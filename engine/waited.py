"""While we waited for GTA 6: six "GTA V release day vs GTA 6" price pairs, then a 3D finale of the multiples.

GTA V came out Sep 17, 2013. GTA 6 comes out Nov 19, 2026. Until then the GTA 6 side is today's price;
from launch day on, stocks lock to the Nov 19 close (monthly prices use the latest month).

Data: Yahoo Finance (adjusted close, "$1,000 in X") and US BLS average prices / FRED series. No voice, no Claude.
Several videos a day (workflow gta_waited.yml), each a different mix of items.

    python -m engine.waited --dry      build the data and props only
    python -m engine.waited            render to media/waited__<date>__<n>/final.mp4
    python -m engine.waited --post     render and post right away (what the workflow runs)
    python -m engine.waited --flat     the flat finale only (no 3D)
"""
import argparse
import json
import random
import subprocess
import sys
from datetime import date, datetime, timedelta

from config import DATA_DIR, MEDIA_DIR
from engine import recipes
from engine.render import PUBLIC, VIDEO_DIR

GTA5 = date(2013, 9, 17)
GTA6 = date(2026, 11, 19)
STATE = DATA_DIR / "waited.json"
ROUNDS = 5                                   # 4 quick rounds + the big one (was 6: shorter Shorts get finished and replayed more)
HOOK, ROUND, FINALE, FOLLOW = 2.0, 2.3, 3.4, 1.6

# (ticker, name) -> "$1,000 in <name>"
STOCKS = [("NVDA", "Nvidia"), ("TSLA", "Tesla"), ("NFLX", "Netflix"), ("AMD", "AMD"), ("AAPL", "Apple"),
          ("AMZN", "Amazon"), ("MSFT", "Microsoft"), ("GOOGL", "Google"), ("META", "Meta"), ("TTWO", "Take-Two"),
          ("SONY", "Sony"), ("NTDOY", "Nintendo"), ("COST", "Costco"), ("MCD", "McDonald's"), ("SPY", "the S&P 500"),
          ("GC=F", "gold"), ("NKE", "Nike"), ("DIS", "Disney"), ("GME", "GameStop")]
# (FRED series, short name, headline, ticket line, unit) ; unit: "usd2" prices, "usd0", "usdT" (millions -> $T)
PRICES = [("APU0000708111", "Eggs", "A dozen eggs.", "A DOZEN EGGS", "usd2"),
          ("APU000074714", "Gas", "A gallon of gas.", "A GALLON OF GAS", "usd2"),
          ("APU0000702111", "Bread", "A pound of bread.", "A POUND OF BREAD", "usd2"),
          ("APU0000703112", "Beef", "A pound of ground beef.", "A POUND OF BEEF", "usd2"),
          ("APU0000717311", "Coffee", "A pound of coffee.", "A POUND OF COFFEE", "usd2"),
          ("APU0000709112", "Milk", "A gallon of milk.", "A GALLON OF MILK", "usd2"),
          ("APU0000706111", "Chicken", "A pound of chicken.", "A POUND OF CHICKEN", "usd2"),
          ("APU0000704111", "Bacon", "A pound of bacon.", "A POUND OF BACON", "usd2"),
          ("APU000072610", "Power", "Electricity, per kWh.", "ONE KWH OF POWER", "usd3")]
LIFE = [("FEDMINNFRWG", "Min wage", "The federal minimum wage.", "MINIMUM WAGE / HR", "usd2"),
        ("CES0500000003", "Pay", "The average hourly pay.", "AVERAGE PAY / HR", "usd2"),
        ("MSPUS", "Home", "The median US home.", "MEDIAN HOME PRICE", "usd0"),
        ("GFDEBTN", "US debt", "The US national debt.", "US NATIONAL DEBT", "usdT")]
HOOKS = [("GTA V came out in 2013.", "Here's what 13 years of waiting did to prices."),
         ("We've waited 13 years for GTA 6.", "Look what happened in the meantime."),
         ("GTA V release day vs GTA 6 release day.", "Same wait. Wildly different results."),
         ("13 years between GTA V and GTA 6.", "Here's what that wait cost you.")]
