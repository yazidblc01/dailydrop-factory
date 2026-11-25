"""Explainers on any canvas (video/src/ed/Explain.tsx), the same engine as the map reels (engine/mapx.py).

Each topic builds a world of elements (paths, shapes, text, arrows, counters, a spinning group, a dot that travels a route)
and a story in beats: what's said, the headline, where the camera goes, what appears, pulses or leaves, and the stat card.
Facts come with their source on the card and in the description.

    python -m engine.explain --topic roulette            one test reel into media/explain__roulette/final.mp4
    python -m engine.explain --all                       every topic, one after the other
    add --novoice for captions only
"""
import argparse
import json
import math
import os
import random
import subprocess
import sys

import requests

from config import DATA_DIR, MEDIA_DIR, ROOT
from engine import mapx

VIDEO_DIR = ROOT / "video"
PUBLIC = VIDEO_DIR / "public"
HIST = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_{}.geojson"

NAVY = {"bg": "linear-gradient(#123049, #1B4664)", "accent": "#FFD23F", "fade": "#0B1C2B"}
PAPER = {"bg": "#EFE9DD", "accent": "#FFD23F", "fade": "#0B1C2B"}
FELT = {"bg": "radial-gradient(ellipse at 50% 45%, #1F7A4D, #0D3B25 75%)", "accent": "#FFD23F", "fade": "#06170E"}
SPACE = {"bg": "radial-gradient(ellipse at 50% 30%, #121a33, #05060c 70%)", "accent": "#FFD23F", "fade": "#05060c", "stars": True}
NIGHT = {"bg": "linear-gradient(#141821, #1E2430)", "accent": "#FFD23F", "fade": "#0B0D12"}


def T(id, x, y, text, size, **kw):
    return {"id": id, "type": "text", "x": x, "y": y, "text": text, "size": size, **kw}


def beat(say, head, cam, **kw):
    return {"say": say, "head": head, "cam": cam, **kw}


# ---------- history: Rome on a real map, borders by year ----------
def hist(year):
    f = mapx.CACHE / f"hist_{year}.geojson"
    if not f.exists():
        mapx.CACHE.mkdir(parents=True, exist_ok=True)
        r = requests.get(HIST.format(year), timeout=120)
        r.raise_for_status()
        f.write_bytes(r.content)
    return json.loads(f.read_text())["features"]


def rome():
    m = mapx.Map("+proj=lcc +lat_1=35 +lat_2=45 +lat_0=40 +lon_0=15", (-11, 24, 46, 56), (0, 560, 1080, 900), zoom=1.05)
    simp = 2500
    near = m.box.buffer(25)
    sea = [{"id": f"sea{i}", "type": "path", "d": m.d(mapx.union(mapx.ne(n), near=near), simp), "fill": c} for i, (n, c) in
           enumerate([("ne_10m_bathymetry_K_200", "#24526F"), ("ne_10m_bathymetry_J_1000", "#1E4763"), ("ne_10m_bathymetry_I_2000", "#193D57"),
                      ("ne_10m_bathymetry_H_3000", "#14334B")])]
    land = mapx.union(mapx.ne("ne_10m_admin_0_countries_lakes"), near=near)
    els = sea + [{"id": "land", "type": "path", "d": m.d(land, simp), "fill": "#F3ECDD", "stroke": "#5f5340", "sw": 1.4, "raised": True, "paper": True}]
    names = {"bc500": "Rome", "bc200": "Rome", "bc1": "Roman Empire", "100": "Roman Empire"}
    for y, nm in names.items():
        g = mapx.union(hist(y), lambda p, nm=nm: p.get("NAME") == nm)
        els.append({"id": f"r_{y}", "type": "path", "d": m.d(g, 1500), "fill": "#C8102E", "fillOpacity": 0.55, "stroke": "#8E0B21", "sw": 3, "anim": "wipe"})
    rx, ry = m.pt(12.5, 41.9)
    els += [{"id": "rome", "type": "circle", "cx": rx, "cy": ry, "r": 9, "fill": "#111", "stroke": "#fff", "sw": 3, "anim": "pop"},
            T("rome_l", rx + 16, ry - 14, "ROME", 22, anchor="start", fill="#111", track=3, halo="#F3ECDD", anim="pop", c=[rx, ry])]
    for y, lab in [("bc500", "500 BC"), ("bc200", "200 BC"), ("bc1", "YEAR 1"), ("100", "AD 117")]:
        els.append(T(f"y_{y}", 80, 1420, lab, 110, anchor="start", font="anton", fill="#fff", halo="rgba(11,28,43,0.85)", fixed=True))
    near_cam, mid, full = [rx, ry, 3.2], [rx + 60, ry + 40, 1.7], [540, 1010, 1.0]
    beats = [
        beat("This tiny city became one of the biggest empires in history.", ["HOW ", "ROME", " TOOK OVER THE MAP"], near_cam, show=["rome", "rome_l"]),
        beat("In 500 BC, Rome was one small city in Italy.", ["", "500 BC", ": ONE CITY"], near_cam, show=["r_bc500", "y_bc500"]),
        beat("By 200 BC, it ruled almost all of Italy and was fighting Carthage for the sea.", ["BY 200 BC: ", "ALL OF ITALY", ""], mid,
             show=["r_bc200", "y_bc200"], hide=["r_bc500", "y_bc500"]),
        beat("By the year 1, it circled the whole Mediterranean.", ["IT ", "CIRCLED", " THE SEA"], full, show=["r_bc1", "y_bc1"], hide=["r_bc200", "y_bc200"]),
        beat("At its peak in 117 AD, under Trajan, it covered about 5 million square kilometers.", ["THE ", "PEAK", ": AD 117"], full,
             show=["r_100", "y_100"], hide=["r_bc1", "y_bc1"], pulse=["r_100"], tilt=14,
             card={"big": "5M", "line": "km² at its peak, under Trajan", "src": "World History Encyclopedia"}),
        beat("About one in five people on Earth lived inside it.", ["", "1 IN 5", " PEOPLE ON EARTH"], full, tilt=14,
             card={"big": "21%", "line": "of the world's people lived inside it (estimate)", "src": "History Hit"}),
        beat("Which empire should we map next?", ["WHICH EMPIRE ", "NEXT", "?"], full, ask=True),
    ]
    meta = {"title": "How Rome took over the map 🏛️",
            "description": "From one city in 500 BC to about 5 million km² at its peak in 117 AD under Trajan, home to roughly 1 in 5 people on Earth (estimate).\n"
                           "Borders: historical-basemaps (aourednik). Map data: Natural Earth.\n#history #rome #maps",
            "pinned_comment": "Which empire should we map next? 👇"}
    return {"els": els, "base": [e["id"] for e in sea] + ["land"], "beats": beats, "theme": NAVY}, meta


