"""Texts from the future: a fake iMessage chat between past you and 2026 you.

The story (who, when, what) comes from data/text_stories.csv. Every number comes from real data
(Yahoo prices or FRED) or from the facts column of the CSV, and Claude writes only the chat around
them. Any number in the chat that is not in the facts gets the chat rejected and rewritten.

    python -m engine.texts --list               stories and which ones are used
    python -m engine.texts <id> --dry           facts + chat, no render
    python -m engine.texts <id>                 full render to media/texts__<id>/final.mp4
    python -m engine.texts <id> --flat          render with the old flat design (the automatic backup)

The video is the 3D editorial design (video/src/ed/Texts.tsx). If that render fails, the old flat design
(TextsFuture) is rendered instead, so the day never breaks.
"""
import argparse
import csv
import json
import os
import re
import copy
import subprocess
import sys
from datetime import date, datetime, timedelta

from config import CLAUDE_MODEL, DATA_DIR, MEDIA_DIR
from engine import topics
from engine.render import VIDEO_DIR, load_music_lib, PUBLIC
from engine.script import numbers_in

STORIES = DATA_DIR / "text_stories.csv"
PREFIX = "texts__"
LOW_STOCK = 6
# gaming stories, in the order the 7 PM GTA slot uses them; the main slot leaves them alone during GTA month
GAMING = ["ps4_nvidia", "gta6_trailer_ttwo", "switch_2017", "rdr2_ttwo", "ps5_amd", "xbox360_2005", "gtx1080_2016",
          "ps3_2006", "minecraft_2014", "steamdeck_amd", "wii_2006", "pokemon_go_2016", "gme_tradein_2019", "gme_moon"]
MAX_DURATION = 30.0
REVEAL_GAP = 4.5        # seconds the 3D number reveal holds before the next text
PALETTE = "paper"
ALWAYS_OK = set(range(0, 13)) | {20, 24, 50, 100}  # "2 years", "24/7", "100%"... harmless small numbers


# ---------- the story bank ----------
def load_stories():
    with open(STORIES, newline="") as f:
        return [r for r in csv.DictReader(f) if r["id"].strip()]


def used_ids():
    """Stories already made or posted (posts.json catches ones posted by hand, like the GTA V launch one)."""
    from engine.upload import load_posts
    seen = list(topics.load_history()["done"]) + list(load_posts())
    return {t[len(PREFIX):] for t in seen if t.startswith(PREFIX)}


def left_count():
    used = used_ids()
    return sum(1 for s in load_stories() if s["id"] not in used)


def queue(pool="main"):
    """Unused stories in the order they will be used. pool "gaming" = the GTA slot."""
    from engine import schedule
    used = used_ids()
    stories = {s["id"]: s for s in load_stories()}
    if pool == "gaming":
        return [stories[i] for i in GAMING if i in stories and i not in used]
    hold = set(GAMING) if schedule.gta_week() else set()
    return [s for s in stories.values() if s["id"] not in used and s["id"] not in hold]


def pairs(field):
    """"TTWO:Take-Two|NVDA:Nvidia" -> [("TTWO", "Take-Two"), ("NVDA", "Nvidia")]"""
    out = []
    for part in filter(None, (field or "").split("|")):
        code, _, name = part.partition(":")
        out.append((code.strip(), name.strip() or code.strip()))
    return out


# ---------- money formatting (the chat must use these strings exactly) ----------
def usd(v):
    if v >= 100:
        return f"${v:,.0f}"
    if v >= 10:
        return f"${v:,.0f}" if abs(v - round(v)) < 0.005 else f"${v:,.2f}"
    return f"${v:,.2f}"


def month_label(d):
    return d.strftime("%b %Y")


# ---------- facts from real data ----------
def stock_facts(story):
    import yfinance as yf
    buy = datetime.strptime(story["buy_date"], "%Y-%m-%d").date()
    amount = float(story["amount"])
    out = []
    for code, name in pairs(story["tickers"]):
        px = yf.download(code, start=str(buy - timedelta(days=7)), auto_adjust=True, progress=False)["Close"]
        s = (px[code] if hasattr(px, "columns") else px).dropna()
        s = s[s > 0]
        after = s[s.index.date >= buy]
        if after.empty or (after.index[0].date() - buy).days > 7:
            raise RuntimeError(f"no {code} price near {buy}")
        first, last = float(after.iloc[0]), float(after.iloc[-1])
        peak_day = after.idxmax()
        peak = float(after.max())
        now_value = amount * last / first
        f = {
            "name": name, "ticker": code,
            "bought_on": after.index[0].strftime("%b %-d, %Y"),
            "amount": usd(amount),
            "worth_now": usd(now_value),
            "change": f"{(last / first - 1) * 100:+.0f}%",
            "as_of": month_label(after.index[-1].date()),
        }
        if peak_day.date() > after.index[0].date() and peak > first * 1.5 and peak > last * 2:
            f["peak_value"] = usd(amount * peak / first)  # it went way up, then came back down
            f["peak_month"] = month_label(peak_day.date())
        out.append({k: v for k, v in f.items() if v is not None})
    return out


