"""Posting slots, Toronto time (also US Eastern, the biggest English-speaking audience).

Based on the 2026 studies (Buffer, SocialPilot, PostEverywhere): Friday 4 to 7 PM is the best Shorts window,
Monday midday and Sunday morning are next, and posting 2 to 3 hours before the 6 to 9 PM peak beats posting into it.
Revisit after ~4 weeks with YouTube Studio's "When your viewers are on YouTube".

    python -m engine.schedule      shows today's slot
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ_NAME = "America/Toronto"
TZ = ZoneInfo(TZ_NAME)
# weekday (Mon=0) -> (hour, minute)
SLOTS = {0: (12, 0), 1: (16, 0), 2: (16, 0), 3: (16, 0), 4: (17, 0), 5: (11, 0), 6: (9, 0)}
MIN_LEAD = timedelta(minutes=15)  # closer than this to the slot (or past it): post right away


def slot_today(now=None):
    """Today's slot as a Toronto datetime, or None if it's too late (then post immediately)."""
    now = now or datetime.now(TZ)
    h, m = SLOTS[now.weekday()]
    slot = now.replace(hour=h, minute=m, second=0, microsecond=0)
    return slot if slot - now >= MIN_LEAD else None


def label(slot):
    return slot.strftime("%a %b %-d, %-I:%M %p") + " (Toronto)"


if __name__ == "__main__":
    s = slot_today()
    print(f"Today's slot: {label(s)}" if s else "Today's slot has passed: a run now would post immediately")
    for d in range(7):
        day = datetime.now(TZ) + timedelta(days=d)
        h, m = SLOTS[day.weekday()]
        print(f"  {day:%a}: {h % 12 or 12}:{m:02d} {'AM' if h < 12 else 'PM'}")
