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
ROUNDS = 6
HOOK, ROUND, FINALE = 2.3, 2.6, 5.2

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
    """Six pairs: 2 everyday prices, 1 cost-of-life number, 2 stocks, and a big-multiple stock saved for last."""
    today = today or datetime.now().date()
    st = load_state()
    n = st["count"] if seed is None else seed
    rnd = random.Random(1000 + n)
    got_s, got_p, got_l = [], [], []
    for t, nm in rnd.sample(STOCKS, len(STOCKS)):
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
    others = [x for x in got_s if x is not fin][:2]
    rest = (got_p[:2] + got_l[:1] + got_p[2:] + got_l[1:])[:ROUNDS - 1 - len(others)]
    mid = sorted(rest + others, key=lambda x: x["r"])
    opener = max((x for x in mid if x["kind"] == "price"), key=lambda x: x["r"], default=None)  # open on a shock everyone feels
    rounds = ([opener] if opener else []) + [x for x in mid if x is not opener] + [fin]
    hookA, hookB = HOOKS[n % len(HOOKS)]
    for x in rounds:
        x["stamp"] = mult_text(x["r"])
    days = (GTA6 - today).days
    badge = f"GTA 6 IN {days} DAYS" if days > 1 else "GTA 6 IS OUT TOMORROW" if days == 1 else "GTA 6 IS OUT TODAY" if days == 0 else "GTA 6 IS OUT"
    duration = round(HOOK + ROUNDS * ROUND + FINALE, 2)
    props = {"pal": "vice", "duration": duration, "label": "WHILE WE WAITED · GTA 6", "badge": badge, "hookA": hookA, "hookB": hookB,
             "teaser": "THE LAST ONE IS INSANE", "rounds": [{k: x[k] for k in ("name", "head", "what", "then", "now", "thenDate", "nowDate", "stamp", "r")} for x in rounds],
             "hook": HOOK, "round": ROUND, "flat": False}
    title = TITLES[n % len(TITLES)].format(fin=fin["name"].replace("the ", ""), mult=fin["stamp"].replace("×", "x"))
    lines = "\n".join(f"• {x['fact']}" for x in rounds)
    meta = {"title": title,
            "description": (f"GTA V came out on Sep 17, 2013. GTA 6 comes out on Nov 19, 2026. Here's what changed in between:\n{lines}\n\n"
                            "Sources: Yahoo Finance (adjusted close), US Bureau of Labor Statistics and FRED. Not financial advice.\n"
                            "#gta6 #gtav #gta"),
            "pinned_comment": "What did you buy in 2013? 👇"}
    topic = f"waited__{today:%Y%m%d}__{n}"
    return topic, props, meta, fin["key"]


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
    a = ap.parse_args()
    import run
    try:
        topic, final = make(a.dry, a.flat)
        if final and a.post:
            run.post(topic, now=True, slot="waited")
        elif final:
            print(f"\nRendered {final}")
    except Exception as e:
        run.telegram(f"❌ GTA waited reel failed: {e}")
        raise
