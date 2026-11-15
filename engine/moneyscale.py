"""Money to scale: $10,000 in the best stock of a group, stacked in $100 bills next to real things.

Uses the same Yahoo data as the invest reels (groups and years in recipes.py). No voice and no Claude:
the numbers and the text are all built here, so a video costs nothing.

    python -m engine.moneyscale --list          which hero/year combos qualify (needs internet)
    python -m engine.moneyscale --dry           pick the next one and write props only
    python -m engine.moneyscale                 full render to media/ms__<TICKER>__<YEAR>/final.mp4
    python -m engine.moneyscale big_tech 2015   a specific group and year
"""
import argparse
import json
import subprocess
import sys
from datetime import date

from config import DATA_DIR, MEDIA_DIR
from engine import recipes, topics
from engine.render import PUBLIC, VIDEO_DIR, load_music_lib

PREFIX = "ms__"
START = 10_000
BILL_MM = 0.109
MIN_CM = 80          # taller than a fire hydrant, so it passes at least 3 things (can, cat, hydrant)
RECENT = 3           # the same company is not the hero twice in this many videos
YEAR_ORDER = [2015, 2012, 2013, 2010, 2018, 2020, 2008, 2005, 2021, 2022]
OBJECT_CM = [12.2, 30, 76, 178, 305, 550, 800]  # must match OBJECTS in video/src/MoneyScale.tsx
POOL = DATA_DIR / "topic_pool.json"


def cm(value):
    return value / 100 * BILL_MM / 10


def height(c):
    return f"{c / 100:.2f} m" if c >= 100 else f"{c:.1f} cm" if c >= 1 else f"{c * 10:.1f} mm"


def money(v):
    return f"${v:,.0f}"


def ticker_of(group, name):
    return next(t for t, n, _ in recipes.INVEST_GROUPS[group][1] if n == name)


def done_list():
    return [t for t in topics.load_history()["done"] if t.startswith(PREFIX)]


def bad_invest():
    """Invest topics the weekly audit found broken (missing data), skipped without downloading."""
    if not POOL.exists():
        return set()
    return {t for t, r in json.loads(POOL.read_text())["topics"].items() if r["status"] == "data"}


GAMING_GROUPS = ["gamer_gear", "gaming"]


def candidates(groups=None):
    for year in YEAR_ORDER:
        for group in groups or recipes.INVEST_GROUPS:
            yield group, year


def build(group, year):
    """Props + texts for one group/year, or None if it is not tall enough to be fun."""
    payload = recipes.build_invest(f"invest__{group}__{year}")
    items = sorted(payload["items"], key=lambda it: it["end"])
    hero, loser = items[-1], items[0]
    hero_v, loser_v = hero["end"] * START / 1000, loser["end"] * START / 1000
    hero_cm = cm(hero_v)
    if hero_cm < MIN_CM:
        return None
    passes = sum(1 for h in OBJECT_CM if cm(START) < h < hero_cm)
    grow_start = 2.6
    grow_end = grow_start + min(15.0, 2.3 * (passes + 1))
    compare_at = grow_end + 1.2
    s = hero["series"]
    t0, t1 = s[0][0], s[-1][0]
    series = [[round((t - t0) / (t1 - t0), 4), round(v * START / 1000, 2)] for t, v in s]
    as_of = date.fromisoformat(payload["data_as_of"])
    props = {
        "theme": "money",
        "duration": round(compare_at + 4.4, 2),
        "kicker": f"$10,000 IN {hero['label'].upper()} IN {year}",
        "question": "How tall is it now, in $100 bills?",
        "hero": {"label": hero["label"], "value": round(hero_v)},
        "loser": {"label": loser["label"], "value": round(loser_v)},
        "years": [year, as_of.year],
        "series": series,
        "sourceLabel": f"Source: Yahoo Finance, adjusted close, {year} to {as_of:%b %Y}. A $100 bill is 0.109 mm thick.",
        "growStart": grow_start,
        "growEnd": round(grow_end, 2),
        "compareAt": round(compare_at, 2),
        # editorial design (EdScale 3D, EdScaleFlat backup); the fields above feed the old MoneyScale last resort
        "pal": "paper",
        "label": "MONEY TO SCALE",
        "hookA": f"$10,000 of {hero['label']}, bought in {year}.",
        "hookB": "Stacked in $100 bills, how tall is it now?",
        "edDuration": round(grow_end + 7.6, 2),
    }
    h, l = hero["label"], loser["label"]
    meta = {
        "title": f"$10,000 in {h} in {year}, stacked in $100 bills 💵",
        "description": (f"$10,000 put into {h} at the start of {year} is worth {money(hero_v)} today "
                        f"(adjusted close, {as_of:%b %Y}). Stacked in $100 bills, that is {height(hero_cm)} tall. "
                        f"The same $10,000 in {l} is {money(loser_v)}, a stack of {height(cm(loser_v))}. "
                        f"Not financial advice."),
        "pinned_comment": f"What would you have put $10,000 into in {year}? 👇",
    }
    topic = f"{PREFIX}{ticker_of(group, h).replace('-USD', '').replace('=F', '')}__{year}"
    return topic, props, meta


