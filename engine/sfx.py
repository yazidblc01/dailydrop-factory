"""One-time: generates the channel's sound effects and music bed with ElevenLabs.
Files land in video/public/sfx/ and every render uses them automatically.

Usage:
    python -m engine.sfx            (creates any missing files)
    python -m engine.sfx --redo     (regenerates everything)
"""
import os
import sys

import requests
from dotenv import load_dotenv

from config import ROOT

load_dotenv()
OUT = ROOT / "video" / "public" / "sfx"

SOUNDS = {
    "whoosh": ("Fast cinematic whoosh transition, short swoosh, clean, no music", 0.8),
    "tick": ("Short digital UI tick pop for a number appearing, crisp, punchy", 0.5),
    "riser": ("Tense cinematic riser building suspense, rising pitch, ends abruptly", 3.0),
    "impact": ("Deep cinematic bass hit impact boom with short tail, for a big reveal", 1.5),
}
MUSIC_PROMPT = ("Energetic modern trap instrumental beat for a fast YouTube Shorts explainer, "
                "punchy drums, deep 808, dark synth, no vocals, steady 140 bpm, loopable")


def headers():
    return {"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}


def make_sound(name, prompt, seconds):
    r = requests.post("https://api.elevenlabs.io/v1/sound-generation", headers=headers(),
                      json={"text": prompt, "duration_seconds": seconds, "prompt_influence": 0.6}, timeout=120)
    r.raise_for_status()
    (OUT / f"{name}.mp3").write_bytes(r.content)


def make_music():
    r = requests.post("https://api.elevenlabs.io/v1/music", headers=headers(),
                      json={"prompt": MUSIC_PROMPT, "music_length_ms": 45000}, timeout=300)
    r.raise_for_status()
    (OUT / "music.mp3").write_bytes(r.content)


if __name__ == "__main__":
    redo = "--redo" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (prompt, secs) in SOUNDS.items():
        if redo or not (OUT / f"{name}.mp3").exists():
            make_sound(name, prompt, secs)
            print(f"Created sfx/{name}.mp3")
        else:
            print(f"Exists  sfx/{name}.mp3")
    if redo or not (OUT / "music.mp3").exists():
        try:
            make_music()
            print("Created sfx/music.mp3")
        except requests.HTTPError as e:
            print(f"Music not generated ({e.response.status_code}): your ElevenLabs plan may not include music. "
                  "Videos will render without a music bed.")
    else:
        print("Exists  sfx/music.mp3")
