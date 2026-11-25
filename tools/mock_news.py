"""Mock of the Leonida Live news format (never posts). Renders 3 stills and the full reel on this machine.

    python tools/mock_news.py                    our best recent posted clip
    python tools/mock_news.py --fresh            like a real slot: finds fresh GTA 6 clips, screens them, takes the best new one
    python tools/mock_news.py --clip <key>       a given clip (a key of data/streamclips.json "seen", or its start)
    python tools/mock_news.py --mode crop        zoomed-in footage instead of the 1.15x band

--fresh screens with the real screener and saves what it saw to data/ (wiped by the next `git checkout -- data/`).
Outputs (exact paths printed at the end): media/mock_news/open.png, chyron.png, guess.png, news.mp4
"""
import argparse
import json
import random
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv

load_dotenv()
from engine import streamclips as sc
from config import MEDIA_DIR

VIDEO = ROOT / "video"
OPEN, FREEZE_FOR, SIGNOFF = 4.6, 5.5, 1.8          # the freeze: 0.5 s in, then a 5-second answer timer

COPY = {"name": "broadcast", "description": "The news copy for the segment.", "input_schema": {"type": "object", "properties": {
    "headline": {"type": "array", "items": {"type": "string"}, "description": "the cold-open headline, 2 or 3 short lines (max 13 characters each), tabloid TV style, "
                 "teasing the event without giving the ending away, e.g. ['MAN STEALS', 'GRANDMA'S', 'SCOOTER']"},
    "kicker": {"type": "string", "description": "a short line above the headline, max 32 characters: the place and time, e.g. 'Vice Beach · 9:47 PM'"},
    "chyron": {"type": "string", "description": "the lower-third headline, deadpan local-news voice, max 34 characters, never the ending"},
    "sub": {"type": "string", "description": "the line under it, max 46 characters, a dry joke or detail about this exact moment"},
    "ticker": {"type": "array", "items": {"type": "string"}, "description": "4 scrolling ticker items, max 44 characters each, deadpan fake news about THIS moment "
               "and its aftermath (witnesses, police statements, absurd follow-ups); funny, specific, never mean about real people"},
    "options": {"type": "array", "items": {"type": "string"}, "description": "3 answers to 'what happens next?', max 26 characters each, e.g. 'Owner breaks his hand'; "
                "exactly one is what really happens, the other two believable"},
    "answer": {"type": "integer", "description": "index (0-2) of the option that really happens"},
    "signoff": {"type": "string", "description": "the anchor's sign-off, max 30 characters, e.g. 'Back to you, Leonida.' or a dry callback"},
    "place": {"type": "string", "description": "where it happens in Leonida, max 14 characters, uppercase, e.g. VICE CITY, VICE BEACH, GRASSRIVERS; VICE CITY if unsure"},
    "clock": {"type": "string", "description": "a believable time of day matching the light on screen, e.g. 11:42 PM"},
    "weather": {"type": "string", "description": "the weather in the info strip matching the scene, max 14 characters, e.g. '84°F CLEAR' or '71°F RAIN'"},
    "wanted": {"type": "integer", "description": "1 to 5: how much trouble the person is in, as a GTA wanted level"}},
    "required": ["headline", "kicker", "chyron", "sub", "ticker", "options", "answer", "signoff", "place", "clock", "weather", "wanted"]}}
SYS = """You write 'Leonida Live', a deadpan local TV news segment about something that just happened in GTA 6 (the game's state is Leonida,
its city Vice City). The footage is a streamer's clip; the streamer is the 'eyewitness'. Voice: a straight-faced local news anchor
reporting absurd chaos as serious news. Funny through specifics and understatement, never cringe, no emojis, no hashtags.
Never give the payoff away before it plays (headline, chyron and sub tease it). Stay true to what happens in the clip.
Write in English even if the streamer speaks another language.
KEEP IT SIMPLE: our viewers are 13 to 25 and scroll fast. Every line must be understood in one second by a 13-year-old:
short everyday words, no clever wordplay that needs thinking, no fancy words (not 'ethics panel', 'altercation', 'deliberates').
Good: 'MAN CAN'T DECIDE IF HE SHOULD SHOOT', 'GUY CRASHES BIKE, BLAMES BIKE'. Funny comes from the situation, not big words."""


def usable(v):
    return v.get("use") and v.get("facecam") and v.get("face_visible") and v.get("peak") is not None and v.get("url") and not v.get("nudity")


