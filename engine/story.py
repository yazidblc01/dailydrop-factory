"""The "story" format: a line race from the first frame, with the leader hidden as "???",
callouts at the key moments, then the #1 reveal.

This module works out, from the data alone:
- the mystery item (the eventual #1, hidden until the reveal)
- the race's key moments (lead changes, crashes, breakaways), so the voiceover and the
  on-screen callouts always say something true about the data
and, once the voice exists, the scene plan the video template plays.
"""
MYSTERY = "???"
MYSTERY_WORD = {"invest": "the mystery stock", "wb": "the mystery country", "gta": "the mystery game"}
import math

MAX_MOMENTS = 3
MIN_GAP_YEARS = 1.0     # moments closer than this are merged (the later one wins)
CRASH = 0.55            # a drop to 55% or less of the previous 12-month high counts as a crash


# ---------- countdown ----------
def ranked(payload):
    """Items from #1 (highest end value) to last."""
    return sorted(payload["items"], key=lambda i: i["end"], reverse=True)


def countdown(payload):
    """The items shown one by one before the race: last place up to #3, with their rank."""
    r = ranked(payload)
    return [{"rank": i + 1, "short": it["short"], "end_spoken": it["end_spoken"], "end_display": it["end_display"]}
            for i, it in reversed(list(enumerate(r))) if i >= 2]


# ---------- race moments ----------
def _value(series, t):
    if t <= series[0][0]:
        return series[0][1]
    for (t0, v0), (t1, v1) in zip(series, series[1:]):
        if t <= t1:
            k = (t - t0) / ((t1 - t0) or 1)
            if v0 > 0 and v1 > 0:
                return math.exp(math.log(v0) + (math.log(v1) - math.log(v0)) * k)
            return v0 + (v1 - v0) * k
    return series[-1][1]


def moments(payload):
    """Key moments of the race: [{t, u, kind, item, text, fact}], in time order, at most MAX_MOMENTS.
    t is a decimal year, u is the race progress (0 = start, 1 = today)."""
    items = [i for i in payload["items"] if i.get("series") and len(i["series"]) > 2]
    if not payload.get("race") or len(items) < 2:
        return []
    t0 = min(i["series"][0][0] for i in items)
    t1 = max(i["series"][-1][0] for i in items)
    if t1 - t0 < 1:
        return []
    steps = max(24, int((t1 - t0) * 12))
    grid = [t0 + (t1 - t0) * k / steps for k in range(steps + 1)]
    vals = {i["short"]: [_value(i["series"], t) for t in grid] for i in items}
    year = lambda t: int(t)

    found = []
    # lead changes (ignore the first months, when everyone starts equal)
    leader = None
    for k, t in enumerate(grid):
        if t < t0 + 0.5:
            continue
        top = max(vals, key=lambda s: vals[s][k])
        if leader and top != leader:
            found.append({"t": t, "kind": "lead", "item": top, "text": f"{top} takes #1",
                          "fact": f"In {year(t)}, {top} passed {leader} for #1."})
        leader = top
    # crashes: the deepest drop per item versus its high of the previous 12 months
    for s, v in vals.items():
        worst, at = 1.0, None
        for k in range(len(grid)):
            back = [v[j] for j in range(len(grid)) if grid[k] - 1.0 <= grid[j] <= grid[k]]
            ratio = v[k] / max(back)
            if ratio < worst:
                worst, at = ratio, k
        if at is not None and worst <= CRASH:
            pct = round((1 - worst) * 100)
            found.append({"t": grid[at], "kind": "crash", "item": s, "text": f"{s} crashes -{pct}%",
                          "fact": f"In {year(grid[at])}, {s} fell {pct}% from its high of the year before."})
    # breakaway: the first time the leader is worth twice the runner-up (after the last lead change)
    last_lead = max([m["t"] for m in found if m["kind"] == "lead"], default=t0)
    for k, t in enumerate(grid):
        if t <= last_lead:
            continue
        order = sorted(vals, key=lambda s: vals[s][k], reverse=True)
        a, b = vals[order[0]][k], vals[order[1]][k]
        if b > 0 and a / b >= 2:
            found.append({"t": t, "kind": "breakaway", "item": order[0], "text": f"{order[0]} pulls away",
                          "fact": f"By {year(t)}, {order[0]} was worth twice as much as {order[1]}."})
            break

    # keep the most telling ones: the last lead change and the breakaway first, then crashes, then early leads
    priority = {"breakaway": 0, "crash": 2, "lead": 3}
    last_lead_m = [m for m in found if m["kind"] == "lead"][-1:]
    pool = last_lead_m + sorted([m for m in found if m not in last_lead_m], key=lambda m: (priority[m["kind"]], -m["t"]))
    chosen = []
    for m in pool:
        if all(abs(m["t"] - c["t"]) >= MIN_GAP_YEARS for c in chosen):
            chosen.append(m)
        if len(chosen) == MAX_MOMENTS:
            break
    chosen.sort(key=lambda m: m["t"])
    winner = ranked(payload)[0]["short"]
    word = MYSTERY_WORD.get(payload["recipe"], "the mystery pick")
    for m in chosen:
        if m["item"] == winner:  # never leak #1 before the reveal
            m["text"] = m["text"].replace(winner, MYSTERY)
            m["fact"] = m["fact"].replace(winner, word)
        m["fact"] = m["fact"].replace(f"passed {winner}", f"passed {word}").replace(f"than {winner}", f"than {word}")
        m["u"] = round((m["t"] - t0) / (t1 - t0), 4)
        m["t"] = round(m["t"], 3)
    return chosen


# ---------- scene plan (after the voice is recorded) ----------
def scene_plan(payload, script, sections, backgrounds):
    """Turns the voice sections into the scenes the StoryReel template plays.
    The line race fills the whole video: question on top for the hook, callouts during the race,
    the final chart holds, ??? turns into the real logo right on the chart, the question returns for the loop."""
    sec = {s["name"]: s for s in sections}
    calls = [s for s in sections if s["name"].startswith("call")]
    top = ranked(payload)[0]
    end_t = sections[-1]["end"] + 0.5
    reveal_t = sec["reveal"]["start"]
    finish = max(reveal_t - 1.5, sec["tension"]["start"] + 3.0)  # the finished chart holds 1.5s before the reveal

    race = {"type": "linerace", "start": 0.0, "end": end_t, "mystery": top["short"], "revealAt": reveal_t}
    ms = payload.get("moments") or []
    keys = [[0.3, 0.0]]
    if ms and len(calls) == len(ms):
        for s, m in zip(calls, ms):  # each callout lands exactly when its voice line starts
            if keys[-1][0] + 0.3 < s["start"] < finish - 0.3 and m["u"] > keys[-1][1]:
                keys.append([s["start"], m["u"]])
        race["callouts"] = [{"at": s["start"], "text": m["text"], "item": MYSTERY if m["item"] == top["short"] else m["item"]}
                            for s, m in zip(calls, ms)]
    keys.append([max(finish, keys[-1][0] + 0.3), 1.0])
    race["keys"] = keys

    return [
        race,
        {"type": "question", "start": 0.0, "end": sec["hook"]["end"] + 0.2},
        {"type": "question", "start": sec["twist"]["start"], "end": end_t},
    ]
