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
    """Zernio's analytics answer: 'analytics' holds the totals across platforms, 'platformAnalytics' one entry per platform."""
    tot = (x.get("analytics") or {}).get("views")
    per = {p.get("platform"): (p.get("analytics") or {}).get("views") or 0 for p in x.get("platformAnalytics") or [] if p.get("platform")}
    return int(tot if isinstance(tot, (int, float)) else sum(per.values())), per


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
        if age < timedelta(hours=20) or age > timedelta(days=8) or (old.get("views") and old.get("at", "") > (now - timedelta(hours=20)).isoformat()):
            continue
        r = requests.get(f"{ZAPI}/analytics", params={"postId": zid}, headers=zheaders(), timeout=60)
        if r.status_code >= 400:
            print(f"      clip stats: analytics unavailable ({r.status_code}: {r.text[:120]})")
            break
        j = r.json()
        total, per = views_in(j)
        if rec.get("ig_zernio_id"):                # the Instagram delay test posts Instagram separately
            ri = requests.get(f"{ZAPI}/analytics", params={"postId": rec["ig_zernio_id"]}, headers=zheaders(), timeout=60)
            if ri.status_code < 400:
                it, ip = views_in(ri.json())
                per["instagram"] = per.get("instagram", 0) + ip.get("instagram", it)
                total += ip.get("instagram", it)
        a = j.get("analytics") or {}
        stats[p["topic"]] = {"logins": p["logins"], "star": p.get("star"), "views": total, "per_platform": per,
                             "completion": a.get("completionRate"), "avg_watch_ms": a.get("igReelsAvgWatchTime"),
                             "layout": p.get("layout"), "ig_delayed": bool(rec.get("ig_zernio_id")), "at": now.isoformat()}
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
