"""Spike watch, run by the clock every 20 minutes (9 AM to 11:30 PM Toronto): is an allowlisted streamer's GTA 6 clip blowing up
right now? If so, start a GTA wave run that screens it and posts it within the hour (format=spike), instead of waiting for a slot.
Standard library only (the clock's machine has no packages). Reads the latest state straight from the repo through gh.

Rules (all must hold):
  - made in the last 4 hours, 15 to 60 s long, 2,500+ views and 1,200+ views an hour
  - not already looked at by the clip pipeline, at most 2 spikes a day
  - no GTA wave run in the last 75 minutes, and no stream clip slot coming in the next 60 (that slot will take it)
"""
import json
import os
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

HELIX = "https://api.twitch.tv/helix"
MIN_VIEWS, MIN_VPH, MAX_AGE_H, PER_DAY = 2500, 1200, 4, 2
CLIP_SLOTS = ["12:07", "20:07"]            # the stream clip slots (Toronto)


def gh_raw(path):
    r = subprocess.run(["gh", "api", "-H", "Accept: application/vnd.github.raw", f"repos/{os.environ['GH_REPO']}/contents/{path}"],
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[:200])
    return json.loads(r.stdout)


def http(url, data=None, headers=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def helix(path, tok, **params):
    q = urllib.parse.urlencode([(k, x) for k, v in params.items() for x in (v if isinstance(v, list) else [v])])
    return http(f"{HELIX}/{path}?{q}", headers={"Client-ID": os.environ["TWITCH_CLIENT_ID"], "Authorization": f"Bearer {tok}"})["data"]


def recent_wave_run(minutes):
    r = subprocess.run(["gh", "run", "list", "--workflow", "gta_waited.yml", "--limit", "5", "--json", "createdAt"], capture_output=True, text=True)
    if r.returncode:
        return True                         # unsure: don't start anything
    cut = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return any(datetime.fromisoformat(x["createdAt"].replace("Z", "+00:00")) >= cut for x in json.loads(r.stdout))


def find(now_local):
    """The clip id to post now, or None (with the reason printed)."""
    for hm in CLIP_SLOTS:
        h, m = map(int, hm.split(":"))
        slot = now_local.replace(hour=h, minute=m, second=0, microsecond=0)
        if timedelta(0) <= slot - now_local <= timedelta(minutes=60):
            return None, f"the {hm} clip slot is coming"
    if recent_wave_run(75):
        return None, "a GTA wave run started in the last 75 min"
    if not os.environ.get("TWITCH_CLIENT_ID"):
        return None, "no Twitch keys on the clock"
    st = gh_raw("data/streamclips.json")
    today = now_local.strftime("%Y-%m-%d")
    if sum(1 for x in st.get("spikes", []) if x.get("date") == today) >= PER_DAY:
        return None, "2 spikes already today"
    used = set(st.get("used", []))
    allow = gh_raw("data/streamers.json")
    logins = [k for k in allow.get("twitch", {}) if k not in allow.get("blocked", {})]
    tok = http("https://id.twitch.tv/oauth2/token", {"client_id": os.environ["TWITCH_CLIENT_ID"],
                                                     "client_secret": os.environ["TWITCH_CLIENT_SECRET"], "grant_type": "client_credentials"})["access_token"]
    gid = helix("games", tok, name="Grand Theft Auto VI")[0]["id"]
    users = []
    for i in range(0, len(logins), 100):
        users += helix("users", tok, login=logins[i:i + 100])
    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=MAX_AGE_H)).strftime("%Y-%m-%dT%H:%M:%SZ")
    best = None
    for u in users:
        for c in helix("clips", tok, broadcaster_id=u["id"], started_at=since, ended_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"), first=20):
            if c["game_id"] != gid or c["id"] in used or not 15 <= c["duration"] <= 60:
                continue
            age = max((now - datetime.fromisoformat(c["created_at"].replace("Z", "+00:00"))).total_seconds() / 3600, 0.25)
            vph = c["view_count"] / age
            if c["view_count"] >= MIN_VIEWS and vph >= MIN_VPH and (not best or vph > best[1]):
                best = (c, vph)
    if not best:
        return None, "nothing spiking"
    c, vph = best
    print(f"spike: {c['broadcaster_name']}: {c['title']} ({c['view_count']} views, {vph:.0f}/h)")
    return c["id"], "spiking"


if __name__ == "__main__":
    from zoneinfo import ZoneInfo
    print(find(datetime.now(ZoneInfo("America/Toronto"))))
