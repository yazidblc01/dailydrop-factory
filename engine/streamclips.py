"""Stream clips: streamers' GTA 6 Twitch moments, made into Daily Drop verticals, 5 a day during the hype.

Slots (the Clock starts them through the GTA wave workflow, engine/waited.py):
    9:07, 12:07, 15:07, 20:07   one clip           make()
    18:07                       streamers react    make_react(): the same moment from 2 or 3 streamers, back to back
Anything that fails falls back: react -> a single clip -> a regular GTA wave reel. A slot is never empty.

Each run:
    0. housekeeping (once a day): find new streamers who allow clipping (engine/streamers.py) and read how our
       past clips did on all 4 platforms (engine/clipstats.py), so the picking below learns from it
    1. find      Twitch's official API: the last 36 h of GTA 6 clips from the allowlist (data/streamers.json),
                 ranked by views per hour x how unusual they are for that streamer x how that streamer does for us;
                 max 2 a day per streamer, never a clip we've looked at before
    2. screen    Claude sees 4 frames, the timed transcript and the loudness peaks: keeps real moments, rejects nudity,
                 big spoilers, early gore, songs and dead air; finds the facecam and the game; picks the star (reaction or
                 gameplay), the moment's label, the trim (start, end) and the peak; writes the hook, title and caption
    3. polish    trimmed to the 8 to 30 s core, a 1 s cold open of the peak, audio leveled to -14 LUFS,
                 a punch-in and a hit on the peak, captions from a stronger speech model with the strong swears starred
    4. render    video/src/ed/Clip.tsx
    5. gauntlet  a fresh Claude looks at frames of the finished vertical and fails it only if something is broken
    6. post      engine/upload.py, all 4 platforms, streamer credit and links in the caption

    python -m engine.streamclips --list     the ranked candidates right now (no Claude, no render)
    python -m engine.streamclips --dry      screen the best ones, no render
    python -m engine.streamclips            make one clip (posting is done by engine/waited.py --post)
    python -m engine.streamclips --react    make one "streamers react"
"""
import argparse
import base64
import json
import os
import re
import statistics
import subprocess
from datetime import datetime, timedelta, timezone

import requests

from config import CLAUDE_FAST, CLAUDE_MODEL, DATA_DIR, MEDIA_DIR
from engine import render
from engine.render import VIDEO_DIR
from engine.waited import GTA6, follow_card
FOLLOW = 1.2                     # the logo outro at the end of every clip

STATE = DATA_DIR / "streamclips.json"
ALLOW = DATA_DIR / "streamers.json"
HELIX = "https://api.twitch.tv/helix"
GAME = "Grand Theft Auto VI"
GAME5 = "Grand Theft Auto V"
# actions that look different between the games (GTA 5 vs GTA 6 reels pair clips by these); value = the on-screen word
ACTIONS = {"police chase": "POLICE", "car crash": "CRASHES", "swimming": "WATER", "falling": "FALLS", "explosion": "EXPLOSIONS",
           "shootout": "GUNFIGHTS", "driving fast": "DRIVING", "motorcycle": "BIKES", "flying": "FLYING", "fist fight": "FIGHTS",
           "robbery": "ROBBERIES", "weather": "WEATHER", "beach": "BEACHES", "npc reaction": "NPCS", "ragdoll": "RAGDOLL"}
MIN_S, MAX_S = 15, 60            # Twitch clips we look at
CUT_MIN, CUT_MAX = 12, 40        # what we keep: 12 to 20 s for a punchy moment, longer only when it needs a setup
MIN_VIEWS = 200                  # viewers voted: a clip needs this many Twitch views (views per hour and the outlier rank the rest)
FRESH_H = 24                     # fresh clips only (day-1 missions age out); 48 h if 24 comes up dry
MIN_SCORE = 7                    # the final pick's bar
FLOOR = 6                        # after a full search with no 7, the best 6 is posted; never lower
EXPOSED = {"FEMALE_BREAST_EXPOSED", "FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED", "BUTTOCKS_EXPOSED", "ANUS_EXPOSED"}
CLIP_PLATFORMS = ["youtube", "facebook"]   # plain clips: TikTok and Instagram demote reposted streams
PER_STREAMER_DAY = 2
SCREENS = 10         # most fresh clips the cheap model screens per reel (about half a cent each); free filter first
SWEARS = re.compile(r"^(f+u+c+k\w*|motherf\w*|s+h+i+t\w*|bitch\w*|asshole\w*|dick\w*|pussy\w*|bastard\w*|cunt\w*)([.,!?]*)$", re.I)
# the clip at the same loudness as every other, its picture lightly sharpened (it gets enlarged in the vertical) and kept near-lossless
LEVEL = ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-vf", "unsharp=5:5:0.6:5:5:0.0", "-c:v", "libx264", "-crf", "12", "-preset", "veryfast",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k"]


# ---------- state ----------
def load_state():
    st = json.loads(STATE.read_text()) if STATE.exists() else {}
    return {"used": st.get("used", []), "count": st.get("count", 0), "seen": st.get("seen", {}),
            "posted": st.get("posted", []), "house": st.get("house", ""), "seen5": st.get("seen5", {})}


def save_state(st):
    st["used"] = st["used"][-800:]
    cut = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    st["seen"] = {k: v for k, v in st["seen"].items() if v.get("at", "") > cut}
    st["posted"] = st["posted"][-300:]
    STATE.write_text(json.dumps(st, indent=2, ensure_ascii=False))


def allowlist():
    j = json.loads(ALLOW.read_text())
    return {k: v for k, v in j.get("twitch", {}).items() if k not in j.get("blocked", {})}


# ---------- 0. housekeeping ----------
def housekeeping(st):
    """Once a day: new streamers and recent results. Never blocks the run."""
    today = datetime.now().strftime("%Y-%m-%d")
    if st["house"] == today:
        return
    for label, job in (("streamer discovery", "engine.streamers"), ("clip stats", "engine.clipstats")):
        try:
            __import__(job, fromlist=["run"]).run()
        except Exception as e:
            print(f"      {label} skipped: {e}")
    st["house"] = today


# ---------- 1. find ----------
def token():
    r = requests.post("https://id.twitch.tv/oauth2/token", timeout=30, data={
        "client_id": os.environ["TWITCH_CLIENT_ID"], "client_secret": os.environ["TWITCH_CLIENT_SECRET"],
        "grant_type": "client_credentials"})
    r.raise_for_status()
    return r.json()["access_token"]


def helix(path, tok, **params):
    r = requests.get(f"{HELIX}/{path}", params=params, timeout=30,
                     headers={"Client-ID": os.environ["TWITCH_CLIENT_ID"], "Authorization": f"Bearer {tok}"})
    r.raise_for_status()
    return r.json()["data"]


def game_id(tok, name=GAME):
    g = helix("games", tok, name=name)
    if not g:
        raise RuntimeError(f"Twitch has no '{name}' category")
    return g[0]["id"]


