"""Posts a finished video through Upload-Post to every platform in config.PLATFORMS
(YouTube, Facebook, and later TikTok and Instagram). Upload-Post is already approved by each platform.

Needs in .env (or GitHub secrets):
    UPLOAD_POST_API_KEY=...
    UPLOAD_POST_USER=dailydrop

Every post is recorded in data/posts.json (kept in the repo) so a later run can find the live links
of a scheduled post.

    python -m engine.upload <topic>                        post a rendered video right now, everywhere
    python -m engine.upload <topic> --only facebook        post it only there (e.g. catch up a video that
                                                           is already on YouTube); not recorded in posts.json
    python -m engine.upload --check                        look up live links of scheduled posts
"""
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

from config import AI_LABEL, DATA_DIR, MEDIA_DIR, PLATFORMS
from engine.render import music_credit
from engine.schedule import TZ_NAME

load_dotenv()
API = "https://api.upload-post.com/api"
POSTS = DATA_DIR / "posts.json"
CATEGORY_EDUCATION = "27"
POLL_EVERY, POLL_MAX = 15, 900  # seconds
PRIMARY = "youtube"  # a post counts as live once this one has a link

TAGS = {
    "invest": ["investing", "stocks", "stock market", "finance", "money", "data"],
    "gta": ["gta 6", "gta vi", "gta", "grand theft auto", "gaming", "rockstar"],
    "wb": ["economy", "countries", "world", "gdp", "data", "geography"],
}
DOMAINS = {"youtube": ("youtu",), "facebook": ("facebook.com", "fb.watch"),
           "instagram": ("instagram.com",), "tiktok": ("tiktok.com",)}


# ---------- small helpers ----------
def recipe_of(topic):
    if topic.startswith("invest__"):
        return "invest"
    if topic.startswith("wb__"):
        return "wb"
    return "gta"


def headers(topic=None, suffix=""):
    key = os.environ.get("UPLOAD_POST_API_KEY")
    if not key:
        raise RuntimeError("UPLOAD_POST_API_KEY missing")
    h = {"Authorization": f"Apikey {key}"}
    if topic:
        h["Idempotency-Key"] = f"dailydrop-{topic}{suffix}"  # a retry of the same topic never double-posts
    return h


def load_posts():
    return json.loads(POSTS.read_text()) if POSTS.exists() else {}


def save_post(topic, **fields):
    posts = load_posts()
    entry = posts.setdefault(topic, {})
    if "urls" in fields:
        entry.setdefault("urls", {}).update(fields.pop("urls"))
        if entry["urls"].get(PRIMARY):
            entry["url"] = entry["urls"][PRIMARY]
    entry.update(fields)
    POSTS.write_text(json.dumps(posts, indent=2))


def find_urls(obj, out=None):
    """Every post link anywhere in an Upload-Post response, by platform: {"youtube": url, ...}."""
    out = {} if out is None else out
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("url", "post_url") and isinstance(v, str):
                for platform, marks in DOMAINS.items():
                    if any(m in v for m in marks):
                        out.setdefault(platform, v)
            elif k in ("video_id",) and isinstance(v, str) and len(v) == 11 and "youtube" not in out:
                out["youtube"] = f"https://youtube.com/shorts/{v}"
            else:
                find_urls(v, out)
    elif isinstance(obj, list):
        for v in obj:
            find_urls(v, out)
    return out


def find_errors(obj, path="", out=None):
    """Error messages anywhere in a response, labelled by where they were found."""
    out = [] if out is None else out
    if isinstance(obj, dict):
        if obj.get("success") is False and (obj.get("error") or obj.get("message")):
            out.append(f"{path or 'upload'}: {obj.get('error') or obj.get('message')}")
        for k, v in obj.items():
            find_errors(v, k if k in DOMAINS else path, out)
    elif isinstance(obj, list):
        for v in obj:
            find_errors(v, path, out)
    return out


def status(**params):
    return requests.get(f"{API}/uploadposts/status", headers=headers(), params=params, timeout=60).json()


# ---------- what each platform gets ----------
def build_fields(topic, meta, user, when, platforms):
    title = meta["title"][:100]
    description = meta["description"]
    credit = music_credit(topic)
    if credit:
        description += "\n\n🎵 " + credit  # the free music license requires the credit
    caption = f"{meta['title']}\n\n{description}"  # TikTok and Instagram have one text field

    fields = [("user", user), ("title", title), ("description", description[:4900]), ("external_id", topic)]
    fields += [("platform[]", p) for p in platforms]
    if meta.get("pinned_comment"):
        fields.append(("first_comment", meta["pinned_comment"]))
    if when:
        fields += [("scheduled_date", when.strftime("%Y-%m-%dT%H:%M:%S")), ("timezone", TZ_NAME)]
    else:
        fields.append(("async_upload", "true"))

    if "youtube" in platforms:
        fields += [("privacyStatus", "public"), ("categoryId", CATEGORY_EDUCATION),
                   ("selfDeclaredMadeForKids", "false"), ("containsSyntheticMedia", "false"),
                   ("defaultLanguage", "en"), ("defaultAudioLanguage", "en-US")]
        fields += [("tags[]", t) for t in TAGS[recipe_of(topic)]]
    if "facebook" in platforms:
        fields += [("facebook_media_type", "REELS"), ("facebook_title", title),
                   ("facebook_description", description[:4900])]
        if AI_LABEL:
            fields.append(("facebook_is_ai_generated", "true"))
    if "instagram" in platforms:
        fields += [("media_type", "REELS"), ("share_to_feed", "true"),
                   ("instagram_title", caption[:2200]), ("audio_name", "The Daily Drop")]
    if "tiktok" in platforms:
        fields += [("tiktok_title", caption[:2200]), ("privacy_level", "PUBLIC_TO_EVERYONE"),
                   ("post_mode", "DIRECT_POST"), ("cover_timestamp", "0")]  # frame 0 is the full poster
        if AI_LABEL:
            fields.append(("is_aigc", "true"))
    return fields


