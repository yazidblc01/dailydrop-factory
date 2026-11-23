"""Bars v2: a bar chart race of countries, World Bank data, a different theme each time (video/src/ed/BarRace.tsx).

    python -m engine.barrace --dry      the race it would make, nothing rendered
    python -m engine.barrace            renders media/bars__<theme>__<date>/final.mp4 (not posted)
"""
import argparse
import json
import random
import subprocess
from datetime import datetime

import requests

from config import DATA_DIR, MEDIA_DIR
from engine.render import VIDEO_DIR

STATE = DATA_DIR / "barrace.json"
BIG = ["USA", "CHN", "JPN", "DEU", "IND", "GBR", "FRA", "ITA", "BRA", "CAN", "RUS", "KOR", "AUS", "ESP", "MEX", "IDN", "SAU", "TUR", "NGA", "PAK"]
RICH = ["CHE", "NOR", "USA", "IRL", "SGP", "QAT", "DNK", "AUS", "NLD", "SWE", "CAN", "DEU", "JPN", "GBR", "ARE", "ISL", "LUX", "AUT"]
# theme key: (badge, title, title highlight, World Bank code, unit, countries, start year, question at the start, question at the end)
THEMES = {
    "gdp": ("🌍 ECONOMIES", "The world's biggest economies, ", "1990 to now", "NY.GDP.MKTP.CD", "usd_big", BIG, 1990,
            "Guess who's #2 by the end 👇", "Did you guess #2? 👇"),
    "people": ("👥 POPULATION", "The countries with the most people, ", "1970 to now", "SP.POP.TOTL", "people", BIG, 1970,
               "Watch who ends up #1 👇", "Did you see that coming? 👇"),
    "rich": ("💰 RICH PER PERSON", "The richest countries per person, ", "1990 to now", "NY.GDP.PCAP.CD", "usd", RICH, 1990,
             "Guess who wins 👇", "Did you guess #1? 👇"),
    "military": ("🪖 MILITARY", "Who spends the most on the military, ", "1990 to now", "MS.MIL.XPND.CD", "usd_big", BIG, 1990,
                 "Guess who's #2 👇", "Did you guess #2? 👇"),
    "exports": ("🚢 EXPORTS", "The world's biggest exporters, ", "1990 to now", "NE.EXP.GNFS.CD", "usd_big", BIG, 1990,
                "Guess who wins 👇", "Did you guess #1? 👇"),
    "life": ("❤️ LIFE EXPECTANCY", "Where people live the longest, ", "1990 to now", "SP.DYN.LE00.IN", "years", RICH + ["CHN", "KOR", "ITA", "ESP", "FRA"], 1990,
             "Guess who's #1 👇", "Did you guess #1? 👇"),
}
NAMES = {"United States": "USA", "United Kingdom": "UK", "Korea, Rep.": "South Korea", "Russian Federation": "Russia", "Turkiye": "Turkey",
         "United Arab Emirates": "UAE", "Saudi Arabia": "Saudi Arabia", "Iran, Islamic Rep.": "Iran", "Egypt, Arab Rep.": "Egypt", "Hong Kong SAR, China": "Hong Kong"}
COLORS = {"USA": "#3C6DF0", "CHN": "#E8433A", "JPN": "#F06AA0", "DEU": "#F5A623", "IND": "#FF8A3D", "GBR": "#7C5CFF", "FRA": "#2FB6FF", "ITA": "#1FB85A",
          "BRA": "#00B89C", "CAN": "#FF5E5E", "RUS": "#8E9BFF", "KOR": "#4FD1FF", "AUS": "#FFC23D", "ESP": "#FF7A59", "MEX": "#2ECC71", "IDN": "#E35D6A",
          "SAU": "#16A085", "TUR": "#D63A5A", "NGA": "#27AE60", "PAK": "#1E8449", "CHE": "#E74C3C", "NOR": "#5D6DFF", "IRL": "#2ECC71", "SGP": "#FF6B81",
          "QAT": "#9B2A5E", "DNK": "#C0392B", "NLD": "#FF8C1A", "SWE": "#3D8BFF", "ARE": "#1ABC9C", "ISL": "#5DADE2", "LUX": "#48C9B0", "AUT": "#EC7063"}
PALETTE = ["#FF4FA0", "#2FB6FF", "#FFB13B", "#7C5CFF", "#22C55E", "#FF5E5E", "#00C2A8"]
HOOK, RACE, HOLD, OUTRO = 1.8, 12.5, 2.6, 1.6


def flag(iso2):
    return "".join(chr(0x1F1E6 + ord(c) - 65) for c in iso2.upper()) if len(iso2) == 2 and iso2.isalpha() else "🏳️"


def fetch(code, countries, start):
    url = f"https://api.worldbank.org/v2/country/{';'.join(countries)}/indicator/{code}?date={start}:{datetime.now().year}&format=json&per_page=20000"
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    rows = r.json()[1] or []
    series = {}
    for x in rows:
        if x["value"] is None:
            continue
        iso3 = x["countryiso3code"]
        s = series.setdefault(iso3, {"name": NAMES.get(x["country"]["value"], x["country"]["value"]), "iso2": x["country"]["id"], "v": {}})
        s["v"][int(x["date"])] = float(x["value"])
    return series


