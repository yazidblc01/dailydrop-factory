"""The cover of a reel: media/<topic>/cover.jpg, made right before posting (engine/upload.py).

Instagram and Facebook get it as the reel's cover; TikTok can only pick a frame, so it gets the time of the frame the
cover is built from (or 1 s in, where every reel's hook is fully on screen). YouTube doesn't let apps set a Shorts cover.

    skits and texts (the scene sells them)   still: the title over a frame of the reel
    everything else (data and money reels)   text:  the title and one big number on the palette's backdrop

    python -m engine.cover <topic>     make the cover of a rendered reel and print its path
"""
import json
import re
import subprocess
import sys

from config import MEDIA_DIR
from engine.render import PUBLIC, VIDEO_DIR

STILL = ("gtamath__", "texts__", "clip__")
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")


def clean(s):
    return re.sub(r"\s+", " ", EMOJI.sub("", s or "")).strip(" .")


def duration(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout)


def words(props, meta, topic):
    """(a, b, big): the title in two parts (b in italics) and an optional big number."""
    a, b, big = props.get("headA") or props.get("hookA") or props.get("hook"), props.get("headB") or props.get("hookB"), None
    if not a:
        a, b = clean(meta.get("title")), ""
    if topic.startswith("ms__"):
        big = topic.split("__")[2]
    elif topic.startswith("waited__"):
        big = "13 YEARS"
    return clean(a), clean(b), big


def make(out):
    """Returns (cover path, TikTok cover time in ms), or (None, 1000) if anything fails: posting never waits on it."""
    topic = out.name
    try:
        props = json.loads((out / "props.json").read_text())
        meta = json.loads((out / "upload.json").read_text())
        a, b, big = words(props, meta, topic)
        pal = props.get("pal") if props.get("pal") in ("paper", "green", "night", "vice") else "paper"
        cp = {"kind": "text", "pal": pal, "a": a, "b": b or "", "big": big or ""}   # every key set: the defaults never leak in
        ms = 1000
        if topic.startswith(STILL):
            at = round(duration(out / "final.mp4") * 0.4, 2)       # mid-skit: the bubbles and characters are on screen
            pub = PUBLIC / "covers"
            pub.mkdir(parents=True, exist_ok=True)
            frame = pub / f"{topic}.png"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(at), "-i", str(out / "final.mp4"), "-frames:v", "1", str(frame)],
                           check=True, capture_output=True)
            cp.update({"kind": "still", "bg": f"covers/{topic}.png", "cropTop": 330 if topic.startswith("texts__") else 560})
            ms = int(at * 1000)
        (out / "cover.json").write_text(json.dumps(cp, indent=2, ensure_ascii=False))
        dst = out / "cover.jpg"
        cmd = ["npx", "remotion", "still", "src/index.ts", "Cover", str(dst), f"--props={out / 'cover.json'}",
               "--image-format=jpeg", "--jpeg-quality=90"]
        r = subprocess.run(cmd, cwd=VIDEO_DIR, capture_output=True, text=True, timeout=300)
        if r.returncode != 0 or not dst.exists():
            raise RuntimeError((r.stderr or r.stdout)[-300:])
        return dst, ms
    except Exception as e:
        print(f"      cover skipped ({e})")
        return None, 1000
    finally:
        (PUBLIC / "covers" / f"{topic}.png").unlink(missing_ok=True)   # don't let frames pile up in public/


if __name__ == "__main__":
    print(make(MEDIA_DIR / sys.argv[1]))
