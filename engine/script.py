"""Writes the video script from the data payload, then checks every number.

Usage:
    python -m engine.script <topic>
"""
import json
import os
import re
import sys

import anthropic
from dotenv import load_dotenv

from config import CLAUDE_MODEL, MEDIA_DIR

load_dotenv()

SYSTEM = """You write scripts for faceless YouTube Shorts on a data channel called The Daily Drop.
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
- Use ONLY numbers that appear in the DATA. In spoken lines (hook, beats say, tension, reveal, twist) use the *_spoken forms, e.g. "$1.2 trillion". In "show" labels use the *_display forms, e.g. "$1.2T". Years are fine.
- Never invent, estimate or round numbers beyond what the data shows.
- 3 or 4 beats. Total spoken words (hook + beats + tension + reveal + twist) between 65 and 85.
- Short words, short sentences, grade 6 reading level. Confident, fast, no filler ("basically", "in this video", "let's dive in").
- Build curiosity: the beats show the starting picture, the reveal shows how it ended up. Keep the winner secret until the reveal.
- The twist must lead naturally back into the hook so the video loops.
- If the data is about stocks or investing, never say "you should buy", and add "Not financial advice." to the description.
- Do not use the words gambling, guaranteed, or free money.
- At most 3 hashtags, at the end of the description.
"""

NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
ALWAYS_OK = {1, 2, 3, 4, 5, 6, 7, 8, 10}


def numbers_in(text):
    return [float(n.replace(",", "")) for n in NUM_RE.findall(str(text))]


def allowed_numbers(payload):
    nums = set(ALWAYS_OK)
    sources = []
    for it in payload["items"]:
        sources += [it["start_display"], it["end_display"], it["start_spoken"], it["end_spoken"], it.get("year") or ""]
    sources += [payload["start_label"], payload["end_label"], payload["angle"], payload.get("data_as_of", "")]
    sources += [str(v) for v in payload["facts"].values()]
    for s in sources:
        for n in numbers_in(s):
            nums.add(round(n, 2))
            nums.add(round(n))
    return nums


def spoken_parts(script):
    return [script["hook"], *[b["say"] for b in script["beats"]], script["tension"], script["reveal"], script["twist"]]


def check_numbers(script, payload):
    allowed = allowed_numbers(payload)
    text = " ".join(spoken_parts(script) + [b["show"] for b in script["beats"]] + [script["title"]])
    return [str(n) for n in numbers_in(text) if round(n, 2) not in allowed and round(n) not in allowed]


def word_count(script):
    return len(" ".join(spoken_parts(script)).split())


def ask_claude(payload, feedback=None):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    slim = {k: payload[k] for k in ("angle", "start_label", "end_label", "items", "facts", "notes", "on_screen_source")}
    user = "DATA:\n" + json.dumps(slim, indent=2)
    if feedback:
        user += "\n\nYour previous script was rejected: " + feedback + " Fix it."
    msg = client.messages.create(model=CLAUDE_MODEL, max_tokens=4000, system=SYSTEM,
                                 messages=[{"role": "user", "content": user}])
    text = "".join(b.text for b in msg.content if b.type == "text")
    return json.loads(text[text.find("{"): text.rfind("}") + 1])


def write_script(topic, max_tries=3):
    payload = json.loads((MEDIA_DIR / topic / "data.json").read_text())
    feedback = None
    for attempt in range(1, max_tries + 1):
        script = ask_claude(payload, feedback)
        problems = []
        bad = check_numbers(script, payload)
        if bad:
            problems.append(f"these numbers are not in the data: {', '.join(bad)}")
        words = word_count(script)
        if not 60 <= words <= 90:
            problems.append(f"spoken length is {words} words, needs 65 to 85")
        if not problems:
            script["word_count"] = words
            (MEDIA_DIR / topic / "script.json").write_text(json.dumps(script, indent=2))
            return script, attempt
        feedback = "; ".join(problems) + "."
        print(f"Attempt {attempt} rejected: {feedback}")
    raise RuntimeError(f"No valid script after {max_tries} attempts. Last problems: {feedback}")


if __name__ == "__main__":
    topic = sys.argv[1] if len(sys.argv) > 1 else "gta_launch_prices"
    s, n = write_script(topic)
    print(f"\nScript passed checks on attempt {n} ({s['word_count']} words)\n")
    print("HOOK:   ", s["hook"])
    for i, b in enumerate(s["beats"], 1):
        print(f"BEAT {i}: ", b["say"], f"   [screen: {b['show']}]")
    print("TENSION:", s["tension"])
    print("REVEAL: ", s["reveal"])
    print("TWIST:  ", s["twist"])
    print("\nTITLE:  ", s["title"])
    print("DESC:   ", s["description"])
    print("PINNED: ", s["pinned_comment"])
    print(f"\nSaved media/{topic}/script.json")
