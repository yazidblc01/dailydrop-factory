"""Leonida Live: every stream clip as a breaking-news segment from inside GTA 6 (video/src/ed/News.tsx, composition EdNews).

  cold open (4.6 s)   GRAND THEFT AUTO 6, BREAKING / NEWS slabs, the frozen payoff, the headline card
  the clip            footage from the scene (1.15x band or zoomed in), the streamer as the eyewitness, chyron, ticker, info strip
  the quiz            only when the clip has a real "what happens next?" moment: the footage freezes just before the payoff,
                      a game-show card with 3 answers and a 5-second timer, then the payoff plays and the right answer pops in
  sign-off            the anchor's last line

Why: YouTube's Oct 1 2026 Shorts update cuts reach for channels that mostly repost clips. The news segment is our own
writing (headline, chyron, ticker jokes, quiz) wrapped around the clip: the commentary and storyline YouTube asks for.
"""
import json
import random
import subprocess

OPEN, SIGNOFF, QUIZ_FOR = 4.6, 1.8, 5.5            # the quiz: 0.5 s in, then a 5-second answer timer

COPY = {"name": "broadcast", "description": "The news copy for the segment.", "input_schema": {"type": "object", "properties": {
    "headline": {"type": "array", "items": {"type": "string"}, "description": "the cold-open headline, 2 or 3 short lines (max 13 characters each), "
                 "teasing the event without giving the ending away, e.g. ['MAN STEALS', 'GRANDMA'S', 'SCOOTER']"},
    "kicker": {"type": "string", "description": "a short line above the headline, max 32 characters: the place and time, e.g. 'Vice Beach · 9:47 PM'"},
    "chyron": {"type": "string", "description": "the lower-third headline, max 34 characters, never the ending"},
    "sub": {"type": "string", "description": "the line under it, max 46 characters, a simple joke or detail about this exact moment"},
    "ticker": {"type": "array", "items": {"type": "string"}, "description": "4 scrolling ticker items, max 44 characters each, deadpan fake news about THIS moment "
               "and its aftermath (witnesses, police statements, silly follow-ups); funny, specific, never mean about real people"},
    "quiz": {"type": "boolean", "description": "true only if the clip has a real 'what happens next?' moment: a visible build-up a viewer could guess from, "
             "and a payoff that lands after it (a jump, a crash coming, a fight about to start). false for clips that are funny from start to end"},
    "options": {"type": "array", "items": {"type": "string"}, "description": "3 answers to 'what happens next?', max 26 characters each, simple words, "
                "e.g. 'Owner breaks his hand'; exactly one is what really happens, the other two believable"},
    "answer": {"type": "integer", "description": "index (0-2) of the option that really happens"},
    "signoff": {"type": "string", "description": "the anchor's sign-off, max 30 characters, e.g. 'Back to you, Leonida.' or a simple callback"},
    "place": {"type": "string", "description": "where it happens in Leonida, max 14 characters, uppercase, e.g. VICE CITY, VICE BEACH; VICE CITY if unsure"},
    "clock": {"type": "string", "description": "a believable time of day matching the light on screen, e.g. 11:42 PM"},
    "weather": {"type": "string", "description": "the weather matching the scene, max 14 characters, e.g. '84°F CLEAR' or '71°F RAIN'"},
    "wanted": {"type": "integer", "description": "1 to 5: how much trouble the person is in, as a GTA wanted level"}},
    "required": ["headline", "kicker", "chyron", "sub", "ticker", "quiz", "options", "answer", "signoff", "place", "clock", "weather", "wanted"]}}
SYS = """You write 'Leonida Live', a deadpan local TV news segment about something that just happened in GTA 6 (the game's state is Leonida,
its city Vice City). The footage is a streamer's clip; the streamer is the 'eyewitness'. Voice: a straight-faced local news anchor
reporting absurd chaos as serious news. Funny through specifics and understatement, never cringe, no emojis, no hashtags.
Never give the payoff away before it plays (headline, chyron and sub tease it). Stay true to what happens in the clip.
Write in English even if the streamer speaks another language.
KEEP IT SIMPLE: our viewers are 13 to 25 and scroll fast. Every line must be understood in one second by a 13-year-old:
short everyday words, no clever wordplay that needs thinking, no fancy words (not 'ethics panel', 'altercation', 'deliberates').
Good: 'MAN CAN'T DECIDE IF HE SHOULD SHOOT', 'GUY CRASHES BIKE, BLAMES BIKE'. Funny comes from the situation, not big words."""


def write(sc, v, seg):
    """The broadcast copy, and where the footage freezes for the quiz (None when there is no quiz)."""
    peak = seg["peak"] if seg.get("peak") is not None else seg["dur"] * 0.6
    freeze_at = round(min(peak - 0.6, seg["dur"] - 1.5), 2)
    can_quiz = freeze_at >= 2.2                         # the build-up needs a couple of seconds before the freeze
    said = " ".join(w["w"] for w in seg.get("words", []))[:600]
    c = sc.ask([{"type": "text", "text": f"The moment: {v.get('moment')}. Setup: {v.get('setup')}. What the screener saw: {v.get('why')}\n"
                                         f"What is said: {said}\nThe payoff is at {peak:.1f}s of a {seg['dur']:.1f}s clip."
                                         + ("" if can_quiz else " The payoff comes too early for a quiz: set quiz to false.")}],
               COPY, SYS)
    opts = c.get("options") or []
    quiz = bool(c.get("quiz")) and can_quiz and len(opts) == 3 and 0 <= int(c.get("answer", -1)) < 3
    if quiz:
        order = random.sample(range(3), 3)              # the right answer lands at a random letter
        c["options"], c["answer"] = [opts[i] for i in order], order.index(int(c["answer"]))
    else:
        c["options"], c["answer"] = ["", "", ""], 0
    c["question"] = "What happens next?"
    c["headline"] = [x for x in (c.get("headline") or []) if x][:3] or ["BREAKING"]
    c["ticker"] = [x for x in (c.get("ticker") or []) if x][:4] or [c.get("sub", "")]
    return c, (freeze_at if quiz else None)


def render(sc, seg, copy, freeze_at, mode, report, out):
    """Renders the segment (4K like every clip reel). Returns (final, total seconds)."""
    quiz = freeze_at is not None
    freeze_for = QUIZ_FOR if quiz else 0.0
    duration = round(OPEN + seg["dur"] + freeze_for + SIGNOFF, 2)
    props = {"seg": seg, "copy": {**copy, "report": report}, "open": OPEN, "freezeAt": freeze_at if quiz else seg["dur"], "freezeFor": freeze_for,
             "signoff": SIGNOFF, "duration": duration, "look": "news", "cc": True, "mode": mode, "quiz": "show" if quiz else "none",
             "headA": copy.get("chyron", "").capitalize(), "pal": "vice"}          # headA/pal: for the cover (engine/cover.py)
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    final = out / "final.mp4"
    try:
        subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdNews", str(final), f"--props={out / 'props.json'}",
                        "--codec=h264", "--crf=16", "--scale=2", "--image-format=png", "--x264-preset=slow"], cwd=sc.VIDEO_DIR, check=True)
    finally:
        (sc.render.PUBLIC / seg["src"]).unlink(missing_ok=True)
        if seg.get("bg"):
            (sc.render.PUBLIC / seg["bg"]).unlink(missing_ok=True)
    return final, duration
