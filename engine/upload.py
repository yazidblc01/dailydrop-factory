"""Posts a finished video to every platform in config.PLATFORMS (YouTube, Facebook, later TikTok and Instagram).

Two posting services, picked by config.POSTER:
    "zernio"       free for 2 accounts with unlimited posts (needs ZERNIO_API_KEY, account IDs in config.py)
    "upload_post"  the old one, kept as a backup (needs UPLOAD_POST_API_KEY and UPLOAD_POST_USER)
Both are already approved by each platform, so videos go public (a home-made YouTube app would be stuck private).

Every post is recorded in data/posts.json (kept in the repo) so a later run can find the live links
of a scheduled post. Old Upload-Post records keep being checked after the switch.

    python -m engine.upload <topic>                        post a rendered video right now, everywhere
    python -m engine.upload <topic> --only facebook        post it only there (a catch-up); not recorded in posts.json
    python -m engine.upload --draft [topic]                test: sends the newest rendered video to Zernio as a
                                                           draft (nothing gets published); not recorded
    python -m engine.upload --check                        look up live links of scheduled posts
"""
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

from config import AI_LABEL, DATA_DIR, MEDIA_DIR, PLATFORMS, POSTER, ZERNIO_ACCOUNTS
from engine.render import music_credit
from engine.schedule import TZ_NAME

load_dotenv()
API = "https://api.upload-post.com/api"
ZAPI = "https://zernio.com/api/v1"
POSTS = DATA_DIR / "posts.json"
CATEGORY_EDUCATION = "27"
POLL_EVERY, POLL_MAX = 15, 900  # seconds
PRIMARY = "youtube"  # a post counts as live once this one has a link

TAGS = {
    "invest": ["investing", "stocks", "stock market", "finance", "money", "data"],
    "gta": ["gta 6", "gta vi", "gta 6 release", "gta 6 launch", "gta 6 funny", "gta 6 memes", "gta 6 trailer", "lucia",
            "gta online", "gta", "grand theft auto", "gaming", "rockstar"],
    "wb": ["economy", "countries", "world", "gdp", "data", "geography"],
    "prices": ["inflation", "prices", "groceries", "cost of living", "money", "data"],
}
DOMAINS = {"youtube": ("youtu",), "facebook": ("facebook.com", "fb.watch"),
           "instagram": ("instagram.com",), "tiktok": ("tiktok.com",)}


# ---------- small helpers ----------
def recipe_of(topic):
    for prefix in ("invest", "wb", "prices"):
        if topic.startswith(prefix + "__"):
            return prefix
    return "gta"


def is_gta(meta):
    return bool(re.search(r"\bgta\b|grand theft|lucia|rockstar|vice city", f"{meta.get('title', '')} {meta.get('description', '')}", re.I))


GTA_HASHTAGS = "#GTA6 #GTAVI #Shorts"   # a few only: search runs on the words now, not on hashtags


def keywords(meta):
    """The search line: the words people actually type, in plain text (platform search reads these, not hashtags)."""
    text = f"{meta['title']} {meta['description']}"
    who = re.findall(r"🎥 ([^\n:]+?) on Twitch", meta["description"])
    words = [f"{w} GTA 6" for w in dict.fromkeys(who)]
    words += ["GTA 6 funny moments", "GTA 6 gameplay"] if who else ["GTA 6", "GTA 6 launch"]
    if re.search(r"gta ?(5|v)\b", text, re.I):
        words.append("GTA 5 vs GTA 6")
    if re.search(r"lucia", text, re.I):
        words.append("Lucia GTA 6")
    words += ["Grand Theft Auto VI", "Vice City"]
    return ", ".join(dict.fromkeys(words))


def seo(meta):
    """GTA reels lead with "GTA 6" in the title, open the description with a plain search line, and keep 2 or 3 hashtags."""
    if not is_gta(meta):
        return meta
    m = dict(meta)
    title = m["title"].strip()
    if not re.match(r"gta ?(6|vi)\b", title, re.I):
        title = f"GTA 6: {title}"
    m["title"] = title[:100]
    body = re.sub(r"(\s*#\w+)+\s*$", "", m["description"]).rstrip()   # drop the old hashtag line
    m["description"] = f"{body}\n\n{keywords(m)}\n{GTA_HASHTAGS}"
    return m


def few_tags(text, n):
    """At most n hashtags (Instagram allows 5), and no #Shorts, which only means something on YouTube."""
    kept = []

    def one(m):
        tag = m.group(1)
        if tag.lower() == "#shorts" or tag.lower() in kept or len(kept) >= n:
            return ""
        kept.append(tag.lower())
        return m.group(0)
    return re.sub(r"[ \t]*(#\w+)", one, text).strip()


