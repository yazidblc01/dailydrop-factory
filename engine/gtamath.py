"""GTA Math: voiced cartoon comedy skits for the GTA 6 wave (2 a day, at 3:07 and 9:07 PM).

Three looks rotate (video/src/ed/Skit.tsx):
  couch      you and someone (your girl, mom, boss, dad) on the couch, texts pop up, speech bubbles
  phones     two phones side by side, the same text sent to two people
  countdown  a narrator roasts through #3 #2 #1 over cartoon scenes (bank, getaway car, couch, beach)
Claude writes the skit for a topic from TOPICS. ElevenLabs acts it out in ONE dialogue take (eleven_v3, several
voices, delivery tags like [sighs]), so the lines flow into each other like a real conversation, and returns when
every character is spoken, which times the bubbles and captions. Game characters are never drawn, only texted.

    python -m engine.gtamath --dry                       write the skit only (one Claude call, no voice)
    python -m engine.gtamath                             skit, voice, render to media/gtamath__<date>__<n>/final.mp4
    python -m engine.gtamath --style phones --topic 3    pick the look and the topic (index in TOPICS)
"""
import argparse
import base64
import json
import os
import random
import re
import subprocess
from datetime import datetime

import requests

from config import CLAUDE_MODEL, DATA_DIR, MEDIA_DIR, VOICE
from engine import render
from engine.render import VIDEO_DIR
from engine.voice import ELEVEN, duration, to_wav
from engine.waited import FOLLOW, GTA6, follow_card

STATE = DATA_DIR / "gtamath.json"
STYLES = ["couch", "phones", "countdown"]

# (topic, looks it works in)
TOPICS = [
    ("Your girl vs Lucia. Girlfriends are 'banning' GTA 6 because of Lucia (the game's female lead you date in-game). "
     "Lucia robs banks with you, never asks where you were, texts back; your girl is jealous of a video game.", ["couch", "phones", "countdown"]),
    ("Dad left to get milk in 2013 and promised he'd be back before GTA 6. GTA 6 is out in days. Mom is still waiting too.", ["couch", "countdown"]),
    ("Mom walks in at 4 AM on launch night. You have school in 3 hours. You have a heist in 3 minutes.", ["couch"]),
    ("Calling in sick on November 19: texting your boss vs texting the group chat at the same time.", ["phones"]),
    ("Rockstar is your toxic ex: 13 years of 'soon', two delays, and you still came back.", ["phones", "countdown"]),
    ("The kid who called you trash on GTA Online in 2013 is now your manager, and he's taking launch day off, not you.", ["couch", "phones"]),
    ("Texting yourself in 2013 from 2026: he asks if GTA 6 is out, if you're rich, if you're married.", ["phones"]),
    ("Your PS4 dies the night before GTA 6 comes out. A funeral, with a eulogy.", ["countdown", "couch"]),
    ("Your future kid asks what you did during GTA 6 launch week.", ["couch"]),
    ("Therapy: 'When did it start?' 'September 2013.' The therapist is also waiting for GTA 6.", ["couch"]),
    ("Signs you've been waiting too long for GTA 6.", ["countdown"]),
    ("Your girl asks for a gift for the holidays. GTA 6 costs $79.99. Choices were made.", ["couch", "phones"]),
]

