"""One command, one finished and posted video.

    python run.py                          picks the next topic, makes the video, schedules it for today's slot
    python run.py gta_launch_prices        same, for a specific topic
    python run.py --now                    posts immediately instead of waiting for today's slot
    python run.py --dry                    picks and builds data + script only (no voice, no render, no post)
    python run.py --no-post                makes the video but does not post it
    python run.py --post-only <topic>      posts a video that's already rendered, right now
    python run.py --check                  pings Telegram with the links of scheduled posts that went live
    python run.py --once-a-day             skips if today's video already exists (used by the backup morning runs)
    python run.py --slot gta               the GTA week Short (7 PM, GTA pool); does nothing outside GTA week

Steps: live-link check -> topic -> data -> script -> voice -> render -> schedule on YouTube -> Telegram
"""
import argparse
import json
import os
import time
from datetime import datetime

import requests
from dotenv import load_dotenv

from config import MEDIA_DIR
from engine import audit, data, render, schedule, script, topics, upload, voice

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


def make(topic=None, dry=False, publish=True, now=False, slot="main"):
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
    a = ap.parse_args()
    try:
        if a.check:
            report_live()
        elif a.post_only:
            if not a.topic:
                raise SystemExit("--post-only needs a topic, e.g. python run.py --post-only invest__big_tech__2015")
            post(a.topic, now=True, slot=a.slot)
        elif a.slot == "gta" and not a.topic and not schedule.gta_week():
            print("Not GTA week, nothing to do.")
        elif a.once_a_day and made_today(a.slot):
            print("Today's video already exists, nothing to do.")
        else:
            if not a.dry:
                report_live()
            make(a.topic, a.dry, publish=not a.no_post, now=a.now, slot=a.slot)
    except Exception as e:
        telegram(f"❌ Shorts factory failed: {e}")
        raise
