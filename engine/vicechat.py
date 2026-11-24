"""The Vice City group chat: GTA 6's cast and its NPCs text each other about a streamer's viral moment.

The reel (video/src/ed/Chat.tsx):
  first 4-7 s  the actual clip, full screen, with its sound, ending just after the payoff: the context comes first
  then         the clip shrinks into a video bubble (looping the payoff) in an iMessage group chat on the 3D phone, and the chat goes fast
              (about 1 s per message, typing dots, tapbacks), ending on a punchline with a camera push. Then the logo outro.
  The title stays on top for the whole reel.

Source: the best stream clip we posted in the last 2 days that no chat has used yet. No clip, no chat (the 6:07 PM slot
falls through to the next original). Claude (the strong model) writes the chat.

    python -m engine.vicechat --dry      the chat it would write, nothing rendered
    python -m engine.vicechat            renders media/chat__<date>__<n>/final.mp4 (not posted)
"""
import argparse
import json
import os
import random
import subprocess
from datetime import datetime, timedelta

from config import CLAUDE_MODEL, DATA_DIR, MEDIA_DIR
from engine.render import PUBLIC, VIDEO_DIR

STATE = DATA_DIR / "vicechat.json"
INTRO_MIN, INTRO_MAX = 4.0, 8.0  # the clip plays full screen first, through to the payoff
LOOP = 3.0                      # then the video bubble loops just the payoff
OUTRO = 1.6                     # the logo outro
CAST = {"lucia": "Lucia, GTA 6's lead: sharp, sarcastic, the brains, roasts Jason",
        "jason": "Jason, Lucia's partner, the player: deadpan, impulsive, always the one who did it. His texts are the blue ones",
        "grandma": "Grandma, a Vice City NPC: always the victim, dramatic, types in caps when upset",
        "cop": "Officer Diaz, a Vice City cop: tired, useless, short replies",
        "tourist": "a confused tourist NPC: new to Vice City, horrified by everything",
        "bro": "a gym bro NPC: loud, proud, makes it about himself",
        "npc": "a random NPC: chaotic bystander energy"}
TAPS = ["😂", "‼️", "💀", "👍", "❓", "❤️"]
SYS = """You write a short, very funny iMessage group chat between GTA 6 characters and Vice City NPCs, reacting to a clip
of something a streamer just did in the game. The clip plays first, so the viewer already saw what happened: the chat is the
reaction, not the explanation. Audience: gamers 13 to 25.
Funny = escalating, absurd, deadpan, quick back-and-forth, a punchline in the LAST message (short, hits hard, often a callback).
NPC victims are dramatic, the cop is useless, Lucia roasts Jason, Jason (the player) is unbothered and guilty.
Rules: 5 to 7 messages after the clip, each 2 to 9 words, texting style (lowercase fine, caps for yelling). Max 4 characters
in the chat including Jason. Never name the streamer or Twitch: the player is "some guy", "a man screaming into a webcam", etc.
No slurs, no sexual content, no real politics. Tapbacks: 2 or 3 messages get one, the punchline gets 2 or 3."""
TOOL = {"name": "chat", "description": "The group chat.", "input_schema": {"type": "object", "properties": {
    "hook": {"type": "string", "description": "the on-screen title, stays on top the whole reel: what happened in the clip, "
             "funny and clear, max 40 characters, no spoiler of the punchline, e.g. 'HE STOLE A CAR WITH GRANDMA STILL IN IT'"},
    "poster": {"type": "string", "enum": list(CAST), "description": "who posts the clip in the chat (usually the victim or a witness)"},
    "msgs": {"type": "array", "items": {"type": "object", "properties": {
        "who": {"type": "string", "enum": list(CAST)}, "text": {"type": "string"},
        "taps": {"type": "array", "items": {"type": "string", "enum": TAPS}, "description": "tapbacks on this message, often empty"}},
        "required": ["who", "text", "taps"]}},
    "title": {"type": "string", "description": "starts with 'GTA 6: ', the joke in a few words, max 60 characters"},
    "description": {"type": "string", "description": "1 sentence"},
    "pinned_comment": {"type": "string", "description": "a question that gets replies"}},
    "required": ["hook", "poster", "msgs", "title", "description", "pinned_comment"]}}


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {"count": 0, "used": []}


def source():
    """The best single stream clip we posted in the last 2 days that no chat has used: (score, topic, clip id, seen entry)."""
    from engine import streamclips
    st = streamclips.load_state()
    used = set(load_state()["used"])
    cut = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    best = None
    for p in st["posted"]:
        if p["date"] < cut or p["topic"] in used or "__vs_" in p["topic"] or "__react_" in p["topic"]:
            continue
        tail = p["topic"].split("__")[-1]
        cid = next((k for k in st["seen"] if k[:24].replace("-", "_") == tail), None)
        v = st["seen"].get(cid or "")
        if not v or not v.get("url") or v.get("start") is None or v.get("nudity"):
            continue
        cand = (v.get("score") or 0, p["topic"], cid, v)
        if not best or cand[0] > best[0]:
            best = cand
    return best


def ask(context):
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    msg = client.messages.create(model=CLAUDE_MODEL, max_tokens=1500, system=SYS, tools=[TOOL],
                                 messages=[{"role": "user", "content": f"{context}\nCast: {json.dumps(CAST)}"}])
    return next(b.input for b in msg.content if b.type == "tool_use")


