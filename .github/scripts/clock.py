"""The clock: stays awake on GitHub and starts each run at its exact minute (GitHub's own scheduler can be hours late or skip runs).
Runs about 5.5 hours, then starts the next clock. Any slot missed in the last 90 minutes is started late rather than skipped.
Each slot is started only once: before starting, it checks whether that workflow already has a run since the slot time."""
import json
import subprocess
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Toronto")
# (Toronto time, workflow, inputs)
SLOTS = [("10:37", "gta_waited.yml", {"format": "texts"}),                   # original: texts from the future
         ("12:07", "gta_waited.yml", {"format": "streamclip"}),              # stream clip
         ("15:07", "gta_waited.yml", {"format": "streamvs"}),                # GTA 5 vs GTA 6
         ("18:07", "gta_waited.yml", {}),                                    # original: the rotation (data race, coins, money to scale)
         ("18:47", "daily.yml", {"mode": "check"}),
         ("20:07", "gta_waited.yml", {"format": "streamclip"})]              # stream clip
# the old 6:13 AM morning reel and the catch-up job are retired (nothing schedules them any more)
PAUSE_UNTIL = datetime(2000, 1, 1, tzinfo=TZ)
PAUSED = set()
LATE_OK = timedelta(minutes=90)
LIFE = timedelta(hours=5, minutes=30)


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True)


def runs_since(workflow, since):
    r = gh("run", "list", "--workflow", workflow, "--limit", "20", "--json", "createdAt,event")
    if r.returncode:
        print(r.stderr)
        return None
    out = []
    for x in json.loads(r.stdout):
        t = datetime.fromisoformat(x["createdAt"].replace("Z", "+00:00"))
        if t >= since:
            out.append(x)
    return out


def due(now):
    """Slots whose time passed less than LATE_OK ago (today or yesterday, for slots just after midnight)."""
    for day in (now.date() - timedelta(days=1), now.date()):
        for hm, wf, inputs in SLOTS:
            h, m = map(int, hm.split(":"))
            at = datetime(day.year, day.month, day.day, h, m, tzinfo=TZ)
            if hm in PAUSED and at < PAUSE_UNTIL:
                continue
            if at <= now < at + LATE_OK:
                yield at, wf, inputs


def fire(at, wf, inputs):
    since = at.astimezone(timezone.utc) - timedelta(minutes=2)
    have = runs_since(wf, since)
    if have is None:
        return False
    # a run started since the slot by the clock (workflow_dispatch) means this slot is done;
    # for daily.yml the check slots share the workflow, so only count runs started within 3 minutes of the slot
    if wf == "daily.yml":
        have = [x for x in have if datetime.fromisoformat(x["createdAt"].replace("Z", "+00:00")) < since + timedelta(minutes=5)
                and x["event"] == "workflow_dispatch"]
    else:
        have = [x for x in have if x["event"] == "workflow_dispatch"]
    if have:
        return True
    args = ["workflow", "run", wf]
    for k, v in inputs.items():
        args += ["-f", f"{k}={v}"]
    r = gh(*args)
    print(f"{datetime.now(TZ):%H:%M} start {wf} {inputs} for {at:%H:%M}: {'ok' if r.returncode == 0 else r.stderr.strip()}")
    return r.returncode == 0


def main():
    start = datetime.now(TZ)
    print(f"clock up at {start:%Y-%m-%d %H:%M} Toronto")
    done = set()
    while datetime.now(TZ) - start < LIFE:
        now = datetime.now(TZ)
        for at, wf, inputs in due(now):
            key = (at.isoformat(), wf)
            if key not in done and fire(at, wf, inputs):
                done.add(key)
        time.sleep(30)
    r = gh("workflow", "run", "clock.yml")
    print("next clock started" if r.returncode == 0 else f"could not start the next clock: {r.stderr}")


if __name__ == "__main__":
    main()