def candidates(st, hours=FRESH_H, game=GAME):
    """Allowlisted clips of `game` (GTA 6 unless asked) from the last `hours`, best first."""
    from engine import clipstats
    tok = token()
    gid = game_id(tok, game)
    logins = list(allowlist())
    users = []
    for i in range(0, len(logins), 100):
        users += helix("users", tok, login=logins[i:i + 100])
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    until = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    today = datetime.now().strftime("%Y-%m-%d")
    done_today = {}
    for p in st["posted"]:
        if p["date"] == today:
            for lg in p["logins"]:
                done_today[lg] = done_today.get(lg, 0) + 1
    weights = clipstats.weights()
    used = set(st["used"])
    out = []
    for u in users:
        if done_today.get(u["login"], 0) >= PER_STREAMER_DAY:
            continue
        # ended_at matters: without it Twitch only searches the first week after started_at (that hid every GTA 5 clip)
        clips = [c for c in helix("clips", tok, broadcaster_id=u["id"], started_at=since, ended_at=until, first=100) if c["game_id"] == gid]
        if not clips:
            continue
        med = statistics.median([c["view_count"] for c in clips]) or 1
        for c in clips:
            if c["id"] in used or not MIN_S <= c["duration"] <= MAX_S or c["view_count"] < MIN_VIEWS:
                continue
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(c["created_at"].replace("Z", "+00:00"))).total_seconds() / 3600
            c["login"], c["vph"], c["outlier"] = u["login"], c["view_count"] / max(age, 1), c["view_count"] / med
            c["rank"] = c["vph"] * min(c["outlier"], 9) ** 0.5 * weights.get(u["login"], 1.0)
            out.append(c)
    return sorted(out, key=lambda c: -c["rank"])


# ---------- 2. screen ----------
def download(url, out):
    dst = out / "source.mp4"
    if not dst.exists():
        # the sharpest version Twitch has (1080p60 when the streamer streams in it)
        subprocess.run(["yt-dlp", "-q", "--no-warnings", "-S", "res,fps,br", "-f", "b", "-o", str(dst), url], check=True, timeout=300)
    lvl = out / "level.mp4"                        # every clip at the same loudness
    if not lvl.exists():
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(dst), *LEVEL, str(lvl)], check=True, capture_output=True, timeout=300)
    return lvl


def probe(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                        "-of", "json", str(f)], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    return j["streams"][0]["width"], j["streams"][0]["height"], float(j["format"]["duration"])


def audio(f):
    import numpy as np
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