SYSTEM = """You write 15 to 22 second animated comedy Shorts for a GTA 6 channel, the week GTA 6 comes out (Nov 19, 2026).
The audience is mostly guys 13 to 25 who live on gaming TikTok and Reels. They share what makes them laugh out loud.

WHAT MAKES IT FUNNY
- One instantly relatable situation, set up in the first line, so nobody needs context.
- Escalate fast. Every line raises the stakes or twists the one before.
- The last line flips it. It's the line people screenshot and send to their friends. Never explain the joke after it.
- Savage, roast energy, dark and a little shocking is good: deadbeat dads, toxic exes, bosses, being broke, life ruined by a video game.
  Punch at the situation, at gamers, at the characters. Petty, chaotic, unhinged, specific.
- Sound like real people talking, not a script: contractions, "bro", "babe", "nah", cut-offs ("You have scho-" "MOM."), pauses written as "...".
- Short lines. Most under 10 words. Never over 14.
- No puns, no corporate jokes, no "fun facts", no number-crunching. Numbers only if the number IS the joke.

HARD LIMITS
- No sexual content or innuendo, no slurs, no jokes about race, religion or sexuality, no drugs, no real people's names.
- Game characters (Lucia, Jason, Trevor) can only appear as names in texts or in dialogue. They never speak as a voice on screen.

DELIVERY TAGS: you may start a spoken line with ONE tag in square brackets to direct the acting:
[sighs] [laughs] [whispers] [sarcastic] [angry] [shouting] [excited] [nervous] [deadpan] [crying]. Use 2 to 4 per skit, where they land the joke.

THE LOOK you write for is given. Write "lines" in spoken order. The first line is always "narrator": the hook, under 10 words,
like "POV: ..." or a punchy setup. "headA"/"headB" are the on-screen title of the hook (headB is the twisty end, in pink italics).

couch: speakers are "you" (the gamer on the couch), "other" (the person next to you: set other.look to girl, mom, boss or dad,
  and other.role to a 1-2 word tag like YOUR GIRL, MOM, BOSS, DAD, THERAPIST, YOUR KID), "text" (a text message popping up on
  your phone from "sender", like "Lucia 🌴" or "The Boys 🎮"; it is read aloud), and "narrator" (rarely, after the hook).
  Set youMood (chill, shock, smug, sweat, sad) and otherMood (sus, mad, fury, happy) on lines where faces should change.
phones: two phones side by side. "left" and "right" are the two contacts (name with an emoji, sub = a short status like
  "iMessage" or "4 online", voice = female or male, dark = true for the cooler one). Speakers: "you" (set "to": left, right or both;
  the same text to both is the classic setup), "left", "right" (their replies), "narrator" (the hook). The replies are the jokes.
countdown: the narrator roasts through 3 reasons. Lines with "kick": 3, 2, 1 start each reason; give each a "kickLine"
  (on-screen, 3 to 6 words) and a "scene": bank, car, couch or beach. A kick line can carry "notif" (a short text from
  "sender" that pops up). After kick 1 you can add "other" and "you" lines for the closer. Narrator talks like a friend
  roasting you, not a TV host: "Number three." is fine once, then keep it moving.

"tag": a 2 to 6 word sticker that slams on screen after the last line (like "Emotional damage." or "Respawning.").
Answer by calling write_skit."""

SKIT_TOOL = {
    "name": "write_skit",
    "description": "Return the finished skit.",
    "input_schema": {
        "type": "object",
        "properties": {
            "headA": {"type": "string"}, "headB": {"type": "string"},
            "other": {"type": "object", "properties": {"look": {"type": "string", "enum": ["girl", "mom", "boss", "dad"]}, "role": {"type": "string"}}},
            "sender": {"type": "string"}, "sender_voice": {"type": "string", "enum": ["female", "male"]},
            "left": {"type": "object", "properties": {"name": {"type": "string"}, "sub": {"type": "string"}, "voice": {"type": "string", "enum": ["female", "male"]}, "dark": {"type": "boolean"}}},
            "right": {"type": "object", "properties": {"name": {"type": "string"}, "sub": {"type": "string"}, "voice": {"type": "string", "enum": ["female", "male"]}, "dark": {"type": "boolean"}}},
            "lines": {"type": "array", "minItems": 4, "maxItems": 10, "items": {"type": "object", "properties": {
                "who": {"type": "string", "enum": ["narrator", "you", "other", "text", "left", "right"]},
                "say": {"type": "string"}, "to": {"type": "string", "enum": ["left", "right", "both"]},
                "youMood": {"type": "string"}, "otherMood": {"type": "string"},
                "kick": {"type": "integer"}, "kickLine": {"type": "string"}, "scene": {"type": "string", "enum": ["bank", "car", "couch", "beach"]},
                "notif": {"type": "string"}}, "required": ["who", "say"]}},
            "tag": {"type": "string"},
            "title": {"type": "string", "description": "YouTube title that starts with 'GTA 6' (what people search) and says GTA 6 only once, under 60 characters, no hashtags, e.g. 'GTA 6 when mom walks in at 4 AM'"},
            "description": {"type": "string"}, "pinned_comment": {"type": "string", "description": "a question that baits replies"},
        },
        "required": ["headA", "headB", "lines", "tag", "title", "description", "pinned_comment"],
    },
}

TAGS = {"sighs", "laughs", "whispers", "sarcastic", "angry", "shouting", "excited", "nervous", "deadpan", "crying"}
WHO = {"couch": {"narrator", "you", "other", "text"}, "phones": {"narrator", "you", "left", "right"},
       "countdown": {"narrator", "you", "other"}}