# ---------- money: Costco, FY2025 (fiscal year ended Aug 31, 2025) ----------
def costco():
    sales, cogs, sga, fees = 269.9, 239.9, 25.0, 5.3          # $ billions, Costco FY2025 results
    left = sales - cogs - sga                                  # ≈ 5.1, from selling stuff
    X, Y0, H, Wd = 110, 640, 780, 340
    hc, hs = H * cogs / sales, H * sga / sales
    hp = max(H - hc - hs, 14)
    ink = "#1d1a22"
    els = [
        {"id": "bar", "type": "rect", "x": X, "y": Y0, "w": Wd, "h": H, "rx": 6, "fill": "#fff", "stroke": ink, "sw": 4},
        T("bar_l", X, Y0 - 30, "$270B OF SALES A YEAR", 58, anchor="start", font="anton", fill=ink),
        {"id": "cogs", "type": "rect", "x": X, "y": Y0 + H - hc, "w": Wd, "h": hc, "fill": "#9AA5B1", "stroke": ink, "sw": 4, "anim": "grow"},
        T("cogs_l", X + Wd + 36, Y0 + H - hc / 2, "89% THE STUFF", 56, anchor="start", font="anton", fill=ink),
        {"id": "sga", "type": "rect", "x": X, "y": Y0 + H - hc - hs, "w": Wd, "h": hs, "fill": "#5C6773", "stroke": ink, "sw": 4, "anim": "grow"},
        T("sga_l", X + Wd + 36, Y0 + hp + hs / 2 + 30, "9% STORES & STAFF", 46, anchor="start", font="anton", fill="#5C6773"),
        {"id": "prof", "type": "rect", "x": X - 6, "y": Y0 - 2, "w": Wd + 12, "h": hp + 4, "fill": "#FFD23F", "stroke": ink, "sw": 4, "anim": "grow", "glow": True},
        T("prof_l", X + Wd + 36, Y0 + 14, "1.9% LEFT: $5.1B", 46, anchor="start", font="anton", fill="#C8102E", halo="#EFE9DD"),
    ]
    # the two profit blocks side by side, drawn to scale
    s = 118
    bx, by = (1080 - (math.sqrt(left) + math.sqrt(fees)) * s - 160) / 2, 1230
    w1, w2 = math.sqrt(left) * s, math.sqrt(fees) * s
    els += [
        {"id": "pb1", "type": "rect", "x": bx, "y": by - w1, "w": w1, "h": w1, "rx": 8, "fill": "#FFD23F", "stroke": ink, "sw": 4, "anim": "pop", "c": [bx + w1 / 2, by - w1 / 2]},
        T("pb1_l", bx + w1 / 2, by + 50, "SELLING STUFF", 30, fill=ink), T("pb1_v", bx + w1 / 2, by - w1 / 2 + 22, "$5.1B", 58, font="anton", fill=ink),
        {"id": "pb2", "type": "rect", "x": bx + w1 + 160, "y": by - w2, "w": w2, "h": w2, "rx": 8, "fill": "#E0263C", "stroke": ink, "sw": 4, "anim": "pop",
         "c": [bx + w1 + 160 + w2 / 2, by - w2 / 2], "glow": True},
        T("pb2_l", bx + w1 + 160 + w2 / 2, by + 50, "MEMBERSHIP FEES", 30, fill=ink),
        T("pb2_v", bx + w1 + 160 + w2 / 2, by - w2 / 2 + 22, "$5.3B", 58, font="anton", fill="#fff"),
        T("plus", bx + w1 + 80, by - w1 / 2 + 22, "+", 90, font="anton", fill=ink),
        {"id": "card_e", "type": "emoji", "x": bx + w1 + 160 + w2 / 2, "y": by - w2 - 70, "text": "💳", "size": 90, "anim": "pop"},
    ]
    top, prof_cam, blocks = [540, 1020, 1.0], [X + Wd + 150, Y0 + 60, 1.7], [540, 1060, 1.0]
    beats = [
        beat("Costco sells about 270 billion dollars of stuff a year.", ["COSTCO SELLS ", "$270B", " A YEAR"], top, show=["bar", "bar_l"]),
        beat("Almost all of it goes to paying for the stuff itself.", ["", "89%", " PAYS FOR THE STUFF"], top, show=["cogs", "cogs_l"]),
        beat("Then the warehouses and the workers.", ["THEN THE ", "STORES & STAFF", ""], top, show=["sga", "sga_l"]),
        beat("What's left from selling is less than 2 cents per dollar.", ["LESS THAN ", "2¢", " PER DOLLAR"], prof_cam, show=["prof", "prof_l"], pulse=["prof"],
             card={"big": "1.9%", "line": "of sales is left after paying for goods, stores and staff", "src": "Costco FY2025 results"}),
        beat("Now look at membership fees: 5.3 billion dollars, and they cost almost nothing to collect.", ["NOW THE ", "MEMBERSHIP FEES", ""], blocks,
             show=["pb1", "pb1_l", "pb1_v", "plus", "pb2", "pb2_l", "pb2_v", "card_e"],
             hide=["bar", "bar_l", "cogs", "cogs_l", "sga", "sga_l", "prof", "prof_l"], stagger=0.15),
        beat("So about half of Costco's profit comes from the card in your wallet.", ["HALF THE PROFIT IS ", "THE CARD", ""], blocks, pulse=["pb2"],
             card={"big": "51%", "line": "of Costco's operating profit equals its membership fees", "src": "Costco FY2025 results"}),
        beat("Is your Costco card worth it?", ["IS YOUR CARD ", "WORTH IT", "?"], blocks, ask=True),
    ]
    meta = {"title": "Costco barely makes money selling you stuff 💳",
            "description": "Fiscal 2025: $269.9B of sales, $239.9B paid for the goods, $25.0B for stores and staff, about $5.1B left. Membership fees: $5.3B, "
                           "about 51% of the $10.4B operating profit, calculated.\nSource: Costco FY2025 results (Sept 25, 2025).\n#costco #money #business",
            "pinned_comment": "Is your Costco card worth it? 👇"}
    return {"els": els, "base": [], "beats": beats, "theme": PAPER}, meta


