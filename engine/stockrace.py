"""Stocks race v3: "$1,000 in car stocks since 2013: who won?". 4 brands from one theme race as running bars, 10 to 15 years.

The reel (video/src/ed/Race.tsx):
  0 to 3.2 s   guess first: 4 big brand tiles, "Pick one before it starts", 3 2 1
  the race     4 running bars from the start year to today: the leader on top with a crown, overtakes slide, live $ and %, the year top right
  the ending   a podium with the final amounts, then "Did you pick right?" and the logo outro
Real prices: Yahoo Finance adjusted close (dividends reinvested). No voice, no Claude.

    python -m engine.stockrace --dry      the race it would make, nothing rendered
    python -m engine.stockrace            renders media/race__<theme>__<start year>/final.mp4 (not posted)
"""
import argparse
import json
import random
import subprocess
from datetime import date, timedelta

from config import DATA_DIR, MEDIA_DIR
from engine.render import VIDEO_DIR

STATE = DATA_DIR / "stockrace.json"
POINTS = 160                    # points per line, spread evenly over the years
# theme: (what to call them, [(ticker, name, tile color, tile text color, logo domain)])
LABELS = {"fastfood": "🍔 FAST FOOD", "drinks": "🥤 DRINKS", "sneakers": "👟 SNEAKERS", "cars": "🏎️ CARS", "phones": "📱 PHONES", "shopping": "🛒 SHOPPING",
          "chips": "💾 CHIPS", "airlines": "✈️ AIRLINES", "banks": "🏦 BANKS", "tech": "💻 BIG TECH"}
# no gaming here on purpose: this format is about everyday brands, not GTA (Nov 25 2026)
THEMES = {
    "fastfood": ("fast food stocks", [("MCD", "McDonald's", "#DA291C", "#FFC72C", "mcdonalds.com"), ("CMG", "Chipotle", "#A81612", "#FFFFFF", "chipotle.com"),
                                       ("DPZ", "Domino's", "#006491", "#FFFFFF", "dominos.com"), ("SBUX", "Starbucks", "#00704A", "#FFFFFF", "starbucks.com")]),
    "drinks": ("drink stocks", [("KO", "Coca-Cola", "#F40009", "#FFFFFF", "coca-cola.com"), ("PEP", "Pepsi", "#004B93", "#FFFFFF", "pepsi.com"),
                                ("MNST", "Monster", "#95D600", "#000000", "monsterenergy.com"), ("KDP", "Dr Pepper", "#7A1F2B", "#FFFFFF", "keurigdrpepper.com")]),
    "sneakers": ("sneaker stocks", [("NKE", "Nike", "#F15A22", "#FFFFFF", "nike.com"), ("ADDYY", "Adidas", "#0A0A0A", "#FFFFFF", "adidas.com"),
                                    ("DECK", "HOKA", "#2E5BFF", "#FFFFFF", "hoka.com"), ("LULU", "Lululemon", "#D22030", "#FFFFFF", "lululemon.com")]),
    "cars": ("car stocks", [("TSLA", "Tesla", "#CC0000", "#FFFFFF", "tesla.com"), ("TM", "Toyota", "#FFFFFF", "#EB0A1E", "toyota.com"),
                            ("F", "Ford", "#003478", "#FFFFFF", "ford.com"), ("GM", "GM", "#0170CE", "#FFFFFF", "gm.com")]),
    "phones": ("phone makers", [("AAPL", "Apple", "#C9CDD2", "#000000", "apple.com"), ("005930.KS", "Samsung", "#1428A0", "#FFFFFF", "samsung.com"),
                                ("NOK", "Nokia", "#00A3E0", "#FFFFFF", "nokia.com"), ("BB", "BlackBerry", "#000000", "#FFFFFF", "blackberry.com")]),
    "shopping": ("shopping stocks", [("AMZN", "Amazon", "#FF9900", "#000000", "amazon.com"), ("COST", "Costco", "#E31837", "#FFFFFF", "costco.com"),
                                     ("WMT", "Walmart", "#0071CE", "#FFC220", "walmart.com"), ("M", "Macy's", "#E21A2C", "#FFFFFF", "macys.com")]),
    "chips": ("chip stocks", [("NVDA", "Nvidia", "#76B900", "#000000", "nvidia.com"), ("AMD", "AMD", "#000000", "#FFFFFF", "amd.com"),
                              ("INTC", "Intel", "#0071C5", "#FFFFFF", "intel.com"), ("QCOM", "Qualcomm", "#3253DC", "#FFFFFF", "qualcomm.com")]),
    "airlines": ("airline stocks", [("DAL", "Delta", "#003366", "#FFFFFF", "delta.com"), ("AAL", "American", "#0078D2", "#FFFFFF", "aa.com"),
                                    ("LUV", "Southwest", "#304CB2", "#FFBF27", "southwest.com"), ("UAL", "United", "#002244", "#FFFFFF", "united.com")]),
    "banks": ("bank stocks", [("JPM", "JPMorgan", "#5C4033", "#FFFFFF", "jpmorganchase.com"), ("GS", "Goldman", "#7399C6", "#FFFFFF", "goldmansachs.com"),
                              ("WFC", "Wells Fargo", "#D71E28", "#FFCD41", "wellsfargo.com"), ("C", "Citi", "#003B70", "#FFFFFF", "citi.com")]),
    "tech": ("big tech stocks", [("MSFT", "Microsoft", "#00A4EF", "#FFFFFF", "microsoft.com"), ("GOOGL", "Google", "#FFFFFF", "#4285F4", "google.com"),
                                 ("META", "Meta", "#0866FF", "#FFFFFF", "meta.com"), ("IBM", "IBM", "#1F70C1", "#FFFFFF", "ibm.com")]),
}
YEARS_BACK = range(10, 16)       # the race starts 10 to 15 years ago, on today's date
SPREAD = 3.0                     # the winner must end at least 3x the loser: a close race is boring


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {"used": []}


