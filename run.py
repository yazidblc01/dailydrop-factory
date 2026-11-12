"""One command, one finished and posted video.

    python run.py                          picks the next topic, makes the video, schedules it for today's slot
    python run.py gta_launch_prices        same, for a specific topic
    python run.py --now                    posts immediately instead of waiting for today's slot
    python run.py --dry                    picks and builds data + script only (no voice, no render, no post)
    python run.py --no-post                makes the video but does not post it
    python run.py --post-only <topic>      posts a video that's already rendered, right now
    python run.py --check                  pings Telegram with the links of scheduled posts that went live
    python run.py --once-a-day             skips if today's video already exists (used by the backup morning runs)
    python run.py --slot gta               the GTA month Short (7 PM, GTA pool); does nothing outside GTA month
    python run.py --format texts           force a texts-from-the-future video (default: texts 2 days out of 3)
    python run.py texts__doge_snl          a specific texts story (ids in data/text_stories.csv)

    python run.py --preflight              only tests the API keys (seconds, costs nothing)

Steps: key check -> live-link check -> topic -> data -> script -> voice -> render -> schedule -> Telegram
"""
import argparse
import json
import os
import time
from datetime import date, datetime

import requests
from dotenv import load_dotenv

from config import MEDIA_DIR, POSTER
from engine import audit, data, render, schedule, script, texts, topics, upload, voice

load_dotenv()


def telegram(text, video=None):
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        return
    base = f"https://api.telegram.org/bot{token}"
    try:
        if video and video.stat().st_size < 49_000_000:
            with open(video, "rb") as f:
                requests.post(f"{base}/sendVideo", data={"chat_id": chat, "caption": text[:1000]},
                              files={"video": f}, timeout=300)
        else:
            requests.post(f"{base}/sendMessage", data={"chat_id": chat, "text": text}, timeout=30)
    except requests.RequestException as e:
        print(f"Telegram failed: {e}")


def links(urls):
    return "\n".join(f"{p.capitalize()}: {u}" for p, u in urls.items())


def report_live():
    """Pings the links of scheduled videos that have gone live (and any that failed)."""
    try:
        found, failed = upload.check_live()
    except Exception as e:  # a status hiccup must never stop today's video
        print(f"Live-link check skipped: {e}")
        return
    for title, urls in found:
        telegram(f"📈 Live now: {title}\n{links(urls)}")
    for title, err in failed:
        telegram(f"❌ Scheduled post failed: {title}\n{err}")
    print(f"Live-link check: {len(found)} new live, {len(failed)} failed")


def post(topic, now=False, slot="main"):
    print("[6/6] Posting")
    when = None if now else schedule.slot_today(slot=slot)
    meta = json.loads((MEDIA_DIR / topic / "upload.json").read_text())
    res = upload.post(topic, when)
    upload.save_post(topic, slot=slot)  # lets --once-a-day tell the daily Short from the GTA week one
    tag = "🎮 GTA week. " if slot == "gta" else ""
    if res["status"] == "scheduled":
        print(f"      Scheduled for {schedule.label(when)}")
        telegram(f"🗓 {tag}Scheduled for {schedule.label(when)}\n{meta['title']}", MEDIA_DIR / topic / "final.mp4")
    else:
        print(f"      Live: {res['urls']}")
        text = f"✅ {tag}Posted: {meta['title']}\n{links(res['urls'])}"
        if res.get("errors"):
            text += "\n⚠️ " + "\n⚠️ ".join(res["errors"])
        telegram(text)
    return res


def made_today(slot="main"):
    """True if this slot's video was already posted or scheduled today (Toronto date). Used by the backup runs."""
    today = datetime.now(schedule.TZ).date()
    for p in upload.load_posts().values():
        if p.get("slot", "main") != slot:
            continue
        stamp = p.get("when") or p.get("posted_at")
        if stamp and datetime.fromisoformat(stamp).astimezone(schedule.TZ).date() == today:
            return True
    return False


def preflight(posting=True):
    """Tests every paid key with a free request before any credits are spent.
    Fails only on a clear "bad key" answer, so a slow or flaky service never blocks the video."""
    checks = [
        ("ANTHROPIC_API_KEY", "https://api.anthropic.com/v1/models?limit=1",
         lambda k: {"x-api-key": k, "anthropic-version": "2023-06-01"}),
        ("ELEVENLABS_API_KEY", "https://api.elevenlabs.io/v1/models", lambda k: {"xi-api-key": k}),
    ]
    if posting and POSTER == "zernio":
        checks.append(("ZERNIO_API_KEY", "https://zernio.com/api/v1/accounts",
                       lambda k: {"Authorization": f"Bearer {k}"}))
    bad = []
    for name, url, hdr in checks:
        key = os.environ.get(name, "").strip()
        if not key:
            bad.append(f"{name} is missing")
            continue
        try:
            r = requests.get(url, headers=hdr(key), timeout=20)
        except requests.RequestException as e:
            print(f"      key check: {name} could not be reached ({e.__class__.__name__}), going on")
            continue
        text = r.text.lower()
        if r.status_code == 401 or (r.status_code == 403 and "invalid" in text):
            if "permission" in text and "invalid" not in text:
                continue  # a valid key without that one permission: fine
            bad.append(f"{name} was rejected ({r.status_code})")
    if bad:
        raise RuntimeError("Key check failed, nothing was made: " + "; ".join(bad) +
                           ". Fix the GitHub secret from .env with: gh secret set NAME --body \"$(grep '^NAME=' .env "
                           "| cut -d= -f2-)\"")
    print("      keys OK")


