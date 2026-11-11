"""The "story" format: a line race from the first frame, with one contender hidden as "???",
callouts at the key moments, then the reveal right on the chart.

This module works out, from the data alone:
- the mystery: normally the eventual #1; but if #1 never changed during the race (boring, and
  obvious on screen), the biggest grower instead, and the question becomes "which grew the most?"
- the race's key moments (lead changes, overtakes, record jumps, crashes, breakaways), so the
  voiceover and the on-screen callouts always say something true about the data
- whether a topic is worth making at all in this format (enough moments)
and, once the voice exists, the scene plan the video template plays.
"""
import math

MYSTERY = "???"
MYSTERY_WORD = {"invest": "the mystery stock", "wb": "the mystery country", "gta": "the mystery game"}
MAX_MOMENTS = 3
MIN_MOMENTS = 2         # fewer than this and the race is dull: the topic picker skips it
MIN_GAP_YEARS = 1.0     # moments closer than this are merged
CRASH = 0.55            # a drop to 55% or less of the previous 12-month high counts as a crash
JUMP = 1.8              # a rise to 1.8x within 12 months counts as a record jump


# ---------- ranking ----------
def ranked(payload):
    """Items from #1 (highest end value) to last."""
    return sorted(payload["items"], key=lambda i: i["end"], reverse=True)


def countdown(payload):
    """Last place up to #3, with their rank (kept for other scene layouts)."""
    r = ranked(payload)
    return [{"rank": i + 1, "short": it["short"], "end_spoken": it["end_spoken"], "end_display": it["end_display"]}
            for i, it in reversed(list(enumerate(r))) if i >= 2]


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


def _grid(payload):
    items = [i for i in payload["items"] if i.get("series") and len(i["series"]) > 1]
    if not payload.get("race") or len(items) < 2:
        return None
    t0 = min(i["series"][0][0] for i in items)
    t1 = max(i["series"][-1][0] for i in items)
    if t1 - t0 < 1:
        return None
    steps = max(24, int((t1 - t0) * 12))
    grid = [t0 + (t1 - t0) * k / steps for k in range(steps + 1)]
    vals = {i["short"]: [_value(i["series"], t) for t in grid] for i in items}
    return t0, t1, grid, vals


def _pct(ratio):
    return round((ratio - 1) * 100)


# ---------- the mystery ----------
def mystery(payload):
    """Who is hidden as ??? and why.
    mode "top":    the eventual #1 (when the lead changed hands, so it's a real race)
    mode "growth": the biggest grower (when #1 led from start to finish)"""
    top = ranked(payload)[0]
    g = _grid(payload)
    if g:
        t0, t1, grid, vals = g
        k_early = next(k for k, t in enumerate(grid) if t >= t0 + 0.5 * min(1.0, (t1 - t0) / 4))
        early_leader = max(vals, key=lambda s: vals[s][k_early])
        if early_leader == top["short"]:
            growth = max(payload["items"], key=lambda i: i["end"] / i["start"] if i["start"] else 0)
            if growth["short"] != top["short"]:
                ratio = growth["end"] / growth["start"]
                return {"short": growth["short"], "mode": "growth", "ratio": round(ratio, 3),
                        "growth_text": f"{ratio:.1f}x" if ratio >= 2 else f"+{_pct(ratio)}%"}
    return {"short": top["short"], "mode": "top"}


