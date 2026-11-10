"""Renders the final video for a topic with Remotion.

Preview props only (then open the studio to look at it):
    python -m engine.render <topic> --props-only
    cd video && npm run studio

Full render to media/<topic>/final.mp4:
    python -m engine.render <topic>
    python -m engine.render <topic> --theme paper     force a color theme
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import date

import requests

from config import MEDIA_DIR, ROOT

VIDEO_DIR = ROOT / "video"
PUBLIC = VIDEO_DIR / "public"
THEMES = ["neon", "money", "blood", "ice", "paper"]
CAPTION_SECTIONS = ("beat", "tension")  # captions only where the screen is not already showing the words
MAX_CAPTION_WORDS = 3
MAX_CAPTION_CHARS = 18


# ---------- helpers ----------
def norm(t):
    return re.sub(r"[^a-z0-9]", "", t.lower())


def pick_theme(topic, forced=None):
    if forced:
        if forced not in THEMES:
            raise ValueError(f"unknown theme {forced}, pick one of {THEMES}")
        return forced
    return THEMES[(date.today().toordinal() + sum(map(ord, topic))) % len(THEMES)]


def cache_image(url):
    """Downloads a logo or flag into video/public/img so the render never waits on the internet."""
    if not url:
        return None
    if not url.startswith("http"):
        return url  # already a local file in video/public
    name = hashlib.md5(url.encode()).hexdigest()[:16] + ".png"
    path = PUBLIC / "img" / name
    if not path.exists():
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(r.content)
        except requests.RequestException as e:
            print(f"  image skipped ({e.__class__.__name__}): {url.split('?')[0]}")
            return None
    return f"img/{name}"


# ---------- word timing from the script text ----------
def timed_tokens(section, words):
    """Script words of one section with times.

    The text comes from the script (so numbers stay whole, like $370,774), the timing comes from
    Whisper: each script word is placed at the same share of letters through the section.
    """
    toks = section["text"].split()
    ws = [w for w in words if section["start"] - 0.05 <= w["start"] < section["end"] + 0.05]
    if ws:
        lens = [max(len(norm(w["w"])), 1) for w in ws]
        total, acc, anchors = sum(lens), 0, []
        for w, n in zip(ws, lens):
            anchors.append((acc / total, (acc + n) / total, w["start"], w["end"]))
            acc += n
    else:
        anchors = [(0.0, 1.0, section["start"], section["end"])]

    def at(frac):
        for a0, a1, s, e in anchors:
            if frac <= a1:
                k = 0 if a1 == a0 else (frac - a0) / (a1 - a0)
                return s + (e - s) * max(0.0, min(1.0, k))
        return anchors[-1][3]

    tl = [max(len(norm(t)), 1) for t in toks]
    total, acc, out = sum(tl), 0, []
    for t, n in zip(toks, tl):
        out.append({"w": t, "start": round(at(acc / total), 3), "end": round(at((acc + n) / total), 3)})
        acc += n
    return out


def build_captions(sections, words):
    groups = []
    for s in sections:
        if not s["name"].startswith(CAPTION_SECTIONS):
            continue
        cur = []
        for tok in timed_tokens(s, words):
            shown = re.sub(r"[.,!?;:]+$", "", tok["w"])
            cur.append({**tok, "w": shown})
            chars = sum(len(c["w"]) + 1 for c in cur)
            if len(cur) >= MAX_CAPTION_WORDS or chars >= MAX_CAPTION_CHARS or re.search(r"[.!?,;:]$", tok["w"]):
                groups.append(cur)
                cur = []
        if cur:
            groups.append(cur)
    return [{"words": g, "start": g[0]["start"], "end": g[-1]["end"]} for g in groups]


def mention_times(short, sections, words):
    """Times when the voice names an item during the beats (its row lights up)."""
    target = [norm(x) for x in short.split() if norm(x)]
    times = []
    for s in sections:
        if not s["name"].startswith("beat"):
            continue
        toks = timed_tokens(s, words)
        keys = [norm(t["w"]) for t in toks]
        for i in range(len(keys) - len(target) + 1):
            if keys[i:i + len(target)] == target:
                times.append(toks[i]["start"])
    return times


# ---------- props ----------
def build_props(topic, theme=None):
    out = MEDIA_DIR / topic
    data = json.loads((out / "data.json").read_text())
    script = json.loads((out / "script.json").read_text())
    timing = json.loads((out / "timing.json").read_text())
    sections, words = timing["sections"], timing["words"]

    items = []
    for it in data["items"]:
        items.append({
            "label": it["label"], "short": it["short"], "year": it.get("year"),
            "start": it["start"], "end": it["end"],
            "image": cache_image(it.get("image")),
            "series": it.get("series"),
            "mentions": mention_times(it["short"], sections, words),
        })

    sfx = {k: (f"sfx/{k}.mp3" if (PUBLIC / "sfx" / f"{k}.mp3").exists() else None)
           for k in ("whoosh", "impact", "tick", "riser")}
    tracks = sorted((PUBLIC / "music").glob("*.mp3")) if (PUBLIC / "music").exists() else []
    music = f"music/{tracks[sum(map(ord, topic)) % len(tracks)].name}" if tracks else None

    facts = data["facts"]
    flip = data["recipe"] == "gta"  # for prices, the most expensive is the bad one
    badges = [
        {"short": facts["top_now"], "text": data["badges"]["top"], "tone": "bad" if flip else "good"},
        {"short": facts["bottom_now"], "text": data["badges"]["bottom"], "tone": "good" if flip else "bad"},
    ]

    props = {
        "theme": pick_theme(topic, theme),
        "duration": timing["duration"],
        "audio": "voice.wav",
        "music": music,
        "sfx": sfx,
        "hook": script["hook"],
        "unit": data["unit"],
        "startLabel": data["start_label"],
        "endLabel": data["end_label"],
        "startOrder": data.get("start_order", "given"),
        "race": bool(data.get("race")) and all(i["series"] for i in items),
        "sections": sections,
        "hookWords": [w for w in words if w["start"] < sections[0]["end"]],
        "captions": build_captions(sections, words),
        "items": items,
        "badges": badges,
        "sourceLabel": data["on_screen_source"],
    }

    (VIDEO_DIR / "props").mkdir(exist_ok=True)
    props_path = VIDEO_DIR / "props" / "current.json"
    props_path.write_text(json.dumps(props, indent=2))
    shutil.copy(out / "voice.wav", PUBLIC / "voice.wav")
    return props_path, props


def ensure_video_tools():
    """Installs the Remotion tools if they're missing (e.g. after replacing the video folder)."""
    if not (VIDEO_DIR / "node_modules" / "@remotion" / "cli").exists():
        print("Video tools missing, running npm install (one time, about a minute)...")
        subprocess.run(["npm", "install", "--no-audit", "--no-fund"], cwd=VIDEO_DIR, check=True)