def peaks(a, n=3):
    """The loudest moments (seconds), from 0.25 s windows, at least 2 s apart."""
    import numpy as np
    if a.size < 16000:
        return []
    w = 4000
    rms = np.sqrt((a[: a.size // w * w].reshape(-1, w) ** 2).mean(1))
    rms = np.convolve(rms, np.ones(3) / 3, "same")
    out = []
    for i in np.argsort(-rms):
        t = round(float(i) * 0.25, 2)
        if all(abs(t - o) > 2 for o in out):
            out.append(t)
        if len(out) == n:
            break
    return out


def contrast(a):
    """How much the loudest moment stands out from the clip's usual level (a scream or a crash scores high)."""
    import numpy as np
    if a.size < 16000:
        return 0.0
    w = 4000
    rms = np.sqrt((a[: a.size // w * w].reshape(-1, w) ** 2).mean(1))
    return float(rms.max() / max(np.median(rms), 1e-6))


def worth_a_look(a, words):
    """Free check before any Claude call: the clip has sound, and either someone talks or something loud happens."""
    if a.size < 16000:
        return "no audio"
    if len(words) < 6 and contrast(a) < 2.0:
        return "silent and flat (nobody talks, nothing loud happens)"
    return None


_MODEL = None


def transcribe(a):
    """Word timings from a stronger model than the narration uses (stream audio is noisy). Strong swears get starred."""
    global _MODEL
    if a.size < 16000:
        return []
    from faster_whisper import WhisperModel
    if _MODEL is None:
        _MODEL = WhisperModel("distil-large-v3", device="cpu", compute_type="int8")
    segs, _ = _MODEL.transcribe(a, word_timestamps=True, language="en", vad_filter=True)
    words = []
    for s in segs:
        for w in s.words or []:
            t = w.word.strip()
            m = SWEARS.match(t)
            if m:
                t = m.group(1)[0] + "*" * (len(m.group(1)) - 1) + m.group(2)
            if t:
                words.append({"w": t, "start": round(w.start, 2), "end": round(w.end, 2)})
    return words


def frames(f, times, out, tag):
    paths = []
    for i, t in enumerate(times):
        p = out / f"{tag}{i}.jpg"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(0, t):.2f}", "-i", str(f), "-frames:v", "1", "-vf", "scale=768:-2", str(p)],
                       check=True, capture_output=True)
        paths.append(p)
    return paths


def sheet(f, t0, t1, out, tag, n=12):
    """A contact sheet: n frames spread over [t0, t1], tiled 4 x 3 in one image, each stamped with its time.
    One image costs about as much as one frame, and shows the whole clip (pauses, menus, black screens...)."""
    import cv2
    import numpy as np
    times = [t0 + (t1 - t0) * (i + 0.5) / n for i in range(n)]
    tiles = []
    for i, t in enumerate(times):
        p = out / f"{tag}_t{i}.jpg"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(0, t):.2f}", "-i", str(f), "-frames:v", "1", "-vf", "scale=384:216", str(p)],
                       check=True, capture_output=True)
        im = cv2.imread(str(p))
        im = im if im is not None else np.zeros((216, 384, 3), np.uint8)
        cv2.rectangle(im, (0, 0), (92, 30), (0, 0, 0), -1)
        cv2.putText(im, f"{t:.1f}s", (6, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        tiles.append(im)
        p.unlink(missing_ok=True)
    grid = np.vstack([np.hstack(tiles[r * 4:(r + 1) * 4]) for r in range(n // 4)])
    path = out / f"{tag}_sheet.jpg"
    cv2.imwrite(str(path), grid, [cv2.IMWRITE_JPEG_QUALITY, 82])
    return path, times


def clean_trim(s, e, peak, dead):
    """The longest stretch of [s, e] with no dead span in it (pause, map, menu...), keeping the peak if it can."""
    cuts = sorted((max(s, float(a)), min(e, float(b))) for a, b in (d for d in dead if len(d) == 2) if float(b) > s and float(a) < e)
    pieces, cur = [], s
    for a, b in cuts:
        if a > cur:
            pieces.append((cur, a))
        cur = max(cur, b)
    if cur < e:
        pieces.append((cur, e))
    if not pieces:
        return None
    with_peak = [x for x in pieces if x[0] <= peak <= x[1]]
    return max(with_peak or pieces, key=lambda x: x[1] - x[0])


def img(p):
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(p.read_bytes()).decode()}}


def ask(content, tool, system, model=CLAUDE_MODEL):
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    msg = client.messages.create(model=model, max_tokens=2000, system=system, tools=[tool],
                                 messages=[{"role": "user", "content": content}])
    for b in msg.content:
        if b.type == "tool_use":
            return dict(b.input)
    text = "".join(b.text for b in msg.content if b.type == "text")
    return json.loads(text[text.find("{"): text.rfind("}") + 1])


BOX = {"type": ["object", "null"], "properties": {"x": {"type": "number"}, "y": {"type": "number"}, "w": {"type": "number"}, "h": {"type": "number"}}}
SCREEN = {"name": "screen", "description": "Your verdict on the clip.", "input_schema": {"type": "object", "properties": {
    "use": {"type": "boolean", "description": "true unless one of the reject rules applies"},
    "why": {"type": "string"},
    "score": {"type": "integer", "description": "1-10, how likely it is to stop a scroll"},
    "star": {"type": "string", "enum": ["reaction", "gameplay"], "description": "what makes it worth watching"},
    "moment": {"type": "string", "description": "3 to 6 words naming the game moment, so the same moment can be matched across streamers, e.g. 'first time seeing Lucia', 'first police chase', 'the opening drive'"},
    "action": {"type": "string", "enum": [*ACTIONS, "none"], "description": "the main on-screen action, for GTA 5 vs GTA 6 comparisons; none if no clear one"},
    "facecam": {**BOX, "description": "the streamer's webcam as fractions of the frame (x, y = top-left), null if none"},
    "gamebox": {**BOX, "description": "the region that shows the game itself, as fractions, leaving out chat, black bars, borders and the streamer's overlays (social-handle bars, alerts, goals)"},
    "start": {"type": "number", "description": "seconds: where the reel starts. Punchy moment: just before it (12 to 20 s in total). Only a moment that needs a setup starts earlier (up to 40 s)"},
    "nudity": {"type": "boolean", "description": "true if any nude body shows (it gets blurred automatically, do NOT reject for it)"},
    "face_visible": {"type": "boolean", "description": "true only if a REAL HUMAN face shows on a webcam. An avatar, VTuber, cartoon, mascot or costume head does NOT count"},
    "dead": {"type": "array", "items": {"type": "array", "items": {"type": "number"}},
             "description": "[start, end] seconds where nothing playable shows: a pause or settings menu, the map, photo mode, a loading or black screen, frozen video, alt-tabbed away. Empty if none"},
    "captioned": {"type": "boolean", "description": "true if the stream already shows its OWN burned-in captions of what the streamer says (not the game's subtitles)"},
    "dark": {"type": "boolean", "description": "true if the gameplay is too dark to see what happens"},
    "end": {"type": "number", "description": "seconds: after the streamer's reaction to the payoff ends"},
    "story": {"type": "boolean", "description": "true only if a viewer with no context can follow it: a setup, a payoff and a reaction"},
    "setup": {"type": "string", "description": "one line shown for the first seconds, 6 to 14 words, present tense, what is going on BEFORE the payoff, never revealing it. E.g. 'xQc tries to rob a store with cops one block away'"},
    "cold_open": {"type": "boolean", "description": "true only if flashing the payoff for 1 second first makes sense on its own (a crash, an explosion); false for anything that needs the setup"},
    "peak": {"type": "number", "description": "seconds: the single best instant (the scream, the crash, the punchline)"},
    "hook": {"type": "string", "description": "2 to 5 words on screen for the first 3 seconds. Tease the moment, NEVER state its ending ('HE TRIED TO OUTRUN THE COPS', not 'HE DROVE INTO THE CANAL')."},
    "title": {"type": "string", "description": "starts with 'GTA 6', under 60 characters, no hashtags. Reaction clips name the streamer: 'GTA 6: Lacy Sees Lucia For The First Time'."},
    "description": {"type": "string", "description": "1 or 2 short sentences"},
    "pinned_comment": {"type": "string", "description": "a question that gets replies"}},
    "required": ["use", "why", "score", "star", "moment", "start", "end", "peak", "story", "setup", "cold_open", "nudity", "face_visible", "dead", "captioned", "dark", "hook", "title", "description", "pinned_comment"]}}

SCREEN_SYS = """You are the first filter for GTA 6 stream clips for The Daily Drop, a Shorts channel for gamers 13 to 25.
What wins (our hit: a streamer knocks a grandma off her mobility scooter and steals it, his face cracking up on camera):
an absurd, chaotic or funny thing happening, plus a visible reaction. Our reels carry big captions of everything said, so a
funny line of dialogue counts too: it doesn't have to work on mute.
Score 1 to 10 on that. Low scores: talking about the game, opinions ("it's too easy"), menus, walking around, a truck driving by.
Reject the clip (use=false) ONLY if:
- a sex act or sexual scene (nudity alone is fine: it gets blurred automatically; set nudity=true)
- slurs or hateful content (ordinary swearing is fine: it gets bleeped)
- a major story spoiler (an ending, a main character's death, a big twist)
- graphic gore in the first 7 seconds
- a song with lyrics clearly playing
- no story (story=false): ONLY when nothing understandable happens: wandering around, menus, loading, talking about something
  off screen. For GTA, chaos IS the story: an action and its consequence (a fight then the cops, a crash then an explosion, a theft
  then a chase, running naked through a club with cops coming) or a fail and the streamer reacting all count as a story
- the reaction is the star but the streamer's face is not visible (face_visible=false): a voice over gameplay is not a reaction
Find the facecam and the game region. Trim to fit the moment: a punchy moment is 12 to 20 seconds, starting just before it;
only a moment that needs context starts earlier (up to 40 s). End after the reaction, no dead air. Write the setup line.
Also tag the main on-screen action (police chase, car crash, ...) so the clip can be paired with GTA 5; none if there isn't one."""

SCREEN5_SYS = """You tag GTA 5 (Grand Theft Auto V) stream clips, to pair them with GTA 6 clips of the SAME action in a 'GTA 5 vs GTA 6' Short.
use=true only if one action is clearly happening in the game on screen: a police chase, a car crash, swimming, a fall, an explosion,
a shootout, fast driving, a motorcycle, flying, a fist fight, a robbery, weather, a beach, NPCs reacting, ragdoll physics.
use=false if it's mostly talking, menus, a loading screen, chat or the facecam, or if there is nudity, gore in the first 7 seconds,
slurs or a song with lyrics. Find the game region and the facecam. Trim start/end tightly around the action (6 to 12 seconds)
and put the peak on its best instant. Fill hook/title/description/pinned_comment with a few words; they are not used."""

GAUNTLET = {"name": "verdict", "description": "Pass or fail the vertical.", "input_schema": {"type": "object", "properties": {
    "pass": {"type": "boolean"}, "faults": {"type": "string"}}, "required": ["pass", "faults"]}}

GAUNTLET_SYS = """You review frames of a finished vertical Short before it posts. Fail it ONLY if something is broken:
the video is black, frozen or just blur; the facecam crop cuts the face off badly; the hook text is unreadable or covers the
streamer's face; or nudity is visible. Small layout preferences are not a reason to fail. Otherwise pass it."""


def timed(words):
    lines, cur, t0 = [], [], None
    for w in words:
        t0 = w["start"] if t0 is None else t0
        cur.append(w["w"])
        if len(cur) >= 8:
            lines.append(f"[{t0:.1f}s] {' '.join(cur)}")
            cur, t0 = [], None
    if cur:
        lines.append(f"[{t0:.1f}s] {' '.join(cur)}")
    return "\n".join(lines)[:2500] or "(no speech)"


def screen(c, src, dur, words, loud, out, system=None):
    pk0 = min(max(loud[0] if loud else dur * 0.5, 0.0), dur - 0.2)
    sh, times = sheet(src, 0.0, dur, out, "src")
    content = [img(sh), *map(img, frames(src, [pk0], out, "pk")), {"type": "text", "text":
               f"Streamer: {c['broadcaster_name']} (Twitch). Clip title: {c['title']}. {dur:.1f} s long, {c.get('view_count', '?')} views.\n"
               f"Image 1: a contact sheet of the whole clip, 12 frames left to right, top to bottom, each stamped with its time "
               f"({', '.join(f'{t:.1f}s' for t in times)}). Image 2: the frame at the loudest moment ({pk0:.1f}s).\n"
               f"Loudest moments (s): {loud}\nWhat they say, with times:\n{timed(words)}"}]
    v = ask(content, SCREEN, system or SCREEN_SYS, model=CLAUDE_FAST)   # the cheap model screens; the strong one writes the words on winners
    # keep the trim sane, whatever came back
    if v.get("use") and v.get("story") is False:
        v["use"] = False
        v["why"] = f"no story: {v.get('why', '')}"
    if v.get("use") and v.get("star") == "reaction" and not v.get("face_visible"):
        v["use"] = False
        v["why"] = f"reaction with no real face on screen: {v.get('why', '')}"
    if v.get("use") and v.get("dark"):
        v["use"] = False
        v["why"] = f"too dark to see: {v.get('why', '')}"
    peak = v.get("peak")
    peak = float(peak) if peak is not None else (loud[0] if loud else dur / 2)
    peak = min(max(peak, 0.0), dur)
    s, e = float(v.get("start") or 0), float(v.get("end") or dur)
    if not (0 <= s < e <= dur + 0.5) or not (s <= peak <= e):
        s, e = max(0.0, peak - 9), min(dur, peak + 4)
    e = min(e, dur)
    if e - s > CUT_MAX:
        s = max(s, min(peak - 3, e - CUT_MAX))
        e = min(e, s + CUT_MAX)
    if e - s < CUT_MIN:
        s, e = max(0.0, e - CUT_MIN), min(dur, max(e, s + CUT_MIN))
    if v.get("dead"):                                   # cut out pauses, the map, menus, black screens
        piece = clean_trim(s, e, peak, v["dead"])
        if not piece or piece[1] - piece[0] < 7.0:          # a clean stretch of 7 s still makes a punchy reel
            if v.get("use"):
                v["use"] = False
                v["why"] = f"too much pause/menu/black screen: {v.get('why', '')}"
        else:
            s, e = piece
            peak = min(max(peak, s), e)
    v.update({"start": round(s, 2), "end": round(e, 2), "peak": round(peak, 2)})
    return v


# ---------- the final pick (the strong model) ----------
FINAL = {"name": "pick", "description": "Pick the clip to post, or none.", "input_schema": {"type": "object", "properties": {
    "pick": {"type": "integer", "description": "the number of the best clip (always name one)"},
    "score": {"type": "integer", "description": "1 to 10 for that clip, as it will look in our finished reel"},
    "why": {"type": "string"},
    **{k: SCREEN["input_schema"]["properties"][k] for k in ("setup", "hook", "title", "description", "pinned_comment")}},
    "required": ["pick", "score", "why", "setup", "hook", "title", "description", "pinned_comment"]}}
FINAL_SYS = """You make the final call on which GTA 6 stream clip The Daily Drop posts (Shorts, gamers 13 to 25).
What wins: an absurd, chaotic or funny thing happening, with the streamer's face reacting. Our reels caption every word said,
so a funny line of dialogue works too. Chaos is a story: an action and its consequence, or a fail and the reaction.
Our hit: a streamer knocks a grandma off her mobility scooter and steals it. A flop: a streamer says the game is too easy as a truck drives by.
Judge each clip as it will look in OUR finished reel, not raw: nudity gets blurred automatically, swears get bleeped,
every word said is captioned on screen, and the setup line you write explains the context in the first seconds.
So never mark a clip down for nudity, swearing or needing context. Mark it down for a weak or unclear payoff, no reaction,
or a moment we already posted. Name the best clip and score it honestly (7+ = we'd be proud to post it).
Never pick a moment we already posted recently (the list is given). Then write its words:
Mark a clip down hard if the sheet shows a pause screen, the map, a menu, photo mode, a black or very dark screen, or nothing moving.
hook = the EVENT in 2 to 5 words ('HE STOLE GRANDMA'S SCOOTER'), never a mood ('X LOST IT', 'X IS UNIMPRESSED'),
and never the ending of the moment (tease it: 'HE TRIED TO OUTRUN THE COPS', not 'HE DROVE INTO THE CANAL').
title starts with 'GTA 6: ' and names the event. setup = the context line, never giving the payoff away."""


def recent_moments(st, days=3):
    cut = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    return [p.get("moment") for p in st["posted"] if p.get("moment") and p["date"] >= cut]


def final_pick(cands, st, out):
    """The strong model sees the finalists side by side (2 frames each) and picks one, or none."""
    content = []
    for i, (c, v, info) in enumerate(cands):
        sh, _ = sheet(info["src"], v["start"], v["end"], out, f"fin{i}")
        shots = [sh]
        content += [{"type": "text", "text": f"Clip {i}: {c['broadcaster_name']}, '{c['title']}' ({c.get('view_count', '?')} Twitch views). "
                                             f"Screener: {v.get('score')}/10, star {v.get('star')}, moment: {v.get('moment')}. {v.get('why')}\n"
                                             f"Trim {v['start']}-{v['end']}s, peak {v['peak']}s. Said:\n"
                                             f"{timed([w for w in info['words'] if v['start'] <= w['start'] <= v['end']])}\n"
                                             f"Image: a contact sheet of the trim, 12 frames in order."}, *map(img, shots)]
    rec = recent_moments(st)
    content.append({"type": "text", "text": "Moments we posted in the last 3 days (don't repeat): " + ("; ".join(rec) if rec else "none")})
    try:
        return ask(content, FINAL, FINAL_SYS)
    except Exception as e:
        print(f"        final pick failed ({str(e)[:80]}), taking the screener's best")
        i = max(range(len(cands)), key=lambda j: cands[j][1].get("score") or 0)
        return {"pick": i, "score": cands[i][1].get("score") or 0, "why": "screener's best"}


def bleep(info, out):
    """Swear words muted with a beep laid over them (the captions star them out). Returns info for the new file."""
    spans = [(max(0.0, w["start"] - 0.03), w["end"] + 0.03) for w in info["words"] if SWEARS.match(re.sub(r"[^\w*.,!?]", "", w["w"]) or "") or "*" in w["w"]]
    if not spans:
        return info
    on = "+".join(f"between(t,{a:.2f},{b:.2f})" for a, b in spans)
    dst = out / "bleeped.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(info["src"]), "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
                    "-filter_complex", f"[0:a]volume='if({on},0,1)':eval=frame[m];[1:a]volume='if({on},0.35,0)':eval=frame[b];"
                    f"[m][b]amix=inputs=2:duration=first:normalize=0[a]", "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    str(dst)], check=True)
    print(f"        bleeped {len(spans)} word(s)")
    return {**info, "src": dst}


_NUDE = None


def nude_boxes(src, t0, t1, out, fps=5):
    """NudeNet (free, runs on the processor) on frames of [t0, t1]: exposed body parts as (time, x, y, w, h), as fractions of the frame."""
    global _NUDE
    from nudenet import NudeDetector
    _NUDE = _NUDE or NudeDetector()
    d = out / "nn"
    subprocess.run(["rm", "-rf", str(d)])
    d.mkdir()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(0.0, t0):.2f}", "-to", f"{t1:.2f}", "-i", str(src), "-vf", f"fps={fps},scale=960:-2",
                    str(d / "%05d.jpg")], check=True)
    found = []
    for f in sorted(d.glob("*.jpg")):
        t = max(0.0, t0) + (int(f.stem) - 1) / fps
        import cv2                                # comes with NudeNet
        H, W = cv2.imread(str(f)).shape[:2]
        for hit in _NUDE.detect(str(f)):
            if hit["class"] in EXPOSED and hit["score"] >= 0.3:
                x, y, w, h = hit["box"]
                found.append((t, x / W, y / H, w / W, h / H))
    subprocess.run(["rm", "-rf", str(d)])
    return found


def blur_list(src, start, end, out):
    """Blur boxes for the trimmed part: each box 30% bigger and held 0.5 s either side, so a missed frame never flashes anything."""
    out_list = []
    for t, x, y, w, h in nude_boxes(src, start - 0.5, end + 0.5, out):
        cx, cy, w2, h2 = x + w / 2, y + h / 2, w * 1.3, h * 1.3
        out_list.append({"t0": round(t - 0.5, 2), "t1": round(t + 0.5, 2), "x": round(cx - w2 / 2, 4), "y": round(cy - h2 / 2, 4),
                         "w": round(w2, 4), "h": round(h2, 4)})
    if out_list:
        print(f"        blurring {len(out_list)} nudity box(es)")
    return out_list


COPY = {"name": "copy", "description": "The words for the reel.", "input_schema": {"type": "object", "properties": {
    k: SCREEN["input_schema"]["properties"][k] for k in ("setup", "hook", "title", "description", "pinned_comment")},
    "required": ["setup", "hook", "title", "description", "pinned_comment"]}}


def copy(c, v, words):
    """The strong model rewrites the hook, title and text for a clip that passed (text only, no images: cheap)."""
    try:
        w = ask([{"type": "text", "text": f"Streamer: {c['broadcaster_name']} (Twitch). Clip title: {c['title']}.\n"
                  f"The star is the {v.get('star')}. Moment: {v.get('moment')}. Screener notes: {v.get('why')}\n"
                  f"Draft setup line: {v.get('setup')} | draft hook: {v.get('hook')} | draft title: {v.get('title')}\nWhat they say, with times:\n{timed(words)}\n\n"
                  "Write the best scroll-stopping words for this Short."}], COPY,
                "You write the on-screen hook, title, description and pinned comment for GTA 6 stream-clip Shorts "
                "(gamers 13 to 25). Follow each field's rules exactly. No spoilers.")
        v.update({k: w[k] for k in ("setup", "hook", "title", "description", "pinned_comment") if w.get(k)})
    except Exception as e:
        print(f"        copy kept from the screener ({str(e)[:80]})")
    return v


def media_info(lvl):
    w, h, dur = probe(lvl)
    try:
        words = transcribe(audio(lvl))
    except Exception as e:
        print(f"        no transcript ({str(e)[:80]})")
        words = []
    return {"src": lvl, "w": w, "h": h, "dur": dur, "words": words}


# ---------- 3, 4, 5: polish, render, gauntlet ----------
def badge(today):
    d = (today - GTA6).days
    return f"GTA 6 · DAY {d + 1}" if d >= 0 else "GTA 6 LAUNCH WEEK"


def publish_src(info, name, i):
    (render.PUBLIC / "clips").mkdir(parents=True, exist_ok=True)
    rel = f"clips/{name}_{i}.mp4"
    subprocess.run(["cp", str(info["src"]), str(render.PUBLIC / rel)], check=True)
    return rel


def seg(info, v, rel, credit, start, end, label=None, words=True, flash=False, blurs=None):
    ws = [{"w": x["w"], "start": round(x["start"] - start, 2), "end": round(x["end"] - start, 2)}
          for x in info["words"] if start <= x["start"] < end] if words and not v.get("captioned") else []
    return {"src": rel, "srcW": info["w"], "srcH": info["h"], "from": round(start, 2), "dur": round(end - start, 2),
            "facecam": v.get("facecam"), "gamebox": v.get("gamebox"), "star": v.get("star") or "gameplay",
            "peak": round(v["peak"] - start, 2) if start <= v["peak"] <= end else None,
            "words": ws, "credit": credit, "label": label, "flash": flash, "face": bool(v.get("face_visible", True)),
            "blurs": [{**b, "t0": round(b["t0"] - start, 2), "t1": round(b["t1"] - start, 2)} for b in (blurs or []) if b["t1"] > start and b["t0"] < end]}


def render_reel(segs, hook, out, today, setup=None, setup_at=0.0):
    dur = sum(s["dur"] for s in segs)
    props = {"segs": segs, "hook": hook.upper()[:28], "badge": badge(today), "react": len({s["credit"] for s in segs}) > 1,
             "setup": setup, "setupAt": round(setup_at, 2),
             "follow": follow_card(today, dur), "duration": round(dur + FOLLOW, 2),
             "headA": hook.capitalize(), "pal": "vice"}       # headA/pal: for the cover (engine/cover.py)
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    final = out / "final.mp4"
    try:
        # rendered in 4K (2160x3840): text and edges stay crisp, and YouTube gives 4K uploads a much higher bitrate,
        # so the stream footage survives its re-encode far better even on 1080p phones. Frames as PNG, not JPEG.
        subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdClip", str(final), f"--props={out / 'props.json'}",
                        "--codec=h264", "--crf=16", "--scale=2", "--image-format=png", "--x264-preset=slow"], cwd=VIDEO_DIR, check=True)
    finally:
        for s in segs:
            (render.PUBLIC / s["src"]).unlink(missing_ok=True)
    return final, dur


