"""Data recipes: each one turns parameters into a verified "then vs now" payload, with no manual research.

Every payload has the same shape, so one video template renders all of them:
    items: [{label, short, start, end, start_display, end_display, start_spoken, end_spoken, image, year}]
    unit, start_label, end_label, start_order, badges, facts, angle, on_screen_source
"""
import csv
import math
import os
from datetime import date

import requests
from dotenv import load_dotenv

from config import DATA_DIR

load_dotenv()
THIS_YEAR = date.today().year


# ---------- number formatting (screen vs voice) ----------
def _scaled(v, div):
    x = v / div
    return f"{x:.0f}" if abs(x) >= 100 else f"{x:.1f}"


def compact(v, prefix="$"):
    for div, suf in ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")):
        if abs(v) >= div:
            return f"{prefix}{_scaled(v, div)}{suf}"
    return f"{prefix}{v:,.0f}"


def compact_spoken(v, prefix="$"):
    for div, word in ((1e12, "trillion"), (1e9, "billion"), (1e6, "million")):
        if abs(v) >= div:
            return f"{prefix}{_scaled(v, div)} {word}"
    return f"{prefix}{v:,.0f}"


def fmt(v, unit):
    if unit == "usd2":
        return f"${v:,.2f}", f"${v:,.2f}"
    if unit == "usd0":
        return f"${v:,.0f}", f"${v:,.0f}"
    if unit == "usd_compact":
        return compact(v), compact_spoken(v)
    if unit == "num_compact":
        return compact(v, ""), compact_spoken(v, "")
    raise ValueError(unit)


def make_item(label, short, start, end, unit, image=None, year=None, series=None):
    """series (optional): [[time, value], ...] for the bar race, time as a decimal year."""
    sd, ss = fmt(start, unit)
    ed, es = fmt(end, unit)
    item = {"label": label, "short": short, "start": round(start, 4), "end": round(end, 4),
            "start_display": sd, "start_spoken": ss, "end_display": ed, "end_spoken": es,
            "image": image, "year": year}
    if series:
        item["series"] = series
    return item


def decimal_year(d):
    return round(d.year + (d.timetuple().tm_yday - 1) / 365.25, 3)


def finish(payload):
    """Adds facts used by the script writer and the badges."""
    items = payload["items"]
    top = max(items, key=lambda i: i["end"])
    bottom = min(items, key=lambda i: i["end"])
    start_rank = {i["short"]: r for r, i in enumerate(sorted(items, key=lambda i: -i["start"]))}
    end_rank = {i["short"]: r for r, i in enumerate(sorted(items, key=lambda i: -i["end"]))}
    climber = max(items, key=lambda i: start_rank[i["short"]] - end_rank[i["short"]])
    payload["facts"] = {
        "top_now": top["short"], "top_now_value": top["end_display"],
        "bottom_now": bottom["short"], "bottom_now_value": bottom["end_display"],
        "biggest_climber": climber["short"],
        "climber_moved_up_places": start_rank[climber["short"]] - end_rank[climber["short"]],
    }
    payload["rank_changes"] = sum(abs(start_rank[k] - end_rank[k]) for k in start_rank)
    payload["spread"] = round(top["end"] / max(bottom["end"], 1e-9), 2)
    return payload


# =====================================================================
# Recipe 1: "$1,000 invested in X in YEAR is now worth..."  (Yahoo Finance via yfinance)
# =====================================================================
INVEST_GROUPS = {
    "big_tech": ("tech giants", [("AAPL", "Apple", "apple.com"), ("MSFT", "Microsoft", "microsoft.com"),
                                 ("NVDA", "Nvidia", "nvidia.com"), ("AMZN", "Amazon", "amazon.com"),
                                 ("GOOGL", "Google", "google.com"), ("META", "Meta", "meta.com")]),
    "money_assets": ("ways to store money", [("BTC-USD", "Bitcoin", "bitcoin.org"), ("GC=F", "Gold", None),
                                             ("SPY", "S&P 500", None), ("QQQ", "Nasdaq 100", None),
                                             ("SLV", "Silver", None), ("TLT", "US Bonds", None)]),
    "gaming": ("gaming stocks", [("TTWO", "Take-Two", "take2games.com"), ("EA", "EA", "ea.com"),
                                 ("SONY", "Sony", "sony.com"), ("NTDOY", "Nintendo", "nintendo.com"),
                                 ("MSFT", "Microsoft", "microsoft.com")]),
    "fast_food": ("fast food stocks", [("MCD", "McDonald's", "mcdonalds.com"), ("SBUX", "Starbucks", "starbucks.com"),
                                       ("CMG", "Chipotle", "chipotle.com"), ("YUM", "Yum Brands", "yum.com"),
                                       ("WEN", "Wendy's", "wendys.com"), ("DPZ", "Domino's", "dominos.com")]),
    "banks": ("big banks", [("JPM", "JPMorgan", "jpmorganchase.com"), ("BAC", "Bank of America", "bankofamerica.com"),
                            ("WFC", "Wells Fargo", "wellsfargo.com"), ("GS", "Goldman Sachs", "goldmansachs.com"),
                            ("MS", "Morgan Stanley", "morganstanley.com"), ("C", "Citi", "citigroup.com")]),
    "car_makers": ("car makers", [("TSLA", "Tesla", "tesla.com"), ("TM", "Toyota", "toyota.com"),
                                  ("F", "Ford", "ford.com"), ("GM", "GM", "gm.com"),
                                  ("HMC", "Honda", "honda.com"), ("RACE", "Ferrari", "ferrari.com")]),
    "streaming_media": ("entertainment stocks", [("NFLX", "Netflix", "netflix.com"), ("DIS", "Disney", "disney.com"),
                                                 ("WBD", "Warner Bros", "wbd.com"), ("CMCSA", "Comcast", "comcast.com"),
                                                 ("PARA", "Paramount", "paramount.com"), ("SPOT", "Spotify", "spotify.com")]),
}
INVEST_YEARS = [2010, 2013, 2015, 2018, 2020]


