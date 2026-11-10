"""Builds the voiceover and word-level timings for a topic.

AI voice (ElevenLabs):
    python -m engine.voice gta_launch_prices

Your own recording (any audio file, e.g. a Telegram voice note):
    python -m engine.voice gta_launch_prices --file path/to/recording.ogg

Outputs in media/<topic>/:
    voice.wav    the full voiceover
    timing.json  every word with start/end times, plus each script section's start/end
"""
import argparse
import difflib
import json
import os
import re
import subprocess

import requests
from dotenv import load_dotenv

from config import MEDIA_DIR

load_dotenv()

ELEVEN = "https://api.elevenlabs.io/v1"
VOICE_PREFS = ["Brian", "Adam", "Daniel", "Bill", "George", "Liam"]  # first match in your account wins
VOICE_SETTINGS = {"stability": 0.4, "similarity_boost": 0.8, "style": 0.45, "use_speaker_boost": True, "speed": 1.12}
GAP = 0.06           # seconds of silence between sections
PRE_REVEAL_GAP = 0.3  # longer pause right before the reveal


def sections(script):
    """Spoken order, twist last so the video loops.
    story:   hook, tension (race intro), call1..callM (race moments), reveal, twist
    classic: hook, beat1..beatN, tension, reveal, twist"""
    out = [("hook", script["hook"])]
    if "race_intro" in script:
        out += [("tension", script["race_intro"])]
        out += [(f"call{i}", c) for i, c in enumerate(script["callouts"], 1)]
    else:
        out += [(f"beat{i}", b["say"]) for i, b in enumerate(script["beats"], 1)]
        out += [("tension", script["tension"])]
    out += [("reveal", script["reveal"]), ("twist", script["twist"])]
    return out


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nk=1:nw=1", str(path)], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def to_wav(src, dst):
    run(["ffmpeg", "-y", "-i", str(src), "-ar", "44100", "-ac", "1", str(dst)])


def silence(dst, seconds):
    run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(seconds), str(dst)])


def pick_voice():
    headers = {"xi-api-key": os.environ["ELEVENLABS_API_KEY"]}
    voices = requests.get(f"{ELEVEN}/voices", headers=headers, timeout=30).json()["voices"]
    for pref in VOICE_PREFS:
        for v in voices:
            if v["name"].lower().startswith(pref.lower()):
                return v["voice_id"], v["name"]
    return voices[0]["voice_id"], voices[0]["name"]


SPEECH_FIXES = [
    (r"\bGTA VI\b", "GTA six"), (r"\bGTA V\b", "GTA five"), (r"\bGTA IV\b", "GTA four"),
    (r"\bGTA III\b", "GTA three"), (r"\bGTA 6\b", "GTA six"),
]


def speakable(text):
    """Rewrites text so the AI voice says it right (e.g. roman numerals)."""
    for pat, rep in SPEECH_FIXES:
        text = re.sub(pat, rep, text)
    return text


def tts(text, voice_id, dst):
    text = speakable(text)
    r = requests.post(
        f"{ELEVEN}/text-to-speech/{voice_id}",
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"},
        json={"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": VOICE_SETTINGS},
        timeout=120,
    )
    r.raise_for_status()
    with open(dst, "wb") as f:
        f.write(r.content)


def load_audio_16k(path):
    """Decodes audio with ffmpeg into the 16 kHz mono float array Whisper expects.
    (Avoids faster-whisper's own decoder, which breaks with newer versions of the av library.)"""
    import numpy as np
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le",
                        "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


def transcribe_words(wav):
    """Word timestamps with faster-whisper (runs locally, free)."""
    from faster_whisper import WhisperModel
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(load_audio_16k(wav), word_timestamps=True, language="en")
    words = []
    for s in segs:
        for w in s.words:
            words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
    return words


def norm(t):
    return re.sub(r"[^a-z0-9]", "", t.lower())


def align_sections(secs, words, total):
    """For a recording: find where each script section starts by fuzzy-matching words."""
    script_tokens, owner = [], []
    for idx, (_, text) in enumerate(secs):
        for tok in text.split():
            script_tokens.append(norm(tok))
            owner.append(idx)
    heard = [norm(w["w"]) for w in words]
    sm = difflib.SequenceMatcher(None, script_tokens, heard, autojunk=False)
    first_word = {}
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            first_word.setdefault(owner[a + k], b + k)
    starts, last = [], 0.0
    for idx in range(len(secs)):
        if idx in first_word:
            last = max(last, words[first_word[idx]]["start"])
        starts.append(last)
    out = []
    for idx, (name, text) in enumerate(secs):
        end = starts[idx + 1] if idx + 1 < len(secs) else total
        out.append({"name": name, "text": text, "start": round(starts[idx], 3), "end": round(end, 3)})
    return out


