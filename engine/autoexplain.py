"""Automatic explainers (the 7:13 PM slot once the hand-made queue is empty), on a hard budget of $0.30 a reel.

Quality comes from a library of hand-built visual pieces ("canvases"); Claude only writes the story and fills the data:
    map        any country or region: real coastlines, sea depth, shaded areas (provinces, countries, circles, border bands), cities, pins
    history    one empire or country through the years, real historical borders (historical-basemaps)
    breakdown  where the money goes: a stacked bar of shares, a highlighted slice
    versus     2 to 4 amounts as squares drawn to scale
    odds       a game of chance: an optional wheel, the win/lose bar, 1,000 simulated tries (the math is computed here, not by Claude)
    stack      things lined up inside a distance (planets between Earth and the Moon): drawn to scale, the fit computed here
    flow       a chain of steps with a dot traveling it, and an optional answer coming back
    grid       a 2x2 of choices (dilemmas, payoffs)

The day: 1) Sonnet writes one spec (topic, story beats, data, facts) from a cached design guide; 2) Haiku checks every fact with
web search; a wrong fact gets one rewrite, else the topic is dropped; 3) render; 4) Haiku looks at one frame per beat and scores it;
under 7 gets one fix and one re-check; 5) post. Every call's cost is counted; past $0.30 it stops and posts nothing.

    python -m engine.autoexplain --test map           build the example spec for one canvas and render it (no Claude, no cost)
    python -m engine.autoexplain                      a real one: write, check, render (no post)
"""
import argparse
import base64
import warnings
import json
import math
import os
import random
import re
import subprocess
import sys
from datetime import date

from config import CLAUDE_FAST, CLAUDE_MODEL, DATA_DIR, MEDIA_DIR, ROOT
from engine import explain, mapx

warnings.filterwarnings("ignore", category=DeprecationWarning)
VIDEO_DIR = ROOT / "video"
PUBLIC = VIDEO_DIR / "public"
STATE = DATA_DIR / "explain.json"
BUDGET = 0.30
# $ per million tokens (Claude pricing page, Nov 2026); Haiku kept at the older, higher price to stay on the safe side
PRICES = {CLAUDE_MODEL: {"in": 2.0, "out": 10.0, "cache_read": 0.20, "cache_write": 2.50},
          CLAUDE_FAST: {"in": 1.0, "out": 5.0, "cache_read": 0.10, "cache_write": 1.25}}
SEARCH = 0.01
CANVASES = ["map", "breakdown", "odds", "history", "stack", "versus", "flow", "grid"]
THEMES = {"navy": explain.NAVY, "paper": explain.PAPER, "felt": explain.FELT, "space": explain.SPACE, "night": explain.NIGHT}
INK = "#1d1a22"
PALETTE = ["#FFD23F", "#E0263C", "#2E86DE", "#1E9E55", "#9B59B6", "#F39C12"]


class Budget(Exception):
    pass


class Meter:
    def __init__(self):
        self.spent = 0.0
        self.lines = []

    def add(self, model, usage, label):
        p = PRICES.get(model, PRICES[CLAUDE_MODEL])
        u = usage
        cost = ((getattr(u, "input_tokens", 0) or 0) * p["in"] + (getattr(u, "output_tokens", 0) or 0) * p["out"]
                + (getattr(u, "cache_read_input_tokens", 0) or 0) * p["cache_read"]
                + (getattr(u, "cache_creation_input_tokens", 0) or 0) * p["cache_write"]) / 1e6
        st = getattr(u, "server_tool_use", None)
        cost += (getattr(st, "web_search_requests", 0) or 0) * SEARCH if st else 0
        self.spent += cost
        self.lines.append(f"{label}: ${cost:.3f}")
        print(f"      {label}: ${cost:.3f} (total ${self.spent:.3f})")
        if self.spent > BUDGET:
            raise Budget(f"over ${BUDGET:.2f} (${self.spent:.3f})")

    def room(self, need):
        if self.spent + need > BUDGET:
            raise Budget(f"not enough budget left for the next step (${self.spent:.3f} spent)")


# ======================================================================
# the canvases: data in, elements (+ named groups and camera spots) out
# ======================================================================
class Canvas:
    def __init__(self):
        self.els, self.groups, self.spots, self.base, self.placeholders = [], {}, {"all": [540, 1010, 1.0]}, [], {}

    def add(self, group, *els):
        for e in els:
            self.els.append(e)
            self.groups.setdefault(group, []).append(e["id"])

    def spot(self, name, x0, y0, x1, y1, zmax=3.2):
        w, h = max(x1 - x0, 40), max(y1 - y0, 40)
        z = max(1.0, min(760 / w, 640 / h, zmax))
        self.spots[name] = [round((x0 + x1) / 2, 1), round((y0 + y1) / 2 + 40 / z, 1), round(z, 2)]


def T(id, x, y, text, size, **kw):
    return {"id": id, "type": "text", "x": round(x, 1), "y": round(y, 1), "text": text, "size": size, **kw}


ZOOMS = [1.0, 1.4, 2.0, 2.8, 4.0]


class Labels:
    """Screen-size labels that never pile up: each one, by priority, takes the first side (right, then left) and the lowest zoom
    at which it clears every label already placed. A label that only fits zoomed in shows only zoomed in (minz)."""
    def __init__(self):
        self.placed = []                                     # (sx, sy) world anchor, screen box offsets (x0, y0, x1, y1), minz

    @staticmethod
    def box(text, size, track, side, off, center=False):
        w = len(text) * (size * 0.62 + track) + 8
        h = size * 1.15
        if center:
            return (-w / 2, -h * 0.8, w / 2, h * 0.35)
        return (off, -h * 0.8, off + w, h * 0.35) if side == "right" else (-off - w, -h * 0.8, -off, h * 0.35)

    def free(self, x, y, b, z):
        for (px, py, pb, pz) in self.placed:
            if pz > z:
                continue
            ax0, ay0, ax1, ay1 = x * z + b[0], y * z + b[1], x * z + b[2], y * z + b[3]
            bx0, by0, bx1, by1 = px * z + pb[0], py * z + pb[1], px * z + pb[2], py * z + pb[3]
            if ax0 < bx1 + 6 and bx0 < ax1 + 6 and ay0 < by1 + 4 and by0 < ay1 + 4:
                return False
        return True

    def place(self, x, y, text, size, track, off, center=False):
        for z in ZOOMS:
            for side in (["center"] if center else ["right", "left"]):
                b = self.box(text, size, track, side, off, center)
                if self.free(x, y, b, z):
                    self.placed.append((x, y, b, z))
                    return side, z
        return None, None

    def block(self, x, y, r):
        """A dot is an obstacle too (at every zoom its size grows, so block its zoom-1 size)."""
        self.placed.append((x, y, (-r, -r, r, r), 1.0))


def _proj_map(bbox, zoom=0.95):
    w, s, e, n = bbox
    if s < 20 and n > -20:                                   # near the equator: Mercator (a conic breaks across it)
        return mapx.Map(f"+proj=merc +lon_0={(w + e) / 2}", bbox, (0, 560, 1080, 900), zoom=zoom)
    lat1, lat2 = s + (n - s) * 0.25, n - (n - s) * 0.25
    return mapx.Map(f"+proj=lcc +lat_1={lat1} +lat_2={lat2} +lat_0={(s + n) / 2} +lon_0={(w + e) / 2}", bbox, (0, 560, 1080, 900), zoom=zoom)


