"""Test the English captions on a non-English streamer: finds the most-viewed GTA 6 clip of the last 3 days from a few
Spanish/French/German streamers on the allowlist, then test-renders it (never posts, state untouched).

    python tools/test_foreign.py            prints the output path at the end
    python tools/test_foreign.py crop       force the layout (crop or zoom)
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv

load_dotenv()
from engine import streamclips as sc

LOGINS = ["rubius", "auronplay", "illojuan", "elmariana", "squeezie", "montanablack88", "trymacs", "vegetta777"]

tok = sc.token()
gid = sc.game_id(tok)
now = datetime.now(timezone.utc)
since = (now - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
best = None
for u in sc.helix("users", tok, login=LOGINS):
    for c in sc.helix("clips", tok, broadcaster_id=u["id"], started_at=since, ended_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"), first=20):
        if c["game_id"] == gid and (best is None or c["view_count"] > best["view_count"]):
            best = c
if not best:
    raise SystemExit("no GTA 6 clip from those streamers in the last 3 days")
print(f"      picked: {best['broadcaster_name']} ({best.get('language')}), {best['view_count']} views: {best['title']}")
sc.make_one(best["url"], sys.argv[1] if len(sys.argv) > 1 else None)