# ---------- casino math: American roulette ----------
def roulette():
    cx, cy, R = 540, 880, 300
    order = ["0", "28", "9", "26", "30", "11", "7", "20", "32", "17", "5", "22", "34", "15", "3", "24", "36", "13", "1", "00", "27", "10", "25", "29", "12",
             "8", "19", "31", "18", "6", "21", "33", "16", "4", "23", "35", "14", "2"]
    reds = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
    kids, n = [], len(order)
    for i, lab in enumerate(order):
        a0, a1 = (i / n) * 2 * math.pi - math.pi / 2, ((i + 1) / n) * 2 * math.pi - math.pi / 2
        col = "#1E8F4E" if lab in ("0", "00") else ("#C8102E" if int(lab) in reds else "#141414")
        p = lambda r, a: f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}"
        kids.append({"type": "path", "d": f"M{p(R * 0.62, a0)} L{p(R, a0)} A{R},{R} 0 0 1 {p(R, a1)} L{p(R * 0.62, a1)} A{R * 0.62},{R * 0.62} 0 0 0 {p(R * 0.62, a0)} Z",
                     "fill": col, "stroke": "#D4AF37", "sw": 2})
        am = (a0 + a1) / 2
        tx, ty = cx + R * 0.83 * math.cos(am), cy + R * 0.83 * math.sin(am)
        kids.append({"type": "text", "x": round(tx, 1), "y": round(ty + 8, 1), "text": lab, "size": 22, "fill": "#fff", "weight": 800})
    kids += [{"type": "circle", "cx": cx, "cy": cy, "r": R * 0.62, "fill": "#7A4A22", "stroke": "#D4AF37", "sw": 4},
             {"type": "circle", "cx": cx, "cy": cy, "r": R * 0.2, "fill": "#D4AF37"}]
    els = [{"id": "rim", "type": "circle", "cx": cx, "cy": cy, "r": R + 26, "fill": "#4A2C12", "stroke": "#D4AF37", "sw": 6},
           {"id": "wheel", "type": "group", "cx": cx, "cy": cy, "spin": 40, "children": kids},
           {"id": "ptr", "type": "path", "d": f"M{cx - 18},{cy - R - 50} L{cx + 18},{cy - R - 50} L{cx},{cy - R - 8} Z", "fill": "#FFD23F", "stroke": "#111", "sw": 3}]
    # green pockets highlight + labels
    for i, lab in enumerate(order):
        if lab in ("0", "00"):
            am = ((i + 0.5) / n) * 2 * math.pi - math.pi / 2
    els += [T("lab_rb", cx, cy + R + 90, "18 RED · 18 BLACK", 48, font="anton", fill="#fff", halo="rgba(0,0,0,0.6)"),
            T("lab_g", cx, cy + R + 150, "+ 2 GREEN: 0 AND 00", 48, font="anton", fill="#3BE37A", halo="rgba(0,0,0,0.6)")]
    # the odds bar: 38 slots, 18 win for red
    bx, by, bw, bh = 90, 1330, 900, 70
    for i in range(38):
        els.append({"id": f"s{i}", "type": "rect", "x": bx + i * bw / 38 + 1, "y": by, "w": bw / 38 - 2, "h": bh,
                    "fill": "#C8102E" if i < 18 else ("#1E8F4E" if i >= 36 else "#141414"), "stroke": "#D4AF37", "sw": 1, "anim": "pop",
                    "c": [bx + (i + 0.5) * bw / 38, by + bh / 2]})
    els += [T("odds_l", bx, by - 24, "BET RED: WIN 18 OF 38", 38, anchor="start", fill="#fff", halo="rgba(0,0,0,0.6)"),
            T("odds_r", bx + bw, by + bh + 52, "LOSE 20", 38, anchor="end", fill="#ff8a8a", halo="rgba(0,0,0,0.6)")]
    # one player: $10 a spin on red, 1,000 spins, from $1,000 (a fixed seed whose path ends near the average)
    best = None
    for seed in range(400):
        rnd = random.Random(seed)
        v, path = 1000, [1000]
        for _ in range(1000):
            v += 10 if rnd.random() < 18 / 38 else -10
            path.append(v)
        if abs(path[-1] - (1000 - 526)) < 40 and min(path) > 250 and max(path) < 1250:
            best = path
            break
    gx, gy, gw, gh = 110, 2150, 860, 520                    # the chart sits below the wheel; the camera pans down to it
    lo, hi = 200, 1300
    pt = lambda i, v: (gx + gw * i / 1000, gy + gh - gh * (v - lo) / (hi - lo))
    d = "M" + "L".join(f"{pt(i, v)[0]:.1f},{pt(i, v)[1]:.1f}" for i, v in enumerate(best) if i % 4 == 0)
    ex = f"M{pt(0, 1000)[0]:.1f},{pt(0, 1000)[1]:.1f} L{pt(1000, 474)[0]:.1f},{pt(1000, 474)[1]:.1f}"
    els += [{"id": "axis", "type": "path", "d": f"M{gx},{gy} L{gx},{gy + gh} L{gx + gw},{gy + gh}", "stroke": "rgba(255,255,255,0.7)", "sw": 3},
            {"id": "start_l", "type": "path", "d": f"M{gx},{pt(0, 1000)[1]:.1f} L{gx + gw},{pt(0, 1000)[1]:.1f}", "stroke": "rgba(255,255,255,0.35)", "sw": 2},
            T("start_t", gx + gw, pt(0, 1000)[1] - 14, "YOU START: $1,000", 28, anchor="end", fill="rgba(255,255,255,0.8)"),
            {"id": "exp", "type": "path", "d": ex, "stroke": "#FFD23F", "sw": 4, "anim": "draw", "dur": 3.0},
            {"id": "walk", "type": "path", "d": d, "stroke": "#fff", "sw": 4, "anim": "draw", "dur": 3.2},
            T("spins", gx + gw, gy + gh + 50, "1,000 SPINS →", 30, anchor="end", fill="rgba(255,255,255,0.8)")]
    top, chart = [540, 1000, 1.0], [540, 2390, 1.0]
    beats = [
        beat("Why does the casino always win at roulette?", ["WHY THE ", "CASINO", " ALWAYS WINS"], top, show=["rim", "wheel", "ptr"]),
        beat("An American wheel has 38 pockets: 18 red and 18 black.", ["", "38", " POCKETS"], top, show=["lab_rb"]),
        beat("Plus two green ones: zero and double zero.", ["THE TRICK: ", "2 GREEN", ""], top, show=["lab_g"], pulse=["lab_g"]),
        beat("Bet on red, and you win 18 times out of 38. But it pays like a coin flip.", ["IT PAYS LIKE A ", "COIN FLIP", ""], top,
             show=["odds_l"] + [f"s{i}" for i in range(38)] + ["odds_r"], hide=["lab_rb", "lab_g"], stagger=0.035),
        beat("That gap is the house edge: about 5 cents of every dollar you bet.", ["THE ", "HOUSE EDGE", ""], top,
             card={"big": "5.26%", "line": "of every bet the house keeps, on average", "src": "38-pocket wheel math"}),
        beat("Bet 10 dollars a spin for 1,000 spins, and on average you lose 526 dollars.", ["1,000 SPINS LATER", "", ""], chart,
             show=["axis", "start_l", "start_t", "exp", "walk", "spins"], stagger=0.1,
             card={"big": "$526", "line": "lost on average: $10,000 bet × 5.26%", "src": "expected value, calculated"}),
        beat("Ever beaten the house?", ["EVER BEATEN THE ", "HOUSE", "?"], chart, ask=True),
    ]
    meta = {"title": "Why the casino ALWAYS wins at roulette 🎰",
            "description": "An American wheel has 38 pockets: 18 red, 18 black, 2 green. A red bet wins 18/38 of the time but pays even money, "
                           "so the house keeps 5.26% of every bet on average. $10 × 1,000 spins = $10,000 bet, about $526 lost on average, calculated.\n"
                           "The line is one simulated player.\n#casino #math #roulette",
            "pinned_comment": "Ever beaten the house? 👇"}
    return {"els": els, "base": [], "beats": beats, "theme": FELT}, meta