def build_ai(topic, script, out):
    voice_id, voice_name = pick_voice()
    print(f"Voice: {voice_name}")
    tmp = out / "parts"
    tmp.mkdir(exist_ok=True)
    silence(tmp / "gap.wav", GAP)
    silence(tmp / "gap_long.wav", PRE_REVEAL_GAP)

    secs, files, cursor, timed = sections(script), [], 0.0, []
    for i, (name, text) in enumerate(secs):
        mp3, wav = tmp / f"{i:02d}_{name}.mp3", tmp / f"{i:02d}_{name}.wav"
        tts(text, voice_id, mp3)
        to_wav(mp3, wav)
        d = duration(wav)
        timed.append({"name": name, "text": text, "start": round(cursor, 3), "end": round(cursor + d, 3)})
        files.append(wav)
        cursor += d
        if i < len(secs) - 1:
            g = tmp / ("gap_long.wav" if secs[i + 1][0] == "reveal" else "gap.wav")
            files.append(g)
            cursor += PRE_REVEAL_GAP if secs[i + 1][0] == "reveal" else GAP
        print(f"  {name:<8} {d:5.2f}s")

    lst = tmp / "concat.txt"
    lst.write_text("".join(f"file '{f.resolve()}'\n" for f in files))
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out / "voice.wav")])
    return timed, voice_name


def build(topic, file=None):
    out = MEDIA_DIR / topic
    with open(out / "script.json") as f:
        script = json.load(f)

    if file:
        to_wav(file, out / "voice.wav")
        source = "your recording"
    else:
        timed, voice_name = build_ai(topic, script, out)
        source = f"ElevenLabs ({voice_name})"

    total = duration(out / "voice.wav")
    print("Transcribing for word timings (first run downloads a ~500 MB model)...")
    words = transcribe_words(out / "voice.wav")
    if file:
        timed = align_sections(sections(script), words, total)

    timing = {"source": source, "duration": round(total, 3), "sections": timed, "words": words}
    with open(out / "timing.json", "w") as f:
        json.dump(timing, f, indent=2)
    return timing


def retime(topic):
    """Re-runs only the word timings on an existing AI voice.wav, rebuilding section times
    from the saved section clips. Saves an ElevenLabs re-generation."""
    out = MEDIA_DIR / topic
    with open(out / "script.json") as f:
        script = json.load(f)
    secs, cursor, timed = sections(script), 0.0, []
    for i, (name, text) in enumerate(secs):
        d = duration(out / "parts" / f"{i:02d}_{name}.wav")
        timed.append({"name": name, "text": text, "start": round(cursor, 3), "end": round(cursor + d, 3)})
        cursor += d
        if i < len(secs) - 1:
            cursor += PRE_REVEAL_GAP if secs[i + 1][0] == "reveal" else GAP
    total = duration(out / "voice.wav")
    print("Transcribing for word timings...")
    words = transcribe_words(out / "voice.wav")
    timing = {"source": "ElevenLabs (existing voice.wav)", "duration": round(total, 3),
              "sections": timed, "words": words}
    with open(out / "timing.json", "w") as f:
        json.dump(timing, f, indent=2)
    return timing


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("topic", nargs="?", default="gta_launch_prices")
    ap.add_argument("--file", help="use your own recording instead of the AI voice")
    ap.add_argument("--retime", action="store_true",
                    help="skip voice generation, only redo word timings on the existing voice.wav")
    a = ap.parse_args()
    t = retime(a.topic) if a.retime else build(a.topic, a.file)
    print(f"\nVoice source: {t['source']}")
    print(f"Total length: {t['duration']:.1f}s, {len(t['words'])} words timed\n")
    for s in t["sections"]:
        print(f"  {s['start']:6.2f}s - {s['end']:6.2f}s  {s['name']:<8} {s['text'][:60]}")
    print(f"\nSaved media/{a.topic}/voice.wav and timing.json")
    print(f"Listen: afplay media/{a.topic}/voice.wav")