def pick(st, ref, fresh_since=None):
    seen = st["seen"]
    if ref:
        key = next((k for k in seen if k == ref or k.startswith(ref)), None)
        if not key:
            raise SystemExit(f"no seen clip {ref}")
        return key, seen[key]
    if fresh_since:
        good = [(k, v) for k, v in seen.items() if v.get("at", "") >= fresh_since and not v.get("posted") and usable(v)]
        if not good:
            raise SystemExit("the fresh search found no usable clip with a facecam (see the screening above)")
    else:
        good = [(k, v) for k, v in seen.items() if v.get("posted") and (v.get("score") or 0) >= 7 and usable(v)]
    good.sort(key=lambda kv: (kv[1].get("score") or 0, kv[1].get("at", "")), reverse=True)
    if fresh_since and (good[0][1].get("score") or 0) < 7:
        print(f"      note: the best fresh clip only scored {good[0][1].get('score')}/10 (a real slot would skip it)")
    return good[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip")
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--mode", choices=["band", "crop"], default="band")
    a = ap.parse_args()
    since = None
    if a.fresh:
        since = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        print("      searching fresh clips like a real slot (screening only, nothing posts)...")
        sc.make(screen_only=True)
    st = sc.load_state()
    key, v = pick(st, a.clip, since)
    v = dict(v, layout="zoom")
    out = MEDIA_DIR / "mock_news"
    subprocess.run(["rm", "-rf", str(out)])
    out.mkdir(parents=True)
    print(f"      clip: {v.get('name')}: {v.get('moment')} ({v.get('score')}/10)")
    info = sc.media_info(sc.download(v["url"], out), v.get("language"))
    start, end = float(v["start"]), min(float(v["end"]), info["dur"])
    name = "mock_news"
    rel = sc.publish_src(info, name, 0)
    bg = sc.zoom_bg(info, v, name, 0)
    seg = sc.seg(info, v, rel, f"{v.get('name') or v.get('login')} on Twitch", start, end, bg=bg)
    peak = seg["peak"] if seg["peak"] is not None else seg["dur"] * 0.6
    freeze_at = round(max(2.2, min(peak - 0.6, seg["dur"] - 1.5)), 2)
    said = " ".join(w["w"] for w in seg["words"])[:600]
    copy = sc.ask([{"type": "text", "text": f"The moment: {v.get('moment')}. Setup: {v.get('setup')}. What the screener saw: {v.get('why')}\n"
                                            f"What is said: {said}\nThe footage freezes at {freeze_at:.1f}s, just before the payoff at {peak:.1f}s."}],
                  COPY, SYS)
    if not (0 <= int(copy.get("answer", 0)) < 3) or len(copy.get("options", [])) != 3:
        raise SystemExit(f"bad copy: {copy}")
    opts, ans = copy["options"], int(copy["answer"])
    order = random.sample(range(3), 3)                  # the right answer lands at a random letter
    copy["options"], copy["answer"] = [opts[i] for i in order], order.index(ans)
    copy["question"] = "What happens next?"
    copy["report"] = len(st.get("posted", [])) + 1      # the series number in the top bar
    print("      copy: " + json.dumps(copy, ensure_ascii=False, indent=1))
    duration = round(OPEN + seg["dur"] + FREEZE_FOR + SIGNOFF, 2)
    props = {"seg": seg, "copy": copy, "open": OPEN, "freezeAt": freeze_at, "freezeFor": FREEZE_FOR, "signoff": SIGNOFF, "duration": duration,
             "look": "news", "cc": True, "mode": a.mode, "quiz": "show"}
    pf = out / "props.json"
    pf.write_text(json.dumps(props, indent=2, ensure_ascii=False))
    stills = {"open.png": 4.0, "chyron.png": OPEN + min(2.0, freeze_at - 0.3), "guess.png": OPEN + freeze_at + 2.5}
    for fn, t in stills.items():
        subprocess.run(["npx", "remotion", "still", "src/index.ts", "EdNews", str(out / fn), f"--props={pf}", f"--frame={int(t * 30)}"], cwd=VIDEO, check=True)
    subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdNews", str(out / "news.mp4"), f"--props={pf}", "--codec=h264", "--crf=18"], cwd=VIDEO, check=True)
    print("\n      done:")
    for fn in [*stills, "news.mp4"]:
        print(f"      {out / fn}")


if __name__ == "__main__":
    main()