def logo_url(domain):
    """Company logo from logo.dev if a LOGO_DEV_TOKEN is set in .env, otherwise no logo."""
    token = os.environ.get("LOGO_DEV_TOKEN")
    if not domain or not token:
        return None
    return f"https://img.logo.dev/{domain}?token={token}&size=128&format=png"


def invest_candidates():
    return [f"invest__{g}__{y}" for g in INVEST_GROUPS for y in INVEST_YEARS]


def build_invest(topic_id):
    import yfinance as yf
    _, group, year = topic_id.split("__")
    year = int(year)
    theme, assets = INVEST_GROUPS[group]
    tickers = [a[0] for a in assets]
    px = yf.download(tickers, start=f"{year}-01-01", auto_adjust=True, progress=False)["Close"]
    last_day = px.dropna(how="all").index[-1].date()

    items = []
    for ticker, name, domain in assets:
        s = px[ticker].dropna()
        if s.empty or s.index[0].year != year:  # did not trade at the start of that year
            continue
        base = float(s.iloc[0])
        end = 1000 * float(s.iloc[-1]) / base
        # Month-end values for the bar race, pinned to the exact first and last day
        monthly = s.resample("ME").last().dropna()
        series = [[decimal_year(s.index[0]), 1000.0]]
        series += [[decimal_year(d), round(1000 * float(v) / base, 2)] for d, v in monthly.items()]
        series[-1] = [decimal_year(s.index[-1]), round(end, 2)]
        items.append(make_item(name, name, 1000.0, end, "usd0", image=logo_url(domain), year=year, series=series))
    if len(items) < 4:
        raise ValueError(f"only {len(items)} assets had data for {year}")

    return finish({
        "topic": topic_id,
        "recipe": "invest",
        "unit": "usd0",
        "items": items,
        "start_label": f"$1,000 in {year}",
        "end_label": "Worth today",
        "start_order": "given",
        "race": True,
        "badges": {"top": "BEST", "bottom": "WORST"},
        "angle": f"You put $1,000 into each of these {theme} in {year}. Which one made you the most by today?",
        "notes": "Values include reinvested dividends (adjusted close). Not financial advice.",
        "on_screen_source": f"Source: Yahoo Finance, adjusted close, {year} to {last_day:%b %Y}. Not financial advice.",
        "data_as_of": last_day.isoformat(),
    })


# =====================================================================
# Recipe 2: World Bank "then vs now" rankings with flags
# =====================================================================
WB_INDICATORS = {
    "gdp": ("NY.GDP.MKTP.CD", "usd_compact", "GDP", "Which economy is the biggest now?"),
    "gdp_pc": ("NY.GDP.PCAP.CD", "usd0", "GDP per person", "Where do people earn the most now?"),
    "pop": ("SP.POP.TOTL", "num_compact", "Population", "Which country has the most people now?"),
}
WB_GROUPS = {
    "giants": ("the world's biggest economies", ["USA", "CHN", "JPN", "DEU", "IND", "GBR", "FRA", "BRA"]),
    "asia": ("Asian countries", ["CHN", "JPN", "KOR", "IND", "IDN", "SGP"]),
    "americas": ("countries in the Americas", ["USA", "CAN", "MEX", "BRA", "ARG", "CHL"]),
    "europe": ("European countries", ["DEU", "GBR", "FRA", "ITA", "ESP", "POL"]),
    "mena": ("Middle East and North Africa", ["SAU", "ARE", "TUR", "EGY", "MAR", "ISR"]),
    "africa": ("African countries", ["NGA", "EGY", "ZAF", "MAR", "KEN", "ETH"]),
}
WB_START_YEARS = [1990, 2000]


def wb_candidates():
    return [f"wb__{ind}__{grp}__{y}" for ind in WB_INDICATORS for grp in WB_GROUPS for y in WB_START_YEARS]