def _sea_land(c, m, simp):
    near = m.box.buffer(25)
    for i, (n, col) in enumerate([("ne_10m_bathymetry_K_200", "#24526F"), ("ne_10m_bathymetry_J_1000", "#1E4763"),
                                  ("ne_10m_bathymetry_I_2000", "#193D57"), ("ne_10m_bathymetry_H_3000", "#14334B")]):
        c.add("sea", {"id": f"sea{i}", "type": "path", "d": m.d(mapx.union(mapx.ne(n), near=near), simp), "fill": col})
    countries = mapx.ne("ne_10m_admin_0_countries_lakes")
    land = mapx.union(countries, near=near)
    c.add("land", {"id": "land", "type": "path", "d": m.d(land, simp), "fill": "#E7DFCF", "stroke": "#5f5340", "sw": 1.2, "raised": True, "paper": True})
    c.base += c.groups["sea"] + ["land"]
    return countries, near


def _pixel_bounds(m, g):
    gp = m.project(g)
    x0, y0, x1, y1 = gp.bounds
    a, b = m.px(x0, y1), m.px(x1, y0)
    return a[0], a[1], b[0], b[1]


def canvas_map(d):
    from shapely.geometry import Point
    from shapely.ops import unary_union
    c = Canvas()
    countries = mapx.ne("ne_10m_admin_0_countries_lakes")
    focus = mapx.union(countries, lambda p: p.get("ADM0_A3") == d["focus"])
    if focus.is_empty:
        raise ValueError(f"unknown country code {d['focus']}")
    if d.get("bbox"):
        bbox = d["bbox"]
    else:
        x0, y0, x1, y1 = focus.bounds
        px, py = (x1 - x0) * 0.12 + 0.5, (y1 - y0) * 0.12 + 0.5
        bbox = [x0 - px, y0 - py, x1 + px, y1 + py]
    m = _proj_map(bbox)
    simp = max(150, 1500 * (bbox[2] - bbox[0]) / 90)
    _sea_land(c, m, simp)
    c.add("focusland", {"id": "focusland", "type": "path", "d": m.d(focus, simp), "fill": "#FFF8EA", "stroke": "#3b3326", "sw": 2})
    c.base.append("focusland")
    lakes = mapx.union(mapx.ne("ne_10m_lakes"), lambda p: (p.get("scalerank") or 9) <= 4, near=m.box.buffer(5))
    if not lakes.is_empty:
        c.add("lakes", {"id": "lakes", "type": "path", "d": m.d(lakes, simp), "fill": "#3C7395"})
        c.base.append("lakes")
    c.spot("all", *_pixel_bounds(m, focus), zmax=1.0)
    c.spots["all"] = [540, 1010, 1.0]
    area_labels = []
    for i, a in enumerate(d.get("areas", [])):
        k = a["kind"]
        if k == "admin1":
            g = mapx.union(mapx.ne("ne_10m_admin_1_states_provinces_lakes"),
                           lambda p: p.get("adm0_a3") == d["focus"] and (p.get("name") or "").lower() == a["name"].lower())
        elif k == "country":
            g = mapx.union(countries, lambda p: p.get("ADM0_A3") == a["iso3"])
        elif k == "circle":
            pt = m.T(m.tf.transform, Point(a["lon"], a["lat"])).buffer(a["km"] * 1000)
            g = None
            gp = pt.intersection(m.T(m.tf.transform, focus)) if a.get("clip", True) else pt
        elif k == "band":
            other = mapx.union(countries, lambda p: p.get("ADM0_A3") == a["from"])
            if other.geom_type == "MultiPolygon" and a.get("main_only", True):
                other = max(other.geoms, key=lambda q: q.area)
            g = None
            gp = m.T(m.tf.transform, focus).intersection(m.T(m.tf.transform, other).buffer(a["km"] * 1000))
        else:
            raise ValueError(f"unknown area kind {k}")
        if g is not None:
            if g.is_empty:
                raise ValueError(f"area not found: {a}")
            gp = m.project(g, simp / 2)
        gp = gp.simplify(simp / 2)
        col = a.get("color", "accent")
        el = {"id": f"area_{a['id']}", "type": "path", "d": m.d(gp, projected=True), "anim": "wipe", "sw": 3, "glow": True}
        el.update({"hatch": True, "stroke": "#FFD23F"} if col == "accent" else {"fill": col, "fillOpacity": 0.6, "stroke": col})
        c.add(f"area:{a['id']}", el)
        x0, y0, x1, y1 = gp.bounds
        p0, p1 = m.px(x0, y1), m.px(x1, y0)
        c.spot(f"area:{a['id']}", p0[0], p0[1], p1[0], p1[1])
        if a.get("label"):
            rp = gp.representative_point()
            lx, ly = m.px(rp.x, rp.y)
            area_labels.append((a, lx, ly))
    L = Labels()
    places = [f for f in mapx.ne("ne_10m_populated_places_simple") if f["properties"].get("adm0_a3") == d["focus"]]
    places.sort(key=lambda f: -f["properties"].get("pop_max", 0))
    top = places[: d.get("cities", 12)]
    big = top[0]["properties"]["pop_max"] if top else 1
    dots = [(f, *m.pt(*f["geometry"]["coordinates"]), 5 + (f["properties"]["pop_max"] / big) ** 0.5 * 20) for f in top]
    # labels by priority: pins (they sit over everything), then area labels, then the biggest cities
    pin_names = {p["name"].upper() for p in d.get("pins", [])}
    for p in d.get("pins", []):
        x, y = m.pt(p["lon"], p["lat"])
        L.block(x, y, 14)
        side, z = L.place(x, y, p["name"].upper(), 28, 2, 22)
        lab = T(f"pinl_{p['id']}", x, y, p["name"].upper(), 28, anchor="end" if side == "left" else "start", fill="#fff", halo="rgba(0,0,0,0.75)",
                ss=True, dx=-22 if side == "left" else 22, dy=10, track=2, anim="pop", c=[x, y], **({"minz": z} if z and z > 1 else {}))
        c.add(f"pin:{p['id']}", {"id": f"pin_{p['id']}", "type": "circle", "cx": x, "cy": y, "r": 12, "fill": "#111", "stroke": "#FFD23F", "sw": 4, "anim": "pop"},
              *([lab] if side else []))
        c.spot(f"pin:{p['id']}", x - 220, y - 170, x + 220, y + 170)
    for f, x, y, r in dots:
        L.block(x, y, r)
    for a, lx, ly in area_labels:
        side, z = L.place(lx, ly, a["label"].upper(), 26, 2, 0, center=True)
        if side:
            c.add(f"area:{a['id']}", T(f"areal_{a['id']}", lx, ly, a["label"].upper(), 26, fill="#fff", halo="rgba(11,28,43,0.85)", ss=True, track=2,
                                       **({"minz": z} if z > 1 else {})))
    for i, (f, x, y, r) in enumerate(dots):
        c.add("cities", {"id": f"city{i}", "type": "circle", "cx": x, "cy": y, "r": round(r, 1), "fill": "#FF4F5E", "stroke": "#fff", "sw": 3, "anim": "pop", "ss": True})
        name = f["properties"]["name"].upper()
        if i < d.get("city_labels", 6) and name not in pin_names:          # a pinned city keeps only its pin label
            side, z = L.place(x, y, name, 22, 2, r + 10)
            if side:
                c.add("cities", T(f"cityl{i}", x, y, name, 22, anchor="end" if side == "left" else "start", fill="#fff", halo="rgba(0,0,0,0.7)", ss=True,
                                  dx=-(r + 10) if side == "left" else r + 10, dy=8, track=2, anim="pop", c=[x, y], **({"minz": z} if z > 1 else {})))
    return c, "navy"