def pick(groups=None, recent=RECENT):
    """The next qualifying video: not made before, and not the same hero as the last few."""
    done = done_list()
    recent_heroes = {t.split("__")[1] for t in done[-recent:]} if recent else set()
    skip = bad_invest()
    for group, year in candidates(groups):
        if f"invest__{group}__{year}" in skip:
            continue
        try:
            got = build(group, year)
        except Exception as e:  # a data hiccup on one group never stops the day
            print(f"      skipped {group} {year}: {e}")
            continue
        if not got:
            continue
        topic = got[0]
        if topic in done or topic.split("__")[1] in recent_heroes:
            continue
        return got
    raise RuntimeError("no money-to-scale video left")


def pick_music(topic):
    folder = PUBLIC / "music"
    files = sorted(f.name for f in folder.glob("*.mp3")) if folder.exists() else []
    if not files:
        return None, 0
    lib = load_music_lib()
    fitting = [f for f in files if "invest" in lib.get(f, {}).get("pool", [])] or files
    name = fitting[sum(map(ord, topic)) % len(fitting)]
    return name, float(lib.get(name, {}).get("start", 0))


def make(group=None, year=None, dry=False, gaming=False, flat_only=False):
    """Builds one video. Returns (topic, final path), like run.make. gaming=True: the GTA slot (gaming groups only)."""
    if group:
        got = build(group, int(year))
        if not got:
            raise RuntimeError(f"{group} {year} is not tall enough (needs {MIN_CM} cm)")
    else:
        got = pick(GAMING_GROUPS, recent=1) if gaming else pick()
    topic, props, meta = got
    out = MEDIA_DIR / topic
    out.mkdir(parents=True, exist_ok=True)
    music, start = pick_music(topic)
    props["music"] = f"music/{music}" if music else None
    props["musicStart"] = start
    final = out / "final.mp4"
    (out / "props.json").write_text(json.dumps(props, indent=2))
    (out / "render.json").write_text(json.dumps({"theme": "money", "music": music}, indent=2))
    (out / "upload.json").write_text(json.dumps({"topic": topic, **meta, "file": str(final)}, indent=2, ensure_ascii=False))
    print(f"      {topic}: {meta['title']} ({props['duration']}s, music {music})")
    print(f"      {props['hero']['label']} {money(props['hero']['value'])} vs {props['loser']['label']} {money(props['loser']['value'])}")
    if dry:
        return topic, None
    render(out, final, flat_only)
    return topic, final


def render(out, final, flat_only=False):
    """3D design first; if that fails, the same design drawn flat; if even that fails, the old design. The day never breaks."""
    from engine.texts import warn
    props = json.loads((out / "props.json").read_text())
    (out / "props_ed.json").write_text(json.dumps({**props, "duration": props["edDuration"]}, indent=2))
    gl = "angle" if sys.platform == "darwin" else "swangle"   # GitHub has no graphics card: software 3D
    base = ["npx", "remotion", "render", "src/index.ts"]
    ed = [f"--props={out / 'props_ed.json'}", "--codec=h264", "--crf=18"]
    if not flat_only:
        if subprocess.run(base + ["EdScale", str(final)] + ed + [f"--gl={gl}"], cwd=VIDEO_DIR).returncode == 0:
            return "3d"
        print("      3D render failed, rendering the flat version instead")
    if subprocess.run(base + ["EdScaleFlat", str(final)] + ed, cwd=VIDEO_DIR).returncode == 0:
        if not flat_only:
            warn(f"⚠️ 3D render failed for {out.name}, the flat version of the design was used instead.")
        return "flat"
    print("      flat render failed too, rendering the old design")
    warn(f"⚠️ 3D and flat renders both failed for {out.name}, the old dark design was used instead.")
    subprocess.run(base + ["MoneyScale", str(final), f"--props={out / 'props.json'}", "--codec=h264", "--crf=18"], cwd=VIDEO_DIR, check=True)
    return "old"


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("group", nargs="?")
    ap.add_argument("year", nargs="?")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--flat", action="store_true", help="flat version only (no 3D)")
    a = ap.parse_args()
    if a.list:
        done, n = set(done_list()), 0
        for g, y in candidates():
            try:
                got = build(g, y)
            except Exception as e:
                print(f"  error  {g} {y}: {e}")
                continue
            if got:
                n += 1
                print(f"  {'used ' if got[0] in done else 'ready'}  {got[0]:<20} {g} {y}: {got[1]['hero']['label']} {money(got[1]['hero']['value'])}")
        print(f"{n} qualify")
    else:
        topic, final = make(a.group, a.year, a.dry, flat_only=a.flat)
        if final:
            print(f"\nRendered {final}")