def price_facts(story):
    from engine.recipes import fred_monthly
    buy = datetime.strptime(story["buy_date"], "%Y-%m-%d").date()
    key = buy.strftime("%Y-%m")
    out = []
    for code, name in pairs(story["tickers"]):
        m = fred_monthly(code)
        if key not in m:
            raise RuntimeError(f"no FRED {code} for {key}")
        last_key = max(m)
        then, now = m[key], m[last_key]
        out.append({"name": name, "then": usd(then), "then_month": month_label(buy),
                    "now": usd(now), "as_of": month_label(datetime.strptime(last_key, "%Y-%m").date()),
                    "change": f"{(now / then - 1) * 100:+.0f}%"})
    return out


def build_facts(story):
    data = stock_facts(story) if story["kind"] == "stock" else price_facts(story)
    extra = [x.strip() for x in (story["facts"] or "").split("|") if x.strip()]
    return {"data": data, "facts": extra}


def source_label(story, facts):
    d = facts["data"]
    if story["kind"] == "stock":
        names = ", ".join(f"{x['name']} ({x['ticker'].replace('-USD', '')})" for x in d)
        return f"{names} adjusted close, {d[0]['bought_on']} to {d[0]['as_of']}. Not financial advice."
    return f"US average prices (BLS via FRED), {d[0]['then_month']} vs {d[0]['as_of']}."


# ---------- the chat writer ----------
SYSTEM = """You write a fake iPhone text chat for a YouTube Short called "Texts from the future".
Past me texts with future me (it is 2026 for future me). It must feel like a real chat between friends: short,
casual, funny, believable. Mostly lowercase, light slang, no hashtags.

RULES
- 12 to 16 messages. Each message under 55 characters.
- The FIRST TWO messages are from "them" (future me). They pop up on past me's lock screen as notifications,
  so they are the hook of the video: short, intriguing, and they must make sense on their own
  (for example: "don't buy the PS4 tomorrow" then "it's you. from 2026"). Each of these two is under 32 characters.
  Past me replies after that.
- "me" = past me, inside the SETTING. "them" = future me, who knows how it turns out.
- Shape: past me is in the moment (1 to 3 msgs) -> future me drops the tip -> past me doubts it ->
  the real number lands as its own short message -> a twist or callback -> end on a short funny line from "me"
  (an emoji alone like 💀 or 😭 is great as the last message).
- The big number lands ALONE in its own message from "them", written exactly as in FACTS (like "$174,123"),
  and it is the ONLY message that is just a dollar amount. Then past me reacts. Never explain the math after it,
  never say "that's where it is in <month>", never add a second "you'd have been richer" number.
  Only mention peak_value if the story is about a crash (it fell a lot from the peak).
- The last 3 messages are the punchline: a callback to the SETTING (the thing past me was worried about).
- Numbers: ONLY numbers that appear in FACTS or SETTING, written exactly as given ($816 not 816 dollars,
  keep the $ and commas). No other numbers, no other years, no percentages unless given.
- Real-world claims: only what FACTS or SETTING say. No invented events, no invented prices.
- Future me never tells the viewer to invest today. No "not financial advice" inside the chat.
- At most 3 emojis in the whole chat (an emoji-only message counts as 1).
- Never name any real person except ones in SETTING or FACTS.

Fill in the write_chat tool with:
{"hookTop": "max 22 chars, the setup, CAPS", "hookBottom": "max 24 chars, CAPS",
 "revealLine": "max 40 chars, the headline shown when the big number appears, e.g. The $399 you spent on a PS4",
 "revealEm": "max 22 chars, the end of that headline, e.g. would be this.",
 "captionLead": "max 38 chars, first person, sets the scene under the phone, e.g. The night before I bought a PS4,",
 "captionEm": "max 28 chars, the twist half of that caption, highlighted, e.g. 2026 me started texting.",
 "messages": [{"from": "me" | "them", "text": "..."}],
 "title": "YouTube title under 70 chars, curiosity, max 1 emoji, numbers only from FACTS",
 "description": "2 sentences with the real numbers and dates from FACTS, then: Not financial advice.",
 "pinned_comment": "a short question that makes people comment"}"""