HIST_YEARS = ["bc2000", "bc1500", "bc1000", "bc700", "bc500", "bc400", "bc323", "bc300", "bc200", "bc100", "bc1", "100", "200", "300", "400", "500",
              "600", "700", "800", "900", "1000", "1100", "1200", "1279", "1300", "1400", "1492", "1500", "1530", "1600", "1650", "1700", "1715",
              "1783", "1800", "1815", "1880", "1900", "1914", "1920", "1930", "1938", "1945", "1960", "1994"]


def year_label(y):
    return f"{y[2:]} BC" if y.startswith("bc") else ("YEAR 1" if y == "1" else f"AD {y}" if int(y) < 1000 else y)


def canvas_history(d):
    c = Canvas()
    m = _proj_map(d["bbox"])
    simp = max(400, 2500 * (d["bbox"][2] - d["bbox"][0]) / 60)
    _sea_land(c, m, simp)
    found, missing = 0, {}
    names = [d["entity"]] if isinstance(d["entity"], str) else d["entity"]
    for y in d["years"]:
        if y not in HIST_YEARS:
            raise ValueError(f"no border map for year {y}")
        feats = explain.hist(y)
        g = mapx.union(feats, lambda p: any(n.lower() in (p.get("NAME") or "").lower() for n in names))
        if g.is_empty:
            from shapely.geometry import shape
            near = sorted(((shape(f["geometry"]).buffer(0).intersection(m.box).area, f["properties"].get("NAME")) for f in feats
                           if f["properties"].get("NAME") and shape(f["geometry"]).intersects(m.box)), reverse=True)[:10]
            missing[y] = [n for _, n in near]
            continue
        found += 1
        c.add(f"year:{y}", {"id": f"yr_{y}", "type": "path", "d": m.d(g, simp / 2), "fill": d.get("color", "#C8102E"), "fillOpacity": 0.55,
                            "stroke": "#8E0B21", "sw": 3, "anim": "wipe"},
              T(f"yrl_{y}", 80, 1420, year_label(y), 110, anchor="start", font="anton", fill="#fff", halo="rgba(11,28,43,0.85)", fixed=True))
        c.spot(f"year:{y}", *_pixel_bounds(m, g))
    if found < 3:
        raise ValueError(f"only {found} years of borders found for {names}. Names on the maps there: "
                         + "; ".join(f"{y}: {', '.join(v)}" for y, v in missing.items()))
    for p in d.get("pins", []):
        x, y = m.pt(p["lon"], p["lat"])
        c.add(f"pin:{p['id']}", {"id": f"pin_{p['id']}", "type": "circle", "cx": x, "cy": y, "r": 9, "fill": "#111", "stroke": "#fff", "sw": 3, "anim": "pop"},
              T(f"pinl_{p['id']}", x, y, p["name"].upper(), 24, anchor="start", fill="#111", halo="#F3ECDD", ss=True, dx=16, dy=-8, track=3, anim="pop", c=[x, y]))
        c.spot(f"pin:{p['id']}", x - 150, y - 120, x + 150, y + 120)
    return c, "navy"


def canvas_breakdown(d):
    c = Canvas()
    X, Y0, H, W = 110, 660, 760, 340
    c.add("bar", {"id": "bar", "type": "rect", "x": X, "y": Y0, "w": W, "h": H, "rx": 6, "fill": "#fff", "stroke": INK, "sw": 4},
          T("bar_l", X, Y0 - 40, d["total_label"].upper(), 54, anchor="start", font="anton", fill=INK))
    y = Y0 + H
    shades = ["#9AA5B1", "#5C6773", "#C9D1D9", "#7B8794", "#3E4C59"]
    parts = d["parts"]
    tops, yy = [], Y0 + H
    for p in parts:                                     # each slice's top and height, bottom to top
        h = max(H * p["pct"] / 100, 14)
        yy -= h
        tops.append((yy, h))
    order = sorted(range(len(parts)), key=lambda i: tops[i][0])
    labs, last = {}, Y0 - 10
    for i in order:                                     # labels from the top down, at least 54 px apart
        want = tops[i][0] + tops[i][1] / 2 + 16
        labs[i] = max(want, last + 54)
        last = labs[i]
    for i, p in enumerate(parts):
        y, h = tops[i]
        hot = p["id"] == d.get("highlight")
        fill = "#FFD23F" if hot else shades[i % len(shades)]
        ly = labs[i]
        c.add(f"part:{p['id']}", {"id": f"part_{p['id']}", "type": "rect", "x": X - (6 if hot else 0), "y": y, "w": W + (12 if hot else 0), "h": h,
                                  "fill": fill, "stroke": INK, "sw": 4, "anim": "grow", "glow": hot},
              T(f"partl_{p['id']}", X + W + 34, ly, f"{p['pct']:g}% {p['label'].upper()}", 50 if h > 60 else 42, anchor="start", font="anton",
                fill="#C8102E" if hot else INK, halo="#EFE9DD"))
        c.spot(f"part:{p['id']}", X, y - 60, X + W + 520, y + h + 60, zmax=2.0)
    return c, "paper"


def canvas_versus(d):
    c = Canvas()
    items = d["items"][:4]
    vmax = max(i["value"] for i in items)
    side = lambda v: 430 * math.sqrt(v / vmax) if len(items) <= 2 else 300 * math.sqrt(v / vmax)
    sides = [max(side(i["value"]), 60) for i in items]
    gap = 120
    total = sum(sides) + gap * (len(items) - 1)
    x, base = (1080 - total) / 2, 1250
    for k, (it, s) in enumerate(zip(items, sides)):
        col = it.get("color") or PALETTE[k % len(PALETTE)]
        dark = col in ("#FFD23F", "#F39C12")
        c.add(f"item:{it['id']}", {"id": f"it_{it['id']}", "type": "rect", "x": x, "y": base - s, "w": s, "h": s, "rx": 8, "fill": col, "stroke": INK, "sw": 4,
                                   "anim": "pop", "c": [x + s / 2, base - s / 2]},
              T(f"itv_{it['id']}", x + s / 2, base - s / 2 + 22, it["display"], 64 if s > 200 else 44, font="anton", fill=INK if dark else "#fff"),
              T(f"itl_{it['id']}", x + s / 2, base + 52, it["label"].upper(), 30, fill=INK, track=1))
        c.spot(f"item:{it['id']}", x - 40, base - s - 40, x + s + 40, base + 80, zmax=2.0)
        x += s + gap
    return c, "paper"


COLORS = {"red": "#C8102E", "black": "#141414", "green": "#1E8F4E", "blue": "#2E86DE", "white": "#EEEEEE", "gold": "#D4AF37"}


