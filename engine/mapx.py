"""Map explainers, Vox style (video/src/ed/MapV.tsx).

A real map built from Natural Earth (coastlines, ocean depth, lakes, borders, cities), a story told in beats:
each beat has a line of narration (ElevenLabs voice when there's a key, captions either way), a camera move,
a headline with a highlighter word, and what happens on the map (cities pop, a band draws on, a stat card slams).

Map data: Natural Earth (public domain), downloaded once from GitHub into cache/ne/.
Needs shapely and pyproj (pip install shapely pyproj).

    python -m engine.mapx --topic canada_border           render the test reel into media/map__canada_border/final.mp4
    python -m engine.mapx --topic canada_border --novoice captions only (no ElevenLabs)
"""
import argparse
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import requests

from config import MEDIA_DIR, ROOT

NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
CACHE = ROOT / "cache" / "ne"
VIDEO_DIR = ROOT / "video"
PUBLIC = VIDEO_DIR / "public"
W, H = 1080, 1920
READ_WPS = 2.7          # no voice: how fast the captions are read (words a second)
TAIL = 0.5              # a breath after each beat


# ---------- data ----------
def ne(name):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{name}.geojson"
    if not f.exists():
        print(f"      downloading {name}...")
        r = requests.get(NE + name + ".geojson", timeout=180)
        r.raise_for_status()
        f.write_bytes(r.content)
    return json.loads(f.read_text())["features"]


class Map:
    """A projection plus a fit of a lon/lat box into a pixel box on the page."""
    def __init__(self, proj, bbox, view, zoom=1.0):
        from pyproj import Transformer
        from shapely.geometry import box
        from shapely.ops import transform
        self.T = transform
        self.tf = Transformer.from_crs("EPSG:4326", proj, always_xy=True)
        self.box = box(*bbox)
        bx0, by0, bx1, by1 = transform(self.tf.transform, self.box).bounds
        vx, vy, vw, vh = view
        s = min(vw / (bx1 - bx0), vh / (by1 - by0)) * zoom
        cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
        self.s = s
        self.px = lambda X, Y: (vx + vw / 2 + (X - cx) * s, vy + vh / 2 - (Y - cy) * s)

    def project(self, g, simp=0):
        g = g.intersection(self.box.buffer(40))
        g = self.T(self.tf.transform, g)
        return g.simplify(simp) if simp else g

    def d(self, g, simp=0, projected=False):
        g = g if projected else self.project(g, simp)
        out = []

        def ring(cs, close=True):
            return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in (self.px(a, b) for a, b in cs)) + ("Z" if close else "")

        def walk(g):
            t = g.geom_type
            if t == "Polygon":
                out.append(ring(g.exterior.coords))
                out.extend(ring(r.coords) for r in g.interiors)
            elif t == "LineString":
                out.append(ring(g.coords, False))
            elif t.startswith("Multi") or t == "GeometryCollection":
                for x in g.geoms:
                    walk(x)
        walk(g)
        return "".join(out)

    def pt(self, lon, lat):
        x, y = self.px(*self.tf.transform(lon, lat))
        return [round(x, 1), round(y, 1)]


def union(feats, keep=lambda p: True, near=None):
    from shapely.geometry import shape
    from shapely.ops import unary_union
    gs = []
    for f in feats:
        if not keep(f["properties"]):
            continue
        g = shape(f["geometry"])
        if not g.is_valid:
            g = g.buffer(0)
        if near is None or g.intersects(near):
            gs.append(g)
    return unary_union(gs)


def base_layers(m, focus, others, simp):
    """Sea depth bands, the neighbours, the focus country, lakes."""
    near = m.box.buffer(30)
    sea = [{"d": m.d(union(ne(n), near=near), simp), "fill": c} for n, c in
           [("ne_10m_bathymetry_K_200", "#24526F"), ("ne_10m_bathymetry_J_1000", "#1E4763"),
            ("ne_10m_bathymetry_I_2000", "#193D57"), ("ne_10m_bathymetry_H_3000", "#14334B")]]
    countries = ne("ne_10m_admin_0_countries_lakes")
    nb = [m.d(union(countries, lambda p, c=c: p.get("ADM0_A3") == c), simp) for c in others]
    land = union(countries, lambda p: p.get("ADM0_A3") == focus)
    lakes = union(ne("ne_10m_lakes"), lambda p: (p.get("scalerank") or 9) <= 3, near=near)
    return {"sea": sea, "near": nb, "land": m.d(land, simp), "lakes": m.d(lakes, simp)}, land


