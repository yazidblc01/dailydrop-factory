"""Texts from the future: a fake iMessage chat between past you and 2026 you.

The story (who, when, what) comes from data/text_stories.csv. Every number comes from real data
(Yahoo prices or FRED) or from the facts column of the CSV, and Claude writes only the chat around
them. Any number in the chat that is not in the facts gets the chat rejected and rewritten.

    python -m engine.texts --list               stories and which ones are used
    python -m engine.texts <id> --dry           facts + chat, no render
    python -m engine.texts <id>                 full render to media/texts__<id>/final.mp4
"""
import argparse
import csv
import json
import os
import re
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
MAX_DURATION = 26.0
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
- 12 to 16 messages. Each message under 55 characters. The first message is from "me" (past me).
- "me" = past me, inside the SETTING. "them" = future me, who knows how it turns out.
- Shape: past me is in the moment (1 to 3 msgs) -> future me drops the tip -> past me doubts it ->
  the real number lands as its own short message -> a twist or callback -> end on a short funny line from "me"
  (an emoji alone like 💀 or 😭 is great as the last message).
- The big number lands ALONE in its own message, then past me reacts. Never explain the math after it,
  never say "that's where it is in <month>", never add a second "you'd have been richer" number.
  Only mention peak_value if the story is about a crash (it fell a lot from the peak).
- The last 3 messages are the punchline: a callback to the SETTING (the thing past me was worried about).
- Numbers: ONLY numbers that appear in FACTS or SETTING, written exactly as given ($816 not 816 dollars,
  keep the $ and commas). No other numbers, no other years, no percentages unless given.
- Real-world claims: only what FACTS or SETTING say. No invented events, no invented prices.
- Future me never tells the viewer to invest today. No "not financial advice" inside the chat.
- At most 3 emojis in the whole chat (an emoji-only message counts as 1).
- Never name any real person except ones in SETTING or FACTS.

Return ONLY JSON:
{"hookTop": "max 22 chars, the setup, CAPS", "hookBottom": "max 24 chars, CAPS",
 "messages": [{"from": "me" | "them", "text": "..."}],
 "title": "YouTube title under 70 chars, curiosity, max 1 emoji, numbers only from FACTS",
 "description": "2 sentences with the real numbers and dates from FACTS, then: Not financial advice.",
 "pinned_comment": "a short question that makes people comment"}"""


def ask_claude(story, facts, feedback=None):
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    user = (f"DATE OF THE CHAT (past me): {story['stamp']}\nSETTING: {story['setting']}\n"
            f"FACTS:\n{json.dumps(facts, indent=2, ensure_ascii=False)}")
    if feedback:
        user += f"\n\nYour previous chat was rejected: {feedback} Fix it."
    msg = client.messages.create(model=CLAUDE_MODEL, max_tokens=2000, system=SYSTEM,
                                 messages=[{"role": "user", "content": user}])
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
    if msgs and msgs[0].get("from") != "me":
        bad.append("The first message must be from me.")
    if any(m.get("from") not in ("me", "them") for m in msgs):
        bad.append('Every message needs "from": "me" or "them".')
    long = [m["text"] for m in msgs if len(m.get("text", "")) > 62]
    if long:
        bad.append(f"Too long: {long[0]!r}.")
    if sum(len(EMOJI.findall(m.get("text", ""))) for m in msgs) > 4:
        bad.append("Too many emojis.")
    ok = allowed_numbers(story, facts)
    text = " ".join(m.get("text", "") for m in msgs) + " " + chat.get("title", "") + " " + chat.get("description", "")
    wrong = sorted({str(n) for n in numbers_in(text) if round(n, 2) not in ok and round(n) not in ok})
    if wrong:
        bad.append(f"These numbers are not in FACTS: {', '.join(wrong)}.")
    for k, cap in (("hookTop", 26), ("hookBottom", 28), ("title", 90)):
        if not chat.get(k) or len(chat[k]) > cap:
            bad.append(f"{k} missing or too long.")
    return bad


# ---------- timing: when each bubble and typing indicator appears ----------
def plain(text):
    return EMOJI.sub("", text).strip()


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
def write(story, max_tries=3):
    facts = build_facts(story)
    feedback = None
    for n in range(max_tries):
        chat = ask_claude(story, facts, feedback)
        bad = check_chat(chat, story, facts)
        if not bad:
            typing, duration = timeline(chat["messages"])
            if duration <= MAX_DURATION:
                return facts, chat, typing, duration
            bad = [f"The chat runs {duration:.0f}s, keep it under {MAX_DURATION:.0f}s: fewer or shorter messages."]
        feedback = " ".join(bad)
        print(f"      chat rejected ({n + 1}/{max_tries}): {feedback}")
    raise RuntimeError(f"no good chat for {story['id']}: {feedback}")


def make(story_id=None, dry=False, pool="main"):
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
            facts, chat, typing, duration = write(story)
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
    props = {
        "duration": duration, "hookTop": chat["hookTop"].upper(), "hookBottom": chat["hookBottom"].upper(),
        "contact": f"Me ({date.today().year})", "stamp": story["stamp"], "clock": story["clock"],
        "messages": chat["messages"], "typing": typing,
        "sourceLabel": source_label(story, facts),
        "music": f"music/{music}" if music else None, "musicStart": music_start,
    }
    (out / "data.json").write_text(json.dumps({"story": story, **facts}, indent=2, ensure_ascii=False))
    (out / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False))
    (out / "render.json").write_text(json.dumps({"music": music}, indent=2))
    final = out / "final.mp4"
    meta = {"topic": topic, "title": chat["title"], "description": chat["description"],
            "pinned_comment": chat["pinned_comment"], "file": str(final)}
    (out / "upload.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"      {topic}: {chat['title']} ({duration:.1f}s, {len(chat['messages'])} texts, music {music})")
    for m in chat["messages"]:
        print(f"        {m['at']:5.1f} {'ME  ' if m['from'] == 'me' else 'THEM'} {m['text']}")
    if dry:
        return topic, None
    cmd = ["npx", "remotion", "render", "src/index.ts", "TextsFuture", str(final),
           f"--props={out / 'props.json'}", "--codec=h264", "--crf=18"]
    subprocess.run(cmd, cwd=VIDEO_DIR, check=True)
    return topic, final


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("story", nargs="?")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--gaming", action="store_true", help="the GTA slot's gaming stories")
    a = ap.parse_args()
    if a.list:
        q = queue("gaming" if a.gaming else "main")
        for n, s in enumerate(q, 1):
            print(f"  {n:>2}. {s['id']}")
        print(f"{len(q)} ready ({'gaming, GTA slot' if a.gaming else 'main slot'})")
        sys.exit()
    topic, final = make(a.story, a.dry, "gaming" if a.gaming else "main")
    if final:
        print(f"\nRendered {final}")