def tags_for(topic, meta):
    return TAGS["gta"] if is_gta(meta) else TAGS[recipe_of(topic)]


def looped(out):
    """The video with its last 0.4 s fading into the first frame, so the replay looks seamless (replays count as
    watch time). Any problem: the original file."""
    src, dst = out / "final.mp4", out / "final_loop.mp4"
    try:
        dur = lambda f: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                                             capture_output=True, text=True, check=True).stdout)
        d, x = dur(src), 0.4
        fc = (f"[0:v]fps=30,format=yuv420p,settb=AVTB[a0];"
              f"[1:v]trim=end_frame=1,loop=loop=30:size=1:start=0,fps=30,format=yuv420p,setpts=N/30/TB,settb=AVTB[f];"
              f"[a0][f]xfade=transition=fade:duration={x}:offset={d - x - 0.05:.3f}[v];"
              f"[0:a]afade=t=out:st={d - x:.3f}:d={x}[a]")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-i", str(src), "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
                        "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-c:a", "aac", "-shortest", str(dst)],
                       check=True, capture_output=True, timeout=300)
        if abs(dur(dst) - d) > 0.5:
            raise RuntimeError("length changed")
        return dst
    except Exception as e:
        print(f"      loop ending skipped ({e})")
        return src


def description_of(topic, meta):
    description = meta["description"]
    credit = music_credit(topic)
    if credit:
        description += "\n\n🎵 " + credit  # the free music license requires the credit
    return description[:4900]


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
    description = description_of(topic, meta)
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
        fields += [("tags[]", t) for t in tags_for(topic, meta)]
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
                   ("post_mode", "DIRECT_POST"), ("cover_timestamp", "1000")]  # 1 s in: the hook is fully on screen
        if AI_LABEL:
            fields.append(("is_aigc", "true"))
    return fields


# ---------- posting through Upload-Post (backup) ----------
def up_post(topic, when=None, only=None):
    """Uploads media/<topic>/final.mp4 to every platform in PLATFORMS.

    when: a Toronto datetime to publish at (Upload-Post holds it until then), or None to publish now.
    only: a list of platforms to post to instead (a catch-up post); it is not recorded in posts.json.
    Returns {"status": "live", "url": ..., "urls": {...}, "errors": [...]}
         or {"status": "scheduled", "job_id": ..., "when": ...}.
    """
    out = MEDIA_DIR / topic
    meta = seo(json.loads((out / "upload.json").read_text()))
    platforms = only or [p for p in meta.get("platforms") or PLATFORMS if p in PLATFORMS]   # a reel can name its own platforms
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

    with open(looped(out), "rb") as f:
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


def up_check(topic, p, found, failed):
    """Status of one Upload-Post record (also used for posts made before the switch to Zernio)."""
    try:
        s = status(job_id=p["job_id"]) if p.get("job_id") else status(request_id=p["request_id"])
    except (requests.RequestException, ValueError) as e:
        print(f"  status check failed for {topic}: {e}")
        return
    urls = find_urls(s)
    if urls.get(PRIMARY):
        save_post(topic, urls=urls)
        found.append((p.get("title", topic), urls))
        return
    errors = find_errors(s)
    if errors and overdue(p):
        save_post(topic, failed=" | ".join(errors))
        failed.append((p.get("title", topic), " | ".join(errors)))


def overdue(p, grace_minutes=30):
    when = p.get("when")
    if not when:
        return True
    return datetime.fromisoformat(when).timestamp() + grace_minutes * 60 < time.time()


# ---------- posting through Zernio (main) ----------
def zheaders():
    key = os.environ.get("ZERNIO_API_KEY")
    if not key:
        raise RuntimeError("ZERNIO_API_KEY missing")
    return {"Authorization": f"Bearer {key}"}


def zjson(r, what):
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text[:500]}
    if r.status_code >= 400:
        raise RuntimeError(f"Zernio refused the {what} ({r.status_code}): {body}")
    return body


def zernio_links(post_obj):
    """({platform: url}, [errors]) from a Zernio post."""
    urls, errors = {}, []
    for t in post_obj.get("platforms", []):
        name = t.get("platform")
        if t.get("platformPostUrl"):
            urls[name] = t["platformPostUrl"]
        elif t.get("status") == "failed":
            errors.append(f"{name}: {t.get('errorMessage') or t.get('error') or 'failed'}")
    return urls, errors


def zget(post_id):
    r = requests.get(f"{ZAPI}/posts/{post_id}", headers=zheaders(), timeout=60)
    body = zjson(r, "status check")
    return body.get("post", body)