def buy_date(back):
    t = date.today()
    return t.replace(year=t.year - back) if not (t.month == 2 and t.day == 29) else t.replace(year=t.year - back, day=28)


def fetch(theme, back):
    """The 4 lines, $1,000 at the start: [{name, color, fg, values}] plus the dates. ValueError when one didn't trade then."""
    import pandas as pd
    import yfinance as yf
    start = pd.Timestamp(buy_date(back))
    assets = THEMES[theme][1]
    px = yf.download([a[0] for a in assets], start=(start - timedelta(days=10)).strftime("%Y-%m-%d"), auto_adjust=True, progress=False)["Close"]
    px = px.where(px > 0).ffill()
    px = px[px.index >= start]
    if px.empty:
        raise ValueError("no prices")
    for a in assets:
        s = px[a[0]].dropna() if a[0] in px else None
        if s is None or s.empty or s.index[0] - start > pd.Timedelta(days=7):
            raise ValueError(f"{a[1]} did not trade on {start:%Y-%m-%d}")
    px = px.dropna()
    idx = sorted(set(round(i * (len(px) - 1) / (POINTS - 1)) for i in range(POINTS)))
    pts = px.iloc[idx]
    lines = []
    for tk, name, col, fg, domain in assets:
        base = float(px[tk].iloc[0])
        lines.append({"name": name, "color": col, "fg": fg, "domain": domain, "values": [round(1000 * float(v) / base, 2) for v in pts[tk]],
                      "final": round(1000 * float(px[tk].iloc[-1]) / base, 2)})
    years = [round(d.year + (d.dayofyear - 1) / 365.25, 3) for d in pts.index]
    return lines, years, px.index[0].date(), px.index[-1].date()


def logo_file(domain):
    """A company's logo from logo.dev (LOGO_DEV_TOKEN), saved once under video/public/logos. Returns its path for the video, or None."""
    import os
    import requests
    from engine.render import PUBLIC
    token = os.environ.get("LOGO_DEV_TOKEN")
    if not token or not domain:
        return None
    rel = f"logos/{domain}.png"
    f = PUBLIC / rel
    try:
        if not f.exists():
            f.parent.mkdir(parents=True, exist_ok=True)
            r = requests.get(f"https://img.logo.dev/{domain}?token={token}&size=256&format=png&retina=true", timeout=20)
            r.raise_for_status()
            if len(r.content) < 500 or not r.content.startswith(b"\x89PNG"):
                raise ValueError("not a logo")
            f.write_bytes(r.content)
        return rel
    except Exception as e:
        print(f"        no logo for {domain} ({str(e)[:60]})")
        return None


