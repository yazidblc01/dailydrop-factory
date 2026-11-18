"""Streamer discovery for the clip pipeline (engine/streamclips.py), once a day.

The allowlist (data/streamers.json, "twitch") only holds streamers with a public sign that they welcome clips:
    - their Twitch bio mentions clipping (a clipping program, "feel free to clip", Whop, Content Rewards, Vyro, Reach)
    - a public list of streamers who pay clippers names them (BOARDS below)
Candidates are the top English GTA 6 streams on Twitch right now. Each one is checked at most once a week.
"blocked" in the same file always wins: put a login there to stop clipping someone for good.

    python -m engine.streamers        check now and print who was added
"""
import json
import re
from datetime import datetime, timedelta

import requests

from config import DATA_DIR

ALLOW = DATA_DIR / "streamers.json"
BOARDS = ["https://www.clyper.io/clipping-programs"]   # a list of streamers who pay clippers (a page that only mentions names would not count)
SIGNS = re.compile(r"clip(ping)?\s*(program|campaign|squad|team|server|discord)|clippers?\b|feel free to clip|clip (my|the|our) "
                   r"(streams?|content|vods?)|whop\.com|contentrewards|content rewards|vyro|reach\.cat", re.I)


def run(top=60):
    from engine.streamclips import game_id, helix, token
    j = json.loads(ALLOW.read_text())
    allow, blocked, checked = j.setdefault("twitch", {}), j.setdefault("blocked", {}), j.setdefault("checked", {})
    week = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    tok = token()
    streams = helix("streams", tok, game_id=game_id(tok), first=100, language="en")
    logins = [s["user_login"] for s in sorted(streams, key=lambda s: -s["viewer_count"])][:top]
    todo = [l for l in logins if l not in allow and l not in blocked and checked.get(l, "") < week]
    if not todo:
        print("      streamers: nobody new to check")
        return []
    boards = ""
    for b in BOARDS:
        try:
            boards += requests.get(b, timeout=30, headers={"User-Agent": "Mozilla/5.0"}).text.lower()
        except Exception:
            pass
    added = []
    users = helix("users", tok, login=todo)
    for u in users:
        login, shown = u["login"], u["display_name"]
        checked[login] = datetime.now().strftime("%Y-%m-%d")
        if SIGNS.search(u.get("description") or ""):
            allow[login] = f"Twitch bio mentions clipping (found {checked[login]})"
        elif boards and re.search(rf"\b{re.escape(shown.lower())}\b", boards):
            allow[login] = f"listed as paying clippers on a public clipping board (found {checked[login]})"
        else:
            continue
        added.append(shown)
    ALLOW.write_text(json.dumps(j, indent=2, ensure_ascii=False))
    print(f"      streamers: checked {len(users)}, added {', '.join(added) or 'nobody'}")
    return added


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    run()
