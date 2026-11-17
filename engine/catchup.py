"""Catch-up for TikTok and Instagram: the reels posted before those two were connected, made again in today's
design and posted there only, one per run, oldest first. The Clock starts it 3 times a day (10:37, 13:37, 16:37).

What gets made again, by the old topic's name:
    texts__<story>         the same story, Texts from the future (new design)
    ms__<TICKER>__<year>   the same company and year, Money to scale
    invest__ / wb__ / prices__   the same data topic, a fresh script and voice
    waited__ / consoles__ / gta_<format>__   the same GTA format, built for today (GTA 6 countdown included)
Anything else is skipped. Done topics are kept in data/catchup.json.

    python -m engine.catchup --list        the queue
    python -m engine.catchup --dry         what the next one would be
    python -m engine.catchup               make the next one and post it to TikTok and Instagram
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime

from config import DATA_DIR, MEDIA_DIR
from engine import upload

STATE = DATA_DIR / "catchup.json"
ONLY = ["tiktok", "instagram"]


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {"done": [], "made": {}, "skipped": {}}


def save_state(st):
    STATE.write_text(json.dumps(st, indent=2, ensure_ascii=False))


def queue():
    """Live posts that never went to TikTok, oldest first."""
    st = load_state()
    seen = set(st["done"]) | set(st["skipped"])
    posts = upload.load_posts()
    old = [(p.get("posted_at", ""), t) for t, p in posts.items()
           if p.get("url") and "tiktok" not in (p.get("platforms") or []) and t not in seen]
    return [t for _, t in sorted(old)]


# ---------- making one again ----------
def data_reel(topic):
    from engine import data, render, script, voice
    data.build(topic)
    s, _ = script.write_script(topic)
    voice.build(topic)
    final = render.render(topic)
    meta = {"topic": topic, "title": s["title"], "description": s["description"], "pinned_comment": s["pinned_comment"], "file": str(final)}
    (MEDIA_DIR / topic / "upload.json").write_text(json.dumps(meta, indent=2))
    return topic, final


def scale_reel(topic):
    from engine import moneyscale, recipes
    _, ticker, year = topic.split("__")
    for group, spec in recipes.INVEST_GROUPS.items():
        if any(m[0].replace("-USD", "").replace("=F", "") == ticker for m in spec[1]):
            got = moneyscale.build(group, int(year))
            if got and got[0] == topic:
                return moneyscale.make(group, year)
    raise RuntimeError(f"can't rebuild {topic}")


def gta_reel(kind, sub=None):
    """A GTA wave format, built for today. The wave's own rotation is left exactly as it was."""
    from engine import waited
    keep = waited.STATE.read_text() if waited.STATE.exists() else None
    try:
        if kind == "waited":
            return waited.make()
        if kind == "board" and sub:   # the same board (gaps, gas, eggs...)
            n = next(i for i, (k, _) in enumerate(waited.BOARDS) if k == sub)
            st = waited.load_state()
            st.setdefault("other", {})["board"] = n
            waited.STATE.write_text(json.dumps(st, indent=2))
        return waited.make_other(kind)
    finally:
        if keep is not None:
            waited.STATE.write_text(keep)


def remake(old):
    if old.startswith("texts__"):
        from engine import texts
        return texts.make(old[len("texts__"):])
    if old.startswith("ms__"):
        return scale_reel(old)
    if old.split("__")[0] in ("invest", "wb", "prices"):
        return data_reel(old)
    if old.startswith("waited__"):
        return gta_reel("waited")
    if old.startswith("consoles__"):
        return gta_reel("consoles")
    if old.startswith("gta_"):
        sub = old.split("__")[0][len("gta_"):]          # board_gaps, receipt, bestsellers, coins, consoles
        kind, _, rest = sub.partition("_")
        return gta_reel(kind, rest or None)
    raise RuntimeError("no way to make this one again")


def run(dry=False):
    from run import telegram
    st = load_state()
    q = queue()
    if not q:
        print("Catch-up done: every old reel is on TikTok and Instagram.")
        return
    old = q[0]
    title = upload.load_posts()[old].get("title", old)
    print(f"Catch-up {len(st['done']) + 1}, {len(q)} left: {old} ({title})")
    if dry:
        return
    try:
        topic, final = remake(old)
    except Exception as e:
        print(f"      skipped: {e}")
        st["skipped"][old] = str(e)[:200]
        save_state(st)
        telegram(f"⚠️ Catch-up skipped {title}: {e}")
        return
    try:
        res = upload.post(topic, only=ONLY)
    except RuntimeError as e:
        if "link after" not in str(e):
            raise                      # nothing was posted: it gets tried again next run
        res = {"urls": {}}             # posted, the links just came slowly: never post it twice
        print(f"      posted, links still pending: {e}")
    st["done"].append(old)
    st["made"][old] = {"topic": topic, "urls": res.get("urls", {}), "at": datetime.now().isoformat(timespec="minutes")}
    save_state(st)
    meta = json.loads((MEDIA_DIR / topic / "upload.json").read_text())
    links = "\n".join(f"{p}: {u}" for p, u in res.get("urls", {}).items())
    telegram(f"📲 Catch-up ({len(q) - 1} left) on TikTok and Instagram: {meta['title']}\n{links}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        posts = upload.load_posts()
        for i, t in enumerate(queue(), 1):
            print(f"{i:>3}. {posts[t].get('posted_at', '')[:10]}  {t}  {posts[t].get('title', '')}")
        sys.exit()
    try:
        run(a.dry)
    except Exception as e:
        from run import telegram
        telegram(f"❌ Catch-up failed: {e}")
        raise