CHAT_TOOL = {
    "name": "write_chat",
    "description": "Return the finished chat and its texts.",
    "input_schema": {
        "type": "object",
        "properties": {
            "hookTop": {"type": "string"}, "hookBottom": {"type": "string"},
            "revealLine": {"type": "string"}, "revealEm": {"type": "string"},
            "captionLead": {"type": "string"}, "captionEm": {"type": "string"},
            "messages": {"type": "array", "items": {"type": "object", "properties": {
                "from": {"type": "string", "enum": ["me", "them"]}, "text": {"type": "string"}}, "required": ["from", "text"]}},
            "title": {"type": "string"}, "description": {"type": "string"}, "pinned_comment": {"type": "string"},
        },
        "required": ["hookTop", "hookBottom", "revealLine", "revealEm", "captionLead", "captionEm", "messages", "title", "description", "pinned_comment"],
    },
}


def ask_claude(story, facts, feedback=None):
    """Claude fills in a tool call, so the reply is always valid JSON (no stray quotes breaking it)."""
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    user = (f"DATE OF THE CHAT (past me): {story['stamp']}\nSETTING: {story['setting']}\n"
            f"FACTS:\n{json.dumps(facts, indent=2, ensure_ascii=False)}")
    if feedback:
        user += f"\n\nYour previous chat was rejected: {feedback} Fix it."
    # this model can't be forced to use the tool, so it is asked to; a plain JSON reply is still accepted as a backup
    msg = client.messages.create(model=CLAUDE_MODEL, max_tokens=3000, system=SYSTEM + "\n\nAlways answer by calling the write_chat tool.",
                                 tools=[CHAT_TOOL], messages=[{"role": "user", "content": user}])
    for b in msg.content:
        if b.type == "tool_use":
            return dict(b.input)
    text = "".join(b.text for b in msg.content if b.type == "text")
    return json.loads(text[text.find("{"): text.rfind("}") + 1])


def allowed_numbers(story, facts):
    nums = set(ALWAYS_OK)
    src = json.dumps(facts) + " " + story["stamp"] + " " + story["setting"] + f" {date.today().year}"
    years = date.today().year - int(story["buy_date"][:4])
    src += f" {story['buy_date'][:4]} {years}"  # "13 YEARS??" is fine
    for n in numbers_in(src):
        nums |= {round(n, 2), round(n)}
    return nums


EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


def check_chat(chat, story, facts):
    """Problems with a chat, or [] if it is good to render."""
    bad = []
    msgs = chat.get("messages") or []
    if not 10 <= len(msgs) <= 18:
        bad.append(f"{len(msgs)} messages, need 12 to 16.")
    if len(msgs) < 3 or msgs[0].get("from") != "them" or msgs[1].get("from") != "them" or msgs[2].get("from") != "me":
        bad.append('The first two messages must be from "them" (the lock screen notifications), the third from "me".')
    if len(big_messages(msgs)) != 1:
        bad.append('Exactly one message from "them" must be just the big dollar amount, alone.')
    if any(m.get("from") not in ("me", "them") for m in msgs):
        bad.append('Every message needs "from": "me" or "them".')
    long = [m["text"] for m in msgs if len(m.get("text", "")) > 62] + [m["text"] for m in msgs[:2] if len(m.get("text", "")) > 36]
    if long:
        bad.append(f"Too long: {long[0]!r}.")
    if sum(len(EMOJI.findall(m.get("text", ""))) for m in msgs) > 4:
        bad.append("Too many emojis.")
    ok = allowed_numbers(story, facts)
    text = " ".join(m.get("text", "") for m in msgs) + " " + " ".join(chat.get(k, "") for k in ("title", "description", "revealLine", "revealEm", "captionLead", "captionEm"))
    wrong = sorted({str(n) for n in numbers_in(text) if round(n, 2) not in ok and round(n) not in ok})
    if wrong:
        bad.append(f"These numbers are not in FACTS: {', '.join(wrong)}.")
    for k, cap in (("hookTop", 26), ("hookBottom", 28), ("title", 90), ("revealLine", 44), ("revealEm", 26), ("captionLead", 42), ("captionEm", 32)):
        if not chat.get(k) or len(chat[k]) > cap:
            bad.append(f"{k} missing or too long.")
    return bad


# ---------- timing: when each bubble and typing indicator appears ----------
def plain(text):
    return EMOJI.sub("", text).strip()


MONEY_ONLY = re.compile(r"^\$[\d,]+(\.\d+)?$")