def texts_day(day=None):
    """The daily slot rotates texts, texts, data reel."""
    return (day or datetime.now(schedule.TZ).date()).toordinal() % 3 != 0


def make_texts(story_id=None, dry=False, publish=True, now=False, slot="main"):
    t0 = time.time()
    print("[1/3] Texts from the future: facts + chat")
    topic, final = texts.make(story_id, dry)
    if dry:
        return topic, None
    topics.mark_done(topic)
    try:
        left = texts.left_count()
        if left < texts.LOW_STOCK:
            telegram(f"⚠️ Only {left} texts stories left. Time to add more to data/text_stories.csv.")
    except Exception as e:  # the stock check must never stop today's video
        print(f"Stock check skipped: {e}")
    print(f"[2/3] Video done in {(time.time() - t0) / 60:.1f} min: {final}")
    if publish:
        post(topic, now, slot)
    else:
        title = json.loads((MEDIA_DIR / topic / "upload.json").read_text())["title"]
        telegram(f"🎬 Rendered, not posted (--no-post)\n{title}", final)
    return topic, final


def make(topic=None, dry=False, publish=True, now=False, slot="main", fmt="auto"):
    if topic and topic.startswith(texts.PREFIX):
        return make_texts(topic[len(texts.PREFIX):], dry, publish, now, slot)
    if not topic and slot == "main" and (fmt == "texts" or (fmt == "auto" and texts_day())):
        try:
            return make_texts(None, dry, publish, now, slot)
        except Exception as e:  # no story left or a hiccup: today becomes a data reel, the day never breaks
            if fmt == "texts":
                raise
            print(f"Texts video failed, making a data reel instead: {e}")
            telegram(f"⚠️ Texts video failed, posting a data reel today instead.\n{e}")
    t0 = time.time()
    if topic:
        print(f"[1/6] Data: {topic}")
        payload = data.build(topic)
    else:
        print("[1/6] Picking the next topic..." + (" (GTA week pool)" if slot == "gta" else ""))
        topic, payload = topics.pick_next(slot)
    print(f"      {payload['angle']}")

    print("[2/6] Script")
    s, _ = script.write_script(topic)
    print(f"      {s['title']}")
    if dry:
        return topic, None

    print("[3/6] Voice")
    voice.build(topic)

    print("[4/6] Render")
    final = render.render(topic)

    topics.mark_done(topic)
    if slot == "main":
        try:
            left = audit.usable_count()
            if left < audit.LOW_STOCK:
                telegram(f"⚠️ Only {left} usable daily topics left (about {left} days). Time to add topics.")
        except Exception as e:  # the stock check must never stop today's video
            print(f"Stock check skipped: {e}")
    meta = {"topic": topic, "title": s["title"], "description": s["description"],
            "pinned_comment": s["pinned_comment"], "file": str(final)}
    (MEDIA_DIR / topic / "upload.json").write_text(json.dumps(meta, indent=2))
    print(f"[5/6] Video done in {(time.time() - t0) / 60:.1f} min: {final}")

    if publish:
        post(topic, now, slot)
    else:
        telegram(f"🎬 Rendered, not posted (--no-post)\n{s['title']}", final)
    return topic, final


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("topic", nargs="?")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--now", action="store_true")
    ap.add_argument("--no-post", action="store_true")
    ap.add_argument("--post-only", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--once-a-day", action="store_true")
    ap.add_argument("--slot", choices=["main", "gta"], default="main")
    ap.add_argument("--preflight", action="store_true")
    ap.add_argument("--format", choices=["auto", "texts", "data"], default="auto")
    a = ap.parse_args()
    try:
        if a.preflight:
            preflight()
        elif a.check:
            report_live()
        elif a.post_only:
            if not a.topic:
                raise SystemExit("--post-only needs a topic, e.g. python run.py --post-only invest__big_tech__2015")
            preflight()
            post(a.topic, now=True, slot=a.slot)
        elif a.slot == "gta" and not a.topic and not schedule.gta_week():
            print("Not GTA week, nothing to do.")
        elif a.once_a_day and made_today(a.slot):
            print("Today's video already exists, nothing to do.")
        else:
            if not a.dry:
                preflight(posting=not a.no_post)
                report_live()
            make(a.topic, a.dry, publish=not a.no_post, now=a.now, slot=a.slot, fmt=a.format)
    except Exception as e:
        telegram(f"❌ Shorts factory failed: {e}")
        raise