# ---------- scale: every planet between Earth and the Moon ----------
def moon():
    # km: Moon at its farthest (apogee) ~405,500; diameters (NASA)
    D = 405500
    planets = [("MERCURY", 4879, "#9C8F86"), ("VENUS", 12104, "#E3C16F"), ("MARS", 6779, "#C1440E"), ("JUPITER", 139820, "#D8B48A"),
               ("SATURN", 116460, "#E6D3A0"), ("URANUS", 50724, "#9FD9E3"), ("NEPTUNE", 49244, "#4B70DD")]
    y0, y1 = 570, 1400                   # Earth's center, the Moon's center
    s = (y1 - y0) / D
    er, mr = 6371 * s, 1737 * s
    cx = 540
    els = [{"id": "earth", "type": "circle", "cx": cx, "cy": y0, "r": er, "fill": "#2E7BC4", "stroke": "#9FD3FF", "sw": 1.5, "glow": True},
           T("earth_l", cx, y0 + 9, "EARTH", 30, anchor="start", fill="#9FD3FF", track=3, ss=True, dx=30),
           {"id": "moonb", "type": "circle", "cx": cx, "cy": y1, "r": mr, "fill": "#C9C9C9", "stroke": "#fff", "sw": 1},
           T("moon_l", cx, y1 + 9, "MOON", 30, anchor="start", fill="#ddd", track=3, ss=True, dx=24),
           {"id": "dist", "type": "path", "d": f"M{cx - 190},{y0} L{cx - 190},{y1}", "stroke": "#FFD23F", "sw": 3, "anim": "draw", "dur": 1.6},
           {"id": "dist_n", "type": "counter", "x": cx - 210, "y": (y0 + y1) / 2, "from": 0, "to": 405500, "suffix": " km", "size": 54, "anchor": "end",
            "fill": "#FFD23F", "dur": 1.6}]
    y = y0 + er
    show = []
    for name, dkm, col in planets:
        r = dkm * s / 2
        cy = y + r
        els += [{"id": f"p_{name}", "type": "circle", "cx": cx, "cy": round(cy, 1), "r": round(r, 1), "fill": col, "stroke": "rgba(255,255,255,0.5)", "sw": 1,
                 "anim": "pop"},
                T(f"pl_{name}", cx + r, round(cy + 8, 1), name, 26, anchor="start", fill="#fff", track=2, anim="pop", c=[cx, cy], ss=True, dx=22)]
        show.append(name)
        y += dkm * s
    gap = D - 6371 - 1737 - sum(p[1] for p in planets)
    small, big1, big2 = ["MERCURY", "VENUS", "MARS"], ["JUPITER", "SATURN"], ["URANUS", "NEPTUNE"]
    ids = lambda ns: sum(([f"p_{n}", f"pl_{n}"] for n in ns), [])
    beats = [
        beat("How far away is the Moon, really?", ["HOW FAR IS THE ", "MOON", "?"], [cx, y0 + 90, 5.0], show=["earth", "earth_l"]),
        beat("At its farthest, about 405,000 kilometers. Far enough for something wild.", ["", "405,000 KM", " AWAY"], [cx, 1010, 1.0],
             show=["moonb", "moon_l", "dist", "dist_n"]),
        beat("You can fit every planet in the solar system in that gap. Mercury, Venus, Mars.", ["FIT EVERY ", "PLANET", " IN THE GAP"], [cx, 640, 3.4],
             show=ids(small), stagger=0.3),
        beat("Jupiter. Saturn.", ["", "JUPITER", " + SATURN"], [cx, 900, 1.15], show=ids(big1), stagger=0.5, hide=[f"pl_{n}" for n in small]),
        beat("Uranus and Neptune. And there's still room left over.", ["", "STILL ROOM", " LEFT"], [cx, 1010, 1.0], show=ids(big2), stagger=0.5,
             card={"big": "380,010", "line": "km: the 7 planets' widths, added up", "src": "NASA planet diameters"}),
        beat(f"About {round(gap / 1000)},000 kilometers to spare.", ["ROOM TO SPARE: ", f"{round(gap / 1000)},000 KM", ""], [cx, 1010, 1.0],
             card={"big": f"{round(gap, -3):,.0f}", "line": "km to spare, with the Moon at its farthest", "src": "calculated"}),
        beat("Did you think it was that far?", ["DID YOU KNOW IT'S ", "THAT FAR", "?"], [cx, 1010, 1.0], ask=True),
    ]
    meta = {"title": "Every planet fits between Earth and the Moon 🌕",
            "description": f"With the Moon at its farthest (about 405,500 km), the 7 other planets side by side (380,010 km of diameters) fit in the gap "
                           f"with about {round(gap, -3):,.0f} km to spare, calculated.\nSources: NASA planet fact sheets.\n#space #moon #planets",
            "pinned_comment": "Did you think it was that far? 👇"}
    return {"els": els, "base": [], "beats": beats, "theme": SPACE}, meta