def canvas_odds(d):
    c = Canvas()
    win, total, stake, pays, tries = d["win"], d["total"], d.get("stake", 10), d.get("pays", 1), d.get("tries", 1000)
    p = win / total
    ev = p * pays - (1 - p)                        # per $1 bet
    edge = -ev * 100
    c.placeholders.update({"{edge}": f"{edge:.2f}%", "{chance}": f"{p * 100:.1f}%", "{total_bet}": f"${stake * tries:,.0f}",
                           "{avg_loss}": f"${-ev * stake * tries:,.0f}"})
    cx, cy, R = 540, 870, 290
    if d.get("wheel"):
        segs = d["wheel"]["segments"]
        kids, n = [], len(segs)
        for i, sg in enumerate(segs):
            a0, a1 = (i / n) * 2 * math.pi - math.pi / 2, ((i + 1) / n) * 2 * math.pi - math.pi / 2
            P = lambda r, a: f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}"
            kids.append({"type": "path", "d": f"M{P(R * 0.62, a0)} L{P(R, a0)} A{R},{R} 0 0 1 {P(R, a1)} L{P(R * 0.62, a1)} A{R * 0.62},{R * 0.62} 0 0 0 {P(R * 0.62, a0)} Z",
                         "fill": COLORS.get(sg.get("color"), sg.get("color", "#333")), "stroke": "#D4AF37", "sw": 2})
            am = (a0 + a1) / 2
            if sg.get("label") and n <= 40:
                kids.append({"type": "text", "x": round(cx + R * 0.82 * math.cos(am), 1), "y": round(cy + R * 0.82 * math.sin(am) + 8, 1),
                             "text": sg["label"], "size": 22 if n > 20 else 30, "fill": "#fff", "weight": 800})
        kids += [{"type": "circle", "cx": cx, "cy": cy, "r": R * 0.62, "fill": "#7A4A22", "stroke": "#D4AF37", "sw": 4},
                 {"type": "circle", "cx": cx, "cy": cy, "r": R * 0.2, "fill": "#D4AF37"}]
        c.add("wheel", {"id": "rim", "type": "circle", "cx": cx, "cy": cy, "r": R + 26, "fill": "#4A2C12", "stroke": "#D4AF37", "sw": 6},
              {"id": "wheel", "type": "group", "cx": cx, "cy": cy, "spin": 40, "children": kids},
              {"id": "ptr", "type": "path", "d": f"M{cx - 18},{cy - R - 50} L{cx + 18},{cy - R - 50} L{cx},{cy - R - 8} Z", "fill": "#FFD23F", "stroke": "#111", "sw": 3})
    bx, by, bw, bh = 90, 1330, 900, 70
    n = min(total, 60)
    wn = round(win / total * n)
    for i in range(n):
        c.add("bar", {"id": f"s{i}", "type": "rect", "x": bx + i * bw / n + 1, "y": by, "w": bw / n - 2, "h": bh,
                      "fill": "#1E9E55" if i < wn else "#2a2a2a", "stroke": "#D4AF37", "sw": 1, "anim": "pop", "c": [bx + (i + 0.5) * bw / n, by + bh / 2]})
    c.add("bar", T("bar_w", bx, by - 24, d["win_label"].upper(), 38, anchor="start", fill="#fff", halo="rgba(0,0,0,0.6)"),
          T("bar_l", bx + bw, by + bh + 52, d["lose_label"].upper(), 38, anchor="end", fill="#ff8a8a", halo="rgba(0,0,0,0.6)"))
    # one player, a fixed seed whose path ends near the average
    start = stake * 100
    path = None
    for seed in range(800):
        rnd, v, pth = random.Random(seed), start, [start]
        for _ in range(tries):
            v += stake * pays if rnd.random() < p else -stake
            pth.append(v)
        if abs(pth[-1] - (start + ev * stake * tries)) < stake * 4 and min(pth) > 0:
            path = pth
            break
    path = path or pth
    gx, gy, gw, gh = 110, 2150, 860, 520
    lo, hi = min(min(path), start + ev * stake * tries) * 0.9, max(path) * 1.05
    P = lambda i, v: (gx + gw * i / tries, gy + gh - gh * (v - lo) / (hi - lo))
    step = max(1, tries // 250)
    dpath = "M" + "L".join(f"{P(i, v)[0]:.1f},{P(i, v)[1]:.1f}" for i, v in enumerate(path) if i % step == 0)
    e0, e1 = P(0, start), P(tries, start + ev * stake * tries)
    c.add("chart", {"id": "axis", "type": "path", "d": f"M{gx},{gy} L{gx},{gy + gh} L{gx + gw},{gy + gh}", "stroke": "rgba(255,255,255,0.7)", "sw": 3},
          {"id": "startl", "type": "path", "d": f"M{gx},{e0[1]:.1f} L{gx + gw},{e0[1]:.1f}", "stroke": "rgba(255,255,255,0.35)", "sw": 2},
          T("startt", gx + gw, e0[1] - 14, f"YOU START: ${start:,}", 28, anchor="end", fill="rgba(255,255,255,0.85)"),
          {"id": "exp", "type": "path", "d": f"M{e0[0]:.1f},{e0[1]:.1f} L{e1[0]:.1f},{e1[1]:.1f}", "stroke": "#FFD23F", "sw": 4, "anim": "draw", "dur": 3.0},
          {"id": "walk", "type": "path", "d": dpath, "stroke": "#fff", "sw": 4, "anim": "draw", "dur": 3.2},
          T("tries", gx + gw, gy + gh + 50, f"{tries:,} TRIES →", 30, anchor="end", fill="rgba(255,255,255,0.85)"))
    c.spots["wheel"] = [540, 1010, 1.0]
    c.spots["bar"] = [540, 1010, 1.0]
    c.spots["chart"] = [540, 2390, 1.0]
    return c, "felt"


def canvas_stack(d):
    c = Canvas()
    cont, items = d["container"], d["items"]
    D = cont["size"]
    y0, y1, cx = 570, 1400, 540
    s = (y1 - y0) / D
    sr, er = cont.get("start_size", 0) * s / 2, cont.get("end_size", 0) * s / 2
    c.add("ends", {"id": "start", "type": "circle", "cx": cx, "cy": y0, "r": max(sr, 6), "fill": cont.get("start_color", "#2E7BC4"), "stroke": "#9FD3FF", "sw": 1.5, "glow": True},
          T("startl", cx, y0, cont["start_label"].upper(), 30, anchor="end", fill="#9FD3FF", track=3, ss=True, dx=-(max(sr, 6) + 24), dy=10),
          {"id": "end", "type": "circle", "cx": cx, "cy": y1, "r": max(er, 4), "fill": cont.get("end_color", "#C9C9C9"), "stroke": "#fff", "sw": 1},
          T("endl", cx, y1, cont["end_label"].upper(), 30, anchor="start", fill="#ddd", track=3, ss=True, dx=max(er, 4) + 20, dy=10))
    c.add("ruler", {"id": "ruler", "type": "path", "d": f"M{cx - 190},{y0} L{cx - 190},{y1}", "stroke": "#FFD23F", "sw": 3, "anim": "draw", "dur": 1.6},
          {"id": "rulern", "type": "counter", "x": cx - 210, "y": (y0 + y1) / 2, "from": 0, "to": D, "suffix": f" {d.get('unit', '')}", "size": 54,
           "anchor": "end", "fill": "#FFD23F", "dur": 1.6})
    y = y0 + sr
    run = []                                                 # tiny ones in a row share one label when zoomed out
    for k, it in enumerate(items):
        r = it["size"] * s / 2
        cy = y + r
        tiny = r < 20
        c.add(f"item:{it['id']}", {"id": f"st_{it['id']}", "type": "circle", "cx": cx, "cy": round(cy, 1), "r": round(max(r, 1.5), 1),
                                   "fill": it.get("color") or PALETTE[k % len(PALETTE)], "stroke": "rgba(255,255,255,0.5)", "sw": 1, "anim": "pop"},
              T(f"stl_{it['id']}", cx, cy, it["label"].upper(), 26, anchor="start", fill="#fff", track=2, ss=True, dx=max(r, 6) + 22, dy=9, anim="pop",
                c=[cx, cy], **({"minz": 2.2} if tiny else {})))
        if tiny:
            run.append((it, cy))
        if run and (not tiny or k == len(items) - 1):
            ids = [i["id"] for i, _ in run]
            my = sum(v for _, v in run) / len(run)
            c.add(f"item:{ids[-1]}", T(f"stg_{ids[0]}", cx, my, " · ".join(i["label"].upper() for i, _ in run), 24, anchor="start", fill="#fff", track=2,
                                        ss=True, dx=30, dy=8, maxz=2.2))
            run = []
        c.spot(f"item:{it['id']}", cx - max(r, 60) - 100, cy - max(r, 60), cx + max(r, 60) + 220, cy + max(r, 60))
        y += it["size"] * s
    used = sum(i["size"] for i in items) + cont.get("start_size", 0) / 2 + cont.get("end_size", 0) / 2
    spare = D - used
    c.placeholders.update({"{sum}": f"{sum(i['size'] for i in items):,.0f}", "{spare}": f"{abs(round(spare, -2)):,.0f}", "{fits}": "yes" if spare >= 0 else "no"})
    c.spot("start", cx - 120, y0 - 90, cx + 120, y0 + 90, zmax=5.0)
    return c, d.get("theme", "space")


def canvas_flow(d):
    c = Canvas()
    steps = d["steps"][:6]
    n = len(steps)
    x, top, bot = 330, 650, 1490
    ys = [top + (bot - top) * i / (n - 1) for i in range(n)]
    for i, (st, y) in enumerate(zip(steps, ys)):
        c.add(f"step:{st['id']}", {"id": f"fl_{st['id']}", "type": "group", "cx": x, "cy": y, "anim": "pop", "c": [x, y], "children": [
            {"type": "circle", "cx": x, "cy": y, "r": 70, "fill": "#fff", "stroke": INK, "sw": 5},
            {"type": "emoji", "x": x, "y": y + 4, "text": st["emoji"], "size": 70},
            {"type": "text", "x": x + 110, "y": y + 14, "text": st["label"].upper(), "size": 40, "fill": INK, "anchor": "start", "font": "anton"}]})
        if i:
            c.add(f"step:{st['id']}", {"id": f"ar_{i}", "type": "arrow", "d": f"M{x},{ys[i - 1] + 78} L{x},{y - 78}", "stroke": INK, "sw": 7, "head": "k"})
        c.spot(f"step:{st['id']}", x - 90, y - 220, x + 560, y + 120, zmax=1.6)
    c.add("dot", {"id": "dot", "type": "mover", "pts": [[x, y] for y in ys], "r": 16, "fill": "#E0263C", "dur": 2.2 * n})
    if d.get("back"):
        back = f"M{x + 80},{ys[-1] - 30} C{x + 560},{ys[-1] - 160} {x + 600},{ys[0] + 300} {x + 330},{ys[0] + 160}"
        c.add("back", {"id": "back", "type": "arrow", "d": back, "stroke": "#1E9E55", "sw": 9, "head": "a", "dur": 1.4},
              {"id": "backb", "type": "group", "cx": 815, "cy": ys[0] + 110, "anim": "pop", "c": [815, ys[0] + 110], "children": [
                  {"type": "rect", "x": 650, "y": ys[0] + 60, "w": 330, "h": 100, "rx": 50, "fill": "#1E9E55", "stroke": INK, "sw": 5},
                  {"type": "text", "x": 815, "y": ys[0] + 127, "text": d["back"]["label"].upper(), "size": 46, "fill": "#fff", "font": "anton"}]})
    return c, "paper"


def canvas_grid(d):
    c = Canvas()
    gx, gy, cw, ch = 300, 760, 340, 300
    c.add("labels", T("rowt", 140, gy + ch + 10, d["row_title"].upper(), 40, font="anton", fill="#FFD23F"),
          T("colt", gx + cw, gy - 70, d["col_title"].upper(), 40, font="anton", fill="#7FD3FF"),
          *[T(f"col{j}", gx + cw * (j + 0.5), gy - 20, d["cols"][j].upper(), 28, fill="#ccc") for j in range(2)],
          *[T(f"row{i}", gx - 20, gy + ch * (i + 0.5) + 10, d["rows"][i].upper(), 28, anchor="end", fill="#ccc") for i in range(2)])
    for i in range(2):
        for j in range(2):
            cell = d["cells"][i][j]
            x, y = gx + j * cw, gy + i * ch
            c.add(f"cell:{i}{j}", {"id": f"cell{i}{j}", "type": "group", "cx": x + cw / 2, "cy": y + ch / 2, "anim": "pop", "c": [x + cw / 2, y + ch / 2], "children": [
                {"type": "rect", "x": x + 8, "y": y + 8, "w": cw - 16, "h": ch - 16, "rx": 18, "fill": "#232a38", "stroke": "#59637a", "sw": 3},
                {"type": "text", "x": x + cw / 2, "y": y + 120, "text": cell["top"].upper(), "size": 44, "font": "anton", "fill": "#FFD23F"},
                {"type": "text", "x": x + cw / 2, "y": y + 190, "text": cell["bottom"].upper(), "size": 36, "font": "anton", "fill": "#7FD3FF"}]})
            c.add(f"hl:{i}{j}", {"id": f"hl{i}{j}", "type": "rect", "x": x + 4, "y": y + 4, "w": cw - 8, "h": ch - 8, "rx": 20, "stroke": "#FFD23F", "sw": 7, "glow": True})
    return c, "night"


BUILD = {"map": canvas_map, "history": canvas_history, "breakdown": canvas_breakdown, "versus": canvas_versus, "odds": canvas_odds,
         "stack": canvas_stack, "flow": canvas_flow, "grid": canvas_grid}


# ======================================================================
# spec -> props, with strict checks
# ======================================================================
def fill(s, ph):
    for k, v in ph.items():
        s = s.replace(k, v)
    return s


def to_props(spec):
    c, theme = BUILD[spec["canvas"]](spec["data"])
    ph = c.placeholders
    beats, shown = [], set()
    years = [g for g in c.groups if g.startswith("year:")]
    for i, b in enumerate(spec["beats"]):
        show, hide = list(b.get("show", [])), list(b.get("hide", []))
        for g in show + hide + b.get("pulse", []):
            if g not in c.groups:
                raise ValueError(f"beat {i + 1}: unknown piece '{g}' (have: {', '.join(sorted(c.groups))})")
        if any(g.startswith("year:") for g in show):          # a new year replaces the one before
            hide += [y for y in years if y in shown and y not in show]
        shown |= set(show)
        f = b.get("focus", "all")
        if f not in c.spots:
            raise ValueError(f"beat {i + 1}: unknown camera spot '{f}'")
        say = fill(b["say"], ph)
        head = [fill(x, ph) for x in b["head"]]
        if len(say.split()) > 22:
            raise ValueError(f"beat {i + 1}: caption too long ({len(say.split())} words)")
        if len("".join(head)) > 30:
            raise ValueError(f"beat {i + 1}: headline too long")
        cam = list(c.spots[f])
        if b.get("card"):
            cam[1] = round(cam[1] + 150 / cam[2], 1)
        nb = {"say": say, "head": head, "cam": cam, "show": sum((c.groups[g] for g in show), []), "hide": sum((c.groups[g] for g in hide), []),
              "pulse": sum((c.groups[g] for g in b.get("pulse", [])), []), "tilt": min(max(b.get("tilt", 0), 0), 20)}
        if len(nb["show"]) > 12:
            nb["stagger"] = 0.04
        if b.get("card"):
            nb["card"] = {k: fill(v, ph) for k, v in b["card"].items()}
        if b.get("ask"):
            nb["ask"] = True
        beats.append(nb)
    if not 5 <= len(beats) <= 9:
        raise ValueError(f"{len(beats)} beats (5 to 9 wanted)")
    if not beats[-1].get("ask"):
        raise ValueError("the last beat must be the question")
    t = spec.get("theme") or theme
    return {"els": c.els, "base": c.base, "beats": beats, "theme": THEMES.get(t, THEMES[theme])}


# ======================================================================
# Claude: write, fact-check, look
# ======================================================================
GUIDE = """You write one short explainer reel (vertical video, 25-40 seconds, no voice: captions and music) for The Daily Drop.
Its look is fixed and polished; you choose ONE canvas, fill its data, and tell the story in beats. Reply with ONE JSON object only.

STYLE: Vox-style. A hook question, a build-up, one or two big numbers on stat cards, a twist, a closing question. Simple words a 13-year-old gets.
Never use em dashes. Never write "pp". Every number must be real, current and checkable; list each one in "facts" with where it comes from.

SPEC:
{"canvas": "...", "topic": "short_slug", "title": "YouTube title, under 70 chars, 1 emoji at the end",
 "description": "2-3 sentences with the key numbers, then a Source line, then 3 hashtags", "pinned": "the closing question with 👇",
 "data": {... the canvas data ...},
 "beats": [{"say": "the caption, max 18 words", "head": ["text before", "HIGHLIGHT", "text after"], "show": [pieces], "hide": [pieces],
            "pulse": [pieces], "focus": "camera spot", "tilt": 0-18, "card": {"big": "76%", "line": "max 9 words", "src": "source name"}, "ask": true}],
 "facts": [{"claim": "the sentence with the number", "source": "organisation or URL"}]} (the 1-3 numbers the reel stands on, most important first; ONE number per claim; pick numbers a single well-known source states plainly)
head: the 3 parts together max 28 characters (it must fit on one line), in capitals; the middle part gets a highlighter. 6 to 8 beats. The last beat is the question
(ask: true, no card). 1 or 2 beats have a card. Use "focus" to move the camera to what the beat talks about. Show pieces as they're talked about.

CANVASES (pieces you can show/hide/pulse, and camera spots you can focus):
map: any country. data {"focus": "ISO3 code", "bbox": [west, south, east, north] (optional, degrees), "cities": 12, "city_labels": 5,
  "areas": [{"id": "a1", "kind": "admin1", "name": "exact province/state name", "label": "short label"} | {"id", "kind": "country", "iso3"} |
            {"id", "kind": "circle", "lon", "lat", "km"} | {"id", "kind": "band", "from": "ISO3 of the neighbour", "km"}],
  "pins": [{"id": "p1", "name": "place", "lon", "lat"}]}
  pieces: "cities", "area:<id>", "pin:<id>". spots: "all", "area:<id>", "pin:<id>".
history: one empire through time. data {"entity": ["names as in historical maps", "and its later names"] (e.g. ["Mongol Empire", "Yuan", "Golden Horde", "Ilkhanate"]),
  "years": 3-5 of ["bc500","bc323","bc200","bc1","100","200","400","1000","1200","1279","1300","1400","1492","1500","1600","1700","1800","1815","1880","1900","1914","1920","1938","1945","1960","1994"],
  "bbox": [w,s,e,n] covering it, "pins": [...]} pieces: "year:<y>" (a new year replaces the last), "pin:<id>". spots: "all", "year:<y>", "pin:<id>".
breakdown: where money goes. data {"total_label": "$270B OF SALES", "parts": [{"id", "label": "2-3 words", "pct": number}] (bottom to top, sums to 100),
  "highlight": "part id"} pieces: "bar", "part:<id>". spots: "all", "part:<id>".
versus: 2-4 amounts as squares to scale. data {"items": [{"id", "label": "2-3 words", "value": number, "display": "$5.3B"}]}
  pieces: "item:<id>". spots: "all", "item:<id>".
odds: a game of chance. data {"win": ways to win, "total": all outcomes, "pays": profit multiple of the stake on a win (1 = even money),
  "stake": 10, "tries": 1000, "win_label": "BET RED: WIN 18 OF 38", "lose_label": "LOSE 20", "wheel": {"segments": [{"label", "color": "red|black|green|blue|white|gold"}]} (optional)}
  These are computed for you, write them as is: {edge} house edge, {chance} win chance, {total_bet}, {avg_loss} average loss after all tries.
  pieces: "wheel" (only with a wheel), "bar", "chart" (one simulated player over all tries). spots: "all", "wheel", "bar", "chart".
stack: things lined up inside a distance. data {"container": {"size", "start_label", "end_label", "start_size", "end_size"}, "unit": "km",
  "items": [{"id", "label", "size", "color": "#hex"}], "theme": "space" or "night"} computed: {sum}, {spare} (room left), {fits}.
  pieces: "ends", "ruler", "item:<id>". spots: "all", "start", "item:<id>".
flow: a chain of 3-6 steps. data {"steps": [{"id", "emoji", "label": "max 18 chars"}], "back": {"label": "APPROVED ✓"} (optional)}
  pieces: "step:<id>", "dot" (travels the chain, show it with the 2nd step), "back". spots: "all", "step:<id>".
grid: a 2x2 of choices. data {"row_title", "col_title", "rows": [2 labels], "cols": [2 labels], "cells": [[{"top", "bottom"}, ...], [...]]}
  pieces: "labels", "cell:<row><col>" (00, 01, 10, 11), "hl:<row><col>" (a highlight frame). spots: "all".
"""

EXAMPLE = {"canvas": "breakdown", "topic": "costco_fees", "title": "Costco barely makes money selling you stuff 💳",
           "description": "Fiscal 2025: $269.9B of sales, about 1.9% left after goods, stores and staff. Membership fees of $5.3B are about half the operating profit.\nSource: Costco FY2025 results.\n#costco #money #business",
           "pinned": "Is your Costco card worth it? 👇",
           "data": {"total_label": "$270B of sales a year", "parts": [{"id": "goods", "label": "the stuff", "pct": 89}, {"id": "staff", "label": "stores & staff", "pct": 9.1},
                                                                       {"id": "left", "label": "left: $5.1B", "pct": 1.9}], "highlight": "left"},
           "beats": [{"say": "Costco sells about 270 billion dollars of stuff a year.", "head": ["COSTCO SELLS ", "$270B", " A YEAR"], "show": ["bar"], "focus": "all"},
                     {"say": "Almost all of it pays for the stuff itself.", "head": ["", "89%", " PAYS FOR THE STUFF"], "show": ["part:goods"]},
                     {"say": "Then the warehouses and the workers.", "head": ["THEN ", "STORES & STAFF", ""], "show": ["part:staff"]},
                     {"say": "What's left is less than 2 cents per dollar.", "head": ["LESS THAN ", "2¢", " PER DOLLAR"], "show": ["part:left"], "pulse": ["part:left"],
                      "focus": "part:left", "card": {"big": "1.9%", "line": "of sales is left over", "src": "Costco FY2025 results"}},
                     {"say": "But membership fees bring in 5.3 billion, and cost almost nothing.", "head": ["THE SECRET: ", "THE CARD", ""], "focus": "all",
                      "card": {"big": "51%", "line": "of operating profit equals the fees", "src": "Costco FY2025 results"}},
                     {"say": "Is your Costco card worth it?", "head": ["IS YOUR CARD ", "WORTH IT", "?"], "ask": True}],
           "facts": [{"claim": "Costco's fiscal 2025 net sales were $269.9 billion", "source": "Costco FY2025 results"},
                     {"claim": "Costco's fiscal 2025 membership fees were $5.3 billion", "source": "Costco FY2025 results"},
                     {"claim": "Costco's fiscal 2025 operating income was $10.4 billion", "source": "Costco FY2025 results"}]}


def client():
    import anthropic
    return anthropic.Anthropic()


def quick(msgs, tools=None, max_tokens=1500):
    """A Haiku call without extended thinking (cheaper and the answer always comes back as text)."""
    kw = {"model": CLAUDE_FAST, "max_tokens": max_tokens, "messages": msgs}
    if tools:
        kw["tools"] = tools
    try:
        return client().messages.create(**kw, thinking={"type": "disabled"})
    except Exception as e:
        if "thinking" not in str(e).lower():
            raise
        return client().messages.create(**kw)


def text_of(r):
    """The reply's text, skipping thinking blocks (Sonnet 5.5 can think before it answers)."""
    return "".join(b.text for b in r.content if getattr(b, "type", "") == "text")


def parse_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON in the reply")
    return json.loads(m.group(0))


def write(meter, canvas, done, fix=None, prev=None):
    sys_blocks = [{"type": "text", "text": GUIDE + "\nEXAMPLE (a breakdown):\n" + json.dumps(EXAMPLE, ensure_ascii=False), "cache_control": {"type": "ephemeral"}}]
    if fix:
        user = (f"Fix this spec. Problems:\n{fix}\n\nSpec:\n{json.dumps(prev, ensure_ascii=False)}\n\nReply with the whole fixed spec JSON only.")
    else:
        user = (f"Today's canvas: {canvas}. Pick a topic people would stop scrolling for, with a surprising number, that fits this canvas well. "
                f"Not one of these (already made): {', '.join(done[-60:]) or 'none'}. Today is {date.today():%B %d, %Y}. JSON only.")
    r = client().messages.create(model=CLAUDE_MODEL, max_tokens=7000, system=sys_blocks, messages=[{"role": "user", "content": user}])
    meter.add(CLAUDE_MODEL, r.usage, "write" if not fix else "fix")
    return parse_json(text_of(r))


def factcheck(meter, spec):
    """Haiku checks the facts with web search (at most 4 facts, 2 searches). Plain lines back, parsed loosely."""
    facts = (spec.get("facts") or [])[:3]
    if not facts:
        return False, "no facts listed"
    meter.room(0.08)
    lines = "\n".join(f"{i + 1}. {f['claim']} (source given: {f.get('source', '?')})" for i, f in enumerate(facts))
    prompt = (f"Check each claim with web search (one search can cover several claims, use them well). Today is {date.today():%B %d, %Y}. "
              f"A claim passes if its number is right within normal rounding and still current.\n\n{lines}\n\n"
              f"End your reply with exactly one line per claim, nothing after them:\n"
              f"1: OK | source url\n2: WRONG | the right number | source url\n3: UNVERIFIED | why\n(UNVERIFIED when you couldn't confirm it)")
    msgs = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}]
    text = ""
    for step in range(3):
        r = quick(msgs, tools, 4000)
        meter.add(CLAUDE_FAST, r.usage, "fact-check")
        text += text_of(r)
        if re.search(r"^\s*\d+\s*[:.)]\s*(OK|WRONG|UNVERIFIED|NOT)", text, re.M | re.I):
            break
        print(f"      fact-check stop: {r.stop_reason}, blocks: {[getattr(b, 'type', '?') for b in r.content][-6:]}")
        msgs = msgs + [{"role": "assistant", "content": r.content}]
        if r.stop_reason != "pause_turn":                # it searched but never wrote the lines: ask for them, no more searching
            msgs.append({"role": "user", "content": "Now write only the result lines, one per claim, in the format asked. No more searching."})
            tools = None
    got = {}
    for m in re.finditer(r"^[^\n\d]*?(\d+)\s*[:.)]\s*([A-Z][A-Z ]*?)\s*(?:\||$)(.*)$", text, re.M):
        word = m.group(2).upper()
        got[int(m.group(1))] = ("OK" if word.startswith("OK") else "WRONG" if word.startswith("WRONG") else "UNVERIFIED", m.group(3).strip())
    bad = []
    for n, f in enumerate(facts, 1):
        v, rest = got.get(n, ("UNVERIFIED", "no answer for it"))
        if v == "WRONG":
            bad.append(f"Claim {n} is wrong: {f['claim']}. The check says: {rest}")
        elif v == "UNVERIFIED":
            bad.append(f"Claim {n} could not be confirmed: {f['claim']}. Replace it with a number that one well-known source states plainly, or drop it from the story.")
    srcs = [rest.split("|")[-1].strip() for n, (v, rest) in got.items() if v == "OK"]
    return (not bad), ("\n".join(bad) if bad else srcs)