def clean_tags(say):
    """Keep known delivery tags, drop anything else in brackets."""
    return re.sub(r"\[([^\]]*)\]\s*", lambda m: f"[{m.group(1).lower()}] " if m.group(1).lower() in TAGS else "", say).strip()


def shown(say):
    return re.sub(r"\[[^\]]*\]\s*", "", say or "").strip()


def ask_claude(style, topic, today, feedback=None):
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    days = (GTA6 - today).days
    when = f"GTA 6 comes out in {days} days." if days > 0 else "GTA 6 is out today." if days == 0 else f"GTA 6 came out {-days} days ago."
    user = (f"LOOK: {style}\nTOPIC: {topic}\nTODAY: {today:%B %d, %Y}. {when} GTA 6 costs $79.99. GTA 5 came out in September 2013.\n"
            "Write the funniest version of this you can. Make it edgy.")
    if feedback:
        user += f"\n\nYour previous skit was rejected: {feedback} Fix it."
    system = SYSTEM if VOICE else SYSTEM + ("\n\nTHERE IS NO VOICE: nobody hears this, it is READ on screen (bubbles, texts, captions) over music. "
                                            "Write it to be read fast: short lines, the punchline in the last words. No delivery tags.")
    msg = client.messages.create(model=CLAUDE_MODEL, max_tokens=3000, system=system, tools=[SKIT_TOOL],
                                 messages=[{"role": "user", "content": user}])
    for b in msg.content:
        if b.type == "tool_use":
            return dict(b.input)
    text = "".join(b.text for b in msg.content if b.type == "text")
    return json.loads(text[text.find("{"): text.rfind("}") + 1])


def check(style, sk):
    probs = []
    lines = sk.get("lines") or []
    if not lines or lines[0].get("who") != "narrator":
        probs.append("the first line must be the narrator's hook")
    for i, l in enumerate(lines):
        if l.get("who") not in WHO[style]:
            probs.append(f"line {i + 1}: speaker '{l.get('who')}' is not allowed in the {style} look (use {sorted(WHO[style])})")
        if len(shown(l.get("say", "")).split()) > 16:
            probs.append(f"line {i + 1} is too long")
        if style == "phones" and l.get("who") == "you" and l.get("to") not in ("left", "right", "both"):
            probs.append(f"line {i + 1}: a 'you' text needs 'to' (left, right or both)")
    words = sum(len(shown(l.get("say", "")).split()) for l in lines)
    if words > 70:
        probs.append(f"too long ({words} words): keep it under 60")
    if style == "countdown":
        kicks = [l.get("kick") for l in lines if l.get("kick")]
        if kicks != [3, 2, 1]:
            probs.append("the countdown needs kick 3, 2, 1 in that order")
        if any(l.get("kick") and l.get("scene") not in ("bank", "car", "couch", "beach") for l in lines):
            probs.append("every kick needs a scene: bank, car, couch or beach")
    if style == "phones" and not (sk.get("left") and sk.get("right")):
        probs.append("phones needs left and right contacts")
    if style in ("couch", "countdown") and not sk.get("other"):
        probs.append("set 'other' (look and role)")
    if style == "couch" and any(l.get("who") == "text" for l in lines) and not sk.get("sender"):
        probs.append("texts need a 'sender'")
    return sorted(set(probs))


def write(style, topic, today, tries=4):
    feedback = None
    for n in range(tries):
        try:
            sk = ask_claude(style, topic, today, feedback)
        except json.JSONDecodeError as e:
            feedback = f"Your reply was not valid JSON ({e})."
            continue
        bad = check(style, sk)
        if not bad:
            for l in sk["lines"]:
                l["say"] = clean_tags(l["say"])
            return sk
        feedback = "; ".join(bad)
        print(f"      skit rejected ({n + 1}/{tries}): {feedback}")
    raise RuntimeError(f"no usable skit: {feedback}")