def zernio_body(topic, meta, media_url, when, platforms, draft, cover_url=None, cover_ms=1000):
    title = meta["title"][:100]
    description = description_of(topic, meta)
    targets, missing = [], []
    for p in platforms:
        account = ZERNIO_ACCOUNTS.get(p)
        if not account:
            missing.append(p)
            continue
        data = {}
        if p == "youtube":
            data = {"title": title, "visibility": "public", "categoryId": CATEGORY_EDUCATION,
                    "madeForKids": False, "containsSyntheticMedia": False}
        elif p == "facebook":
            data = {"contentType": "reel", "title": title}
        elif p == "instagram":
            data = {"isAiGenerated": bool(AI_LABEL)}
            if cover_url:
                data["instagramThumbnail"] = cover_url
        elif p == "tiktok":
            tt = {"privacy_level": "PUBLIC_TO_EVERYONE", "allow_comment": True, "allow_duet": True, "allow_stitch": True,
                  "content_preview_confirmed": True, "express_consent_given": True, "video_made_with_ai": bool(AI_LABEL)}
            data = {"videoMadeWithAi": bool(AI_LABEL), "content_preview_confirmed": True,
                    "express_consent_given": True, "tiktokSettings": tt, "videoCoverTimestampMs": int(cover_ms)}
        if meta.get("pinned_comment") and p in ("youtube", "facebook", "instagram"):
            data["firstComment"] = meta["pinned_comment"]
        entry = {"platform": p, "accountId": account, "platformSpecificData": data}
        if p == "facebook" and cover_url:   # Facebook takes the cover on the video itself
            entry["customMedia"] = [{"type": "video", "url": media_url, "thumbnail": cover_url}]
        if p in ("tiktok", "instagram"):   # one text field there: the title leads the caption (TikTok drops line breaks)
            sep = " " if p == "tiktok" else "\n\n"
            entry["customContent"] = f"{title}{sep}{few_tags(description, 5)}"[:2200]
        targets.append(entry)
    if missing:
        print(f"      no Zernio account for {', '.join(missing)} (add its ID to ZERNIO_ACCOUNTS in config.py)")
    if not targets:
        raise RuntimeError("No Zernio account set for any platform in PLATFORMS")

    body = {"content": description, "tags": tags_for(topic, meta),
            "mediaItems": [{"type": "video", "url": media_url}], "platforms": targets}
    if draft:
        body["isDraft"] = True
    elif when:
        body["scheduledFor"] = when.strftime("%Y-%m-%dT%H:%M:%S")
        body["timezone"] = TZ_NAME
    else:
        body["publishNow"] = True
    return body