LOOK = """These are frames from a vertical explainer reel, one per beat, in order. Judge it like a strict video editor.
Problems to catch: text cut off by the frame edge or covered by another element; labels piled on each other; the main subject too small,
off-screen or covered by the headline (top) or the stat card (bottom); an empty or confusing frame; unreadable text.
Score 1-10 (8 = clean and clear like a good Vox short). Answer ONLY in these lines, nothing else:
SCORE: 8
PROBLEM: 3 | the label TORONTO is cut off at the right edge | move the camera left (focus all)
(one PROBLEM line per problem, none if it's clean)"""


def look(meter, frames):
    meter.room(0.03)
    content = [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(f.read_bytes()).decode()}} for f in frames]
    content.append({"type": "text", "text": LOOK})
    r = quick([{"role": "user", "content": content}], None, 1500)
    meter.add(CLAUDE_FAST, r.usage, "look")
    text = text_of(r)
    m = re.search(r"SCORE\s*[:=]\s*(\d+(?:\.\d+)?)", text, re.I)
    if not m:
        print(f"      look reply not understood: {text[-400:]!r}")
        return {"score": 0, "problems": [{"what": "the frame check could not be read"}]}
    probs = [{"beat": p.group(1), "what": p.group(2).strip(), "fix": p.group(3).strip()}
             for p in re.finditer(r"^\s*PROBLEM\s*[:=]\s*(\d+)\s*\|\s*([^|]*)\|?\s*(.*)$", text, re.M | re.I)]
    return {"score": float(m.group(1)), "problems": probs}