# ---------- voices ----------
# first name found in the account wins; the ids are ElevenLabs' default voices, used if the list can't be read
POOLS = {
    "narrator": [("Chris", "iP95p4xoKVk53GoZ742B"), ("Brian", "nPczCjzI2devNBz1zQrb"), ("Eric", "cjVigY5qzO86Huf0OWal")],
    "you": [("Liam", "TX3LPaxmHKxFdv7VOQHJ"), ("Will", "bIHbv24MWmeRgasZH58o"), ("Charlie", "IKne3meq5aSn9XLyUdCD"), ("Callum", "N2lVS1w4EtoT3dr4eOWO")],
    "girl": [("Laura", "FGY2WhTYpPnrIDTdsKH5"), ("Jessica", "cgSgspJ2msm6clMCkdW9"), ("Lily", "pFZP5JQG7iQjIQuC4Bku")],
    "mom": [("Sarah", "EXAVITQu4vr4xnSDxMaL"), ("Matilda", "XrExE9yKIg1WjnnlVkGX"), ("Alice", "Xb7hH8MSUJpSbSDYk0k2")],
    "man": [("Bill", "pqHfZKP75CvOlQylNhV4"), ("George", "JBFqnCBsd6RMkjVDRZzb"), ("Daniel", "onwK4e9ZLuTAKqWW03F9")],
    "female": [("Matilda", "XrExE9yKIg1WjnnlVkGX"), ("Jessica", "cgSgspJ2msm6clMCkdW9"), ("Aria", "9BWtsMINqrJLrRacOk9x"), ("Sarah", "EXAVITQu4vr4xnSDxMaL")],
    "male": [("Callum", "N2lVS1w4EtoT3dr4eOWO"), ("Charlie", "IKne3meq5aSn9XLyUdCD"), ("Will", "bIHbv24MWmeRgasZH58o"), ("George", "JBFqnCBsd6RMkjVDRZzb")],
}


def account_voices():
    try:
        r = requests.get(f"{ELEVEN}/voices", headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"]}, timeout=30)
        return {v["name"].split()[0].lower(): v["voice_id"] for v in r.json().get("voices", [])}
    except Exception:
        return {}


def cast_voices(sk):
    """One distinct voice per speaker."""
    have = account_voices()
    used, out = set(), {}

    def take(role, pool):
        for name, vid in POOLS[pool]:
            v = have.get(name.lower()) if have else vid
            if v and v not in used:
                used.add(v)
                out[role] = v
                return
        for name, vid in POOLS[pool]:   # none of the names in the account: the default ids
            if vid not in used:
                used.add(vid)
                out[role] = vid
                return
        out[role] = POOLS[pool][0][1]

    take("narrator", "narrator")
    take("you", "you")
    look = (sk.get("other") or {}).get("look", "girl")
    take("other", {"girl": "girl", "mom": "mom", "boss": "man", "dad": "man"}.get(look, "girl"))
    take("text", sk.get("sender_voice") or "female")
    take("left", (sk.get("left") or {}).get("voice") or "male")
    take("right", (sk.get("right") or {}).get("voice") or "female")
    return out


def words_in(chars, starts, a, b):
    """Spoken words (not tags) between character a and b, with the time each starts."""
    out, cur, t0, depth = [], "", None, 0
    for i in range(a, min(b, len(chars))):
        c = chars[i]
        if c == "[":
            depth += 1
        if depth:
            if c == "]":
                depth -= 1
            continue
        if c.isspace():
            if cur:
                out.append((cur, t0))
            cur, t0 = "", None
        else:
            if not cur:
                t0 = starts[i]
            cur += c
    if cur:
        out.append((cur, t0))
    return out


def dialogue(inputs, out):
    """ElevenLabs text-to-dialogue, one take. Returns [(start, end, [(word, t)])] per input."""
    url = f"{ELEVEN}/text-to-dialogue/with-timestamps"
    headers = {"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}
    body = {"inputs": inputs, "model_id": "eleven_v3", "settings": {"stability": 0.5}}
    r = requests.post(url, headers=headers, json=body, timeout=300)
    if r.status_code >= 400:
        print(f"      dialogue refused the settings ({r.status_code}: {r.text[:200]}), retrying without")
        body.pop("settings")
        r = requests.post(url, headers=headers, json=body, timeout=300)
    if r.status_code >= 400:
        raise RuntimeError(f"{r.status_code}: {r.text[:300]}")
    j = r.json()
    (out / "take.mp3").write_bytes(base64.b64decode(j["audio_base64"]))
    al = j.get("alignment") or j.get("normalized_alignment")
    chars, starts = al["characters"], al["character_start_times_seconds"]
    spans = {}
    for s in j.get("voice_segments", []):
        k = s["dialogue_input_index"]
        a = spans.get(k, (1e9, 0, 1e9, 0))
        spans[k] = (min(a[0], s["start_time_seconds"]), max(a[1], s["end_time_seconds"]),
                    min(a[2], s["character_start_index"]), max(a[3], s["character_end_index"]))
    res = []
    for k in range(len(inputs)):
        if k not in spans:
            raise RuntimeError(f"no timing for line {k + 1}")
        st, en, ca, cb = spans[k]
        res.append((st, en, words_in(chars, starts, ca, cb)))
    return res


def line_by_line(inputs, out):
    """Fallback: each line on its own, joined with short gaps."""
    headers = {"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}
    files, res, cursor, gap = [], [], 0.0, 0.18
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(gap), str(out / "gap.wav")], check=True, capture_output=True)
    for i, inp in enumerate(inputs):
        j, r = None, None
        for model in ("eleven_v3", "eleven_multilingual_v2"):
            text = inp["text"] if model == "eleven_v3" else shown(inp["text"])
            r = requests.post(f"{ELEVEN}/text-to-speech/{inp['voice_id']}/with-timestamps", headers=headers, timeout=180,
                              json={"text": text, "model_id": model})
            if r.status_code < 400:
                j = r.json()
                break
        if j is None:
            r.raise_for_status()
        mp3, wav = out / f"l{i:02d}.mp3", out / f"l{i:02d}.wav"
        mp3.write_bytes(base64.b64decode(j["audio_base64"]))
        to_wav(mp3, wav)
        d = duration(wav)
        al = j.get("alignment") or j["normalized_alignment"]
        ws = [(w, cursor + t) for w, t in words_in(al["characters"], al["character_start_times_seconds"], 0, len(al["characters"]))]
        res.append((cursor, cursor + d, ws))
        files += [wav, out / "gap.wav"]
        cursor += d + gap
    (out / "concat.txt").write_text("".join(f"file '{f.resolve()}'\n" for f in files[:-1]))
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(out / "concat.txt"), str(out / "take.wav")], check=True, capture_output=True)
    return res


