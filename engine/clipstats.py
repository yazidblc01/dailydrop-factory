"""How our stream clips did, so engine/streamclips.py picks more of what works (once a day).

Reads each posted clip's views on all 4 platforms from Zernio's analytics (GET /v1/analytics?postId=...),
from 20 hours after posting until it's a week old, into data/clipstats.json. weights() turns that into a multiplier
per streamer: streamers whose clips beat our average get picked more, the others less (0.6x to 1.8x, needs 2+ clips).

    python -m engine.clipstats       update now and print the weights
"""
import json
from datetime import datetime, timedelta, timezone

import requests

from config import DATA_DIR

FILE = DATA_DIR / "clipstats.json"


def load():
    return json.loads(FILE.read_text()) if FILE.exists() else {}


def views_in(x):
    """Total views in an analytics answer, whatever its shape (impressions if a platform has no views)."""
    if isinstance(x, dict):
        own = x.get("views") if isinstance(x.get("views"), (int, float)) else x.get("impressions") if isinstance(x.get("impressions"), (int, float)) else None
        if own is not None and not any(isinstance(v, (dict, list)) for v in x.values()):
            return own
        return sum(views_in(v) for k, v in x.items() if isinstance(v, (dict, list)))
    if isinstance(x, list):
        return sum(views_in(v) for v in x)
    return 0


def run():
    from engine.streamclips import load_state
    from engine.upload import ZAPI, load_posts, zheaders
    stats, posts, now = load(), load_posts(), datetime.now(timezone.utc)
    n = 0
    for p in load_state()["posted"]:
        rec = posts.get(p["topic"]) or {}
        zid, at = rec.get("zernio_id"), rec.get("posted_at")
        if not zid or not at:
            continue
        age = now - datetime.fromisoformat(at)
        old = stats.get(p["topic"], {})
        if age < timedelta(hours=20) or age > timedelta(days=8) or old.get("at", "") > (now - timedelta(hours=20)).isoformat():
            continue
        r = requests.get(f"{ZAPI}/analytics", params={"postId": zid}, headers=zheaders(), timeout=60)
        if r.status_code >= 400:
            print(f"      clip stats: analytics unavailable ({r.status_code}: {r.text[:120]})")
            break
        stats[p["topic"]] = {"logins": p["logins"], "star": p.get("star"), "views": views_in(r.json()), "at": now.isoformat()}
        n += 1
    FILE.write_text(json.dumps(stats, indent=2))
    print(f"      clip stats: updated {n}")


def weights():
    per, allv = {}, []
    for s in load().values():
        for lg in s.get("logins", []):
            per.setdefault(lg, []).append(s["views"])
        allv.append(s["views"])
    if not allv or not sum(allv):
        return {}
    avg = sum(allv) / len(allv)
    return {lg: max(0.6, min(1.8, (sum(v) / len(v) / avg) ** 0.5)) for lg, v in per.items() if len(v) >= 2}


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    run()
    print(weights())