# ---------- how it works: tapping a card ----------
def cardtap():
    ink = "#1d1a22"
    nodes = [("n0", "💳", "YOUR CARD", 650), ("n1", "📟", "THE TERMINAL", 860), ("n2", "🏦", "THE STORE'S BANK", 1070), ("n3", "🌐", "VISA / MASTERCARD", 1280),
             ("n4", "🏛️", "YOUR BANK", 1490)]
    x = 330
    els = []
    for id, emo, lab, y in nodes:
        els += [{"id": id, "type": "group", "cx": x, "cy": y, "anim": "pop", "c": [x, y], "children": [
            {"type": "circle", "cx": x, "cy": y, "r": 70, "fill": "#fff", "stroke": ink, "sw": 5},
            {"type": "emoji", "x": x, "y": y + 4, "text": emo, "size": 70},
            {"type": "text", "x": x + 110, "y": y + 14, "text": lab, "size": 40, "fill": ink, "anchor": "start", "font": "anton"}]}]
    for i in range(4):
        y_a, y_b = nodes[i][3] + 78, nodes[i + 1][3] - 78
        els.append({"id": f"a{i}", "type": "arrow", "d": f"M{x},{y_a} L{x},{y_b}", "stroke": ink, "sw": 7, "head": "k"})
    back = f"M{x + 80},{nodes[4][3] - 30} C{x + 560},{nodes[4][3] - 160} {x + 600},{nodes[0][3] + 300} {x + 330},{nodes[0][3] + 160}"
    route = [[x, 650], [x, 860], [x, 1070], [x, 1280], [x, 1490]]
    els += [{"id": "back", "type": "arrow", "d": back, "stroke": "#1E9E55", "sw": 9, "head": "a", "dur": 1.4},
            {"id": "ok", "type": "group", "cx": 815, "cy": 760, "anim": "pop", "c": [815, 760], "children": [
                {"type": "rect", "x": 650, "y": 710, "w": 330, "h": 100, "rx": 50, "fill": "#1E9E55", "stroke": ink, "sw": 5},
                {"type": "text", "x": 815, "y": 777, "text": "APPROVED ✓", "size": 46, "fill": "#fff", "font": "anton"}]},
            {"id": "dot", "type": "mover", "pts": route, "r": 16, "fill": "#E0263C", "dur": 11},
            {"id": "clock", "type": "counter", "fixed": True, "x": 1000, "y": 640, "from": 0, "to": 2.0, "dec": 1, "comma": False, "suffix": "s", "size": 90, "fill": ink,
             "anchor": "end", "dur": 30}]
    full = [540, 1080, 1.0]
    beats = [
        beat("What happens in the 2 seconds after you tap your card?", ["WHAT HAPPENS IN ", "2 SECONDS", "?"], [x + 200, 700, 1.6], show=["n0", "clock"]),
        beat("The terminal reads a one-time code from your card's chip.", ["A ", "ONE-TIME CODE", ""], [x + 200, 780, 1.4], show=["n1", "a0", "dot"]),
        beat("It sends it to the store's bank.", ["TO THE ", "STORE'S BANK", ""], [x + 200, 960, 1.3], show=["a1", "n2"]),
        beat("Which passes it to the card network, like Visa or Mastercard.", ["THEN THE ", "CARD NETWORK", ""], [x + 200, 1170, 1.3], show=["a2", "n3"]),
        beat("The network asks your bank: is there enough money, and is this fraud?", ["YOUR BANK ", "CHECKS", ""], [x + 200, 1380, 1.3], show=["a3", "n4"]),
        beat("Your bank says yes, and the answer races all the way back.", ["", "APPROVED", ""], full, show=["back", "ok"], pulse=["ok"]),
        beat("The money itself moves later, usually within a day or two.", ["THE MONEY MOVES ", "LATER", ""], full,
             card={"big": "2s", "line": "for the approval. The money settles later.", "src": "how card payments work"}),
        beat("Tap or chip?", ["TAP OR ", "CHIP", "?"], full, ask=True),
    ]
    meta = {"title": "What happens in the 2 seconds after you tap your card 💳",
            "description": "Your card makes a one-time code, the terminal sends it to the store's bank, the card network routes it to your bank, "
                           "your bank checks the money and fraud and says yes. The money itself settles later.\n#money #howitworks #tech",
            "pinned_comment": "Tap or chip? 👇"}
    return {"els": els, "base": [], "beats": beats, "theme": PAPER}, meta