READ_WPS = 2.6   # with no voice: how fast people read the bubbles (words a second)


def silent(sk, out):
    """No voice: each line stays up as long as it takes to read, words popping in one after the other.
    Same shape as the voiced timings [(start, end, [(word, t)])], plus a silent voice.wav."""
    res, cursor = [], 0.4
    for l in sk["lines"]:
        ws = shown(l["say"]).split()
        d = max(1.5, len(ws) / READ_WPS + 0.5)
        pop = min(d * 0.55, len(ws) * 0.12)              # the words land fast, then the line holds to be read
        res.append((cursor, cursor + d, [(w, round(cursor + pop * i / max(len(ws), 1), 3)) for i, w in enumerate(ws)]))
        cursor += d + 0.15
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", f"{cursor:.2f}",
                    str(out / "voice.wav")], check=True)
    return res


def speak(sk, out):
    if not VOICE:
        print("      no voice: timed at reading speed")
        return silent(sk, out)
    v = cast_voices(sk)
    inputs = [{"text": l["say"], "voice_id": v[l["who"]]} for l in sk["lines"]]
    parts = out / "parts"
    parts.mkdir(exist_ok=True)
    try:
        timed = dialogue(inputs, parts)
        to_wav(parts / "take.mp3", out / "voice.wav")
        print("      voice: one dialogue take (eleven_v3)")
    except Exception as e:
        print(f"      dialogue take failed ({e}); recording line by line")
        timed = line_by_line(inputs, parts)
        to_wav(parts / "take.wav", out / "voice.wav")
    return timed


def show_words(text, spoken, st, en):
    """Times for the on-screen words, spread over the spoken words in order ('$80' can be said 'eighty dollars')."""
    ws = text.split()
    if not ws:
        return []
    ts = [t for _, t in spoken if t is not None] or [st]
    res = [{"w": w, "start": round(ts[min(len(ts) - 1, round(i * len(ts) / len(ws)))], 3)} for i, w in enumerate(ws)]
    for i, w in enumerate(res):
        w["end"] = res[i + 1]["start"] if i + 1 < len(res) else round(en, 3)
    return res


def badge(today):
    days = (GTA6 - today).days
    return f"GTA 6 IN {days} DAYS" if days > 1 else "GTA 6 IS OUT TOMORROW" if days == 1 else "GTA 6 IS OUT TODAY" if days == 0 else "GTA 6 IS OUT"


def load_state():
    st = json.loads(STATE.read_text()) if STATE.exists() else {}
    return {"count": st.get("count", 0), "topics": st.get("topics", [])}