def build_wb(topic_id):
    _, ind_key, grp, start_year = topic_id.split("__")
    start_year = int(start_year)
    code, unit, label, question = WB_INDICATORS[ind_key]
    theme, countries = WB_GROUPS[grp]
    url = (f"https://api.worldbank.org/v2/country/{';'.join(countries)}/indicator/{code}"
           f"?date={start_year}:{THIS_YEAR}&format=json&per_page=5000")
    rows = requests.get(url, timeout=60).json()[1]

    series = {}
    for r in rows:
        if r["value"] is None:
            continue
        iso3 = r["countryiso3code"]
        series.setdefault(iso3, {"name": r["country"]["value"], "iso2": r["country"]["id"], "v": {}})
        series[iso3]["v"][int(r["date"])] = float(r["value"])

    # Latest year that every country has data for
    common = set.intersection(*[set(s["v"]) for s in series.values()]) if series else set()
    end_year = max(y for y in common) if common else None
    if not end_year or start_year not in common or end_year - start_year < 10:
        raise ValueError("not enough overlapping World Bank data")

    names = {"United States": "USA", "United Kingdom": "UK", "Korea, Rep.": "South Korea",
             "Egypt, Arab Rep.": "Egypt", "Turkiye": "Turkey", "Russian Federation": "Russia",
             "United Arab Emirates": "UAE", "Saudi Arabia": "Saudi Arabia"}
    items = []
    for iso3 in countries:
        s = series.get(iso3)
        if not s:
            continue
        short = names.get(s["name"], s["name"])
        series = [[y, s["v"][y]] for y in sorted(s["v"]) if start_year <= y <= end_year]
        items.append(make_item(s["name"], short, s["v"][start_year], s["v"][end_year], unit,
                               image=f"https://flagcdn.com/w160/{s['iso2'].lower()}.png", series=series))

    return finish({
        "topic": topic_id,
        "recipe": "wb",
        "unit": unit,
        "items": items,
        "start_label": f"{label} in {start_year}",
        "end_label": f"{label} in {end_year}",
        "start_order": "value",
        "race": True,
        "badges": {"top": "#1", "bottom": "LAST"},
        "angle": f"{label} of {theme}: {start_year} vs {end_year}. {question}",
        "notes": f"World Bank indicator {code}. Values in current US dollars where money.",
        "on_screen_source": f"Source: World Bank ({code}), {start_year} vs {end_year}",
        "data_as_of": str(end_year),
    })


# =====================================================================
# Recipe 3: GTA launch prices adjusted for inflation (hand-verified CSV + FRED CPI)
# =====================================================================
def build_gta_launch_prices(topic_id="gta_launch_prices"):
    r = requests.get("https://api.stlouisfed.org/fred/series/observations",
                     params={"series_id": "CPIAUCSL", "api_key": os.environ["FRED_API_KEY"],
                             "file_type": "json", "observation_start": "1995-01-01"}, timeout=30)
    r.raise_for_status()
    cpi = {o["date"][:7]: float(o["value"]) for o in r.json()["observations"] if o["value"] != "."}
    latest = max(cpi)

    items = []
    with open(DATA_DIR / "gta_launch_prices.csv", newline="") as f:
        for row in csv.DictReader(f):
            ym = row["us_launch_date"][:7]
            base = cpi.get(ym, cpi[latest])
            price = float(row["launch_price_usd"])
            game = row["game"]
            short = game.split(":", 1)[1].strip() if ":" in game else game.replace("Grand Theft Auto", "GTA")
            items.append(make_item(game, short, price, price * cpi[latest] / base, "usd2",
                                   year=int(row["us_launch_date"][:4])))

    return finish({
        "topic": topic_id,
        "recipe": "gta",
        "unit": "usd2",
        "items": items,
        "start_label": "GTA launch prices",
        "end_label": "In today's dollars",
        "start_order": "given",
        "badges": {"top": "MOST EXPENSIVE", "bottom": "CHEAPEST"},
        "angle": "GTA 6 costs $79.99, the highest launch price ever. But adjusted for inflation, which GTA really cost the most?",
        "notes": "Inflation: US CPI-U (FRED CPIAUCSL).",
        "on_screen_source": "Sources: Rockstar, press reports; inflation: US CPI (FRED)",
        "data_as_of": latest,
    })


# ---------- registry ----------
def all_candidates():
    return invest_candidates() + wb_candidates()


def build(topic_id):
    if topic_id.startswith("invest__"):
        return build_invest(topic_id)
    if topic_id.startswith("wb__"):
        return build_wb(topic_id)
    if topic_id == "gta_launch_prices":
        return build_gta_launch_prices(topic_id)
    raise KeyError(topic_id)


def interest(payload):
    """Higher is better. Rankings that flip and big gaps make better reveals."""
    return payload["rank_changes"] + 3 * math.log10(max(payload["spread"], 1))