THEMES = ["mixed", "stocks", "prices", "gamer"]
GAMER = {"TTWO", "SONY", "NTDOY", "AMD", "NVDA", "GME", "MSFT"}
GAME_PRICE = {"key": "GTA", "name": "GTA itself", "kind": "price", "head": "The game itself.", "what": "NEW GTA AT LAUNCH",
              "then": "$59.99", "now": "$79.99", "r": 79.99 / 59.99, "thenDate": "SEP 17, 2013", "nowDate": "NOV 19, 2026",
              "fact": "A new GTA at launch: $59.99 (GTA V, 2013) vs $79.99 (GTA 6, 2026)"}
TITLES = ["Everything that changed while we waited for GTA 6 💀", "13 years waiting for GTA 6: {fin} went {mult} 🤯",
          "GTA V day vs GTA 6 day: what changed 💸", "What 13 years of waiting for GTA 6 did to prices 😭"]


# ---------- data ----------
def money(v, unit):
    if unit == "usdT":
        return f"${v / 1e6:.1f}T"
    if unit == "usd0":
        return f"${v:,.0f}"
    if unit == "usd3":
        return f"${v:.3f}"
    return f"${v:,.2f}"


def mult_text(r):
    if abs(r - 1) < 0.005:
        return "SAME"
    if r >= 2:
        return f"×{r:,.1f}" if r < 100 else f"×{r:,.0f}"
    return f"+{(r - 1) * 100:.0f}%" if r > 1 else f"-{(1 - r) * 100:.0f}%"


def follow_card(today, at):
    """The last 1.6 s of a GTA-season reel: a reason to follow, tied to the GTA 6 countdown."""
    days = (GTA6 - today).days
    if days > 1:
        f = {"kicker": "GTA 6 IN", "big": str(days), "line": "days.", "em": "One a day till then."}
    elif days == 1:
        f = {"kicker": "GTA 6 IN", "big": "1", "line": "day.", "em": "Follow for launch day."}
    elif days == 0:
        f = {"kicker": "GTA 6 IS", "big": "OUT", "line": "today.", "em": "One a day all launch week."}
    else:
        f = {"kicker": "GTA 6 · DAY", "big": str(1 - days), "line": "Follow for", "em": "one a day."}
    return {"at": round(at, 2), **f}


def gta6_side(today):
    """The date the GTA 6 side is measured at: launch day once it's here, today before."""
    return min(today, GTA6) if today >= GTA6 else today


def stock_pair(ticker, name, today):
    import yfinance as yf
    end = gta6_side(today)
    px = yf.download(ticker, start="2013-09-10", end=(end + timedelta(days=1)).isoformat(), auto_adjust=True, progress=False)["Close"]
    s = (px[ticker] if hasattr(px, "columns") else px).dropna()
    s = s[s > 0]
    a = s[s.index >= "2013-09-17"]
    if a.empty or (a.index[0].date() - GTA5).days > 5:
        raise ValueError("no price near GTA V day")
    v0, v1, d1 = float(a.iloc[0]), float(s.iloc[-1]), s.index[-1].date()
    end_v = 1000 * v1 / v0
    return {"key": ticker, "name": name, "kind": "stock", "head": f"$1,000 in {name}.", "what": f"$1,000 IN {name.upper()}",
            "then": "$1,000", "now": money(end_v, "usd0"), "r": end_v / 1000, "thenDate": "SEP 17, 2013",
            "nowDate": f"{d1:%b %-d, %Y}".upper(),
            "fact": f"$1,000 in {name} on Sep 17, 2013 (GTA V release) was worth {money(end_v, 'usd0')} on {d1:%b %-d, %Y}"}


def series_pair(sid, name, head, what, unit, today):
    m = recipes.fred_monthly(sid)              # {"YYYY-MM": value}; quarterly series are keyed by their first month
    then_k = max((k for k in m if k <= "2013-09"), default=None)
    if not then_k or then_k < "2013-01":
        raise ValueError("no 2013 value")
    end_k = max(k for k in m if k <= f"{gta6_side(today):%Y-%m}")
    v0, v1 = m[then_k], m[end_k]
    lab = lambda k: date(int(k[:4]), int(k[5:]), 1).strftime("%b %Y").upper()
    return {"key": sid, "name": name, "kind": "price", "head": head, "what": what, "then": money(v0, unit), "now": money(v1, unit),
            "r": v1 / v0, "thenDate": lab(then_k), "nowDate": lab(end_k),
            "fact": f"{head.rstrip('.')}: {money(v0, unit)} ({lab(then_k).title()}) vs {money(v1, unit)} ({lab(end_k).title()})"}


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {"count": 0, "finales": [], "made": []}


