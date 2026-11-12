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
    "gamer_gear": ("gamer gear stocks", [("NVDA", "Nvidia", "nvidia.com"), ("AMD", "AMD", "amd.com"),
                                         ("INTC", "Intel", "intel.com"), ("LOGI", "Logitech", "logitech.com"),
                                         ("GME", "GameStop", "gamestop.com"), ("HEAR", "Turtle Beach", "turtlebeach.com")]),
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
    "chips": ("chip makers", [("NVDA", "Nvidia", "nvidia.com"), ("AMD", "AMD", "amd.com"),
                              ("INTC", "Intel", "intel.com"), ("TSM", "TSMC", "tsmc.com"),
                              ("QCOM", "Qualcomm", "qualcomm.com"), ("ASML", "ASML", "asml.com")]),
    "airlines": ("airlines", [("DAL", "Delta", "delta.com"), ("UAL", "United", "united.com"),
                              ("AAL", "American", "aa.com"), ("LUV", "Southwest", "southwest.com"),
                              ("ALK", "Alaska", "alaskaair.com"), ("JBLU", "JetBlue", "jetblue.com")]),
    "retail": ("big retailers", [("WMT", "Walmart", "walmart.com"), ("COST", "Costco", "costco.com"),
                                 ("TGT", "Target", "target.com"), ("HD", "Home Depot", "homedepot.com"),
                                 ("LOW", "Lowe's", "lowes.com"), ("BBY", "Best Buy", "bestbuy.com")]),
    "energy": ("oil giants", [("XOM", "Exxon", "exxonmobil.com"), ("CVX", "Chevron", "chevron.com"),
                              ("SHEL", "Shell", "shell.com"), ("BP", "BP", "bp.com"),
                              ("COP", "ConocoPhillips", "conocophillips.com"), ("OXY", "Occidental", "oxy.com")]),
    "luxury": ("luxury brands", [("LVMUY", "LVMH", "lvmh.com"), ("HESAY", "Hermès", "hermes.com"),
                                 ("CFRUY", "Richemont", "richemont.com"), ("PPRUY", "Kering", "kering.com"),
                                 ("TPR", "Tapestry", "tapestry.com"), ("RL", "Ralph Lauren", "ralphlauren.com")]),
    "sportswear": ("sportswear brands", [("NKE", "Nike", "nike.com"), ("ADDYY", "Adidas", "adidas.com"),
                                         ("LULU", "Lululemon", "lululemon.com"), ("UAA", "Under Armour", "underarmour.com"),
                                         ("DECK", "Deckers", "deckers.com"), ("PUMSY", "Puma", "puma.com")]),
    "pharma": ("drug makers", [("LLY", "Eli Lilly", "lilly.com"), ("NVO", "Novo Nordisk", "novonordisk.com"),
                               ("PFE", "Pfizer", "pfizer.com"), ("JNJ", "J&J", "jnj.com"),
                               ("MRK", "Merck", "merck.com"), ("ABBV", "AbbVie", "abbvie.com")]),
    "apps": ("app companies", [("UBER", "Uber", "uber.com"), ("ABNB", "Airbnb", "airbnb.com"),
                               ("SNAP", "Snapchat", "snap.com"), ("PINS", "Pinterest", "pinterest.com"),
                               ("SPOT", "Spotify", "spotify.com"), ("DASH", "DoorDash", "doordash.com")]),
    "crypto": ("cryptocurrencies", [("BTC-USD", "Bitcoin", "bitcoin.org"), ("ETH-USD", "Ethereum", "ethereum.org"),
                                    ("SOL-USD", "Solana", "solana.com"), ("XRP-USD", "XRP", "xrpl.org"),
                                    ("DOGE-USD", "Dogecoin", "dogecoin.com"), ("BNB-USD", "BNB", "bnbchain.org")]),
    "big_funds": ("famous funds", [("SPY", "S&P 500", None), ("QQQ", "Nasdaq 100", None),
                                   ("BRK-B", "Berkshire", "berkshirehathaway.com"), ("ARKK", "ARK Innovation", "ark-invest.com"),
                                   ("DIA", "Dow Jones", None), ("IWM", "Small caps", None)]),
}
# Any group with fewer than 4 assets trading at the start of a year is skipped for that year automatically.
_PRICES = {}   # (group, first year) -> price table, cached for this run only
INVEST_YEARS = [2005, 2008, 2010, 2012, 2013, 2015, 2018, 2020, 2021, 2022]


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
    # one download per group, shared by every start year (the audit checks many years in a row)
    key = (group, min(year, 2005))
    if key not in _PRICES:
        _PRICES[key] = yf.download(tickers, start=f"{key[1]}-01-01", auto_adjust=True, progress=False)["Close"]
    px = _PRICES[key]
    px = px[px.index >= f"{year}-01-01"]
    px = px.where(px > 0)  # Yahoo sometimes has 0 prices for old or thin stocks: treat them as missing
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
_WB = {}   # World Bank answers, cached for this run only