# ---------- topics ----------
def canada_border():
    """Do 90% of Canadians live near the US border? The census: 76% within 160 km, 66% within 100 km (Statistics Canada, 2021)."""
    from shapely.ops import unary_union
    m = Map("+proj=lcc +lat_1=49 +lat_2=77 +lat_0=49 +lon_0=-96", (-141, 40, -52, 80), (0, 560, 1080, 920), zoom=1.12)
    simp = 1500
    layers, can = base_layers(m, "CAN", ["USA"], simp)
    countries = ne("ne_10m_admin_0_countries_lakes")
    usa = union(countries, lambda p: p.get("ADM0_A3") == "USA")
    lower48 = unary_union([g for g in usa.geoms if g.centroid.y < 50 and g.centroid.x > -130])
    cp, up = m.T(m.tf.transform, can), m.T(m.tf.transform, lower48)
    layers["bands"] = {str(km): m.d(cp.intersection(up.buffer(km * 1000)).simplify(1500), projected=True) for km in (160, 100)}
    layers["border"] = [m.d(union([f], lambda p: {p.get("ADM0_A3_L"), p.get("ADM0_A3_R")} == {"CAN", "USA"}), 800)
                        for f in ne("ne_10m_admin_0_boundary_lines_land")
                        if {f["properties"].get("ADM0_A3_L"), f["properties"].get("ADM0_A3_R")} == {"CAN", "USA"}]
    cities = []
    for f in ne("ne_10m_populated_places_simple"):
        p = f["properties"]
        if p.get("adm0_a3") == "CAN" and p.get("pop_max", 0) > 150000:
            lon, lat = f["geometry"]["coordinates"]
            cities.append({"name": p["name"], "at": m.pt(lon, lat), "r": round(4 + (p["pop_max"] / 6.2e6) ** 0.5 * 26, 1), "pop": p["pop_max"]})
    cities.sort(key=lambda c: -c["pop"])
    show = {"Toronto": [-150, 26], "Montréal": [14, -42], "Vancouver": [16, 22], "Calgary": [16, 8], "Edmonton": [16, -34], "Ottawa": [-116, -40]}
    for c in cities:
        c["label"] = show.get(c["name"])
    lab = m.pt(-112, 52.6)
    full = [540, 1020, 1.0]
    south = [700, 1160, 1.8]
    beats = [
        {"say": "You've probably heard that 90% of Canadians live near the US border.", "head": ["DO ", "90%", " OF CANADIANS LIVE NEAR THE US BORDER?"],
         "cam": full, "show": []},
        {"say": "Canada is the second biggest country on Earth.", "head": ["THE ", "2ND BIGGEST", " COUNTRY ON EARTH"], "cam": [540, 960, 1.05], "show": ["pulse"]},
        {"say": "But look where people actually live.", "head": ["BUT LOOK WHERE ", "PEOPLE", " LIVE"], "cam": [560, 1080, 1.15], "show": ["cities"], "tilt": 18},
        {"say": "Draw a line 160 kilometers from the US border.", "head": ["DRAW A LINE ", "160 KM", " FROM THE US"], "cam": [560, 1080, 1.15],
         "show": ["cities", "band160"], "tag": {"at": lab, "text": "WITHIN 160 KM OF THE US"}},
        {"say": "The census says 76% of Canadians live inside it. Not 90.", "head": ["IT'S ", "76%", ", NOT 90%"], "cam": [560, 1080, 1.15],
         "show": ["cities", "band160"], "card": {"big": "76%", "line": "of Canadians live within 160 km of the US border", "myth": "90%"},
         "tag": {"at": lab, "text": "WITHIN 160 KM OF THE US"}},
        {"say": "And two out of three live within just 100 kilometers.", "head": ["2 IN 3 LIVE WITHIN ", "100 KM", ""], "cam": south,
         "show": ["cities", "band100"], "card": {"big": "66%", "line": "live within 100 km of the US border", "myth": ""},
         "tag": {"at": lab, "text": "WITHIN 100 KM OF THE US"}},
        {"say": "The south is warmer, and it's right next to the US, Canada's biggest trading partner.", "head": ["WARMER, AND ", "NEXT TO THE US", ""],
         "cam": [880, 1230, 2.6], "show": ["cities", "band100"], "tilt": 22},
        {"say": "Did you think it was 90%?", "head": ["DID YOU THINK IT WAS ", "90%", "?"], "cam": full, "show": ["cities", "band100"], "ask": True},
    ]
    meta = {"title": "Do 90% of Canadians live near the US border? 🇨🇦",
            "description": "The number everyone repeats is 90%. The 2021 census says 76% of Canadians live within 160 km of the US border, "
                           "and 66% within 100 km.\nSource: Statistics Canada (2021 census). Map data: Natural Earth.\n#canada #maps #geography",
            "pinned_comment": "Did you think it was 90%? 👇"}
    return {"layers": layers, "cities": cities, "beats": beats, "accent": "#FFD23F", "scale": {"km": 500, "px": round(500000 * m.s, 1)}}, meta