# ======================================================================
# render
# ======================================================================
def render(props, out, name):
    end = mapx.timeline(props["beats"])
    props["voice"] = None
    props["outroAt"], props["duration"] = round(end, 2), round(end + 1.6, 2)
    music = sorted((PUBLIC / "music").glob("*.mp3")) if (PUBLIC / "music").exists() else []
    props["music"] = f"music/{music[sum(map(ord, name)) % len(music)].name}" if music else None
    if not props["music"]:
        print("      ⚠️ no music found in video/public/music")
    (out / "props.json").write_text(json.dumps(props, ensure_ascii=False))
    final = out / "final.mp4"
    gl = "angle" if sys.platform == "darwin" else "swangle"
    subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdExplain", str(final), f"--props={out / 'props.json'}",
                    "--codec=h264", "--crf=18", f"--gl={gl}", "--log=error"], cwd=VIDEO_DIR, check=True)
    frames = []
    for i, b in enumerate(props["beats"]):
        t = b["start"] + min(2.2, (b["end"] - b["start"]) * 0.8)
        f = out / f"look_{i + 1}.jpg"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(final), "-frames:v", "1", "-vf", "scale=432:768", "-q:v", "4", str(f)], check=True)
        frames.append(f)
    return final, frames


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {"done": []}


