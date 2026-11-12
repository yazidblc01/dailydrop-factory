"""Writes the video script from the data payload, then checks every number.

Two formats (config.TEMPLATE):
- "story":   hook, race intro, a line per key moment of the race, #1 reveal, twist (#1 hidden as ??? until then)
- "classic": hook, beats, tension, reveal, twist (the original one-chart video)

Usage:
    python -m engine.script <topic>
"""
import json
import os
import re
import sys

import anthropic
from dotenv import load_dotenv

from config import CLAUDE_MODEL, MEDIA_DIR, TEMPLATE
from engine import story

load_dotenv()

COMMON_RULES = """
- Use ONLY numbers that appear in the DATA (or in COUNTDOWN and MOMENTS). In spoken lines use the *_spoken forms, e.g. "$1.2 trillion". Years are fine.
- Never invent, estimate or round numbers beyond what the data shows.
- Short words, short sentences, grade 6 reading level. Confident, fast, a little playful. No filler ("basically", "in this video", "let's dive in").
- The twist must lead naturally back into the hook so the video loops.
- If the data is about stocks or investing, never say "you should buy", and add "Not financial advice." to the description.
- Do not use the words gambling, guaranteed, or free money.
- At most 3 hashtags, at the end of the description.
"""

SYSTEM_STORY = """You write scripts for faceless YouTube Shorts on a data channel called The Daily Drop.
Format: an animated line race runs from the very first second. One contender, the MYSTERY, is hidden on screen
as "???" and only named at the reveal. Key MOMENTS of the race are shown on screen while the voice talks about them.
MODE "top": the mystery is the one that ends up #1, so the hook asks who ends up on top.
MODE "growth": the mystery is the one that GREW the most (the #1 is obvious), so the hook asks who grew the most
and the reveal gives its GROWTH.

Return ONLY valid JSON, no prose, in exactly this shape:
{
  "hook": "a question, max 12 words, spoken in the first second",
  "race_intro": "one short line that teases the mystery, max 12 words",
  "callouts": ["one line per MOMENT, in the same order, max 14 words each"],
  "reveal": "names the mystery and its final number (MODE top) or its GROWTH (MODE growth), max 16 words",
  "twist": "one line that loops back to the hook",
  "bg_reveal": "2 to 4 word photo search for the reveal background",
  "title": "YouTube title, 40 to 60 characters",
  "description": "2 to 3 lines for the YouTube description, ending with the data source",
  "pinned_comment": "a question that makes people comment their guess"
}

Rules:
- Never name the MYSTERY before the reveal: not in the hook, race_intro, callouts or title. Call it MYSTERY_WORD instead.
- "callouts" has exactly one line per MOMENT, in the same order. Each line must say what its MOMENT says (the year and who), because the screen shows that moment at the same time.
- If there are no MOMENTS, "callouts" is an empty list and race_intro carries the suspense.
- The race_intro must NOT list the contenders (the screen shows them). It teases the mystery in one punchy line.
- Write numbers as digits with their symbols ($13,765, 62%); a separate step turns them into spoken words.
- The photo search describes scenery or objects only (skylines, money, highways, landscapes). Never people, faces, brands, logos or product names.
- Total spoken words (hook + race_intro + callouts + reveal + twist) between 45 and 85.
""" + COMMON_RULES

SYSTEM_CLASSIC = """You write scripts for faceless YouTube Shorts on a data channel called The Daily Drop.
The payoff of every video is a NUMBER or RANKING revealed near the end.

Return ONLY valid JSON, no prose, in exactly this shape:
{
  "hook": "question, max 12 words, spoken in the first second",
  "beats": [
    {"say": "one sentence spoken", "show": "short on-screen label, max 6 words"}
  ],
  "tension": "one short line before the reveal",
  "reveal": "the reveal sentence, the key number or winner stated plainly",
  "twist": "one line that loops back to the hook",
  "title": "YouTube title, 40 to 60 characters",
  "description": "2 to 3 lines for the YouTube description, ending with the data source",
  "pinned_comment": "a question that makes people comment their guess"
}

Rules:
- In "show" labels use the *_display forms, e.g. "$1.2T".
- 3 or 4 beats. Total spoken words (hook + beats + tension + reveal + twist) between 65 and 85.
- Build curiosity: the beats show the starting picture, the reveal shows how it ended up. Keep the winner secret until the reveal.
""" + COMMON_RULES

NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
ALWAYS_OK = {1, 2, 3, 4, 5, 6, 7, 8, 10}
WORDS = {"story": (40, 90), "classic": (60, 90)}


def numbers_in(text):
    return [float(n.replace(",", "")) for n in NUM_RE.findall(str(text))]


def allowed_numbers(payload):
    nums = set(ALWAYS_OK)
    sources = []
    for it in payload["items"]:
        sources += [it["start_display"], it["end_display"], it["start_spoken"], it["end_spoken"], it.get("year") or ""]
    sources += [payload["start_label"], payload["end_label"], payload["angle"], payload.get("data_as_of", "")]
    sources += [str(v) for v in payload["facts"].values()]
    sources += [m["fact"] + " " + m["text"] for m in payload.get("moments") or []]
    sources += [str((payload.get("mystery") or {}).get("growth_text", ""))]
    for s in sources:
        for n in numbers_in(s):
            nums.add(round(n, 2))
            nums.add(round(n))
    return nums


