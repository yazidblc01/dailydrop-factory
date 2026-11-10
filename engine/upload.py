"""Posts a finished video to YouTube through Upload-Post (already approved by YouTube, so it goes up public).

Needs in .env (or GitHub secrets):
    UPLOAD_POST_API_KEY=...
    UPLOAD_POST_USER=dailydrop

Every post is recorded in data/posts.json (kept in the repo) so a later run can find the live link
of a scheduled post.

    python -m engine.upload <topic>     post a rendered video right now
    python -m engine.upload --check     look up live links of scheduled posts
"""
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

from config import DATA_DIR, MEDIA_DIR
from engine.schedule import TZ_NAME

load_dotenv()
API = "https://api.upload-post.com/api"
POSTS = DATA_DIR / "posts.json"
CATEGORY_EDUCATION = "27"
POLL_EVERY, POLL_MAX = 15, 900  # seconds

TAGS = {
    "invest": ["investing", "stocks", "stock market", "finance", "money", "data"],
    "gta": ["gta 6", "gta vi", "gta", "grand theft auto", "gaming", "rockstar"],
    "wb": ["economy", "countries", "world", "gdp", "data", "geography"],
}


# ---------- small helpers ----------
def recipe_of(topic):
    if topic.startswith("invest__"):
        return "invest"
    if topic.startswith("wb__"):
        return "wb"
    return "gta"


def headers(topic=None):
    key = os.environ.get("UPLOAD_POST_API_KEY")
    if not key:
        raise RuntimeError("UPLOAD_POST_API_KEY missing")
    h = {"Authorization": f"Apikey {key}"}
    if topic:
        h["Idempotency-Key"] = f"dailydrop-{topic}"  # a retry of the same topic never double-posts
    return h


def load_posts():
    return json.loads(POSTS.read_text()) if POSTS.exists() else {}


def save_post(topic, **fields):
    posts = load_posts()
    posts.setdefault(topic, {}).update(fields)
    POSTS.write_text(json.dumps(posts, indent=2))


def find_url(obj):
    """Finds the YouTube link anywhere in an Upload-Post response."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("url", "post_url") and isinstance(v, str) and "youtu" in v:
                return v
            if k in ("video_id", "post_id") and isinstance(v, str) and len(v) == 11:
                return f"https://youtube.com/shorts/{v}"
            found = find_url(v)
            if found:
                return found
    if isinstance(obj, list):
        for v in obj:
            found = find_url(v)
            if found:
                return found
    return None


def find_error(obj):
    if isinstance(obj, dict):
        if obj.get("success") is False and (obj.get("error") or obj.get("message")):
            return str(obj.get("error") or obj.get("message"))
        for v in obj.values():
            e = find_error(v)
            if e:
                return e
    if isinstance(obj, list):
        for v in obj:
            e = find_error(v)
            if e:
                return e
    return None


def status(**params):
    return requests.get(f"{API}/uploadposts/status", headers=headers(), params=params, timeout=60).json()


# ---------- posting ----------
def post(topic, when=None):
    """Uploads media/<topic>/final.mp4 as a public Short.

    when: a Toronto datetime to publish at (Upload-Post holds it until then), or None to publish now.
    Returns {"status": "live", "url": ...} or {"status": "scheduled", "job_id": ..., "when": ...}.
    """
    out = MEDIA_DIR / topic
    meta = json.loads((out / "upload.json").read_text())
    known = load_posts().get(topic, {})
    if known.get("url"):
        print(f"Already posted: {known['url']}")
        return {"status": "live", "url": known["url"]}
    if known.get("job_id"):
        print(f"Already scheduled: job {known['job_id']} for {known.get('when')}")
        return {"status": "scheduled", "job_id": known["job_id"], "when": known.get("when")}

    user = os.environ.get("UPLOAD_POST_USER")
    if not user:
        raise RuntimeError("UPLOAD_POST_USER missing")

    fields = [
        ("user", user),
        ("platform[]", "youtube"),
        ("title", meta["title"][:100]),
        ("description", meta["description"][:4900]),
        ("privacyStatus", "public"),
        ("categoryId", CATEGORY_EDUCATION),
        ("selfDeclaredMadeForKids", "false"),
        ("containsSyntheticMedia", "false"),
        ("defaultLanguage", "en"),
        ("defaultAudioLanguage", "en-US"),
        ("external_id", topic),
    ]
    fields += [("tags[]", t) for t in TAGS[recipe_of(topic)]]
    if meta.get("pinned_comment"):
        fields.append(("first_comment", meta["pinned_comment"]))
    if when:
        fields += [("scheduled_date", when.strftime("%Y-%m-%dT%H:%M:%S")), ("timezone", TZ_NAME)]
    else:
        fields.append(("async_upload", "true"))

    with open(out / "final.mp4", "rb") as f:
        r = requests.post(f"{API}/upload", headers=headers(topic), data=fields,
                          files={"video": ("final.mp4", f, "video/mp4")}, timeout=600)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
    if r.status_code >= 400 or body.get("success") is False:
        raise RuntimeError(f"Upload-Post refused the upload ({r.status_code}): {body}")

    base = {"title": meta["title"], "posted_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    if when:
        job = body.get("job_id")
        save_post(topic, **base, job_id=job, when=when.isoformat())
        return {"status": "scheduled", "job_id": job, "when": when.isoformat()}

    url = find_url(body)
    request_id = body.get("request_id")
    save_post(topic, **base, request_id=request_id)
    waited = 0
    while not url and request_id and waited < POLL_MAX:
        time.sleep(POLL_EVERY)
        waited += POLL_EVERY
        s = status(request_id=request_id)
        url = find_url(s)
        err = find_error(s)
        if err and not url:
            raise RuntimeError(f"YouTube upload failed: {err}")
        print(f"      waiting for YouTube... {waited}s")
    if not url:
        raise RuntimeError(f"No YouTube link after {POLL_MAX}s (request {request_id}). Check the Upload-Post dashboard.")
    save_post(topic, url=url)
    return {"status": "live", "url": url}


def check_live():
    """Looks up scheduled posts that have gone live since. Returns [(title, url)] newly found,
    and [(title, error)] for ones that failed."""
    found, failed = [], []
    for topic, p in load_posts().items():
        if p.get("url") or p.get("failed") or not (p.get("job_id") or p.get("request_id")):
            continue
        try:
            s = status(job_id=p["job_id"]) if p.get("job_id") else status(request_id=p["request_id"])
        except (requests.RequestException, ValueError) as e:
            print(f"  status check failed for {topic}: {e}")
            continue
        url = find_url(s)
        if url:
            save_post(topic, url=url)
            found.append((p.get("title", topic), url))
            continue
        err = find_error(s)
        when = p.get("when")
        overdue = when and datetime.fromisoformat(when) < datetime.now(timezone.utc).astimezone()
        if err and overdue:
            save_post(topic, failed=err)
            failed.append((p.get("title", topic), err))
    return found, failed


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        f, x = check_live()
        print("Live:", f or "none new")
        print("Failed:", x or "none")
    else:
        t = sys.argv[1] if len(sys.argv) > 1 else "invest__big_tech__2015"
        print(post(t))