def windows(v, dur):
    """The intro (full screen, ends just after the payoff) and the payoff the bubble loops, in source seconds.
    The payoff is the peak when it sits inside the story; otherwise the end of the final pick's trim (it ends on the payoff)."""
    s0, s1 = float(v["start"]), min(float(v["end"]), dur)
    # the trim ends on the payoff; the loudest second is often the streamer yelling before it happens (the canal reel)
    pk = v.get("peak")
    pay = max(s1 - 1.0, float(pk) if pk is not None and float(pk) <= s1 else 0)
    ie = min(s1, pay + 1.0, dur)
    i0 = max(s0, ie - INTRO_MAX)
    i0 = max(0.0, min(i0, ie - INTRO_MIN))
    l0 = max(i0, min(pay - 1.5, ie - LOOP))
    return round(i0, 2), round(ie, 2), round(l0, 2), round(min(ie, l0 + LOOP), 2)


def timed(c, intro):
    """When each message lands: the clip bubble right after the intro, then about 1 s per message, a beat before the punchline."""
    msgs = [{"who": c["poster"], "text": "", "clip": True, "at": round(intro + 0.25, 2), "taps": []}]
    t, prev = intro + 0.25 + 0.9, None
    body = c["msgs"][:7]
    for i, m in enumerate(body):
        if prev:
            t += min(1.6, max(0.85, 0.55 + 0.11 * len(prev["text"].split())))
        last = i == len(body) - 1
        if last:
            t += 0.25
        msgs.append({"who": m["who"], "text": m["text"], "at": round(t, 2), "taps": [x for x in m.get("taps", []) if x in TAPS][:3], "big": last})
        prev = m
    end = round(t + 2.2, 2)
    return msgs, end


def cast_of(c):
    """The faces in the chat's header: the people who text (Jason last), at most 4."""
    order = [c["poster"]] + [m["who"] for m in c["msgs"]]
    out = []
    for k in order:
        if k not in out and k != "jason":
            out.append(k)
    out = out[:3] + (["jason"] if any(m["who"] == "jason" for m in c["msgs"]) else [])
    return out[:4]


def make(dry=False, today=None):
    from engine import streamclips
    today = today or datetime.now().date()
    st = load_state()
    src = source()
    if not src:
        raise RuntimeError("no stream clip from the last 2 days left for a chat")
    _, topic, cid, v = src
    name = f"chat__{today:%Y%m%d}__{st['count']}"
    out = MEDIA_DIR / name
    subprocess.run(["rm", "-rf", str(out)])                # a fresh folder: never reuse a half-downloaded clip
    out.mkdir(parents=True, exist_ok=True)
    print(f"      chat about: {v.get('name') or v.get('login')}: {v.get('moment')} ({topic})")
    lvl = streamclips.download(v["url"], out)
    info = streamclips.media_info(lvl, v.get("language"))
    i0, ie, l0, l1 = windows(v, info["dur"])
    intro_dur = round(ie - i0, 2)
    print(f"      intro {i0}-{ie} s, bubble loops {l0}-{l1} s")
    said = " ".join(w["w"] for w in info["words"] if i0 <= w["start"] <= ie)[:500]   # only what the viewer sees and hears
    c = ask(f"Clip title: {v.get('title')}\nWhat happens: {v.get('setup') or ''}. {v.get('moment')}\n"
            f"The viewer sees the last {intro_dur:.0f} seconds, ending on the payoff. What the streamer says in them: {said}\n"
            "The chat must only react to what's in those seconds. If 'what happens' mentions something the streamer's words "
            "don't confirm in those seconds, leave it out: never describe an outcome the viewer may not see.")
    print(f"      title: {c['hook']}\n        {c['poster']:>8}: [the clip]")
    for m in c["msgs"]:
        print(f"        {m['who']:>8}: {m['text']}  {' '.join(m.get('taps', []))}")
    if dry:
        return name, None
    info = streamclips.bleep(info, out)
    blurs = []                                                # clips with nudity are never used
    rel = streamclips.publish_src(info, name, 0)
    credit = f"{v.get('name') or v.get('login')} on Twitch"
    intro = streamclips.seg(info, v, rel, credit, i0, ie, blurs=blurs)
    bubble = streamclips.seg(info, v, rel, credit, l0, l1, words=False, blurs=blurs)
    msgs, end = timed(c, intro_dur)
    props = {"hook": c["hook"].upper()[:44], "cast": cast_of(c), "msgs": msgs, "introDur": intro_dur, "intro": intro, "bubble": bubble,
             "credit": credit, "music": f"music/{random.choice(['chaos.mp3', 'headphonk.mp3'])}", "clock": "9:41",
             "duration": round(end + OUTRO, 2), "outroAt": end,
             "headA": c["hook"].capitalize(), "pal": "vice"}       # headA/pal: for the cover
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    final = out / "final.mp4"
    try:
        subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdChat", str(final), f"--props={out / 'props.json'}",
                        "--codec=h264", "--crf=16", "--image-format=png"], cwd=VIDEO_DIR, check=True)
    finally:
        (PUBLIC / rel).unlink(missing_ok=True)
    faults = streamclips.free_checks(final, props["duration"])
    if streamclips.still_exposed(final, props["duration"], out):   # the safety net: any nudity fails the reel
        faults.append("nudity in the reel")
    if faults:
        raise RuntimeError(f"chat reel failed its checks: {'; '.join(faults)}")
    login = v.get("login") or ""
    (out / "upload.json").write_text(json.dumps({
        "topic": name, "title": c["title"], "pinned_comment": c["pinned_comment"], "file": str(final),
        "description": f"{c['description']}\n\nThe texts are made up.\n🎥 {credit}: https://twitch.tv/{login}\nOriginal clip: {v['url']}"},
        indent=2, ensure_ascii=False))
    st["count"] += 1
    st["used"] = (st["used"] + [topic])[-100:]
    STATE.write_text(json.dumps(st, indent=2))
    return name, final


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    print(make(a.dry))