def wb_candidates():
    return [f"wb__{ind}__{grp}__{y}" for ind in WB_INDICATORS for grp in WB_GROUPS for y in WB_START_YEARS]


def build_wb(topic_id):
    _, ind_key, grp, start_year = topic_id.split("__")
    start_year = int(start_year)
    code, unit, label, question = WB_INDICATORS[ind_key]
    theme, countries = WB_GROUPS[grp]
    url = (f"https://api.worldbank.org/v2/country/{';'.join(countries)}/indicator/{code}"
           f"?date={start_year}:{THIS_YEAR}&format=json&per_page=5000")
    # A slow or broken answer from the World Bank is a hiccup (try again later), not bad data
    url = url.replace(f"date={start_year}:", "date=1990:")  # one download per indicator and group, cached
    if url not in _WB:
        r = requests.get(url, timeout=40)
        r.raise_for_status()
        try:
            _WB[url] = r.json()[1]
        except (ValueError, IndexError, TypeError) as e:
            raise RuntimeError(f"World Bank sent an unreadable answer: {e}") from None
    rows = [x for x in (_WB[url] or []) if int(x["date"]) >= start_year]

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
        pts = [[y, s["v"][y]] for y in sorted(s["v"]) if start_year <= y <= end_year]
        items.append(make_item(s["name"], short, s["v"][start_year], s["v"][end_year], unit,
                               image=f"https://flagcdn.com/w160/{s['iso2'].lower()}.png", series=pts))

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
# Recipe 3: GTA week. Launch prices, console prices (hand-verified CSVs + FRED CPI) and Take-Two on launch days
# =====================================================================
def us_cpi():
    """Monthly US CPI-U from FRED: ({"YYYY-MM": value}, latest "YYYY-MM")."""
    r = requests.get("https://api.stlouisfed.org/fred/series/observations",
                     params={"series_id": "CPIAUCSL", "api_key": os.environ["FRED_API_KEY"],
                             "file_type": "json", "observation_start": "1995-01-01"}, timeout=30)
    r.raise_for_status()
    cpi = {o["date"][:7]: float(o["value"]) for o in r.json()["observations"] if o["value"] != "."}
    return cpi, max(cpi)


def gta_rows():
    with open(DATA_DIR / "gta_launch_prices.csv", newline="") as f:
        return list(csv.DictReader(f))


def gta_short(game):
    return game.split(":", 1)[1].strip() if ":" in game else game.replace("Grand Theft Auto", "GTA")


