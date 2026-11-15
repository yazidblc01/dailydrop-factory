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

from config import DATA_DIR, MEDIA_DIR, ROOT
from engine import images, story

VIDEO_DIR = ROOT / "video"
PUBLIC = VIDEO_DIR / "public"
THEMES = ["neon", "money", "blood", "ice", "paper"]
MUSIC_LIB = DATA_DIR / "music.json"
CAPTION_SECTIONS = ("beat", "tension")  # classic: captions only where the screen is not already showing the words
STORY_CAPTION_SECTIONS = ("tension", "call")  # story: not on the hook, reveal and end cards (the screen shows it)
MAX_CAPTION_CHARS = 44  # up to two lines; the template shrinks the text to fit


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


def load_music_lib():
    if not MUSIC_LIB.exists():
        return {}
    return {k: v for k, v in json.loads(MUSIC_LIB.read_text()).items() if not k.startswith("_")}


def pick_music(topic, recipe):
    """A track from data/music.json whose pool fits the topic type, the same one every render of a topic.
    Returns (file name, seconds of intro to skip) or (None, 0) if there is no music."""
    folder = PUBLIC / "music"
    files = sorted(f.name for f in folder.glob("*.mp3")) if folder.exists() else []
    if not files:
        return None, 0
    lib = load_music_lib()
    fitting = [f for f in files if recipe in lib.get(f, {}).get("pool", [])] or files
    name = fitting[sum(map(ord, topic)) % len(fitting)]
    return name, float(lib.get(name, {}).get("start", 0))


def music_credit(topic):
    """The credit line for the track used in a rendered topic (for the description), or None."""
    info = MEDIA_DIR / topic / "render.json"
    if not info.exists():
        return None
    name = json.loads(info.read_text()).get("music")
    return load_music_lib().get(name, {}).get("credit") if name else None


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


def build_captions(sections, words, only=CAPTION_SECTIONS):
    """Caption groups that follow the sentences: a group ends at a sentence end, long sentences are
    split into even parts, and a part is never a stray fragment of one or two words."""
    groups = []
    for s in sections:
        if not s["name"].startswith(only):
            continue
        sentence = []
        toks = timed_tokens(s, words)
        for n, tok in enumerate(toks):
            sentence.append({**tok, "w": re.sub(r"[.,!?;:]+$", "", tok["w"])})
            if not (re.search(r"[.!?]$", tok["w"]) or n == len(toks) - 1):
                continue
            chars = sum(len(c["w"]) + 1 for c in sentence)
            parts = max(1, -(-chars // MAX_CAPTION_CHARS))
            while parts > 1 and len(sentence) / parts < 3:
                parts -= 1
            size = -(-len(sentence) // parts)
            chunks = [sentence[k:k + size] for k in range(0, len(sentence), size)]
            if len(chunks) > 1 and len(chunks[-1]) < 3:  # no stray tail
                chunks[-2] += chunks.pop()
            groups += chunks
            sentence = []
    return [{"words": g, "start": g[0]["start"], "end": g[-1]["end"]} for g in groups if g]


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
    music_name, music_start = pick_music(topic, data.get("music_pool", data["recipe"]))

    facts = data["facts"]
    flip = data.get("flip", data["recipe"] == "gta")  # for prices, the most expensive is the bad one
    badges = [
        {"short": facts["top_now"], "text": data["badges"]["top"], "tone": "bad" if flip else "good"},
        {"short": facts["bottom_now"], "text": data["badges"]["bottom"], "tone": "good" if flip else "bad"},
    ]

    props = {
        "theme": pick_theme(topic, theme),
        "duration": timing["duration"],
        "audio": "voice.wav",
        "music": f"music/{music_name}" if music_name else None,
        "musicStart": music_start,
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
    (out / "render.json").write_text(json.dumps({"theme": props["theme"], "music": music_name}, indent=2))
    return props_path, props


def build_story_props(topic, theme=None):
    """Props for the StoryReel template: line race with the leader hidden, callouts, #1 reveal."""
    props_path, props = build_props(topic, theme)  # shared pieces: items, theme, music, sfx, badges, labels
    out = MEDIA_DIR / topic
    data = json.loads((out / "data.json").read_text())
    script = json.loads((out / "script.json").read_text())
    timing = json.loads((out / "timing.json").read_text())
    backgrounds = {}  # the line race fills every frame; photo backgrounds are kept for other scene types
    props["scenes"] = story.scene_plan(data, script, timing["sections"], backgrounds)
    props["captions"] = build_captions(timing["sections"], timing["words"], only=STORY_CAPTION_SECTIONS)
    props["duration"] = props["scenes"][-1]["end"]
    props_path.write_text(json.dumps(props, indent=2))
    return props_path, props


def ensure_video_tools():
    """Installs the Remotion tools if they're missing (e.g. after replacing the video folder)."""
    if not (VIDEO_DIR / "node_modules" / "@remotion" / "cli").exists():
        print("Video tools missing, running npm install (one time, about a minute)...")
        subprocess.run(["npm", "install", "--no-audit", "--no-fund"], cwd=VIDEO_DIR, check=True)


def render(topic, theme=None):
    ensure_video_tools()
    script = json.loads((MEDIA_DIR / topic / "script.json").read_text())
    if script.get("template") == "story":
        props_path, props = build_story_props(topic, theme)
        composition = "StoryReel"
    else:
        props_path, props = build_props(topic, theme)
        composition = "RankingReveal"
    print(f"      {composition}, theme: {props['theme']}, music: {props['music'] or 'none'}")
    final = MEDIA_DIR / topic / "final.mp4"
    if composition == "StoryReel":
        # the editorial design first; the old dark design only if it fails, so the day never breaks
        cmd = ["npx", "remotion", "render", "src/index.ts", "EdStory", str(final), f"--props={props_path}", "--codec=h264", "--crf=18"]
        if subprocess.run(cmd, cwd=VIDEO_DIR).returncode == 0:
            return final
        print("      editorial render failed, rendering the old design")
        from engine.texts import warn
        warn(f"⚠️ The new design failed for {topic}, the old dark design was used instead.")
    cmd = ["npx", "remotion", "render", "src/index.ts", composition, str(final),
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
        sc = json.loads((MEDIA_DIR / a.topic / "script.json").read_text())
        path, p = (build_story_props if sc.get("template") == "story" else build_props)(a.topic, a.theme)
        print(f"Props written to {path.relative_to(ROOT)} ({len(p['items'])} items, {p['duration']:.1f}s, theme {p['theme']})")
        print("Sound effects:", ", ".join(k for k, v in p["sfx"].items() if v) or "none yet (run python -m engine.sfx)")
        print("Music:", p["music"] or "none (add .mp3 tracks to video/public/music/)")
        print("Preview: cd video && npm run studio")
    else:
        f = render(a.topic, a.theme)
        print(f"\nRendered {f.relative_to(ROOT)}")