def pick(n, style=None, topic=None):
    style = style or STYLES[n % len(STYLES)]
    if topic is not None:
        return style, TOPICS[topic][0]
    st = load_state()
    fits = [t for t, looks in TOPICS if style in looks]
    fresh = [t for t in fits if t[:40] not in st["topics"][-8:]]
    return style, random.Random(900 + n).choice(fresh or fits)


def make(dry=False, today=None, style=None, topic=None):
    today = today or datetime.now().date()
    n = load_state()["count"]
    style, top = pick(n, style, topic)
    print(f"      GTA Math [{style}]: {top[:90]}")
    sk = write(style, top, today)
    name = f"gtamath__{today:%Y%m%d}__{n}"
    out = MEDIA_DIR / name
    out.mkdir(parents=True, exist_ok=True)
    (out / "skit.json").write_text(json.dumps({"style": style, "topic": top, **sk}, indent=2, ensure_ascii=False))
    print(f"      {name}: {sk['title']}")
    for l in sk["lines"]:
        extra = f"  (to {l['to']})" if l.get("to") else f"  #{l['kick']} [{l.get('scene')}]" if l.get("kick") else ""
        print(f"        {l['who']:>8}: {l['say']}{extra}")
    print(f"        tag: {sk['tag']}")
    if dry:
        return name, None

    timed = speak(sk, out)
    lines = []
    for l, (a, b, spoken) in zip(sk["lines"], timed):
        text = shown(l["say"])
        d = {"who": l["who"], "show": text, "start": round(a, 3), "end": round(b, 3), "words": show_words(text, spoken, a, b)}
        for k in ("to", "kick", "scene", "notif", "youMood"):
            if l.get(k):
                d[k] = l[k]
        if l.get("kickLine"):
            d["kickLine"] = shown(l["kickLine"])
        if l.get("otherMood"):
            d["herMood"] = l["otherMood"]
        lines.append(d)
    tag_at = round(lines[-1]["end"] + 0.1, 2)
    end = max(duration(out / "voice.wav"), tag_at) + 1.3
    music = None
    music_dir = render.PUBLIC / "music"
    if music_dir.exists():
        pool = [f for f in ("headphonk.mp3", "chaos.mp3") if (music_dir / f).exists()]
        music = pool[n % len(pool)] if pool else None
    pub = render.PUBLIC / "voice"
    pub.mkdir(parents=True, exist_ok=True)
    subprocess.run(["cp", str(out / "voice.wav"), str(pub / f"{name}.wav")], check=True)

    def contact(c, dflt):
        c = c or {}
        return {"name": c.get("name") or dflt, "sub": c.get("sub") or "", "dark": bool(c.get("dark"))}
    other = sk.get("other") or {}
    props = {"pal": "vice", "style": style, "label": "GTA MATH", "badge": badge(today),
             "headA": sk["headA"], "headB": sk["headB"],
             "other": {"look": other.get("look") or "girl", "role": other.get("role") or ""},
             "sender": sk.get("sender") or "Lucia 🌴",
             "left": contact(sk.get("left"), "My Girl ❤️"), "right": contact(sk.get("right"), "Lucia 🌴"),
             "lines": lines, "tag": sk["tag"], "tagAt": tag_at,
             "audio": f"voice/{name}.wav", "music": f"music/{music}" if music else None, "musicVolume": 0.1 if VOICE else 0.42,
             "follow": follow_card(today, end), "duration": round(end + FOLLOW, 2)}
    if style == "phones" and not props["left"]["dark"] and not props["right"]["dark"]:
        props["right"]["dark"] = True
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    (out / "render.json").write_text(json.dumps({"music": music}, indent=2))
    final = out / "final.mp4"
    meta = {"title": sk["title"], "description": sk["description"] + "\n\n#gta6 #gta #gaming #shorts #funny", "pinned_comment": sk["pinned_comment"]}
    (out / "upload.json").write_text(json.dumps({"topic": name, **meta, "file": str(final)}, indent=2, ensure_ascii=False))
    subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdSkit", str(final), f"--props={out / 'props.json'}",
                    "--codec=h264", "--crf=18"], cwd=VIDEO_DIR, check=True)
    st = load_state()
    st["count"] += 1
    st["topics"] = (st["topics"] + [top[:40]])[-20:]
    STATE.write_text(json.dumps(st, indent=2))
    return name, final


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--style", choices=STYLES)
    ap.add_argument("--topic", type=int, help="index in TOPICS")
    a = ap.parse_args()
    name, final = make(a.dry, style=a.style, topic=a.topic)
    print(f"\nRendered {final}" if final else "")