def big_messages(msgs):
    return [i for i, m in enumerate(msgs) if m.get("from") == "them" and MONEY_ONLY.match(m.get("text", "").strip())]


def timeline3d(msgs):
    """3D design: the first two texts are lock-screen notifications, then the chat opens.
    Returns (messages with "at", notifications, open time, duration)."""
    notes = [{"at": 0.2, "text": msgs[0]["text"]}, {"at": 1.25, "text": msgs[1]["text"]}]
    open_at = 2.8
    out = [dict(msgs[0], at=0), dict(msgs[1], at=0)]
    t, prev = 3.7, None
    big = big_messages(msgs)[0]
    for i, m in enumerate(msgs[2:], start=2):
        n = len(plain(m["text"])) or 2
        if prev is None:
            pass
        elif prev.get("big"):
            t += REVEAL_GAP
        elif m["from"] == "me":
            t += (0.75 + 0.01 * len(prev["text"])) if prev["from"] == "me" else (0.6 + 0.025 * len(prev["text"]))
        elif prev["from"] == "me":
            t += 1.6 + min(0.6, 0.008 * n)         # leaves room for the typing dots
        else:
            t += 0.6 + 0.016 * n
        mm = dict(m, at=round(t, 2))
        if i == big:
            mm["big"] = True
        out.append(mm)
        prev = mm
    end = t + (REVEAL_GAP if prev and prev.get("big") else 0) + 2.4
    return out, notes, open_at, round(end, 2)


def timeline(msgs):
    """Adds "at" to each message and returns the typing times, paced like a real chat."""
    t, typing, prev = 0.9, [], None
    for m in msgs:
        n = len(plain(m["text"])) or 2
        if prev is None:
            pass
        elif m["from"] == "me":
            t += (0.75 + 0.01 * len(prev["text"])) if prev["from"] == "me" else (0.6 + 0.025 * len(prev["text"]))
        else:
            if prev["from"] == "me":
                start = t + 0.5
                typing.append(round(start, 2))
                t = start + 0.9 + min(0.6, 0.008 * n)
            else:
                t += 0.6 + 0.016 * n
        m["at"] = round(t, 2)
        prev = m
    return typing, round(t + 2.4, 2)


# ---------- music ----------
def pick_music(story):
    folder = PUBLIC / "music"
    files = sorted(f.name for f in folder.glob("*.mp3")) if folder.exists() else []
    if not files:
        return None, 0
    lib = load_music_lib()
    pool = story.get("music") or "invest"
    fitting = [f for f in files if pool in lib.get(f, {}).get("pool", [])] or files
    name = fitting[sum(map(ord, story["id"])) % len(fitting)]
    return name, float(lib.get(name, {}).get("start", 0))


# ---------- the whole thing ----------
def write(story, max_tries=4):
    facts = build_facts(story)
    feedback = None
    for n in range(max_tries):
        try:
            chat = ask_claude(story, facts, feedback)
        except json.JSONDecodeError as e:   # Claude sometimes breaks the JSON (a stray quote): ask again
            feedback = f"Your reply was not valid JSON ({e}). Return only valid JSON, escape any double quotes inside text."
            print(f"      chat rejected ({n + 1}/{max_tries}): bad JSON")
            continue
        bad = check_chat(chat, story, facts)
        if not bad:
            *_, duration = timeline3d(chat["messages"])
            if duration <= MAX_DURATION:
                return facts, chat, duration
            bad = [f"The chat runs {duration:.0f}s, keep it under {MAX_DURATION:.0f}s: fewer or shorter messages."]
        feedback = " ".join(bad)
        print(f"      chat rejected ({n + 1}/{max_tries}): {feedback}")
    raise RuntimeError(f"no good chat for {story['id']}: {feedback}")