def logos(lines):
    """Real logos on the tiles. A logo that won't load leaves the colored tile."""
    import os
    if not os.environ.get("LOGO_DEV_TOKEN"):
        print("        no LOGO_DEV_TOKEN: colored tiles instead of logos")
    for l in lines:
        l["logo"] = logo_file(l["domain"])


def candidates():
    used = set(load_state()["used"])
    out = [(t, b) for t in THEMES for b in YEARS_BACK if f"{t}__{date.today().year - b}" not in used]
    random.shuffle(out)
    return out


def money(v):
    return f"${v:,.0f}" if v < 10_000 else f"${round(v, -2):,.0f}" if v < 1_000_000 else f"${v / 1e6:.1f}M"


def make(dry=False, today=None):
    errors = []
    for theme, back in candidates()[:15]:
        try:
            lines, years, d0, d1 = fetch(theme, back)
        except Exception as e:
            errors.append(f"{theme}/{back}y: {e}")
            continue
        finals = sorted(lines, key=lambda x: -x["final"])
        if finals[0]["final"] / max(1.0, finals[-1]["final"]) < SPREAD:
            errors.append(f"{theme}/{back}y: too close")
            continue
        break
    else:
        raise RuntimeError("no stock race could be built: " + " | ".join(errors[:4]))
    what, _ = THEMES[theme]
    y0 = d0.year
    phrase = f"since {y0}"
    topic = f"race__{theme}__{y0}"
    print(f"      {what}, {phrase} ({d0} to {d1})")
    for l in finals:
        print(f"        {l['name']:<12} {money(l['final'])}")
    if dry:
        return topic, None
    out = MEDIA_DIR / topic
    subprocess.run(["rm", "-rf", str(out)])
    out.mkdir(parents=True, exist_ok=True)
    logos(lines)
    GUESS, RACE, HOLD, POD = 3.2, 9.0, 2.4, 4.0          # HOLD: the bars stop and the finish sinks in before the results
    props = {"hold": HOLD, "lines": lines, "years": years, "theme": LABELS[theme], "pre": f"in {what} ", "em": f"since {y0}", "post": "",
             "style": "bars", "months": [str(int(y)) for y in years], "what": what, "since": y0,
             "guess": GUESS, "race": RACE, "podium": POD, "outroAt": GUESS + RACE + HOLD + POD, "duration": round(GUESS + RACE + HOLD + POD + 1.6, 2),
             "source": f"Yahoo Finance, adjusted close, {d0:%b %-d %Y} to {d1:%b %-d %Y}. Not financial advice.",
             "music": f"music/{random.choice(['born-to-win.mp3', 'take-off.mp3', 'headphonk.mp3'])}",
             "headA": f"$1,000 {phrase}", "pal": "vice"}       # headA/pal: for the cover
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    final = out / "final.mp4"
    subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdRace", str(final), f"--props={out / 'props.json'}",
                    "--codec=h264", "--crf=16", "--image-format=png"], cwd=VIDEO_DIR, check=True)
    w = finals[0]
    (out / "upload.json").write_text(json.dumps({
        "topic": topic, "file": str(final),
        "title": f"$1,000 in {what} {phrase}: who won?",
        "description": f"$1,000 in each of these {what} {phrase}. {w['name']} turned it into {money(w['final'])}, "
                       f"{finals[-1]['name']} into {money(finals[-1]['final'])}.\n\nSource: Yahoo Finance, adjusted close "
                       f"(dividends reinvested), {d0:%b %-d %Y} to {d1:%b %-d %Y}. Not financial advice.",
        "pinned_comment": "Which one did you pick before it started? 👇"}, indent=2, ensure_ascii=False))
    st = load_state()
    st["used"] = (st["used"] + [f"{theme}__{y0}"])[-200:]
    STATE.write_text(json.dumps(st, indent=2))
    return topic, final


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    print(make(a.dry))