def build(theme):
    badge, ta, tem, code, unit, countries, start, ask, end_ask = THEMES[theme]
    series = fetch(code, countries, start)
    if len(series) < 8:
        raise ValueError(f"only {len(series)} countries with data")
    # the last year most countries have, so the race doesn't end on a half-empty year
    counts = {}
    for s in series.values():
        for y in s["v"]:
            counts[y] = counts.get(y, 0) + 1
    end = max(y for y, c in counts.items() if c >= 0.8 * len(series))
    years = list(range(start, end + 1))
    out = []
    for k, (iso3, s) in enumerate(series.items()):
        v = [s["v"].get(y) for y in years]
        known = [i for i, x in enumerate(v) if x is not None]
        if len(known) < len(years) * 0.6:
            continue
        for i in range(len(v)):                       # fill small gaps with the nearest known value
            if v[i] is None:
                v[i] = s["v"].get(min(s["v"], key=lambda y: abs(y - years[i])))
        out.append({"iso3": iso3, "name": s["name"], "flag": flag(s["iso2"]), "color": COLORS.get(iso3, PALETTE[k % len(PALETTE)]), "v": [round(x, 3) for x in v]})
    if len(out) < 8:
        raise ValueError("not enough countries with a full history")
    # overtakes among the top 5, as banners (at most 5, at least 1.5 s apart)
    toasts, last = [], -9
    steps = (len(years) - 1) * 8
    prev = None
    for k in range(steps + 1):
        f = k / 8
        i0, fr = int(f), f - int(f)
        i1 = min(len(years) - 1, i0 + 1)
        vals = {c["name"]: c["v"][i0] + (c["v"][i1] - c["v"][i0]) * fr for c in out}
        order = sorted(vals, key=lambda n: -vals[n])
        if prev:
            for pos, n in enumerate(order[:5]):
                old = prev.index(n)
                if old > pos and old < len(prev):
                    passed = prev[pos]
                    t = HOOK + RACE * f / (len(years) - 1)
                    if t - last >= 1.5 and len(toasts) < 5 and t < HOOK + RACE - 0.8:
                        toasts.append({"t": round(t, 2), "text": f"{n} passes {passed}"})
                        last = t
                    break
        prev = order
    final = sorted(out, key=lambda c: -c["v"][-1])
    for c in out:
        del c["iso3"]
    props = {"theme": badge, "titleA": ta, "titleEm": tem, "unit": unit, "years": years, "countries": out, "toasts": toasts,
             "hook": HOOK, "race": RACE, "outroAt": HOOK + RACE + HOLD, "duration": round(HOOK + RACE + HOLD + OUTRO, 2), "ask": ask, "endAsk": end_ask,
             "source": f"Source: World Bank, {start} to {end}", "headA": f"{ta}{tem}", "pal": "vice"}
    return props, final, start, end


def money(v, unit):
    if unit == "usd_big":
        return f"${v / 1e12:.1f}T" if v >= 1e12 else f"${v / 1e9:.0f}B"
    if unit == "people":
        return f"{v / 1e9:.2f}B" if v >= 1e9 else f"{v / 1e6:.0f}M"
    if unit == "usd":
        return f"${v:,.0f}"
    if unit == "years":
        return f"{v:.1f} years"
    return f"{v:.0f}%"


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {"count": 0}


def make(dry=False, today=None):
    today = today or datetime.now().date()
    st = load_state()
    keys = list(THEMES)
    errors = []
    for k in range(len(keys)):
        theme = keys[(st["count"] + k) % len(keys)]
        try:
            props, final_rank, y0, y1 = build(theme)
            break
        except Exception as e:
            errors.append(f"{theme}: {e}")
    else:
        raise RuntimeError("no bar race could be built: " + " | ".join(errors))
    unit = props["unit"]
    print(f"      {props['titleA']}{props['titleEm']} ({y0} to {y1}), {len(props['countries'])} countries")
    for c in final_rank[:8]:
        print(f"        {c['name']:<14} {money(c['v'][-1], unit)}")
    for x in props["toasts"]:
        print(f"        {x['t']:>5}s  {x['text']}")
    topic = f"bars__{theme}__{today:%Y%m%d}"
    if dry:
        return topic, None
    out = MEDIA_DIR / topic
    subprocess.run(["rm", "-rf", str(out)])
    out.mkdir(parents=True, exist_ok=True)
    props["music"] = f"music/{random.choice(['born-to-win.mp3', 'take-off.mp3', 'headphonk.mp3'])}"
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    final = out / "final.mp4"
    subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdBarRace", str(final), f"--props={out / 'props.json'}",
                    "--codec=h264", "--crf=16", "--image-format=png"], cwd=VIDEO_DIR, check=True)
    top = final_rank[:3]
    (out / "upload.json").write_text(json.dumps({
        "topic": topic, "file": str(final),
        "title": f"{props['titleA']}{props['titleEm']} 🏁",
        "description": f"{props['titleA']}{props['titleEm']}, {y0} to {y1}. Top 3 now: "
                       + ", ".join(f"{c['name']} {money(c['v'][-1], unit)}" for c in top) + f".\n\nSource: World Bank open data, {y0} to {y1}.",
        "pinned_comment": props["endAsk"]}, indent=2, ensure_ascii=False))
    st["count"] += 1
    STATE.write_text(json.dumps(st, indent=2))
    return topic, final


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    print(make(a.dry))