def make(story_id=None, dry=False, pool="main", flat_only=False):
    """Builds one texts video. Returns (topic, final path) like run.make does. Raises if nothing is left."""
    stories = {s["id"]: s for s in load_stories()}
    if story_id:
        order = [stories[story_id]]
    else:
        order = queue(pool)
        if not order:
            raise RuntimeError(f"no {pool} texts stories left")
    last_err = None
    for story in order:
        try:
            facts, chat, duration = write(story)
            break
        except Exception as e:  # a data hiccup or a bad chat skips to the next story, it never stops the day
            last_err = e
            print(f"      skipped {story['id']}: {e}")
    else:
        raise RuntimeError(f"no texts story worked: {last_err}")

    topic = PREFIX + story["id"]
    out = MEDIA_DIR / topic
    out.mkdir(parents=True, exist_ok=True)
    music, music_start = pick_music(story)
    year = date.today().year
    msgs3d, notes, open_at, duration = timeline3d(chat["messages"])
    stamp_day = datetime.strptime(story["stamp"].split(" at ")[0], "%a, %b %d, %Y")
    d0 = facts["data"][0]
    big_text = msgs3d[big_messages(msgs3d)[0]]["text"]
    if story["kind"] == "stock":
        small, small_tag = d0["amount"], f"{story['item'].upper()} · {stamp_day:%b %Y}".upper()
        big_tag = f"IN {d0['name'].upper()} · {d0['as_of'].upper()}"
    else:
        small, small_tag = d0["then"], f"{d0['name'].upper()} · {d0['then_month'].upper()}"
        big_tag = f"{d0['name'].upper()} · {d0['as_of'].upper()}"
    props = {
        "pal": PALETTE, "duration": duration, "label": f"TEXTS FROM {year}",
        "contact": f"Me ({year})", "clock": story["clock"], "date": f"{stamp_day:%A, %B} {stamp_day.day}", "stamp": story["stamp"],
        "openAt": open_at, "notifications": notes, "messages": msgs3d,
        "reveal": {"small": small, "big": big_text, "smallTag": small_tag, "bigTag": big_tag,
                   "line": chat["revealLine"], "em": chat["revealEm"]},
        "caption": {"kicker": f"{stamp_day:%a, %b} {stamp_day.day}, {stamp_day:%Y} · {story['stamp'].split(' at ')[1]}".upper(),
                    "lead": chat["captionLead"], "em": chat["captionEm"]},
        "capStyle": "marker",
        "music": f"music/{music}" if music else None,
    }
    flat_msgs = copy.deepcopy(chat["messages"])
    typing, flat_dur = timeline(flat_msgs)
    flat = {
        "duration": flat_dur, "hookTop": chat["hookTop"].upper(), "hookBottom": chat["hookBottom"].upper(),
        "contact": f"Me ({year})", "stamp": story["stamp"], "clock": story["clock"],
        "messages": flat_msgs, "typing": typing, "sourceLabel": source_label(story, facts),
        "music": f"music/{music}" if music else None, "musicStart": music_start,
    }
    (out / "props_flat.json").write_text(json.dumps(flat, indent=2, ensure_ascii=False))
    (out / "data.json").write_text(json.dumps({"story": story, **facts}, indent=2, ensure_ascii=False))
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    (out / "render.json").write_text(json.dumps({"music": music}, indent=2))
    final = out / "final.mp4"
    meta = {"topic": topic, "title": chat["title"], "description": chat["description"],
            "pinned_comment": chat["pinned_comment"], "file": str(final)}
    (out / "upload.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"      {topic}: {chat['title']} ({duration:.1f}s, {len(chat['messages'])} texts, music {music})")
    for m in msgs3d:
        print(f"        {m['at']:5.1f} {'ME  ' if m['from'] == 'me' else 'THEM'} {m['text']}{'   <- 3D reveal' if m.get('big') else ''}")
    if dry:
        return topic, None
    render(out, final, flat_only)
    return topic, final


def render(out, final, flat_only=False):
    """3D design first; if that fails for any reason, the flat design, so the day never breaks."""
    gl = "angle" if sys.platform == "darwin" else "swangle"   # GitHub has no graphics card: software 3D
    if not flat_only:
        cmd = ["npx", "remotion", "render", "src/index.ts", "EdTexts", str(final), f"--props={out / 'props.json'}",
               "--codec=h264", "--crf=18", f"--gl={gl}"]
        if subprocess.run(cmd, cwd=VIDEO_DIR).returncode == 0:
            return "3d"
        print("      3D render failed, rendering the flat design instead")
    cmd = ["npx", "remotion", "render", "src/index.ts", "TextsFuture", str(final), f"--props={out / 'props_flat.json'}",
           "--codec=h264", "--crf=18"]
    subprocess.run(cmd, cwd=VIDEO_DIR, check=True)
    return "flat"


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("story", nargs="?")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--gaming", action="store_true", help="the GTA slot's gaming stories")
    ap.add_argument("--flat", action="store_true", help="old flat design")
    a = ap.parse_args()
    if a.list:
        q = queue("gaming" if a.gaming else "main")
        for n, s in enumerate(q, 1):
            print(f"  {n:>2}. {s['id']}")
        print(f"{len(q)} ready ({'gaming, GTA slot' if a.gaming else 'main slot'})")
        sys.exit()
    topic, final = make(a.story, a.dry, "gaming" if a.gaming else "main", a.flat)
    if final:
        print(f"\nRendered {final}")