def build_gta_launch_prices(topic_id="gta_launch_prices"):
    cpi, latest = us_cpi()
    items = []
    for row in gta_rows():
        ym = row["us_launch_date"][:7]
        base = cpi.get(ym, cpi[latest])
        price = float(row["launch_price_usd"])
        items.append(make_item(row["game"], gta_short(row["game"]), price, price * cpi[latest] / base, "usd2",
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


CONSOLE_FAMILIES = {
    "playstation": ("PlayStation", "GTA 6 only runs on PS5 and Xbox Series. Adjusted for inflation, "
                                   "which PlayStation was the most expensive at launch?"),
    "xbox": ("Xbox", "GTA 6 only runs on PS5 and Xbox Series. Adjusted for inflation, "
                     "which Xbox was the most expensive at launch?"),
}


def build_consoles(topic_id):
    """Launch price of each console (top model at launch) in today's dollars. Topic: consoles__playstation."""
    family = topic_id.split("__")[1]
    name, angle = CONSOLE_FAMILIES[family]
    cpi, latest = us_cpi()
    items = []
    with open(DATA_DIR / "console_launch_prices.csv", newline="") as f:
        for row in csv.DictReader(f):
            if row["family"] != family:
                continue
            base = cpi.get(row["us_launch_date"][:7], cpi[latest])
            price = float(row["launch_price_usd"])
            items.append(make_item(row["console"], row["short"], price, price * cpi[latest] / base, "usd0",
                                   year=int(row["us_launch_date"][:4])))
    if len(items) < 4:
        raise ValueError(f"only {len(items)} {name} consoles in the CSV")

    return finish({
        "topic": topic_id,
        "recipe": "consoles",
        "music_pool": "gta",
        "flip": True,
        "unit": "usd0",
        "items": items,
        "start_label": f"{name} launch prices",
        "end_label": "In today's dollars",
        "start_order": "given",
        "badges": {"top": "MOST EXPENSIVE", "bottom": "CHEAPEST"},
        "angle": angle,
        "notes": "US launch price of the top model sold on launch day. Inflation: US CPI-U (FRED CPIAUCSL).",
        "on_screen_source": "Sources: Sony, Microsoft, press reports; inflation: US CPI (FRED)",
        "data_as_of": latest,
    })


def build_ttwo_gta_days(topic_id="ttwo_gta_days"):
    """$1,000 of Take-Two (Rockstar's parent company) bought on the day each GTA came out, worth today."""
    import pandas as pd
    import yfinance as yf
    px = yf.download("TTWO", start="2001-10-01", auto_adjust=True, progress=False)["Close"]
    s = (px["TTWO"] if hasattr(px, "columns") else px).dropna()
    last_day, last = s.index[-1].date(), float(s.iloc[-1])

    items = []
    for row in gta_rows():
        launch = pd.Timestamp(row["us_launch_date"])
        after = s[s.index >= launch]
        if after.empty or after.index[0] - launch > pd.Timedelta(days=7):
            continue  # not out yet (GTA VI) or no trading near that day
        end = 1000 * last / float(after.iloc[0])
        items.append(make_item(row["game"], gta_short(row["game"]), 1000.0, end, "usd0",
                               year=int(row["us_launch_date"][:4])))
    if len(items) < 4:
        raise ValueError(f"only {len(items)} GTA launch days had Take-Two prices")

    return finish({
        "topic": topic_id,
        "recipe": "ttwo",
        "music_pool": "gta",
        "flip": False,
        "unit": "usd0",
        "items": items,
        "start_label": "$1,000 in Take-Two on launch day",
        "end_label": "Worth today",
        "start_order": "given",
        "badges": {"top": "BEST DAY", "bottom": "WORST DAY"},
        "angle": "You put $1,000 into Take-Two, the company that owns Rockstar, on the day each GTA came out. "
                 "Which launch day made you the most by today?",
        "notes": "TTWO adjusted close (splits included) on the first trading day on or after each US launch. "
                 "Not financial advice.",
        "on_screen_source": f"Source: Yahoo Finance, TTWO adjusted close to {last_day:%b %Y}. Not financial advice.",
        "data_as_of": last_day.isoformat(),
    })


# GTA month (engine/schedule.py GTA_START to GTA_END, Nov 12 to 30): a second Short a day at 7 PM, in this order.
# The first unused topic that builds and passes the race check is made; the rest are spares.
GTA_POOL = [
    "gta_launch_prices",        # Thu Nov 12: GTA 6 is the priciest GTA ever, a week before launch
    "consoles__playstation",
    "invest__gaming__2013",     # gaming stocks since the year of GTA V
    "consoles__xbox",
    "invest__gamer_gear__2015",
    "invest__gaming__2018",
    "invest__gamer_gear__2020",
    "ttwo_gta_days",            # Thu Nov 19, launch day: $1,000 in Take-Two on each GTA launch day
    "invest__gaming__2010",
    "invest__gamer_gear__2010",
    "invest__gaming__2020",
    "invest__gamer_gear__2018",
    "invest__gaming__2015",
    "invest__gamer_gear__2013",
    "invest__gaming__2008",
    "invest__gamer_gear__2021",
    "invest__gaming__2021",
    "invest__gamer_gear__2012",
    "invest__gaming__2022",     # Mon Nov 30
    "invest__gaming__2012",     # spares
    "invest__gamer_gear__2008",
    "invest__gaming__2005",
    "invest__gamer_gear__2022",
    "invest__gamer_gear__2005",
]


# =====================================================================
# Recipe 4: grocery and gas prices, "$100 of X in YEAR costs how much today?" (FRED, BLS average prices)
# =====================================================================
PRICE_GROUPS = {
    "basket": ("everyday prices", [("APU0000708111", "Eggs", "a dozen eggs"),
                                   ("APU000074714", "Gas", "a gallon of gas"),
                                   ("APU0000702111", "Bread", "a pound of white bread"),
                                   ("APU0000703112", "Ground beef", "a pound of ground beef"),
                                   ("APU0000717311", "Coffee", "a pound of ground coffee"),
                                   ("APU0000709112", "Milk", "a gallon of milk")]),
    "groceries": ("grocery staples", [("APU0000706111", "Chicken", "a pound of whole chicken"),
                                      ("APU0000711211", "Bananas", "a pound of bananas"),
                                      ("APU0000712311", "Tomatoes", "a pound of tomatoes"),
                                      ("APU0000704111", "Bacon", "a pound of bacon"),
                                      ("APU0000710212", "Cheddar", "a pound of cheddar"),
                                      ("APU0000701312", "Rice", "a pound of white rice")]),
}
PRICE_YEARS = [1990, 1995, 2000, 2005, 2010, 2015, 2020]
_FRED = {}   # FRED series, cached for this run only


def fred_monthly(series_id):
    """{"YYYY-MM": value} for one FRED series. Months with no data (like the 2025 shutdown gap) are left out."""
    if series_id not in _FRED:
        r = requests.get("https://api.stlouisfed.org/fred/series/observations",
                         params={"series_id": series_id, "api_key": os.environ["FRED_API_KEY"],
                                 "file_type": "json", "observation_start": "1980-01-01"}, timeout=30)
        r.raise_for_status()
        _FRED[series_id] = {o["date"][:7]: float(o["value"]) for o in r.json()["observations"] if o["value"] != "."}
    return _FRED[series_id]


def price_candidates():
    return [f"prices__{g}__{y}" for g in PRICE_GROUPS for y in PRICE_YEARS]


def build_prices(topic_id):
    """$100 of each item in a start year, and what the same amount costs at the latest price."""
    _, group, year = topic_id.split("__")
    year = int(year)
    theme, things = PRICE_GROUPS[group]
    latest_month = None
    items, details = [], []
    for series_id, name, what in things:
        m = fred_monthly(series_id)
        start = [v for k, v in m.items() if k.startswith(f"{year}-")]
        if len(start) < 6:  # not tracked that year
            continue
        base = sum(start) / len(start)                 # that year's average price
        last = max(m)
        latest_month = max(latest_month or last, last)
        end = 100 * m[last] / base
        series = [[round(int(k[:4]) + (int(k[5:]) - 1) / 12, 3), round(100 * v / base, 2)]
                  for k, v in sorted(m.items()) if int(k[:4]) >= year]
        series[0][1] = 100.0
        items.append(make_item(name, name, 100.0, end, "usd0", year=year, series=series))
        details.append({"item": name, "what": what, "price_then": f"${base:.2f}", "price_now": f"${m[last]:.2f}"})
    if len(items) < 4:
        raise ValueError(f"only {len(items)} items were tracked in {year}")

    payload = finish({
        "topic": topic_id,
        "recipe": "prices",
        "music_pool": "invest",
        "flip": True,   # the one that went up the most is the bad news
        "unit": "usd0",
        "items": items,
        "start_label": f"$100 worth in {year}",
        "end_label": "Costs today",
        "start_order": "given",
        "race": True,
        "badges": {"top": "UP THE MOST", "bottom": "UP THE LEAST"},
        "angle": f"$100 of each of these {theme} in {year}. How much does the same amount cost today, "
                 f"and which one got the most expensive?",
        "notes": "US city average prices, Bureau of Labor Statistics (via FRED). Start = that year's average price.",
        "on_screen_source": f"Source: US BLS average prices (FRED), {year} vs "
                            f"{date.fromisoformat(latest_month + '-01'):%b %Y}",
        "data_as_of": latest_month,
    })
    payload["facts"]["prices"] = details
    return payload


# ---------- registry ----------
def all_candidates():
    return invest_candidates() + wb_candidates() + price_candidates()


def build(topic_id):
    if topic_id.startswith("invest__"):
        return build_invest(topic_id)
    if topic_id.startswith("wb__"):
        return build_wb(topic_id)
    if topic_id.startswith("prices__"):
        return build_prices(topic_id)
    if topic_id == "gta_launch_prices":
        return build_gta_launch_prices(topic_id)
    if topic_id.startswith("consoles__"):
        return build_consoles(topic_id)
    if topic_id == "ttwo_gta_days":
        return build_ttwo_gta_days(topic_id)
    raise KeyError(topic_id)


def interest(payload):
    """Higher is better. Rankings that flip and big gaps make better reveals."""
    return payload["rank_changes"] + 3 * math.log10(max(payload["spread"], 1))