TOPICS = {"canada_border": canada_border}


# ---------- voice / timing ----------
def voice_take(beats, out, name):
    """One ElevenLabs take for all the beats, with character timings: each beat starts where its first word is said."""
    from engine import voice
    vid, vname = voice.pick_voice()
    parts, spans, pos = [], [], 0
    for i, b in enumerate(beats):
        said = voice.speakable(b["say"])
        if i:
            parts.append(" ")
            pos += 1
        spans.append(pos)
        parts.append(said)
        pos += len(said)
    text = "".join(parts)
    r = requests.post(f"{voice.ELEVEN}/text-to-speech/{vid}/with-timestamps", timeout=180,
                      headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"},
                      json={"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": voice.VOICE_SETTINGS})
    r.raise_for_status()
    j = r.json()
    al = j.get("normalized_alignment") or j["alignment"]
    if len(al["character_start_times_seconds"]) != len(text):
        al = j["alignment"]
    st = al["character_start_times_seconds"]
    mp3 = out / "voice.mp3"
    mp3.write_bytes(base64.b64decode(j["audio_base64"]))
    dst = PUBLIC / "mapvoice"
    dst.mkdir(exist_ok=True)
    (dst / f"{name}.mp3").write_bytes(mp3.read_bytes())
    total = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                                 capture_output=True, text=True).stdout.strip())
    starts = [st[a] if a < len(st) else total for a in spans]
    print(f"      voice: {vname}, {total:.1f}s")
    return starts, total, f"mapvoice/{name}.mp3"


def timeline(beats, starts=None, total=None, lead=1.0):
    """Beat start/end times. With a voice the narration sets them (after a lead-in for the map to draw); without, reading speed does."""
    t = lead
    for i, b in enumerate(beats):
        if starts:
            b["start"] = round(lead + starts[i], 2)
            b["end"] = round(lead + (starts[i + 1] if i + 1 < len(beats) else total + TAIL), 2)
        else:
            dur = max(2.2, len(b["say"].split()) / READ_WPS) + TAIL + (0.6 if b.get("card") else 0)
            b["start"], b["end"] = round(t, 2), round(t + dur, 2)
            t += dur
    beats[-1]["end"] = round(beats[-1]["end"] + 2.2, 2)    # the question stays up
    return beats[-1]["end"]


def make(topic, use_voice=True, dry=False):
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    props, meta = TOPICS[topic]()
    name = f"map__{topic}"
    out = MEDIA_DIR / name
    out.mkdir(parents=True, exist_ok=True)
    starts = total = None
    props["voice"] = None
    if use_voice and os.environ.get("ELEVENLABS_API_KEY"):
        try:
            starts, total, props["voice"] = voice_take(props["beats"], out, name)
            props["lead"] = 1.0
        except Exception as e:
            print(f"      voice failed ({e}), captions only")
            starts = total = None
    elif use_voice:
        print("      no ELEVENLABS_API_KEY, captions only")
    end = timeline(props["beats"], starts, total)
    props["outroAt"] = round(end, 2)
    props["duration"] = round(end + 1.6, 2)
    music = sorted((PUBLIC / "music").glob("*.mp3")) if (PUBLIC / "music").exists() else []
    props["music"] = f"music/{music[sum(map(ord, topic)) % len(music)].name}" if music else None
    (out / "props.json").write_text(json.dumps(props, ensure_ascii=False))
    final = out / "final.mp4"
    (out / "upload.json").write_text(json.dumps({"topic": name, **meta, "file": str(final)}, indent=2, ensure_ascii=False))
    print(f"      {name}: {meta['title']} ({props['duration']}s, props {(out / 'props.json').stat().st_size // 1024} KB)")
    if dry:
        return name, None
    gl = "angle" if sys.platform == "darwin" else "swangle"
    subprocess.run(["npx", "remotion", "render", "src/index.ts", "EdMapV", str(final), f"--props={out / 'props.json'}",
                    "--codec=h264", "--crf=18", f"--gl={gl}"], cwd=VIDEO_DIR, check=True)
    return name, final


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", default="canada_border", choices=list(TOPICS))
    ap.add_argument("--novoice", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    print(make(a.topic, not a.novoice, a.dry))
