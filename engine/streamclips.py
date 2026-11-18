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
from engine.waited import FOLLOW, GTA6, follow_card

STATE = DATA_DIR / "streamclips.json"
ALLOW = DATA_DIR / "streamers.json"
HELIX = "https://api.twitch.tv/helix"
GAME = "Grand Theft Auto VI"
MIN_S, MAX_S = 10, 60            # Twitch clips we look at
CUT_MIN, CUT_MAX = 8, 30         # what we keep of them
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
            "posted": st.get("posted", []), "house": st.get("house", "")}


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


def game_id(tok):
    g = helix("games", tok, name=GAME)
    if not g:
        raise RuntimeError(f"Twitch has no '{GAME}' category")
    return g[0]["id"]


def candidates(st, hours=36):
    """Allowlisted GTA 6 clips from the last `hours`, best first."""
    from engine import clipstats
    tok = token()
    gid = game_id(tok)
    logins = list(allowlist())
    users = []
    for i in range(0, len(logins), 100):
        users += helix("users", tok, login=logins[i:i + 100])
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
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
        clips = [c for c in helix("clips", tok, broadcaster_id=u["id"], started_at=since, first=100) if c["game_id"] == gid]
        if not clips:
            continue
        med = statistics.median([c["view_count"] for c in clips]) or 1
        for c in clips:
            if c["id"] in used or not MIN_S <= c["duration"] <= MAX_S:
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
    "facecam": {**BOX, "description": "the streamer's webcam as fractions of the frame (x, y = top-left), null if none"},
    "gamebox": {**BOX, "description": "the region that shows the game itself, as fractions, leaving out chat, black bars, borders and overlays"},
    "start": {"type": "number", "description": "seconds: where the reel should start, just before the moment builds (8 to 30 s in total)"},
    "end": {"type": "number", "description": "seconds: right after the payoff or the reaction ends"},
    "peak": {"type": "number", "description": "seconds: the single best instant (the scream, the crash, the punchline)"},
    "hook": {"type": "string", "description": "2 to 4 words on screen from the first frame. Reaction: about the streamer ('LACY LOST IT'). Gameplay: about the moment ('WAIT FOR IT'). No spoilers."},
    "title": {"type": "string", "description": "starts with 'GTA 6', under 60 characters, no hashtags. Reaction clips name the streamer: 'GTA 6: Lacy Sees Lucia For The First Time'."},
    "description": {"type": "string", "description": "1 or 2 short sentences"},
    "pinned_comment": {"type": "string", "description": "a question that gets replies"}},
    "required": ["use", "why", "score", "star", "moment", "start", "end", "peak", "hook", "title", "description", "pinned_comment"]}}

SCREEN_SYS = """You pick GTA 6 stream clips for The Daily Drop, a Shorts channel for gamers 13 to 25, during launch week.
Be generous: launch hype is the point. Gameplay, chaos, funny fails, police chases, the streamer losing it, first impressions,
the launch countdown and first boot, and short cutscene moments where the streamer's reaction is the star are all fine.
Reject the clip (use=false) ONLY if one of these is true (the apps remove these or restrict the channel):
- nudity or sexual content on screen (bare breasts, genitals, sex scenes, strip club scenes)
- a major story spoiler: an ending, a death of a main character or a big twist (early-game scenes are fine)
- graphic gore in the first 7 seconds
- a song with lyrics is clearly playing (a radio station or music on stream)
- slurs or hateful content from the streamer
- dead air: nothing happens and nobody reacts
Find the facecam and the game region. Decide whether the reaction or the gameplay is the star, and write the hook and
title for that. Pick the trim: start just before the moment builds, end right after the payoff, 8 to 30 seconds, no dead
air at either end. The loudness peaks and the timed transcript tell you where things happen."""

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


def screen(c, src, dur, words, loud, out):
    at = [dur * 0.15, min(max(loud[0] if loud else dur * 0.5, 0.0), dur - 0.2), max(0.0, dur - 1.5)]   # 3 frames: early, the peak, the end
    content = [*map(img, frames(src, at, out, "src")), {"type": "text", "text":
               f"Streamer: {c['broadcaster_name']} (Twitch). Clip title: {c['title']}. {dur:.1f} s long, {c['view_count']} views.\n"
               f"Frames at {', '.join(f'{t:.1f}s' for t in at)}.\nLoudest moments (s): {loud}\nWhat they say, with times:\n{timed(words)}"}]
    v = ask(content, SCREEN, SCREEN_SYS, model=CLAUDE_FAST)   # the cheap model screens; the strong one writes the words on winners
    # keep the trim sane, whatever came back
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
    v.update({"start": round(s, 2), "end": round(e, 2), "peak": round(peak, 2)})
    return v