# ---------- race moments ----------
def moments(payload, hidden=None):
    """Key moments of the race: [{t, u, kind, item, text, fact}], in time order, at most MAX_MOMENTS.
    t is a decimal year, u is the race progress (0 = start, 1 = today).
    The hidden item's name never appears: it is "???" on screen and MYSTERY_WORD in the facts."""
    g = _grid(payload)
    if not g:
        return []
    t0, t1, grid, vals = g
    year = lambda t: int(t)
    names = list(vals)
    found = []

    # lead changes and overtakes (rank swaps), ignoring the first months when everyone is level
    prev = None
    for k, t in enumerate(grid):
        order = sorted(names, key=lambda s: vals[s][k], reverse=True)
        if t >= t0 + 0.5 and prev:
            if order[0] != prev[0]:
                found.append({"t": t, "kind": "lead", "item": order[0], "other": prev[0],
                              "text": f"{order[0]} takes #1", "fact": f"In {year(t)}, {order[0]} passed {prev[0]} for #1."})
            else:
                for pos in range(1, min(4, len(order))):
                    a = order[pos]
                    if prev.index(a) > pos:  # a moved up into this place
                        b = prev[pos]
                        found.append({"t": t, "kind": "overtake", "item": a, "other": b,
                                      "text": f"{a} passes {b}", "fact": f"In {year(t)}, {a} passed {b} to reach #{pos + 1}."})
                        break
        prev = order

    # record jumps and crashes, against the previous 12 months
    for s, v in vals.items():
        best_up, at_up, worst, at_dn = 1.0, None, 1.0, None
        for k in range(len(grid)):
            back = [v[j] for j in range(len(grid)) if grid[k] - 1.0 <= grid[j] <= grid[k]]
            up, dn = v[k] / min(back), v[k] / max(back)
            if up > best_up:
                best_up, at_up = up, k
            if dn < worst:
                worst, at_dn = dn, k
        if at_up is not None and best_up >= JUMP:
            found.append({"t": grid[at_up], "kind": "jump", "item": s,
                          "text": f"{s} +{_pct(best_up)}%", "fact": f"In {year(grid[at_up])}, {s} rose {_pct(best_up)}% in a single year."})
        if at_dn is not None and worst <= CRASH:
            pct = round((1 - worst) * 100)
            found.append({"t": grid[at_dn], "kind": "crash", "item": s, "text": f"{s} crashes -{pct}%",
                          "fact": f"In {year(grid[at_dn])}, {s} fell {pct}% from its high of the year before."})

    # breakaway: the first time #1 is worth twice #2, after the last lead change
    last_lead = max([m["t"] for m in found if m["kind"] == "lead"], default=t0 + 0.5)
    for k, t in enumerate(grid):
        if t <= last_lead:
            continue
        order = sorted(names, key=lambda s: vals[s][k], reverse=True)
        a, b = vals[order[0]][k], vals[order[1]][k]
        if b > 0 and a / b >= 2:
            found.append({"t": t, "kind": "breakaway", "item": order[0], "other": order[1], "text": f"{order[0]} pulls away",
                          "fact": f"By {year(t)}, {order[0]} was worth twice as much as {order[1]}."})
            break

    # choose: the last lead change first, then variety (one of each other kind), spaced at least a year apart
    priority = {"breakaway": 0, "jump": 1, "crash": 2, "overtake": 3, "lead": 4}
    hidden_first = [m for m in found if m["item"] == hidden and m["kind"] in ("jump", "overtake", "breakaway")]
    last_lead = [m for m in found if m["kind"] == "lead"][-1:]
    rest = sorted([m for m in found if m not in last_lead], key=lambda m: (m["item"] != hidden, priority[m["kind"]], -m["t"]))
    chosen, kinds = [], set()
    for m in last_lead + hidden_first[:1] + rest:
        if m in chosen or any(abs(m["t"] - c["t"]) < MIN_GAP_YEARS for c in chosen):
            continue
        if m["kind"] != "lead" and m["kind"] in kinds:
            continue
        if m["item"] == hidden and sum(c["item"] == hidden for c in chosen) >= 2:
            continue  # keep the others in the story too
        chosen.append(m)
        kinds.add(m["kind"])
        if len(chosen) == MAX_MOMENTS:
            break
    chosen.sort(key=lambda m: m["t"])

    word = MYSTERY_WORD.get(payload["recipe"], "the mystery pick")
    for m in chosen:
        if hidden:
            m["text"] = m["text"].replace(hidden, MYSTERY)
            m["fact"] = m["fact"].replace(hidden, word)
        m["u"] = round((m["t"] - t0) / (t1 - t0), 4)
        m["t"] = round(m["t"], 3)
        m.pop("other", None)
    return chosen


def prepare(payload):
    """Adds the mystery and the moments to a payload (once). Returns how many moments it found."""
    if "mystery" not in payload:
        payload["mystery"] = mystery(payload)
    if "moments" not in payload:
        payload["moments"] = moments(payload, payload["mystery"]["short"])
    return len(payload["moments"])


def worth_it(payload):
    """True if the topic makes a lively race (or isn't a race topic at all)."""
    if not _grid(payload):
        return True  # no history to race: made in the classic format
    return prepare(payload) >= MIN_MOMENTS


# ---------- scene plan (after the voice is recorded) ----------
def scene_plan(payload, script, sections, backgrounds):
    """Turns the voice sections into the scenes the StoryReel template plays.
    The line race fills the whole video: question on top for the hook, callouts during the race,
    the final chart holds, ??? turns into the real logo right on the chart, the question returns for the loop."""
    prepare(payload)
    sec = {s["name"]: s for s in sections}
    calls = [s for s in sections if s["name"].startswith("call")]
    hidden = payload["mystery"]["short"]
    end_t = sections[-1]["end"] + 0.5
    reveal_t = sec["reveal"]["start"]
    finish = max(reveal_t - 1.5, sec["tension"]["start"] + 3.0)  # the finished chart holds 1.5s before the reveal

    race = {"type": "linerace", "start": 0.0, "end": end_t, "mystery": hidden,
            "mysteryMode": payload["mystery"]["mode"], "revealAt": reveal_t}
    ms = payload["moments"]
    keys = [[0.3, 0.0]]
    if ms and len(calls) == len(ms):
        for s, m in zip(calls, ms):  # each callout lands exactly when its voice line starts
            if keys[-1][0] + 0.3 < s["start"] < finish - 0.3 and m["u"] > keys[-1][1]:
                keys.append([s["start"], m["u"]])
        race["callouts"] = [{"at": s["start"], "text": m["text"], "item": MYSTERY if m["item"] == hidden else m["item"]}
                            for s, m in zip(calls, ms)]
    keys.append([max(finish, keys[-1][0] + 0.3), 1.0])
    race["keys"] = keys

    return [
        race,
        {"type": "question", "start": 0.0, "end": sec["hook"]["end"] + 0.2},
        {"type": "question", "start": sec["twist"]["start"], "end": end_t},
    ]
