"""Picks the next topic: never repeats, rotates video types, skips boring data.

Usage:
    python -m engine.topics            (shows what would be picked next, builds its data)
    python -m engine.topics --list     (counts available topics)
"""
import json
import random
import sys
from datetime import date

from config import DATA_DIR, TEMPLATE
from engine import data, recipes, story

HISTORY = DATA_DIR / "history.json"
MIN_INTEREST = 3.0      # below this the reveal is too flat
MAX_TRIES = 6


def load_history():
    if HISTORY.exists():
        return json.loads(HISTORY.read_text())
    return {"done": [], "skipped": []}


def save_history(h):
    HISTORY.write_text(json.dumps(h, indent=2))


def recipe_of(topic_id):
    return topic_id.split("__")[0]


def mark_done(topic_id):
    h = load_history()
    if topic_id not in h["done"]:
        h["done"].append(topic_id)
    save_history(h)


def pick_next():
    """Returns (topic_id, payload). Builds data for candidates until one is interesting enough."""
    h = load_history()
    used = set(h["done"]) | set(h["skipped"])
    pool = [t for t in recipes.all_candidates() if t not in used]
    if not pool:
        raise RuntimeError("No topics left. Add groups or years in engine/recipes.py.")

    # Rotate: avoid the recipe type used last time, if another type is available
    last_recipe = recipe_of(h["done"][-1]) if h["done"] else None
    preferred = [t for t in pool if recipe_of(t) != last_recipe] or pool
    rng = random.Random(date.today().isoformat())
    rng.shuffle(preferred)

    errors = []
    for topic_id in preferred[:MAX_TRIES]:
        try:
            payload = data.build(topic_id)
        except ValueError as e:
            # the data itself doesn't work for this topic (e.g. missing years): skip it for good
            print(f"  skip {topic_id}: {e}")
            h["skipped"].append(topic_id)
            continue
        except Exception as e:
            # a bug or a network hiccup: try the next topic, but keep this one for another day
            print(f"  error on {topic_id} ({e.__class__.__name__}: {e}), trying another")
            errors.append(f"{topic_id}: {e}")
            continue
        score = recipes.interest(payload)
        if score < MIN_INTEREST:
            print(f"  skip {topic_id}: interest {score:.1f} too low")
            h["skipped"].append(topic_id)
            continue
        if TEMPLATE == "story" and not story.worth_it(payload):
            print(f"  skip {topic_id}: the race has fewer than {story.MIN_MOMENTS} key moments")
            h["skipped"].append(topic_id)
            continue
        save_history(h)
        return topic_id, payload

    save_history(h)
    if errors:
        raise RuntimeError("Every topic tried hit an error: " + " | ".join(errors[:3]))
    raise RuntimeError("No interesting topic found in this batch; run again to try the next ones.")


if __name__ == "__main__":
    if "--list" in sys.argv:
        h = load_history()
        allc = recipes.all_candidates()
        print(f"{len(allc)} topics total, {len(h['done'])} done, {len(h['skipped'])} skipped")
    else:
        t, p = pick_next()
        print(f"\nNext topic: {t}\n{p['angle']}")
        print(f"interest {recipes.interest(p):.1f}")