# ---------- anatomy: where your food goes ----------
def digestion():
    ink, skin, organ = "#3a2a22", "#F4D3BC", "#E86A6A"
    body = ("M540,560 C610,560 650,610 650,680 C650,735 625,770 600,790 L600,830 C700,845 790,880 820,960 L860,1250 C870,1300 820,1310 810,1260 "
            "L780,1030 L770,1450 C770,1480 760,1500 740,1500 L340,1500 C320,1500 310,1480 310,1450 L300,1030 L270,1260 C260,1310 210,1300 220,1250 "
            "L260,960 C290,880 380,845 480,830 L480,790 C455,770 430,735 430,680 C430,610 470,560 540,560 Z")
    eso = "M540,760 C540,820 545,880 560,960"
    stomach = "M560,960 C640,940 720,980 700,1050 C685,1110 610,1120 570,1090 C540,1070 520,1040 560,960 Z"
    small = ("M600,1100 C520,1130 470,1150 480,1180 C495,1215 610,1200 620,1230 C630,1265 470,1250 470,1290 C470,1330 620,1300 625,1340 "
             "C630,1380 480,1360 490,1395 C500,1425 600,1410 600,1430")
    large = "M600,1430 C650,1440 690,1420 690,1380 L690,1150 C690,1120 660,1110 620,1115 L460,1120 C420,1120 400,1140 400,1170 L400,1420 C400,1450 430,1470 470,1460"
    route = [[540, 760], [545, 880], [560, 960], [640, 1000], [620, 1080], [600, 1100], [480, 1180], [620, 1230], [470, 1290], [625, 1340], [490, 1395], [600, 1430]]
    els = [{"id": "body", "type": "path", "d": body, "fill": skin, "stroke": ink, "sw": 5, "raised": True, "edge": "#C9A68E"},
           {"id": "eso", "type": "path", "d": eso, "stroke": organ, "sw": 22, "anim": "draw"},
           {"id": "stom", "type": "path", "d": stomach, "fill": organ, "stroke": ink, "sw": 4, "anim": "pop", "c": [625, 1030]},
           T("stom_l", 720, 1000, "STOMACH", 34, anchor="start", fill=ink, font="anton", halo="#F4D3BC"),
           {"id": "small", "type": "path", "d": small, "stroke": "#F29A7A", "sw": 26, "anim": "draw", "dur": 1.6},
           T("small_l", 548, 1272, "SMALL INTESTINE", 32, fill=ink, font="anton", halo="#F4D3BC"),
           {"id": "large", "type": "path", "d": large, "stroke": "#B5523B", "sw": 34, "anim": "draw", "dur": 1.6, "opacity": 0.9},
           T("large_l", 548, 1492, "LARGE INTESTINE", 32, fill=ink, font="anton", halo="#F4D3BC"),
           {"id": "food", "type": "mover", "pts": route, "r": 14, "fill": "#FFD23F", "dur": 7.0}]
    beats = [
        beat("Where does your food go after you swallow it?", ["WHERE YOUR ", "FOOD", " GOES"], [540, 1000, 1.05], show=["body"]),
        beat("First it slides down a tube into your stomach, which churns it into mush.", ["", "THE STOMACH", " CHURNS IT"], [600, 960, 1.6],
             show=["eso", "stom", "stom_l", "food"], pulse=["stom"]),
        beat("Then your small intestine pulls out the nutrients your body uses.", ["THE ", "NUTRIENTS", " COME OUT"], [560, 1240, 1.5], show=["small", "small_l"]),
        beat("Those two steps take about 6 hours.", ["ABOUT ", "6 HOURS", ""], [560, 1180, 1.3],
             card={"big": "6h", "line": "through the stomach and small intestine, on average", "src": "Mayo Clinic"}),
        beat("Then the large intestine soaks the water back up, and that can take up to 2 days.", ["UP TO ", "2 DAYS", " MORE"], [540, 1250, 1.3],
             show=["large", "large_l"], card={"big": "48h", "line": "up to this long in the large intestine", "src": "Mayo Clinic"}),
        beat("Did you know it takes that long?", ["DID YOU KNOW IT ", "TAKES THAT LONG", "?"], [540, 1050, 1.0], ask=True),
    ]
    meta = {"title": "Where your food actually goes (and how long it takes) 🍔",
            "description": "About 6 hours through the stomach and small intestine, then up to 36 to 48 hours in the large intestine. Times vary by person "
                           "and by meal.\nSource: Mayo Clinic.\n#body #science #health",
            "pinned_comment": "Did you know it takes that long? 👇"}
    return {"els": els, "base": [], "beats": beats, "theme": PAPER}, meta