def build(today=None, seed=None):
    """Six pairs, then the finale. The mix rotates by theme:
    mixed: 2 everyday prices, 1 cost-of-life number, 2 stocks; stocks: 5 stocks; prices: 5 prices; gamer: gaming stocks and the game's own price.
    The last round is always the stock with the biggest multiple (not used as the finale in the last 4 videos)."""
    today = today or datetime.now().date()
    st = load_state()
    n = st["count"] if seed is None else seed
    theme = THEMES[(n // 2) % len(THEMES)]
    rnd = random.Random(1000 + n)
    stock_pool = [x for x in STOCKS if x[0] in GAMER] if theme == "gamer" else STOCKS
    got_s, got_p, got_l = [], [], []
    for t, nm in rnd.sample(stock_pool, len(stock_pool)):
        try:
            got_s.append(stock_pair(t, nm, today))
        except Exception as e:  # one ticker failing never stops the video
            print(f"      skipped {nm}: {e}")
        if len(got_s) >= 7:
            break
    for pool, out, k in ((PRICES, got_p, 3), (LIFE, got_l, 2)):
        for row in rnd.sample(pool, len(pool)):
            try:
                out.append(series_pair(*row, today))
            except Exception as e:
                print(f"      skipped {row[1]}: {e}")
            if len(out) >= k:
                break
    if len(got_s) < 3 or len(got_p) + len(got_l) < 3:
        raise RuntimeError(f"not enough data ({len(got_s)} stocks, {len(got_p) + len(got_l)} prices)")
    # the finale: the biggest multiple among the stocks, not used as the finale in the last 4 videos
    recent = set(st["finales"][-4:])
    big = sorted(got_s, key=lambda x: -x["r"])
    fin = next((x for x in big if x["key"] not in recent), big[0])
    k_st = {"mixed": 2, "stocks": 4, "prices": 1, "gamer": 3}[theme]
    others = [x for x in got_s if x is not fin][:k_st]
    extra = [GAME_PRICE] if theme == "gamer" or (theme == "mixed" and n % 3 == 0) else []
    rest = (extra + got_p[:2] + got_l[:1] + got_p[2:] + got_l[1:])[:ROUNDS - 1 - len(others)]
    if len(rest) + len(others) < ROUNDS - 1:  # not enough of one kind: top up with the other
        others = [x for x in got_s if x is not fin][:ROUNDS - 1 - len(rest)]
    mid = sorted(rest + others, key=lambda x: x["r"])
    opener = max((x for x in mid if x["kind"] == "price"), key=lambda x: x["r"], default=None)  # open on a shock everyone feels
    rounds = ([opener] if opener else []) + [x for x in mid if x is not opener] + [fin]
    hookA, hookB = HOOKS[n % len(HOOKS)]
    for x in rounds:
        x["stamp"] = mult_text(x["r"])
    days = (GTA6 - today).days
    badge = f"GTA 6 IN {days} DAYS" if days > 1 else "GTA 6 IS OUT TOMORROW" if days == 1 else "GTA 6 IS OUT TODAY" if days == 0 else "GTA 6 IS OUT"
    end = HOOK + len(rounds) * ROUND + FINALE
    duration = round(end + FOLLOW, 2)
    props = {"pal": "vice", "duration": duration, "label": "WHILE WE WAITED · GTA 6", "badge": badge, "hookA": hookA, "hookB": hookB,
             "teaser": "THE LAST ONE IS INSANE", "rounds": [{k: x[k] for k in ("name", "head", "what", "then", "now", "thenDate", "nowDate", "stamp", "r")} for x in rounds],
             "hook": HOOK, "round": ROUND, "flat": False,
             "hookStyle": "payoff", "follow": follow_card(today, end)}
    title = TITLES[n % len(TITLES)].format(fin=fin["name"].replace("the ", ""), mult=fin["stamp"].replace("×", "x"))
    lines = "\n".join(f"• {x['fact']}" for x in rounds)
    meta = {"title": title,
            "description": (f"GTA V came out on Sep 17, 2013. GTA 6 comes out on Nov 19, 2026. Here's what changed in between:\n{lines}\n\n"
                            "Sources: Yahoo Finance (adjusted close), US Bureau of Labor Statistics and FRED. Not financial advice.\n"
                            "#gta6 #gtav #gta"),
            "pinned_comment": "What did you buy in 2013? 👇"}
    topic = f"waited__{today:%Y%m%d}__{n}"
    return topic, props, meta, fin["key"]


# ---------- the other GTA formats (same sunset look) ----------
RELEASES = [(2001, 10, "III"), (2002, 10, "VICE CITY"), (2004, 10, "SAN ANDREAS"), (2008, 4, "IV"), (2013, 9, "V")]
BOARDS = [("gaps", None), ("gas", ("APU000074714", "A gallon of gas", "GAS, GALLON")), ("game", None),
          ("eggs", ("APU0000708111", "A dozen eggs", "EGGS, DOZEN")), ("wage", ("FEDMINNFRWG", "The minimum wage", "MIN WAGE")),
          ("milk", ("APU0000709112", "A gallon of milk", "MILK, GALLON"))]
RECEIPT_ITEMS = [("APU0000708111", "EGGS, DOZEN"), ("APU0000709112", "MILK, GALLON"), ("APU0000702111", "BREAD, LB"),
                 ("APU0000703112", "GROUND BEEF, LB"), ("APU0000717311", "COFFEE, LB"), ("APU000074714", "GAS, GALLON")]
SOURCE = "Sources: US Bureau of Labor Statistics and FRED."


def latest_key(m, today):
    return max(k for k in m if k <= f"{gta6_side(today):%Y-%m}")


def board(n, today):
    kind, spec = BOARDS[n % len(BOARDS)]
    year6 = 2026
    rows, at = [], lambda i: round(2.6 + 2.2 * i, 2)
    if kind == "gaps":
        names = ["III", "VC", "SA", "IV", "V", "VI"]
        years = [2001, 2002, 2004, 2008, 2013, 2026]
        for i, (nm, y) in enumerate(zip(names, years)):
            gap = "" if i == 0 else f"{y - years[i - 1]}Y"
            rows.append({"text": f"{nm:<4}{y}{gap:>4}", "at": at(i), "hot": nm == "VI"})
        hook, end = ("The longest wait", "in GTA history."), ("13 years between V and VI.", "The longest wait ever.")
        teaser = {"text": rows[-1]["text"], "line": "V to VI:", "em": "13 years. The rest? Watch."}
        title, facts = "The wait between every GTA game 😭", "GTA III 2001, Vice City 2002, San Andreas 2004, GTA IV 2008, GTA V 2013, GTA 6 2026."
    elif kind == "game":
        import csv
        with open(DATA_DIR / "gta_launch_prices.csv", newline="") as f:
            g = list(csv.DictReader(f))
        for i, r in enumerate(g):
            rows.append({"text": f"{r['us_launch_date'][:4]}{'$' + r['launch_price_usd']:>8}", "at": at(i), "hot": r is g[-1]})
        hook, end = ("What a new GTA cost", "on launch day."), (f"${g[0]['launch_price_usd']} to ${g[-1]['launch_price_usd']}.", "Over 25 years.")
        teaser = {"text": rows[-1]["text"], "line": "GTA 6:", "em": f"${g[-1]['launch_price_usd']}. Now the rest."}
        title, facts = "What every GTA cost on launch day 💸", " ".join(f"{r['game']}: ${r['launch_price_usd']} ({r['us_launch_date'][:4]})." for r in g)
    else:
        sid, what, _ = spec
        m = recipes.fred_monthly(sid)
        vals = []
        for y, mo, nm in RELEASES:
            k = f"{y}-{mo:02d}"
            if k in m:
                vals.append((str(y), m[k], nm))
        k6 = latest_key(m, today)
        vals.append((k6[:4] if today >= GTA6 else "NOW", m[k6], "6"))
        top = max(v for _, v, _ in vals)
        for i, (lab, v, nm) in enumerate(vals):
            rows.append({"text": f"{lab:<4}{'$' + format(v, '.2f'):>8}", "at": at(i), "hot": v == top or nm == "6"})
        hook = (f"{what},", "on every GTA release day.")
        teaser = {"text": rows[-1]["text"], "line": f"{what} now.", "em": f"Back in GTA III: ${vals[0][1]:.2f}."}
        end = (f"GTA III: ${vals[0][1]:.2f}.", f"GTA 6: ${vals[-1][1]:.2f}.")
        title = f"{what} on every GTA release day ⛽" if kind == "gas" else f"{what} on every GTA release day 💸"
        facts = " ".join(f"GTA {nm}: ${v:.2f} ({lab})." for lab, v, nm in vals) + " " + SOURCE
    dur = rows[-1]["at"] + 6.2
    props = {"pal": "vice", "duration": round(dur + FOLLOW, 2), "label": "THE BOARD · GTA", "hookA": hook[0], "hookB": hook[1],
             "endA": end[0], "endB": end[1], "header": "", "rows": rows, "teaser": teaser, "follow": follow_card(today, dur)}
    meta = {"title": title, "description": f"{facts}\nGTA 6 comes out November 19, 2026.\n#gta6 #gta #gtav",
            "pinned_comment": "Which GTA did you play first? 👇"}
    return "EdFlap", f"board_{kind}", props, meta


def receipt(n, today):
    items, k_end = [], None
    for sid, name in RECEIPT_ITEMS:
        try:
            m = recipes.fred_monthly(sid)
            k_end = latest_key(m, today)
            items.append({"name": name, "a": round(m["2013-09"], 2), "b": round(m[k_end], 2)})
        except Exception as e:
            print(f"      skipped {name}: {e}")
    if len(items) < 4:
        raise RuntimeError("not enough grocery prices")
    ta, tb = sum(i["a"] for i in items), sum(i["b"] for i in items)
    pct = round((tb / ta - 1) * 100)
    props = {"pal": "vice", "duration": 21 + FOLLOW, "follow": follow_card(today, 21), "label": "THE RECEIPT · GTA", "hookA": "Same grocery run.", "hookB": "GTA V day vs GTA 6 day.",
             "endA": "Same cart.", "endB": f"+{pct}% since GTA V.", "store": "DAILY DROP MARKET", "sub": "GTA V DAY VS GTA 6 DAY",
             "colA": "2013", "colB": k_end[:4], "items": items, "printStart": 2.6, "printEnd": 12.5}
    lines = "\n".join(f"• {i['name'].title()}: ${i['a']:.2f} (Sep 2013) vs ${i['b']:.2f} ({k_end})" for i in items)
    meta = {"title": "The same grocery cart, GTA V day vs GTA 6 day 🧾",
            "description": f"Average US prices when GTA V came out (Sep 2013) vs now:\n{lines}\nTotal: ${ta:.2f} vs ${tb:.2f} (+{pct}%).\n{SOURCE}\n#gta6 #gtav #inflation",
            "pinned_comment": "Which one hurts the most? 👇"}
    return "EdReceipt", "receipt", props, meta


def coins(n, today):
    m = recipes.fred_monthly("CPIAUCSL")
    k_end = latest_key(m, today)
    pts = [[2013, m["2013-09"]]] + [[y, m[f"{y}-09"]] for y in range(2015, int(k_end[:4])) if f"{y}-09" in m] + [[int(k_end[:4]), m[k_end]]]
    buys = round(100 * m["2013-09"] / m[k_end])
    props = {"pal": "vice", "duration": 19 + FOLLOW, "follow": follow_card(today, 19), "label": "THE SHRINKING $100 · GTA", "hookA": "$100 on GTA V release day.", "hookB": "Watch what it buys now.",
             "endA": "That GTA V-day $100 now buys", "endB": f"${buys} of stuff.", "start": 2.6, "end": 14.0, "cpi": pts}
    meta = {"title": f"$100 from GTA V day is now worth ${buys} 😬",
            "description": f"$100 on the day GTA V came out (Sep 2013) buys about ${buys} worth of stuff today (US CPI, {k_end}).\n{SOURCE}\n#gta6 #gtav #inflation",
            "pinned_comment": "What did $100 get you in 2013? 👇"}
    return "EdCoins", "coins", props, meta


def consoles(n, today):
    import csv
    with open(DATA_DIR / "console_launch_prices.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    pick = random.Random(77 + n).sample(rows, 5)
    items = [{"name": r["console"], "sub": r["us_launch_date"][:4], "value": float(r["launch_price_usd"])} for r in pick]
    top = max(items, key=lambda x: x["value"])
    props = {"pal": "vice", "duration": 20 + FOLLOW, "follow": follow_card(today, 20), "label": "HIGHER OR LOWER · GTA", "hookA": "Console launch prices.", "hookB": "Higher or lower?",
             "endA": f"The priciest one here: the {top['name']},", "endB": f"back in {top['sub']}.", "unit": "LAUNCH PRICE", "items": items,
             "start": 2.2, "round": 3.7}
    meta = {"title": "Console launch prices: higher or lower? 🎮",
            "description": "US launch prices: " + ", ".join(f"{i['name']} ${i['value']:g} ({i['sub']})" for i in items) + ".\nGTA 6 comes out November 19, 2026 on PS5 and Xbox Series X and S.\n#gta6 #playstation #xbox",
            "pinned_comment": "How many did you get right? 👇"}
    return "EdHL", "consoles", props, meta


def bestsellers(n, today):
    """Best-selling games ever (publisher-reported copies, data/best_selling_games.csv), GTA V always in."""
    import csv
    with open(DATA_DIR / "best_selling_games.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    rnd = random.Random(55 + n)
    gta = next(r for r in rows if r["game"] == "GTA V")
    pick = rnd.sample([r for r in rows if r is not gta], 4) + [gta]
    rnd.shuffle(pick)
    items = [{"name": r["game"], "sub": r["year"], "value": float(r["million_copies"])} for r in pick]
    top = max(items, key=lambda x: x["value"])
    props = {"pal": "vice", "duration": 20 + FOLLOW, "follow": follow_card(today, 20), "label": "HIGHER OR LOWER · GTA", "hookA": "Best-selling games ever.", "hookB": "Higher or lower?",
             "endA": f"The top seller here: {top['name']},", "endB": f"{top['value']:g} million copies.", "unit": "COPIES SOLD", "fmt": "millions",
             "items": items, "start": 2.2, "round": 3.7}
    meta = {"title": "Best-selling games ever: higher or lower? 🎮",
            "description": "Copies sold, as reported by the publishers: " + ", ".join(f"{r['game']} {float(r['million_copies']):g}M ({r['as_of']})" for r in pick)
                           + ".\nGTA V alone has sold over 230 million copies. GTA 6 comes out November 19, 2026.\n#gta6 #gtav #gaming",
            "pinned_comment": "How many did you get right? 👇"}
    return "EdHL", "bestsellers", props, meta


FORMATS = ["waited", "board", "waited", "receipt", "bestsellers", "waited", "board", "consoles", "waited", "coins"]
OTHER = {"board": board, "receipt": receipt, "coins": coins, "consoles": consoles, "bestsellers": bestsellers}


# ---------- video ----------
def pick_music(topic):
    files = sorted(f.name for f in (PUBLIC / "music").glob("*.mp3")) if (PUBLIC / "music").exists() else []
    pref = [f for f in files if f in ("headphonk.mp3", "chaos.mp3", "born-to-win.mp3")] or files
    return pref[sum(map(ord, topic)) % len(pref)] if pref else None


def render(out, final, flat_only=False):
    """3D finale first; if that fails, the flat finale. Tickets are the same either way."""
    from engine.texts import warn
    gl = "angle" if sys.platform == "darwin" else "swangle"
    base = ["npx", "remotion", "render", "src/index.ts", "EdWaited", str(final), "--codec=h264", "--crf=18"]
    if not flat_only:
        if subprocess.run(base + [f"--props={out / 'props.json'}", f"--gl={gl}"], cwd=VIDEO_DIR).returncode == 0:
            return "3d"
        print("      3D render failed, rendering the flat finale instead")
        warn(f"⚠️ 3D render failed for {out.name}, the flat finale was used instead.")
    props = json.loads((out / "props.json").read_text())
    (out / "props_flat.json").write_text(json.dumps({**props, "flat": True}, indent=2, ensure_ascii=False))
    subprocess.run(base + [f"--props={out / 'props_flat.json'}"], cwd=VIDEO_DIR, check=True)
    return "flat"


def make_other(kind, dry=False, today=None):
    from engine.texts import warn
    today = today or datetime.now().date()
    st = load_state()
    comp, sub, props, meta = OTHER[kind](st.get("other", {}).get(kind, 0), today)
    topic = f"gta_{sub}__{today:%Y%m%d}__{st['count']}"
    out = MEDIA_DIR / topic
    out.mkdir(parents=True, exist_ok=True)
    music = pick_music(topic)
    props["music"] = f"music/{music}" if music else None
    final = out / "final.mp4"
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    (out / "render.json").write_text(json.dumps({"music": music}, indent=2))
    (out / "upload.json").write_text(json.dumps({"topic": topic, **meta, "file": str(final)}, indent=2, ensure_ascii=False))
    print(f"      {topic}: {meta['title']} ({props['duration']}s, {comp}, music {music})")
    if dry:
        return topic, None
    gl = "angle" if sys.platform == "darwin" else "swangle"
    subprocess.run(["npx", "remotion", "render", "src/index.ts", comp, str(final), f"--props={out / 'props.json'}",
                    "--codec=h264", "--crf=18", f"--gl={gl}"], cwd=VIDEO_DIR, check=True)
    st = load_state()
    st["count"] += 1
    st.setdefault("other", {})[kind] = st.get("other", {}).get(kind, 0) + 1
    st["made"] = (st["made"] + [topic])[-200:]
    STATE.write_text(json.dumps(st, indent=2))
    return topic, final


def make_next(dry=False, flat_only=False, today=None, kind=None):
    """The next video in the rotation. Anything other than the waited reel falls back to it if it fails."""
    kind = kind or FORMATS[load_state()["count"] % len(FORMATS)]
    if kind != "waited":
        try:
            return make_other(kind, dry, today)
        except Exception as e:
            from engine.texts import warn
            print(f"      {kind} failed ({e}), making a waited reel instead")
            warn(f"⚠️ GTA {kind} reel failed, posted a waited reel instead.\n{e}")
            if not dry:
                st = load_state()
                st["count"] += 1     # move past it next time
                STATE.write_text(json.dumps(st, indent=2))
    return make(dry, flat_only, today)


def make(dry=False, flat_only=False, today=None):
    topic, props, meta, fin = build(today)
    out = MEDIA_DIR / topic
    out.mkdir(parents=True, exist_ok=True)
    music = pick_music(topic)
    props["music"] = f"music/{music}" if music else None
    final = out / "final.mp4"
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    (out / "render.json").write_text(json.dumps({"music": music}, indent=2))
    (out / "upload.json").write_text(json.dumps({"topic": topic, **meta, "file": str(final)}, indent=2, ensure_ascii=False))
    print(f"      {topic}: {meta['title']} ({props['duration']}s, music {music})")
    for r in props["rounds"]:
        print(f"          {r['name']:<14} {r['then']:>10} -> {r['now']:<12} {r['stamp']}")
    if dry:
        return topic, None
    render(out, final, flat_only)
    st = load_state()
    st["count"] += 1
    st["finales"] = (st["finales"] + [fin])[-20:]
    st["made"] = (st["made"] + [topic])[-200:]
    STATE.write_text(json.dumps(st, indent=2))
    return topic, final


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--flat", action="store_true")
    ap.add_argument("--post", action="store_true", help="post right away when done")
    ap.add_argument("--format", choices=["waited", "board", "receipt", "coins", "consoles", "bestsellers"], help="force one format")
    a = ap.parse_args()
    import run
    try:
        topic, final = make_next(a.dry, a.flat, kind=a.format)
        if final and a.post:
            run.post(topic, now=True, slot="waited")
        elif final:
            print(f"\nRendered {final}")
    except Exception as e:
        run.telegram(f"❌ GTA waited reel failed: {e}")
        raise