def spoken_parts(script):
    if "race_intro" in script:
        return [script["hook"], script["race_intro"], *script["callouts"], script["reveal"], script["twist"]]
    return [script["hook"], *[b["say"] for b in script["beats"]], script["tension"], script["reveal"], script["twist"]]


def check_numbers(script, payload):
    allowed = allowed_numbers(payload)
    extra = [b["show"] for b in script.get("beats", [])] + [script["title"]]
    text = " ".join(spoken_parts(script) + extra)
    return [str(n) for n in numbers_in(text) if round(n, 2) not in allowed and round(n) not in allowed]


def word_count(script):
    return len(" ".join(spoken_parts(script)).split())


def check_story_shape(script, payload):
    problems = []
    n = len(payload.get("moments") or [])
    if len(script.get("callouts", [])) != n:
        problems.append(f"callouts must have exactly {n} lines, one per MOMENT")
    winner = payload["mystery"]["short"].lower()
    early = " ".join([script["hook"], script.get("race_intro", ""), *script.get("callouts", []), script["title"]]).lower()
    if len(script.get("race_intro", "").split()) > 16:
        problems.append("race_intro is too long: one short line, max 12 words, and do not list the contenders")
    if re.search(rf"\b{re.escape(winner)}\b", early):
        problems.append(f"do not name {winner} before the reveal (hook, race_intro, callouts and title must call it the mystery one)")
    return problems


def ask_claude(payload, template, feedback=None):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    keep = ("angle", "start_label", "end_label", "facts", "notes", "on_screen_source")
    slim = {k: payload[k] for k in keep}
    slim["items"] = [{k: v for k, v in it.items() if k not in ("series", "image")} for it in payload["items"]]
    user = "DATA:\n" + json.dumps(slim, indent=2)
    if template == "story":
        my = payload["mystery"]
        user += f"\n\nMYSTERY (hidden until the reveal): {my['short']}\nMODE: {my['mode']}"
        if my["mode"] == "growth":
            user += f"\nGROWTH: {my['growth_text']} (from start to today)"
        user += f"\nMYSTERY_WORD: {story.MYSTERY_WORD.get(payload['recipe'], 'the mystery pick')}"
        moments = [{"year": int(m["t"]), "what": m["fact"]} for m in payload.get("moments") or []]
        user += "\n\nMOMENTS (in order):\n" + json.dumps(moments, indent=2)
    if feedback:
        user += "\n\nYour previous script was rejected: " + feedback + " Fix it."
    msg = client.messages.create(model=CLAUDE_MODEL, max_tokens=4000,
                                 system=SYSTEM_STORY if template == "story" else SYSTEM_CLASSIC,
                                 messages=[{"role": "user", "content": user}])
    text = "".join(b.text for b in msg.content if b.type == "text")
    return json.loads(text[text.find("{"): text.rfind("}") + 1])


def write_script(topic, max_tries=3, template=TEMPLATE):
    path = MEDIA_DIR / topic / "data.json"
    payload = json.loads(path.read_text())
    if template == "story" and not (payload.get("race") and all(i.get("series") for i in payload["items"])):
        template = "classic"  # no price history to race (e.g. GTA launch prices): use the one-chart video
    if template == "story" and ("moments" not in payload or "mystery" not in payload):
        story.prepare(payload)
        path.write_text(json.dumps(payload, indent=2))
    lo, hi = WORDS[template]
    feedback = None
    for attempt in range(1, max_tries + 1):
        script = ask_claude(payload, template, feedback)
        problems = []
        bad = check_numbers(script, payload)
        if bad:
            problems.append(f"these numbers are not in the data: {', '.join(bad)}")
        words = word_count(script)
        if not lo <= words <= hi:
            problems.append(f"spoken length is {words} words, needs {lo + 5} to {hi - 5}")
        if template == "story":
            problems += check_story_shape(script, payload)
        if not problems:
            script["word_count"] = words
            script["template"] = template
            (MEDIA_DIR / topic / "script.json").write_text(json.dumps(script, indent=2))
            return script, attempt
        feedback = "; ".join(problems) + "."
        print(f"Attempt {attempt} rejected: {feedback}")
    raise RuntimeError(f"No valid script after {max_tries} attempts. Last problems: {feedback}")


if __name__ == "__main__":
    topic = sys.argv[1] if len(sys.argv) > 1 else "gta_launch_prices"
    s, n = write_script(topic)
    print(f"\nScript passed checks on attempt {n} ({s['word_count']} words, {s['template']})\n")
    print("HOOK:   ", s["hook"])
    if s["template"] == "story":
        print("RACE:   ", s["race_intro"])
        for c in s["callouts"]:
            print("MOMENT: ", c)
    else:
        for i, b in enumerate(s["beats"], 1):
            print(f"BEAT {i}: ", b["say"], f"   [screen: {b['show']}]")
        print("TENSION:", s["tension"])
    print("REVEAL: ", s["reveal"])
    print("TWIST:  ", s["twist"])
    print("\nTITLE:  ", s["title"])
    print("DESC:   ", s["description"])
    print("PINNED: ", s["pinned_comment"])
    print(f"\nSaved media/{topic}/script.json")