# ---------- philosophy: the prisoner's dilemma ----------
def prisoners():
    gx, gy, cw, ch = 300, 760, 340, 300
    els = [T("you", 140, gy + ch * 0.5 + 10, "YOU", 40, font="anton", fill="#FFD23F"),
           T("they", gx + cw, gy - 70, "YOUR PARTNER", 40, font="anton", fill="#7FD3FF"),
           T("c_q", gx + cw * 0.5, gy - 20, "STAYS QUIET", 28, fill="#ccc"), T("c_b", gx + cw * 1.5, gy - 20, "BETRAYS", 28, fill="#ccc"),
           T("r_q", gx - 20, gy + ch * 0.5 + 10, "QUIET", 28, anchor="end", fill="#ccc"), T("r_b", gx - 20, gy + ch * 1.5 + 10, "BETRAY", 28, anchor="end", fill="#ccc")]
    cells = {"qq": (0, 0, "1 YR", "1 YR"), "qb": (1, 0, "10 YRS", "FREE"), "bq": (0, 1, "FREE", "10 YRS"), "bb": (1, 1, "5 YRS", "5 YRS")}
    for k, (cxi, cyi, you, them) in cells.items():
        x, y = gx + cxi * cw, gy + cyi * ch
        els.append({"id": f"cell_{k}", "type": "group", "cx": x + cw / 2, "cy": y + ch / 2, "anim": "pop", "c": [x + cw / 2, y + ch / 2], "children": [
            {"type": "rect", "x": x + 8, "y": y + 8, "w": cw - 16, "h": ch - 16, "rx": 18, "fill": "#232a38", "stroke": "#59637a", "sw": 3},
            {"type": "text", "x": x + cw / 2, "y": y + 120, "text": f"YOU: {you}", "size": 44, "font": "anton", "fill": "#FFD23F"},
            {"type": "text", "x": x + cw / 2, "y": y + 190, "text": f"THEM: {them}", "size": 36, "font": "anton", "fill": "#7FD3FF"}]})
        els.append({"id": f"hl_{k}", "type": "rect", "x": x + 4, "y": y + 4, "w": cw - 8, "h": ch - 8, "rx": 20, "stroke": "#FFD23F", "sw": 7, "glow": True})
    els += [{"id": "rooms", "type": "group", "cx": 540, "cy": 1000, "anim": "pop", "c": [540, 1000], "children": [
                {"type": "rect", "x": 150, "y": 780, "w": 340, "h": 440, "rx": 20, "fill": "#232a38", "stroke": "#59637a", "sw": 4},
                {"type": "rect", "x": 590, "y": 780, "w": 340, "h": 440, "rx": 20, "fill": "#232a38", "stroke": "#59637a", "sw": 4},
                {"type": "emoji", "x": 320, "y": 980, "text": "🧍", "size": 170}, {"type": "emoji", "x": 760, "y": 980, "text": "🧍‍♂️", "size": 170},
                {"type": "text", "x": 320, "y": 1170, "text": "YOU", "size": 44, "font": "anton", "fill": "#FFD23F"},
                {"type": "text", "x": 760, "y": 1170, "text": "PARTNER", "size": 44, "font": "anton", "fill": "#7FD3FF"}]},
            {"id": "arr1", "type": "arrow", "d": f"M{gx - 40},{gy + ch * 0.25} C{gx - 120},{gy + ch * 0.9} {gx - 120},{gy + ch * 1.1} {gx - 40},{gy + ch * 1.6}",
             "stroke": "#FFD23F", "sw": 7, "head": "a"}]
    grid = ["you", "they", "c_q", "c_b", "r_q", "r_b"]
    cam = [540, 1060, 1.0]
    beats = [
        beat("Two suspects, in separate rooms. Each one gets the same deal.", ["THE ", "PRISONER'S", " DILEMMA"], cam, show=["rooms"]),
        beat("If you both stay quiet, you each get 1 year.", ["BOTH QUIET: ", "1 YEAR", " EACH"], cam, show=grid + ["cell_qq", "hl_qq"], hide=["rooms"], stagger=0.06),
        beat("If you betray your partner and they stay quiet, you walk free. They get 10.", ["BETRAY: ", "YOU WALK", ""], cam, show=["cell_bq", "cell_qb", "hl_bq"],
             hide=["hl_qq"]),
        beat("If you both betray, you both get 5.", ["BOTH BETRAY: ", "5 YEARS", ""], cam, show=["cell_bb", "hl_bb"], hide=["hl_bq"]),
        beat("Here's the trap: whatever they do, betraying is better for you.", ["THE ", "TRAP", ""], cam, show=["arr1"], pulse=["cell_bq", "cell_bb"]),
        beat("So two smart people both betray, and get 5 years instead of 1.", ["SMART CHOICES, ", "WORSE RESULT", ""], cam, pulse=["hl_bb"],
             card={"big": "5 YRS", "line": "each, when staying quiet would have meant 1", "src": "game theory (Flood & Dresher, 1950)"}),
        beat("Would you stay quiet?", ["WOULD YOU STAY ", "QUIET", "?"], cam, ask=True),
    ]
    meta = {"title": "The prisoner's dilemma in 30 seconds 🧠",
            "description": "Both quiet: 1 year each. One betrays: they walk, the other gets 10. Both betray: 5 each. Betraying is better for each person "
                           "whatever the other does, so both betray and end up worse off.\n#philosophy #gametheory #psychology",
            "pinned_comment": "Would you stay quiet? 👇"}
    return {"els": els, "base": [], "beats": beats, "theme": NIGHT}, meta