def z_post(topic, when=None, only=None, draft=False):
    out = MEDIA_DIR / topic
    meta = seo(json.loads((out / "upload.json").read_text()))
    platforms = only or [p for p in meta.get("platforms") or PLATFORMS if p in PLATFORMS]   # a reel can name its own platforms
    primary = PRIMARY if PRIMARY in platforms else platforms[0]
    record = not only and not draft
    known = load_posts().get(topic, {}) if record else {}
    if known.get("url"):
        print(f"Already posted: {known['url']}")
        return {"status": "live", "url": known["url"], "urls": known.get("urls", {}), "errors": []}
    if known.get("zernio_id") or known.get("job_id"):
        print(f"Already scheduled for {known.get('when')}")
        return {"status": "scheduled", "job_id": known.get("zernio_id") or known.get("job_id"), "when": known.get("when")}

    # 1. upload the video file to Zernio's storage
    r = requests.post(f"{ZAPI}/media/presign", headers=zheaders(), timeout=60,
                      json={"filename": f"{topic}.mp4", "contentType": "video/mp4"})
    pre = zjson(r, "upload link")
    with open(looped(out), "rb") as f:
        up = requests.put(pre["uploadUrl"], data=f, headers={"Content-Type": "video/mp4"}, timeout=600)
    if up.status_code >= 400:
        raise RuntimeError(f"Video upload to Zernio failed ({up.status_code}): {up.text[:300]}")

    # 2. the cover (Instagram and Facebook use the image, TikTok a frame time); never blocks the post
    cover_url, cover_ms = None, 1000
    try:
        from engine import cover
        img, cover_ms = cover.make(out)
        if img:
            r = requests.post(f"{ZAPI}/media/presign", headers=zheaders(), timeout=60,
                              json={"filename": f"{topic}_cover.jpg", "contentType": "image/jpeg"})
            cp = zjson(r, "cover upload link")
            with open(img, "rb") as f:
                up = requests.put(cp["uploadUrl"], data=f, headers={"Content-Type": "image/jpeg"}, timeout=120)
            if up.status_code < 400:
                cover_url = cp["publicUrl"]
    except Exception as e:
        print(f"      cover not used ({e})")

    # 3. create the post
    r = requests.post(f"{ZAPI}/posts", headers=zheaders(), timeout=120,
                      json=zernio_body(topic, meta, pre["publicUrl"], when, platforms, draft, cover_url, cover_ms))
    created = zjson(r, "post")
    p = created.get("post", created)
    post_id = p.get("_id") or p.get("id")
    if draft:
        return {"status": "draft", "id": post_id, "post_status": p.get("status")}

    base = {"title": meta["title"], "platforms": platforms, "service": "zernio", "zernio_id": post_id,
            "posted_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    if when:
        if record:
            save_post(topic, **base, when=when.isoformat())
        return {"status": "scheduled", "job_id": post_id, "when": when.isoformat()}

    # 4. posting now: wait for the links
    urls, errors = zernio_links(p)
    if record:
        save_post(topic, **base, urls=urls)
    waited = 0
    while waited < POLL_MAX and not all(x in urls for x in platforms):
        missing = [x for x in platforms if x not in urls]
        if primary in urls and len(errors) >= len(missing):
            break  # the main platform is live and the rest reported an error
        if primary in urls and waited >= 240:
            break  # the main platform is live; the slower ones (TikTok, Instagram) finish on their own
        if errors and primary not in urls and len(errors) >= len(platforms):
            raise RuntimeError("Upload failed: " + " | ".join(errors))
        time.sleep(POLL_EVERY)
        waited += POLL_EVERY
        try:
            urls, errors = zernio_links(zget(post_id))
        except (requests.RequestException, RuntimeError) as e:
            print(f"      status check hiccup: {e}")
        print(f"      waiting for the platforms... {waited}s ({', '.join(x for x in platforms if x not in urls)})")
    if primary not in urls:
        raise RuntimeError(f"No {primary} link after {waited}s (Zernio post {post_id}). {' | '.join(errors)}")
    if record:
        save_post(topic, urls=urls)
    return {"status": "live", "url": urls[primary], "urls": urls, "errors": errors}


def z_check(topic, p, found, failed):
    try:
        post_obj = zget(p["zernio_id"])
    except (requests.RequestException, RuntimeError, ValueError) as e:
        print(f"  status check failed for {topic}: {e}")
        return
    urls, errors = zernio_links(post_obj)
    if urls.get(PRIMARY):
        save_post(topic, urls=urls)
        found.append((p.get("title", topic), urls))
    elif (errors or post_obj.get("status") == "failed") and overdue(p):
        msg = " | ".join(errors) or "failed"
        save_post(topic, failed=msg)
        failed.append((p.get("title", topic), msg))


# ---------- what run.py calls ----------
def post(topic, when=None, only=None):
    """Uploads media/<topic>/final.mp4 to every platform in PLATFORMS, through config.POSTER.
    when: a Toronto datetime to publish at, or None to publish now.
    Returns {"status": "live", "url": ..., "urls": {...}, "errors": [...]}
         or {"status": "scheduled", "job_id": ..., "when": ...}."""
    if POSTER == "upload_post":
        return up_post(topic, when, only)
    return z_post(topic, when, only)


def check_live():
    """Looks up scheduled posts that have gone live since.
    Returns ([(title, {platform: url})] newly live, [(title, error)] failed)."""
    found, failed = [], []
    for topic, p in load_posts().items():
        if p.get("url") or p.get("failed"):
            continue
        if p.get("zernio_id"):
            z_check(topic, p, found, failed)
        elif p.get("job_id") or p.get("request_id"):
            up_check(topic, p, found, failed)
    return found, failed


def newest_rendered():
    videos = sorted(MEDIA_DIR.glob("*/final.mp4"), key=lambda f: f.stat().st_mtime, reverse=True)
    videos = [v for v in videos if (v.parent / "upload.json").exists()]
    if not videos:
        raise SystemExit("No rendered video with an upload.json in media/")
    return videos[0].parent.name


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        f, x = check_live()
        print("Live:", f or "none new")
        print("Failed:", x or "none")
    elif len(sys.argv) > 1 and sys.argv[1] == "--draft":
        t = sys.argv[2] if len(sys.argv) > 2 else newest_rendered()
        print(f"Sending {t} to Zernio as a draft (nothing gets published)...")
        print(z_post(t, draft=True))
        print("Open the Zernio dashboard to see the draft, then delete it there.")
    else:
        args = sys.argv[1:]
        only = None
        if "--only" in args:
            i = args.index("--only")
            only = [x.strip() for x in args[i + 1].split(",")]
            args = args[:i] + args[i + 2:]
        t = args[0] if args else "invest__big_tech__2015"
        print(post(t, only=only))
