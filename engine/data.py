"""Builds and saves the verified data payload for a topic.

Usage:
    python -m engine.data gta_launch_prices
    python -m engine.data invest__big_tech__2015
    python -m engine.data wb__gdp__giants__1990
"""
import json
import sys

from config import MEDIA_DIR
from engine import recipes


def build(topic):
    payload = recipes.build(topic)
    out_dir = MEDIA_DIR / topic
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "data.json").write_text(json.dumps(payload, indent=2))
    return payload


if __name__ == "__main__":
    topic = sys.argv[1] if len(sys.argv) > 1 else "gta_launch_prices"
    p = build(topic)
    print(f"{p['angle']}\n")
    for it in p["items"]:
        print(f"  {it['short']:<18} {it['start_display']:>10}  ->  {it['end_display']:>10}")
    print(f"\nTop now: {p['facts']['top_now']} ({p['facts']['top_now_value']}), "
          f"rank changes: {p['rank_changes']}, interest: {recipes.interest(p):.1f}")
    print(f"Saved media/{topic}/data.json")