def make_auto(dry=False, canvas=None):
    """One automatic explainer, start to finish. Returns (name, final) or (None, None) when it isn't good enough or runs out of budget."""
    from dotenv import load_dotenv
    from engine.texts import warn
    load_dotenv(ROOT / ".env")
    st = load_state()
    auto = st.setdefault("auto", [])
    canvas = canvas or CANVASES[len(auto) % len(CANVASES)]
    meter = Meter()
    done = [a["topic"] for a in auto] + [n.split("__", 1)[1] for n in st["done"]]
    spec = props = None
    try:
        spec = write(meter, canvas, done)
        for attempt in range(2):                                    # build errors (unknown piece, too long) get one fix
            try:
                props = to_props(spec)
                break
            except ValueError as e:
                if attempt:
                    raise
                print(f"      spec problem: {e}")
                spec = write(meter, canvas, done, fix=str(e), prev=spec)
        ok, info = factcheck(meter, spec)
        if not ok:
            print(f"      facts: {info}")
            spec = write(meter, canvas, done, fix=f"Wrong facts, fix every number:\n{info}", prev=spec)
            props = to_props(spec)
            ok, info = factcheck(meter, spec)
            if not ok:
                raise ValueError(f"facts still wrong: {info}")
        sources = info
        name = f"auto__{spec['topic']}"[:60]
        out = MEDIA_DIR / name
        out.mkdir(parents=True, exist_ok=True)
        final, frames = render(props, out, name)
        verdict = look(meter, frames)
        print(f"      look: {verdict.get('score')}/10 {verdict.get('problems')}")
        if verdict.get("score", 0) < 7:
            spec = write(meter, canvas, done, fix="The frames had these problems:\n" + json.dumps(verdict.get("problems"), ensure_ascii=False), prev=spec)
            props = to_props(spec)
            final, frames = render(props, out, name)
            verdict = look(meter, frames)
            print(f"      look again: {verdict.get('score')}/10")
            if verdict.get("score", 0) < 7:
                raise ValueError(f"still {verdict.get('score')}/10 after a fix: {verdict.get('problems')}")
    except Budget as e:
        if not dry:
            warn(f"💸 Explainer stopped: {e}. Nothing posted at 7:13 PM.")
        print(f"      stopped: {e}")
        return None, None
    except Exception as e:
        if not dry:
            warn(f"🗺️ Explainer ({canvas}) not good enough, nothing posted at 7:13 PM: {str(e)[:300]}")
        print(f"      failed: {e}")
        return None, None
    desc = spec["description"]
    (out / "upload.json").write_text(json.dumps({"topic": name, "title": spec["title"], "description": desc, "pinned_comment": spec["pinned"],
                                                 "file": str(final)}, indent=2, ensure_ascii=False))
    (out / "spec.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False))
    if not dry:
        auto.append({"topic": spec["topic"], "canvas": canvas, "date": date.today().isoformat(), "cost": round(meter.spent, 3), "score": verdict.get("score")})
        STATE.write_text(json.dumps(st, indent=2))
        warn(f"🗺️ Explainer made: {spec['title']}\nCanvas: {canvas}, look {verdict.get('score')}/10, cost ${meter.spent:.2f}\n"
             f"Sources: {', '.join(sources[:4]) if isinstance(sources, list) else sources}")
    print(f"      cost ${meter.spent:.3f}: {'; '.join(meter.lines)}")
    return name, final


# ======================================================================
# test specs (no Claude): one per canvas, to check the pieces render well
# ======================================================================
TESTS = {
    "map": {"canvas": "map", "topic": "egypt_nile", "title": "t", "description": "d", "pinned": "p",
            "data": {"focus": "EGY", "cities": 10, "city_labels": 4, "areas": [{"id": "nile", "kind": "circle", "lon": 31.2, "lat": 30.3, "km": 120, "label": "Nile delta"}],
                     "pins": [{"id": "cairo", "name": "Cairo", "lon": 31.24, "lat": 30.04}]},
            "beats": [{"say": "Egypt is bigger than Texas and France combined.", "head": ["EGYPT IS ", "HUGE", ""], "focus": "all"},
                      {"say": "But almost everyone lives in one thin strip.", "head": ["BUT LOOK WHERE ", "PEOPLE", " LIVE"], "show": ["cities"], "tilt": 14},
                      {"say": "Along the Nile, and in its delta near Cairo.", "head": ["THE ", "NILE", ""], "show": ["area:nile", "pin:cairo"], "focus": "area:nile"},
                      {"say": "About 95% of Egyptians live on about 5% of the land.", "head": ["", "95%", " ON 5% OF THE LAND"], "focus": "all",
                       "card": {"big": "95%", "line": "of people live on about 5% of the land", "src": "test"}},
                      {"say": "The rest is desert.", "head": ["THE REST IS ", "DESERT", ""], "focus": "all"},
                      {"say": "Would you live in the desert?", "head": ["WOULD YOU LIVE ", "THERE", "?"], "ask": True}]},
    "versus": {"canvas": "versus", "topic": "t", "title": "t", "description": "d", "pinned": "p",
               "data": {"items": [{"id": "a", "label": "selling stuff", "value": 5.1, "display": "$5.1B"}, {"id": "b", "label": "membership fees", "value": 5.3, "display": "$5.3B"}]},
               "beats": [{"say": "One.", "head": ["", "ONE", ""], "show": ["item:a"]}, {"say": "Two.", "head": ["", "TWO", ""], "show": ["item:b"], "pulse": ["item:b"]},
                         {"say": "Card.", "head": ["", "CARD", ""], "card": {"big": "51%", "line": "test", "src": "t"}},
                         {"say": "Four.", "head": ["", "FOUR", ""], "focus": "item:b"}, {"say": "Five.", "head": ["", "FIVE", ""]},
                         {"say": "Ask?", "head": ["", "ASK", "?"], "ask": True}]},
    "odds": {"canvas": "odds", "topic": "t", "title": "t", "description": "d", "pinned": "p",
             "data": {"win": 18, "total": 37, "pays": 1, "stake": 10, "tries": 1000, "win_label": "bet red: win 18 of 37", "lose_label": "lose 19",
                      "wheel": {"segments": [{"label": str(i), "color": "green" if i == 0 else ("red" if i % 2 else "black")} for i in range(37)]}},
             "beats": [{"say": "A European wheel has 37 pockets.", "head": ["", "37", " POCKETS"], "show": ["wheel"]},
                       {"say": "Red wins 18 times out of 37.", "head": ["RED WINS ", "{chance}", ""], "show": ["bar"]},
                       {"say": "The house keeps {edge} of every bet.", "head": ["THE ", "HOUSE EDGE", ""], "card": {"big": "{edge}", "line": "kept by the house", "src": "math"}},
                       {"say": "1,000 spins of $10.", "head": ["1,000 ", "SPINS", ""], "show": ["chart"], "focus": "chart",
                        "card": {"big": "{avg_loss}", "line": "lost on average", "src": "calculated"}},
                       {"say": "That's the math.", "head": ["THE ", "MATH", ""], "focus": "chart"},
                       {"say": "Ever won?", "head": ["EVER ", "WON", "?"], "focus": "chart", "ask": True}]},
}


def test(canvas):
    spec = TESTS.get(canvas)
    if not spec:
        raise SystemExit(f"no test spec for {canvas} (have: {', '.join(TESTS)})")
    props = to_props(spec)
    name = f"autotest__{canvas}"
    out = MEDIA_DIR / name
    out.mkdir(parents=True, exist_ok=True)
    final, frames = render(props, out, name)
    print(f"Rendered {final}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", help="render the built-in example of one canvas (no Claude)")
    ap.add_argument("--canvas", choices=CANVASES)
    ap.add_argument("--dry", action="store_true", help="make it but don't record it as done")
    a = ap.parse_args()
    if a.test:
        test(a.test)
    else:
        print(make_auto(a.dry, a.canvas))