TOPICS = {"rome": rome, "costco": costco, "roulette": roulette, "moon": moon, "cardtap": cardtap, "digestion": digestion, "prisoners": prisoners}


# ---------- the daily 7:13 PM slot: the next explainer nobody has posted yet ----------
STATE = DATA_DIR / "explain.json"
START = "2026-12-05"       # the first 7 explainers were scheduled by hand through Dec 4


def queue():
    from engine import mapx as mx
    return [f"map__{k}" for k in mx.TOPICS] + [f"explain__{k}" for k in TOPICS]


def next_queued(dry=False, today=None):
    from datetime import date
    from engine.texts import warn
    today = today or date.today()
    if today.isoformat() < START:
        print(f"      explainer slot starts {START}, nothing to do")
        return None, None
    st = json.loads(STATE.read_text()) if STATE.exists() else {"done": []}
    left = [n for n in queue() if n not in st["done"]]
    if not left:
        warn("📭 No explainer left in the queue, nothing posted at 7:13 PM. Ask Claude for the next batch.")
        return None, None
    name = left[0]
    kind, topic = name.split("__", 1)
    if kind == "map":
        name, final = mapx.make(topic, True, dry)
    else:
        name, final = make(topic, True, dry)
    if not dry:
        st["done"].append(name)
        STATE.write_text(json.dumps(st, indent=2))
        if len(left) <= 3:
            warn(f"🗺️ Only {len(left) - 1} explainers left in the queue. Ask Claude for the next batch.")
    return name, final


def make(topic, use_voice=True, dry=False):
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    props, meta = TOPICS[topic]()
    name = f"explain__{topic}"
    out = MEDIA_DIR / name
    out.mkdir(parents=True, exist_ok=True)
    starts = total = None
    props["voice"] = None
    if use_voice and os.environ.get("ELEVENLABS_API_KEY"):
        try:
            starts, total, props["voice"] = mapx.voice_take(props["beats"], out, name)
        except Exception as e:
            print(f"      voice failed ({e}), captions only")
            starts = total = None
    end = mapx.timeline(props["beats"], starts, total)
    props["outroAt"] = round(end, 2)
    props["duration"] = round(end + 1.6, 2)
    music = sorted((PUBLIC / "music").glob("*.mp3")) if (PUBLIC / "music").exists() else []
    props["music"] = f"music/{music[sum(map(ord, topic)) % len(music)].name}" if music else None
    (out / "props.json").write_text(json.dumps(props, ensure_ascii=False))
    final = out / "final.mp4"
    (out / "upload.json").write_text(json.dumps({"topic": name, **meta, "file": str(final)}, indent=2, ensure_ascii=False))
    print(f"      {name}: {meta['title']} ({props['duration']}s)")
    if dry:
        return name, None
    gl = "angle" if sys.platform == "darwin" else "swangle"
    subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdExplain", str(final), f"--props={out / 'props.json'}",
                    "--codec=h264", "--crf=18", f"--gl={gl}"], cwd=VIDEO_DIR, check=True)
    return name, final


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", choices=list(TOPICS))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--novoice", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    for tp in (TOPICS if a.all else [a.topic or "roulette"]):
        print(make(tp, not a.novoice, a.dry))
