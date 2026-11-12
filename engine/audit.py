"""Checks every topic that hasn't been made yet and writes data/topic_pool.json, so the morning run
never wastes its tries on dead topics. Runs weekly on GitHub (audit.yml) and any time on the Mac.

    python -m engine.audit          checks every unused topic (a few minutes)
    python -m engine.audit --new    only checks topics not in topic_pool.json yet, or that had an error

Status per topic:
    ok      builds fine and would make a good video
    data    the data doesn't work (an asset didn't trade yet, missing years): never usable
    flat    the reveal is too flat for the daily pool (still fine for the GTA pool)
    dull    the line race has too few key moments
    error   network or code hiccup: tried again next audit, and the picker still tries it
"""
import json
import sys
import time
from datetime import datetime, timezone

from config import DATA_DIR, TEMPLATE
from engine import recipes, story, topics

POOL = DATA_DIR / "topic_pool.json"
LOW_STOCK = 14   # fewer usable daily topics than this: Telegram alert


def load_pool():
    if POOL.exists():
        return json.loads(POOL.read_text())
    return {"checked": None, "topics": {}}


def check(topic_id):
    try:
        payload = recipes.build(topic_id)
    except ValueError as e:
        return {"status": "data", "reason": str(e)[:200]}
    except Exception as e:
        return {"status": "error", "reason": f"{e.__class__.__name__}: {e}"[:200]}
    try:
        score = round(recipes.interest(payload), 1)
        dull = TEMPLATE == "story" and not story.worth_it(payload)
    except Exception as e:
        return {"status": "data", "reason": f"race check failed: {e.__class__.__name__}: {e}"[:200]}
    if dull:
        return {"status": "dull", "interest": score}
    if score < topics.MIN_INTEREST:
        return {"status": "flat", "interest": score}
    return {"status": "ok", "interest": score}


def usable_count(pool=None):
    """Daily topics not made yet that are ok (or not checked yet)."""
    pool = pool or load_pool()
    h = topics.load_history()
    used = set(h["done"]) | set(h["skipped"])
    bad = {t for t, r in pool["topics"].items() if r["status"] in ("data", "flat", "dull")}
    return sum(1 for t in recipes.all_candidates() if t not in used and t not in bad)


def run(only_new=False):
    pool = load_pool()
    h = topics.load_history()
    used = set(h["done"]) | set(h["skipped"])
    todo = [t for t in dict.fromkeys(recipes.all_candidates() + recipes.GTA_POOL) if t not in used]
    if only_new:
        todo = [t for t in todo if pool["topics"].get(t, {}).get("status", "error") == "error"]
    print(f"Checking {len(todo)} topics...")
    for n, t in enumerate(todo, 1):
        r = check(t)
        pool["topics"][t] = r
        extra = r.get("reason") or (f"interest {r['interest']}" if "interest" in r else "")
        print(f"  [{n}/{len(todo)}] {r['status']:<5} {t}  {extra}", flush=True)
        pool["checked"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        POOL.write_text(json.dumps(pool, indent=2, sort_keys=True))  # saved as it goes: stopping loses nothing
        time.sleep(0.3)  # gentle on Yahoo and the World Bank

    counts = {}
    for t in todo:
        counts[pool["topics"][t]["status"]] = counts.get(pool["topics"][t]["status"], 0) + 1
    left = usable_count(pool)
    print(f"\nDone: {counts}\nUsable daily topics left: {left}")
    if left < LOW_STOCK:
        from run import telegram
        telegram(f"⚠️ Only {left} usable daily topics left (about {left} days). Time to add topics.")
    return left


if __name__ == "__main__":
    run(only_new="--new" in sys.argv)