COPY = {"name": "copy", "description": "The words for the reel.", "input_schema": {"type": "object", "properties": {
    k: SCREEN["input_schema"]["properties"][k] for k in ("hook", "title", "description", "pinned_comment")},
    "required": ["hook", "title", "description", "pinned_comment"]}}


def copy(c, v, words):
    """The strong model rewrites the hook, title and text for a clip that passed (text only, no images: cheap)."""
    try:
        w = ask([{"type": "text", "text": f"Streamer: {c['broadcaster_name']} (Twitch). Clip title: {c['title']}.\n"
                  f"The star is the {v.get('star')}. Moment: {v.get('moment')}. Screener notes: {v.get('why')}\n"
                  f"Draft hook: {v.get('hook')} | draft title: {v.get('title')}\nWhat they say, with times:\n{timed(words)}\n\n"
                  "Write the best scroll-stopping words for this Short."}], COPY,
                "You write the on-screen hook, title, description and pinned comment for GTA 6 stream-clip Shorts "
                "(gamers 13 to 25). Follow each field's rules exactly. No spoilers.")
        v.update({k: w[k] for k in ("hook", "title", "description", "pinned_comment") if w.get(k)})
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


def seg(info, v, rel, credit, start, end, label=None, words=True, flash=False):
    ws = [{"w": x["w"], "start": round(x["start"] - start, 2), "end": round(x["end"] - start, 2)}
          for x in info["words"] if start <= x["start"] < end] if words else []
    return {"src": rel, "srcW": info["w"], "srcH": info["h"], "from": round(start, 2), "dur": round(end - start, 2),
            "facecam": v.get("facecam"), "gamebox": v.get("gamebox"), "star": v.get("star") or "gameplay",
            "peak": round(v["peak"] - start, 2) if start <= v["peak"] <= end else None,
            "words": ws, "credit": credit, "label": label, "flash": flash}