def render(topic, theme=None):
    ensure_video_tools()
    props_path, props = build_props(topic, theme)
    print(f"      theme: {props['theme']}")
    final = MEDIA_DIR / topic / "final.mp4"
    cmd = ["npx", "remotion", "render", "src/index.ts", "RankingReveal", str(final),
           f"--props={props_path}", "--codec=h264", "--crf=18"]
    subprocess.run(cmd, cwd=VIDEO_DIR, check=True)
    return final


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("topic", nargs="?", default="gta_launch_prices")
    ap.add_argument("--theme", choices=THEMES)
    ap.add_argument("--props-only", action="store_true", help="only write props for the studio preview")
    a = ap.parse_args()
    if a.props_only:
        path, p = build_props(a.topic, a.theme)
        print(f"Props written to {path.relative_to(ROOT)} ({len(p['items'])} items, {p['duration']:.1f}s, theme {p['theme']})")
        print("Sound effects:", ", ".join(k for k, v in p["sfx"].items() if v) or "none yet (run python -m engine.sfx)")
        print("Music:", p["music"] or "none (add .mp3 tracks to video/public/music/)")
        print("Preview: cd video && npm run studio")
    else:
        f = render(a.topic, a.theme)
        print(f"\nRendered {f.relative_to(ROOT)}")