def free_checks(final, dur):
    """Checks that cost nothing: length, size, sound level, black and frozen video. Returns the faults found."""
    faults = []
    try:
        real = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", str(final)],
                                    capture_output=True, text=True, check=True).stdout.strip())
        if abs(real - dur) > 1.5:
            faults.append(f"length {real:.1f}s, expected {dur:.1f}s")
        if final.stat().st_size < 500_000:
            faults.append("file is tiny")
        r = subprocess.run(["ffmpeg", "-v", "info", "-i", str(final), "-vf", "scale=270:-2,blackdetect=d=0.5:pix_th=0.1,freezedetect=n=0.003:d=2.5",
                            "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True, timeout=600).stderr
        black = sum(float(x) for x in re.findall(r"black_duration:([\d.]+)", r))
        if black > 0.8:
            faults.append(f"{black:.1f}s of black")
        if "freeze_start" in r:
            faults.append("frozen video")
        m = re.search(r"mean_volume: (-?[\d.]+) dB", r)
        if m and float(m.group(1)) < -38:
            faults.append(f"almost silent ({m.group(1)} dB)")
    except Exception as e:
        faults.append(f"checks could not run: {str(e)[:80]}")
    return faults


def gauntlet(final, dur, out):
    """Free checks first. Claude (the cheap model) only looks when one of them finds something."""
    faults = free_checks(final, dur + FOLLOW)   # the reel plus the follow card at the end
    if not faults:
        return {"pass": True, "faults": "free checks clean"}
    print(f"        free checks flagged: {'; '.join(faults)}, asking Claude")
    shots = frames(final, [0.4, dur * 0.45, dur * 0.85], out, "fin")
    return ask([*map(img, shots), {"type": "text", "text": f"Frames at the start, 45% and 85% of the video. Automatic checks flagged: {'; '.join(faults)}."}],
               GAUNTLET, GAUNTLET_SYS, model=CLAUDE_FAST)


def finish(name, out, final, title, description, pinned, credits, st, logins, star, moment=None, platforms=None):
    meta = {"topic": name, "title": title, "description": f"{description}\n\n{credits}", "pinned_comment": pinned, "file": str(final)}
    if platforms:
        meta["platforms"] = platforms
    (out / "upload.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    st["count"] += 1
    st["posted"].append({"topic": name, "logins": logins, "star": star, "moment": moment, "date": datetime.now().strftime("%Y-%m-%d")})


# ---------- the two formats ----------
def build(c, v, info, name, out, st, today, worded=False):
    """Bleep, blur, words, render and checks for one approved clip. Returns the final file, or None if it did not hold up."""
    try:
        if not worded:
            v = copy(c, v, info["words"])
        info = bleep(info, out)
        blurs = blur_list(info["src"], v["start"], v["end"], out)
        rel = publish_src(info, name, 0)
        credit = f"{c['broadcaster_name']} on Twitch"
        main = seg(info, v, rel, credit, v["start"], v["end"], blurs=blurs)
        segs = [main]
        if v.get("cold_open"):                     # the payoff flashed first, only when it makes sense on its own
            segs = [seg(info, v, rel, credit, max(0.0, v["peak"] - 0.45), min(info["dur"], v["peak"] + 0.55), words=False, flash=True, blurs=blurs), main]
        final, dur = render_reel(segs, v["hook"], out, today, setup=v.get("setup"), setup_at=sum(x["dur"] for x in segs[:-1]))
        g = gauntlet(final, dur, out)
        if g["pass"] and (blurs or v.get("nudity")):           # the safety net: nothing exposed may be left in the final reel
            left = nude_boxes(final, 0, dur, out, fps=2)
            if left:
                g = {"pass": False, "faults": f"nudity still visible in {len(left)} frame(s) after blurring"}
        print(f"        gauntlet: {'PASS' if g['pass'] else 'FAIL'} {g['faults'][:160]}")
        if not g["pass"]:
            return None
    except Exception as e:
        print(f"        render failed: {e}")
        return None
    st["seen"].setdefault(c["id"], {})["posted"] = True
    finish(name, out, final, v["title"], v["description"], v["pinned_comment"],
           f"🎥 {c['broadcaster_name']} on Twitch: https://twitch.tv/{c['login']}\nOriginal clip: {c['url']}",
           st, [c["login"]], v.get("star"), v.get("moment"), CLIP_PLATFORMS)
    return final


def bank(st, hours=72):
    """Clips Claude already approved that never got posted (a slot only uses one): free, no new screening."""
    cut = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    today = datetime.now().strftime("%Y-%m-%d")
    done = {}
    for p in st["posted"]:
        if p["date"] == today:
            for lg in p["logins"]:
                done[lg] = done.get(lg, 0) + 1
    pool = [(k, v) for k, v in st["seen"].items() if v.get("use") and v.get("story") and not v.get("posted") and not v.get("failed")
            and not v.get("final_no") and v.get("nudity") is not None
            and v.get("at", "") > cut and done.get(v.get("login"), 0) < PER_STREAMER_DAY]
    return sorted(pool, key=lambda kv: -(kv[1].get("score") or 0))


def make(dry=False, today=None, tries=30, renders=4, screen_only=False):
    """One clip. The cheap model filters, the strong model picks the best of up to 3 finalists (7/10 or nothing).
    Built never to come back empty:
      1. fresh clips (last 12 h), the free filter first, the cheap model screens up to SCREENS of them
      2. the bank: clips already approved earlier that never got posted
      3. fresh clips from the last 24 h
    screen_only: just screen the top clips and remember them (feeds 'streamers react', GTA 5 vs 6 and the bank)."""
    today = today or datetime.now().date()
    st = load_state()
    housekeeping(st)
    budget = {"screens": 0, "renders": renders, "best": (0, None, None)}
    KEEP = ("use", "why", "score", "star", "moment", "action", "facecam", "gamebox", "start", "end", "peak", "story", "setup", "cold_open",
            "nudity", "face_visible", "captioned", "dark", "dead")

    def decide(finalists):
        """The strong model's pick among the finalists, then the render. Returns (name, final) or None."""
        if not finalists:
            return None
        if dry:
            c, v, info, name, out = finalists[0]
            print(f"        (dry) finalists: {', '.join(f[0]['broadcaster_name'] for f in finalists)}")
            return name, None
        while finalists and budget["renders"] > 0:
            f = final_pick([(c, v, info) for c, v, info, _, _ in finalists], st, finalists[0][4])
            i = f.get("pick", -1)
            print(f"        final pick: {i} ({f.get('score')}/10) {str(f.get('why'))[:140]}")
            if not (0 <= i < len(finalists)) or (f.get("score") or 0) < MIN_SCORE:
                if 0 <= i < len(finalists) and (f.get("score") or 0) >= FLOOR and (f.get("score") or 0) > budget["best"][0]:
                    budget["best"] = (f["score"], finalists[i], f)      # the best 6 so far, posted if no 7 turns up
                for x in finalists:
                    st["seen"].get(x[0]["id"], {})["final_no"] = True
                return None
            c, v, info, name, out = finalists.pop(i)
            v.update({k: f[k] for k in ("setup", "hook", "title", "description", "pinned_comment") if f.get(k)})
            budget["renders"] -= 1
            final = build(c, v, info, name, out, st, today, worded=True)
            if final:
                return name, final
            st["seen"].get(c["id"], {})["failed"] = True
        return None

    def fresh(found, limit):
        finalists = []
        for c in found[:tries]:
            if budget["screens"] >= limit or budget["renders"] <= 0:
                break
            name = f"clip__{today:%Y%m%d}__{c['id'][:24]}".replace("-", "_")
            out = MEDIA_DIR / name
            out.mkdir(parents=True, exist_ok=True)
            print(f"      {c['broadcaster_name']}: {c['title']} ({c['view_count']} views, {c['vph']:.0f}/h, {c['outlier']:.1f}x usual)")
            st["used"].append(c["id"])                 # never look at the same clip twice
            try:
                info = media_info(download(c["url"], out))
                a = audio(info["src"])
                skip = worth_a_look(a, info["words"])
                if skip:
                    print(f"        skipped for free: {skip}")
                    continue
                budget["screens"] += 1
                v = screen(c, info["src"], info["dur"], info["words"], peaks(a), out)
            except Exception as e:
                print(f"        skipped: {e}")
                continue
            st["seen"][c["id"]] = {"at": datetime.now(timezone.utc).isoformat(), "login": c["login"], "name": c["broadcaster_name"],
                                   "url": c["url"], "title": c["title"], "views": c["view_count"], **{k: v.get(k) for k in KEEP}}
            print(f"        screen: {'yes' if v['use'] else 'no'} ({v.get('score')}/10, {v.get('star')}, {v.get('moment')}) {v['why'][:110]}")
            if not v["use"] or screen_only:
                continue
            finalists.append((c, v, info, name, out))
            if len(finalists) == 3:
                got = decide(finalists)
                if got:
                    return got
                finalists = []
        return decide(finalists)

    try:
        found = candidates(st)
        print(f"      stream clips: {len(found)} fresh allowlisted GTA 6 clips (last {FRESH_H} h, {MIN_VIEWS}+ views)")
        got = fresh(found, SCREENS)
        if got or screen_only:
            return got or (None, None)

        picks = []                                       # 2. already approved, never posted
        for cid, m in bank(st)[:3]:
            print(f"      from the bank: {m['name']}: {m['title']} (score {m.get('score')})")
            name = f"clip__{today:%Y%m%d}__{cid[:24]}".replace("-", "_")
            out = MEDIA_DIR / name
            out.mkdir(parents=True, exist_ok=True)
            try:
                info = media_info(download(m["url"], out))
            except Exception as e:
                print(f"        skipped: {e}")
                m["failed"] = True
                continue
            c = {"id": cid, "login": m["login"], "broadcaster_name": m["name"], "url": m["url"], "title": m["title"], "view_count": m.get("views")}
            pk = min(max(m.get("peak") or info["dur"] / 2, 0.0), info["dur"])
            v = {**m, "peak": pk, "start": min(m.get("start") or 0.0, pk), "end": max(min(m.get("end") or info["dur"], info["dur"]), pk),
                 "hook": "WAIT FOR IT", "title": f"GTA 6: {m['name']} {m.get('moment') or ''}".strip()[:60],
                 "description": f"{m['name']} playing GTA 6.", "pinned_comment": "Would you have done the same? 👇"}
            picks.append((c, v, info, name, out))
        got = decide(picks)
        if got:
            return got

        print("      widening to the last 48 h")                  # 3. a bit older
        got = fresh(candidates(st, hours=48), SCREENS + 6)
        if got:
            return got

        score, fin, f = budget["best"]                     # 4. no 7 anywhere: the best 6, never lower
        if fin and not dry and budget["renders"] > 0:
            c, v, info, name, out = fin
            print(f"      no 7/10 today, posting the best {score}/10: {c['broadcaster_name']}: {c['title']}")
            v.update({k: f[k] for k in ("setup", "hook", "title", "description", "pinned_comment") if f.get(k)})
            final = build(c, v, info, name, out, st, today, worded=True)
            if final:
                return name, final
    finally:
        if not dry:
            save_state(st)
    raise RuntimeError(f"no clip reached {MIN_SCORE}/10 ({budget['screens']} screened)")


GROUP = {"name": "group", "description": "The best 'streamers react' reel you can make.", "input_schema": {"type": "object", "properties": {
    "ids": {"type": "array", "items": {"type": "string"}, "description": "2 or 3 clip ids, different streamers, the SAME game moment, best first; empty if none match"},
    "hook": {"type": "string", "description": "2 to 5 words, e.g. 'STREAMERS SEE LUCIA'"},
    "title": {"type": "string", "description": "starts with 'GTA 6', under 60 characters, e.g. 'GTA 6: Streamers See Lucia For The First Time'"},
    "description": {"type": "string"}, "pinned_comment": {"type": "string"}},
    "required": ["ids", "hook", "title", "description", "pinned_comment"]}}


def make_react(dry=False, today=None):
    """The same moment from 2 or 3 streamers, back to back, from clips screened in the last 2 days."""
    today = today or datetime.now().date()
    try:                                   # screen a few fresh clips first, so there's more to match
        make(today=today, tries=6, screen_only=True)
    except Exception as e:
        print(f"      fresh screening skipped: {e}")
    st = load_state()
    cut = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    pool = {k: v for k, v in st["seen"].items() if v.get("use") and not v.get("posted") and v.get("at", "") > cut and v.get("moment")
            and not v.get("nudity")}
    if len({v["login"] for v in pool.values()}) < 2:
        raise RuntimeError("not enough screened clips from different streamers to match")
    listing = "\n".join(f"{k} | {v['name']} | {v['moment']} | {v['star']} | score {v['score']} | {v['title']}" for k, v in pool.items())
    g = ask([{"type": "text", "text": f"Screened GTA 6 clips (id | streamer | moment | star | score | clip title):\n{listing}\n\n"
              "Pick 2 or 3 clips from DIFFERENT streamers showing the same game moment, the funniest reactions first. "
              "If no two clips share a moment, return an empty ids list."}], GROUP,
            "You build 'streamers react' Shorts: the same GTA 6 moment from several streamers, back to back.")
    ids = []
    for i in g.get("ids", []):
        if i in pool and pool[i]["login"] not in {pool[j]["login"] for j in ids}:
            ids.append(i)
    ids = ids[:3]
    if len(ids) < 2:
        raise RuntimeError("no shared moment across streamers")
    name = f"clip__{today:%Y%m%d}__react_{ids[0][:16]}".replace("-", "_")
    out = MEDIA_DIR / name
    out.mkdir(parents=True, exist_ok=True)
    print(f"      streamers react: {g['hook']} ({', '.join(pool[i]['name'] for i in ids)})")
    if dry:
        return name, None
    segs = []
    for n, i in enumerate(ids):
        meta = pool[i]
        sub = out / f"s{n}"
        sub.mkdir(exist_ok=True)
        info = bleep(media_info(download(meta["url"], sub)), sub)
        pk = min(max(meta.get("peak") or info["dur"] / 2, 0.0), info["dur"])
        s, e = max(0.0, pk - 5.5), min(info["dur"], pk + 2.5)      # each streamer: the build-up and the reaction, about 8 s
        v = {**meta, "star": "reaction", "peak": pk}
        segs.append(seg(info, v, publish_src(info, name, n), f"{meta['name']} on Twitch", s, e, label=meta["name"].upper()))
    final, dur = render_reel(segs, g["hook"], out, today)
    gv = gauntlet(final, dur, out)
    print(f"        gauntlet: {'PASS' if gv['pass'] else 'FAIL'} {gv['faults'][:160]}")
    if not gv["pass"]:
        raise RuntimeError(f"react reel failed the gauntlet: {gv['faults'][:120]}")
    for i in ids:
        st["seen"][i]["posted"] = True
        st["used"].append(i)
    credits = "\n".join(f"🎥 {pool[i]['name']} on Twitch: https://twitch.tv/{pool[i]['login']} (clip: {pool[i]['url']})" for i in ids)
    finish(name, out, final, g["title"], g["description"], g["pinned_comment"], credits, st, [pool[i]["login"] for i in ids], "react",
           g["hook"], CLIP_PLATFORMS)
    save_state(st)
    return name, final


# ---------- GTA 5 vs GTA 6 ----------
def quick_info(lvl):
    w, h, dur = probe(lvl)
    return {"src": lvl, "w": w, "h": h, "dur": dur, "words": []}


def fill5(st, actions, screens=6):
    """Screens GTA 5 clips from the allowlisted streamers (last 2 years, most viewed first) until the bank has
    one for an action we already have in GTA 6. The bank is kept, so this gets cheaper every day."""
    have = {v.get("action") for v in st["seen5"].values() if v.get("use") and not v.get("vs_used")}
    if have & actions:
        return
    n = 0
    for c in candidates(st, hours=24 * 730, game=GAME5)[:60]:
        if n >= screens:
            break
        if c["id"] in st["seen5"]:
            continue
        out = MEDIA_DIR / f"gta5__{c['id'][:24]}".replace("-", "_")
        out.mkdir(parents=True, exist_ok=True)
        print(f"      GTA 5: {c['broadcaster_name']}: {c['title']} ({c['view_count']} views)")
        try:
            lvl = download(c["url"], out)
            a = audio(lvl)
            info = quick_info(lvl)
            n += 1
            v = screen(c, lvl, info["dur"], [], peaks(a), out, system=SCREEN5_SYS)
        except Exception as e:
            print(f"        skipped: {e}")
            st["seen5"][c["id"]] = {"at": datetime.now(timezone.utc).isoformat(), "use": False}
            continue
        st["seen5"][c["id"]] = {"at": datetime.now(timezone.utc).isoformat(), "login": c["login"], "name": c["broadcaster_name"],
                                "url": c["url"], "title": c["title"],
                                **{k: v.get(k) for k in ("use", "score", "action", "facecam", "gamebox", "start", "end", "peak")}}
        print(f"        tag: {'yes' if v.get('use') else 'no'} {v.get('action')} ({v.get('score')}/10)")
        if v.get("use") and v.get("action") in actions:
            return


def window(info, m, d):
    """d seconds around the clip's peak, inside the clip."""
    pk = min(max(m.get("peak") or info["dur"] / 2, 0.0), info["dur"])
    s = max(0.0, min(pk - d * 0.6, info["dur"] - d))
    return s, min(info["dur"], s + d), pk


PAIR = {"name": "pair", "description": "Is this a real GTA 5 vs GTA 6 pair?", "input_schema": {"type": "object", "properties": {
    "ok": {"type": "boolean", "description": "true only if the SAME action is clearly visible in BOTH clips, readable at a glance"},
    "why": {"type": "string"},
    "start5": {"type": "number", "description": "seconds: where the action starts in the GTA 5 clip"},
    "end5": {"type": "number"},
    "start6": {"type": "number", "description": "seconds: where the same action starts in the GTA 6 clip"},
    "end6": {"type": "number"}}, "required": ["ok", "why", "start5", "end5", "start6", "end6"]}}
PAIR_SYS = """You approve GTA 5 vs GTA 6 comparison Shorts: the same action in both games, stacked and playing at the same time.
Say ok only if the named action is clearly happening and readable in BOTH clips (not a guy standing still, not a dark screen,
not a menu, not a black screen with WASTED). Then give, in each clip, the stretch (up to 8 s) where the action happens,
so the two halves show the action at the same time. Each image is a contact sheet stamped with times."""


def pair_check(action, sides):
    content = []
    for label, (info, m, sh, a0, b0) in zip(("GTA 5", "GTA 6"), sides):
        content += [{"type": "text", "text": f"{label} clip ({m.get('name')}): {a0:.1f}s to {b0:.1f}s. Tagged: {m.get('moment') or action}."}, img(sh)]
    content.append({"type": "text", "text": f"The action to compare: {action}. Is it clearly visible in both?"})
    return ask(content, PAIR, PAIR_SYS)


def make_vs(dry=False, today=None, pairs=2):
    """GTA 5 vs GTA 6: the same action in both games, stacked and playing together, 1 or 2 actions per reel.
    GTA 6 side: approved clips from the last 2 days (fresh ones screened if needed). GTA 5 side: the GTA 5 bank."""
    today = today or datetime.now().date()
    cut = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()

    def pool6(st):
        return {k: v for k, v in st["seen"].items() if v.get("use") and v.get("action") in ACTIONS and not v.get("vs_used") and not v.get("nudity")
                and not v.get("posted") and v.get("at", "") > cut}
    st = load_state()
    if len(pool6(st)) < 3:
        try:
            make(today=today, tries=12, screen_only=True)
        except Exception as e:
            print(f"      fresh screening skipped: {e}")
        st = load_state()
    p6 = pool6(st)
    print(f"      GTA 6 clips with an action: {len(p6)} ({', '.join(sorted({v['action'] for v in p6.values()}))})")
    try:
        fill5(st, {v["action"] for v in p6.values()})
    finally:
        if not dry:
            save_state(st)
    p5 = {k: v for k, v in st["seen5"].items() if v.get("use") and v.get("action") in ACTIONS and not v.get("vs_used")}
    shared = sorted({v["action"] for v in p6.values()} & {v["action"] for v in p5.values()},
                    key=lambda a: -max(v.get("score") or 0 for v in p6.values() if v["action"] == a))
    if not shared:
        raise RuntimeError("no action found in both GTA 5 and GTA 6 clips yet")
    name = None
    prs, chosen, n = [], [], 0
    for action in shared:
        if len(prs) == pairs:
            break
        k6 = max((k for k, v in p6.items() if v["action"] == action), key=lambda k: p6[k].get("score") or 0)
        for k5 in sorted((k for k, v in p5.items() if v["action"] == action), key=lambda k: -(p5[k].get("score") or 0))[:2]:
            name = name or f"clip__{today:%Y%m%d}__vs_{k6[:16]}".replace("-", "_")
            out = MEDIA_DIR / name
            out.mkdir(parents=True, exist_ok=True)
            print(f"      checking the pair: {action} ({p5[k5]['name']} vs {p6[k6]['name']})")
            if dry:
                chosen.append((action, k5, k6))
                break
            try:
                sides = []
                for m in (p5[k5], p6[k6]):
                    sub = out / f"s{n}"
                    sub.mkdir(exist_ok=True)
                    info = quick_info(download(m["url"], sub))
                    a0 = min(max(float(m.get("start") or 0), 0.0), info["dur"])
                    b0 = min(float(m.get("end") or info["dur"]), info["dur"])
                    sh, _ = sheet(info["src"], a0, b0 if b0 > a0 + 2 else info["dur"], sub, "vs")
                    sides.append((info, m, sh, a0, b0 if b0 > a0 + 2 else info["dur"]))
                    n += 1
                v = pair_check(action, sides)
            except Exception as e:
                print(f"        skipped: {e}")
                continue
            print(f"        pair: {'OK' if v.get('ok') else 'NO'} {str(v.get('why'))[:140]}")
            if not v.get("ok"):
                continue
            segs = []
            d = None
            for (info, m, _, a0, b0), (vs, ve) in zip(sides, ((v["start5"], v["end5"]), (v["start6"], v["end6"]))):
                vs, ve = min(max(float(vs), a0), b0), min(max(float(ve), a0), b0)
                d = min(d or 99, ve - vs if ve - vs >= 3 else b0 - a0)
            d = round(min(8.0, d), 2)
            for (info, m, _, a0, b0), vs in zip(sides, (v["start5"], v["start6"])):
                st0 = min(max(float(vs), a0), max(a0, b0 - d))
                rel = publish_src(info, name, len(segs) + 2 * len(prs))
                segs.append(seg(info, {**m, "peak": st0 + d / 2}, rel, f"{m['name']} on Twitch", st0, st0 + d, words=False))
            prs.append({"top": segs[0], "bottom": segs[1], "dur": d, "action": ACTIONS[action]})
            chosen.append((action, k5, k6))
            break
    if not chosen:
        raise RuntimeError("no GTA 5 vs 6 pair passed the check")
    label = ACTIONS[chosen[0][0]]
    out = MEDIA_DIR / name
    print("      GTA 5 vs GTA 6: " + ", ".join(f"{a} ({p5[k5]['name']} vs {p6[k6]['name']})" for a, k5, k6 in chosen))
    if dry:
        return name, None
    total = round(sum(x["dur"] for x in prs), 2)
    hook = f"GTA 5 VS 6: {label}"
    props = {"pairs": prs, "hook": hook, "badge": "", "duration": round(total + FOLLOW, 2), "follow": follow_card(today, total),
             "headA": "GTA 5 vs GTA 6", "headB": label.capitalize(), "pal": "vice"}
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    final = out / "final.mp4"
    try:
        subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdVs", str(final), f"--props={out / 'props.json'}",
                        "--codec=h264", "--crf=16", "--scale=2", "--image-format=png", "--x264-preset=slow"], cwd=VIDEO_DIR, check=True)
    finally:
        for pr in prs:
            for sd in (pr["top"], pr["bottom"]):
                (render.PUBLIC / sd["src"]).unlink(missing_ok=True)
    g = gauntlet(final, total, out)
    print(f"        gauntlet: {'PASS' if g['pass'] else 'FAIL'} {g['faults'][:160]}")
    if not g["pass"]:
        raise RuntimeError(f"vs reel failed the checks: {g['faults'][:120]}")
    st = load_state()
    for _, k5, k6 in chosen:
        st["seen5"].setdefault(k5, {})["vs_used"] = True
        st["seen"].setdefault(k6, {})["vs_used"] = True
    words = " and ".join(ACTIONS[a].lower() for a, _, _ in chosen)
    title = f"GTA 6 vs GTA 5: {words.title()} Side by Side"[:60]
    credits = "\n".join(f"🎥 {m['name']} on Twitch: https://twitch.tv/{m['login']} (clip: {m['url']})"
                        for _, k5, k6 in chosen for m in (p5[k5], p6[k6]))
    finish(name, out, final, title, f"Same moment, 13 years apart: {words} in GTA 5 vs GTA 6.",
           "Which one surprised you more? 👇", credits, st, sorted({p6[k6]["login"] for _, _, k6 in chosen}), "vs")
    save_state(st)
    return name, final


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--react", action="store_true")
    ap.add_argument("--vs", action="store_true")
    a = ap.parse_args()
    if a.list:
        for c in candidates(load_state())[:20]:
            print(f"{c['rank']:>8.0f} {c['vph']:>6.0f}/h {c['outlier']:>4.1f}x  {c['broadcaster_name']:<14} {c['duration']:>4.0f}s  {c['title']}  {c['url']}")
    else:
        print(make_vs(a.dry) if a.vs else make_react(a.dry) if a.react else make(a.dry))