def render_reel(segs, hook, out, today):
    dur = sum(s["dur"] for s in segs)
    props = {"segs": segs, "hook": hook.upper()[:28], "badge": badge(today), "react": len({s["credit"] for s in segs}) > 1,
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


def finish(name, out, final, title, description, pinned, credits, st, logins, star):
    meta = {"topic": name, "title": title, "description": f"{description}\n\n{credits}", "pinned_comment": pinned, "file": str(final)}
    (out / "upload.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    st["count"] += 1
    st["posted"].append({"topic": name, "logins": logins, "star": star, "date": datetime.now().strftime("%Y-%m-%d")})


# ---------- the two formats ----------
def build(c, v, info, name, out, st, today):
    """Words, render and checks for one approved clip. Returns the final file, or None if it did not hold up."""
    try:
        v = copy(c, v, info["words"])
        rel = publish_src(info, name, 0)
        credit = f"{c['broadcaster_name']} on Twitch"
        cold = seg(info, v, rel, credit, max(0.0, v["peak"] - 0.45), min(info["dur"], v["peak"] + 0.55), words=False, flash=True)
        main = seg(info, v, rel, credit, v["start"], v["end"])
        final, dur = render_reel([cold, main], v["hook"], out, today)
        g = gauntlet(final, dur, out)
        print(f"        gauntlet: {'PASS' if g['pass'] else 'FAIL'} {g['faults'][:160]}")
        if not g["pass"]:
            return None
    except Exception as e:
        print(f"        render failed: {e}")
        return None
    st["seen"].setdefault(c["id"], {})["posted"] = True
    finish(name, out, final, v["title"], v["description"], v["pinned_comment"],
           f"🎥 {c['broadcaster_name']} on Twitch: https://twitch.tv/{c['login']}\nOriginal clip: {c['url']}",
           st, [c["login"]], v.get("star"))
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
    pool = [(k, v) for k, v in st["seen"].items() if v.get("use") and not v.get("posted") and not v.get("failed")
            and v.get("at", "") > cut and done.get(v.get("login"), 0) < PER_STREAMER_DAY]
    return sorted(pool, key=lambda kv: -(kv[1].get("score") or 0))


def make(dry=False, today=None, tries=30, renders=5, screen_only=False):
    """One clip: a 1 s cold open of the peak, then the trimmed moment. Built never to come back empty:
      1. fresh clips (last 36 h), the free filter first, the cheap model screens up to SCREENS of them
      2. the bank: clips already approved earlier that never got posted (no new screening)
      3. fresh clips from the last 4 days
    screen_only: just screen the top clips and remember them (feeds 'streamers react' and the bank)."""
    today = today or datetime.now().date()
    st = load_state()
    housekeeping(st)
    budget = {"screens": 0, "renders": renders}

    def fresh(found, limit):
        for c in found[:tries]:
            if budget["screens"] >= limit or budget["renders"] <= 0:
                return None
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
                                   "url": c["url"], "title": c["title"],
                                   **{k: v.get(k) for k in ("use", "why", "score", "star", "moment", "facecam", "gamebox", "start", "end", "peak")}}
            print(f"        screen: {'yes' if v['use'] else 'no'} ({v.get('score')}/10, {v.get('star')}, {v.get('moment')}) {v['why'][:110]}")
            if not v["use"] or screen_only:
                continue
            if dry:
                print(f"        trim {v['start']}-{v['end']}s, peak {v['peak']}s | hook: {v['hook']} | title: {v['title']}")
                return name, None
            budget["renders"] -= 1
            final = build(c, v, info, name, out, st, today)
            if final:
                return name, final
            st["seen"][c["id"]]["failed"] = True
        return None

    try:
        found = candidates(st)
        print(f"      stream clips: {len(found)} allowlisted GTA 6 clips")
        got = fresh(found, SCREENS)
        if got or screen_only:
            return got or (None, None)

        for cid, m in bank(st):                          # 2. already approved, never posted
            if budget["renders"] <= 0:
                break
            print(f"      from the bank: {m['name']}: {m['title']} (score {m.get('score')})")
            name = f"clip__{today:%Y%m%d}__{cid[:24]}".replace("-", "_")
            out = MEDIA_DIR / name
            out.mkdir(parents=True, exist_ok=True)
            c = {"id": cid, "login": m["login"], "broadcaster_name": m["name"], "url": m["url"], "title": m["title"]}
            try:
                info = media_info(download(m["url"], out))
            except Exception as e:
                print(f"        skipped: {e}")
                m["failed"] = True
                continue
            pk = min(max(m.get("peak") or info["dur"] / 2, 0.0), info["dur"])
            v = {**m, "peak": pk, "start": min(m.get("start") or 0.0, pk), "end": max(min(m.get("end") or info["dur"], info["dur"]), pk),
                 "hook": "WAIT FOR IT", "title": f"GTA 6: {m['name']} {m.get('moment') or 'Loses It'}".strip()[:60],
                 "description": f"{m['name']} playing GTA 6.", "pinned_comment": "Would you have done the same? 👇"}
            if dry:
                return name, None
            budget["renders"] -= 1
            final = build(c, v, info, name, out, st, today)
            if final:
                return name, final
            m["failed"] = True

        print("      widening to the last 4 days")                # 3. older clips
        got = fresh(candidates(st, hours=96), SCREENS + 8)
        if got:
            return got
    finally:
        if not dry:
            save_state(st)
    raise RuntimeError(f"no clip held up ({budget['screens']} screened, bank empty)")


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
    pool = {k: v for k, v in st["seen"].items() if v.get("use") and not v.get("posted") and v.get("at", "") > cut and v.get("moment")}
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
        info = media_info(download(meta["url"], sub))
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
    finish(name, out, final, g["title"], g["description"], g["pinned_comment"], credits, st, [pool[i]["login"] for i in ids], "react")
    save_state(st)
    return name, final


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--react", action="store_true")
    a = ap.parse_args()
    if a.list:
        for c in candidates(load_state())[:20]:
            print(f"{c['rank']:>8.0f} {c['vph']:>6.0f}/h {c['outlier']:>4.1f}x  {c['broadcaster_name']:<14} {c['duration']:>4.0f}s  {c['title']}  {c['url']}")
    else:
        print(make_react(a.dry) if a.react else make(a.dry))