# ---------- posting ----------
def post(topic, when=None, only=None):
    """Uploads media/<topic>/final.mp4 to every platform in PLATFORMS.

    when: a Toronto datetime to publish at (Upload-Post holds it until then), or None to publish now.
    only: a list of platforms to post to instead (a catch-up post); it is not recorded in posts.json.
    Returns {"status": "live", "url": ..., "urls": {...}, "errors": [...]}
         or {"status": "scheduled", "job_id": ..., "when": ...}.
    """
    out = MEDIA_DIR / topic
    meta = json.loads((out / "upload.json").read_text())
    platforms = only or PLATFORMS
    primary = PRIMARY if PRIMARY in platforms else platforms[0]
    record = not only
    known = load_posts().get(topic, {}) if record else {}
    if known.get("url"):
        print(f"Already posted: {known['url']}")
        return {"status": "live", "url": known["url"], "urls": known.get("urls", {}), "errors": []}
    if known.get("job_id"):
        print(f"Already scheduled: job {known['job_id']} for {known.get('when')}")
        return {"status": "scheduled", "job_id": known["job_id"], "when": known.get("when")}

    user = os.environ.get("UPLOAD_POST_USER")
    if not user:
        raise RuntimeError("UPLOAD_POST_USER missing")

    with open(out / "final.mp4", "rb") as f:
        suffix = "" if record else "-" + "-".join(platforms)
        r = requests.post(f"{API}/upload", headers=headers(topic, suffix), data=build_fields(topic, meta, user, when, platforms),
                          files={"video": ("final.mp4", f, "video/mp4")}, timeout=600)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
    if r.status_code >= 400 or body.get("success") is False:
        raise RuntimeError(f"Upload-Post refused the upload ({r.status_code}): {body}")

    base = {"title": meta["title"], "platforms": platforms,
            "posted_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    if when:
        job = body.get("job_id")
        if record:
            save_post(topic, **base, job_id=job, when=when.isoformat())
        return {"status": "scheduled", "job_id": job, "when": when.isoformat()}

    urls, errors = find_urls(body), find_errors(body)
    request_id = body.get("request_id")
    if record:
        save_post(topic, **base, request_id=request_id, urls=urls)
    waited = 0
    while request_id and waited < POLL_MAX and not all(p in urls for p in platforms):
        time.sleep(POLL_EVERY)
        waited += POLL_EVERY
        s = status(request_id=request_id)
        urls.update(find_urls(s))
        errors = find_errors(s)
        missing = [p for p in platforms if p not in urls]
        if primary in urls and (not missing or len(errors) >= len(missing)):
            break  # the main platform is live and the rest either worked or reported an error
        if errors and primary not in urls and len(errors) >= len(platforms):
            raise RuntimeError("Upload failed: " + " | ".join(errors))
        print(f"      waiting for the platforms... {waited}s ({', '.join(missing)})")
    if primary not in urls:
        raise RuntimeError(f"No {primary} link after {waited}s (request {request_id}). {' | '.join(errors)}")
    if record:
        save_post(topic, urls=urls)
    return {"status": "live", "url": urls[primary], "urls": urls, "errors": errors}


def check_live():
    """Looks up scheduled posts that have gone live since.
    Returns ([(title, {platform: url})] newly live, [(title, error)] failed)."""
    found, failed = [], []
    for topic, p in load_posts().items():
        if p.get("url") or p.get("failed") or not (p.get("job_id") or p.get("request_id")):
            continue
        try:
            s = status(job_id=p["job_id"]) if p.get("job_id") else status(request_id=p["request_id"])
        except (requests.RequestException, ValueError) as e:
            print(f"  status check failed for {topic}: {e}")
            continue
        urls = find_urls(s)
        if urls.get(PRIMARY):
            save_post(topic, urls=urls)
            found.append((p.get("title", topic), urls))
            continue
        errors = find_errors(s)
        when = p.get("when")
        overdue = when and datetime.fromisoformat(when) < datetime.now(timezone.utc).astimezone()
        if errors and overdue:
            save_post(topic, failed=" | ".join(errors))
            failed.append((p.get("title", topic), " | ".join(errors)))
    return found, failed


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        f, x = check_live()
        print("Live:", f or "none new")
        print("Failed:", x or "none")
    else:
        args = sys.argv[1:]
        only = None
        if "--only" in args:
            i = args.index("--only")
            only = [x.strip() for x in args[i + 1].split(",")]
            args = args[:i] + args[i + 2:]
        t = args[0] if args else "invest__big_tech__2015"
        print(post(t, only=only))
