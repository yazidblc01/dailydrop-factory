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
import base64
import difflib
import json
import os
import re
import subprocess

import requests
from dotenv import load_dotenv

from config import MEDIA_DIR, VOICE

load_dotenv()

ELEVEN = "https://api.elevenlabs.io/v1"
VOICE_PREFS = ["Brian", "Adam", "Daniel", "Bill", "George", "Liam"]  # first match in your account wins
VOICE_SETTINGS = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": True, "speed": 1.06}
GAP = 0.06           # seconds of silence between sections
PRE_REVEAL_GAP = 0.3  # longer pause right before the reveal
READ_WPS = 2.6       # with no voice: how fast people read the captions (words a second)


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
ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
        "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
SCALES = [(10 ** 12, "trillion"), (10 ** 9, "billion"), (10 ** 6, "million"), (1000, "thousand")]


def int_words(n):
    """1234 -> 'one thousand two hundred thirty-four'."""
    n = int(n)
    if n < 0:
        return "minus " + int_words(-n)
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    if n < 1000:
        return ONES[n // 100] + " hundred" + (" " + int_words(n % 100) if n % 100 else "")
    for size, name in SCALES:
        if n >= size:
            return int_words(n // size) + " " + name + (" " + int_words(n % size) if n % size else "")


def round_spoken(n):
    """Big numbers are rounded the way a person would say them: 13,765 -> 13,800; 370,774 -> 371,000."""
    n = float(n)
    if abs(n) < 10000:
        return int(round(n))
    digits = len(str(int(abs(n))))
    step = 10 ** (digits - 3)
    return int(round(n / step) * step)


def number_words(txt):
    """'13,765' -> 'thirteen thousand eight hundred'; '1.2' -> 'one point two'."""
    txt = txt.replace(",", "")
    if "." in txt:
        whole, frac = txt.split(".", 1)
        frac = frac.rstrip("0")
        if frac:
            return int_words(int(whole or 0)) + " point " + " ".join(ONES[int(d)] for d in frac)
        txt = whole
    return int_words(round_spoken(txt))


def _money(m):
    num, scale = m.group(1), m.group(2)
    plain = num.replace(",", "")
    if scale:  # "$1.2 trillion"
        return f"{number_words(num)} {scale} dollars"
    if "." in plain and len(plain.split(".")[1]) == 2 and float(plain) < 1000:  # "$94.66"
        d, c = plain.split(".")
        cents = f" and {int_words(int(c))} cents" if int(c) else ""
        return f"{int_words(int(d))} dollars{cents}"
    return f"{number_words(num)} dollars"


NUM = r"(\d(?:[\d,]*\d)?(?:\.\d+)?)"


def speakable(text):
    """Rewrites text so the AI voice says it right: numbers, money and symbols become plain words.
    Only the voice gets this version; captions keep the digits."""
    for pat, rep in SPEECH_FIXES:
        text = re.sub(pat, rep, text)
    text = re.sub(r"\$" + NUM + r"(?:\s*(trillion|billion|million|thousand))?", _money, text)
    text = re.sub(r"[+]?" + NUM + r"\s?%", lambda m: number_words(m.group(1)) + " percent", text)
    text = re.sub(r"#\s?(\d+)", lambda m: "number " + int_words(int(m.group(1))), text)
    text = re.sub(r"[x×]\s?" + NUM + r"\b", lambda m: number_words(m.group(1)) + " times", text)
    text = re.sub(NUM + r"\s?[x×](?![a-z])", lambda m: number_words(m.group(1)) + " times", text)
    # other numbers: keep years as they are (the voice reads them well), spell out the rest
    def bare(m):
        t = m.group(1)
        if re.fullmatch(r"(19|20)\d\d", t):
            return t
        return number_words(t)
    return re.sub(r"(?<![\w$])" + NUM + r"(?!\w)", bare, text)


def tts(text, voice_id, dst, before="", after=""):
    """One section of voice. before/after are the neighbouring lines, so the tone carries across the joins."""
    url = f"{ELEVEN}/text-to-speech/{voice_id}"
    headers = {"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}
    body = {"text": speakable(text), "model_id": "eleven_multilingual_v2", "voice_settings": VOICE_SETTINGS}
    r = None
    if before or after:
        r = requests.post(url, headers=headers, timeout=120,
                          json={**body, "previous_text": speakable(before), "next_text": speakable(after)})
    if r is None or r.status_code >= 400:  # no neighbours, or the option was refused: plain request
        r = requests.post(url, headers=headers, json=body, timeout=120)
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
    """The whole script in ONE take, so it sounds like one person telling one story (no restarts between lines).
    ElevenLabs returns when each letter is spoken, which gives every section its exact start and end.
    If that fails for any reason, the old line-by-line recording is used."""
    voice_id, voice_name = pick_voice()
    print(f"Voice: {voice_name}")
    try:
        return build_one_take(script, voice_id, out), voice_name
    except Exception as e:
        print(f"  one-take voice failed ({e}), recording line by line instead")
    return build_lines(script, voice_id, out), voice_name


def build_one_take(script, voice_id, out):
    secs = sections(script)
    parts, spans, pos = [], [], 0
    for i, (name, text) in enumerate(secs):
        sep = "" if i == 0 else ("\n\n" if name == "reveal" else " ")   # a paragraph break: a beat before the reveal
        said = speakable(text)
        pos += len(sep)
        spans.append((pos, pos + len(said)))
        parts.append(sep + said)
        pos += len(said)
    text = "".join(parts)
    url = f"{ELEVEN}/text-to-speech/{voice_id}/with-timestamps"
    headers = {"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}
    r = requests.post(url, headers=headers, timeout=180, json={"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": VOICE_SETTINGS})
    r.raise_for_status()
    j = r.json()
    al = j.get("normalized_alignment") or j["alignment"]
    if "".join(al["characters"]) != text:
        al = j["alignment"]
    starts, ends = al["character_start_times_seconds"], al["character_end_times_seconds"]
    if len(starts) != len(text):
        raise RuntimeError("timings do not match the text")
    tmp = out / "parts"
    tmp.mkdir(exist_ok=True)
    (tmp / "take.mp3").write_bytes(base64.b64decode(j["audio_base64"]))
    to_wav(tmp / "take.mp3", out / "voice.wav")
    total = duration(out / "voice.wav")
    timed = []
    for i, ((name, text_i), (a, b)) in enumerate(zip(secs, spans)):
        st = starts[a]
        en = starts[spans[i + 1][0]] if i + 1 < len(secs) else total
        timed.append({"name": name, "text": text_i, "start": round(st, 3), "end": round(min(en, total), 3)})
        print(f"  {name:<8} {ends[b - 1] - st:5.2f}s")
    (tmp / "take.json").write_text(json.dumps(timed, indent=2))
    return timed


def build_lines(script, voice_id, out):
    tmp = out / "parts"
    tmp.mkdir(exist_ok=True)
    silence(tmp / "gap.wav", GAP)
    silence(tmp / "gap_long.wav", PRE_REVEAL_GAP)

    secs, files, cursor, timed = sections(script), [], 0.0, []
    for i, (name, text) in enumerate(secs):
        mp3, wav = tmp / f"{i:02d}_{name}.mp3", tmp / f"{i:02d}_{name}.wav"
        before = secs[i - 1][1] if i else ""
        after = secs[i + 1][1] if i < len(secs) - 1 else ""
        tts(text, voice_id, mp3, before, after)
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
    return timed


def build_silent(script, out):
    """No voice: every section lasts as long as it takes to read, the words lit one after the other.
    Writes a silent voice.wav so the rest of the pipeline is unchanged."""
    timed, words, cursor = [], [], 0.0
    for i, (name, text) in enumerate(sections(script)):
        if i and name == "reveal":
            cursor += 0.6                                  # a beat before the reveal
        toks = text.split()
        d = max(1.8, len(toks) / 3.5 + 0.3) if name == "hook" else max(1.6, len(toks) / READ_WPS + 0.4)  # the hook is a big headline, read faster
        timed.append({"name": name, "text": text, "start": round(cursor, 3), "end": round(cursor + d, 3)})
        lens = [max(len(norm(t)), 1) for t in toks]
        total, acc, span = sum(lens) or 1, 0, d - 0.3
        for t, n in zip(toks, lens):
            words.append({"w": t, "start": round(cursor + span * acc / total, 3), "end": round(cursor + span * (acc + n) / total, 3)})
            acc += n
        cursor += d + GAP
    silence(out / "voice.wav", round(cursor, 3))
    return timed, words


def build(topic, file=None):
    out = MEDIA_DIR / topic
    with open(out / "script.json") as f:
        script = json.load(f)

    if not file and not VOICE:
        timed, words = build_silent(script, out)
        timing = {"source": "none (captions)", "silent": True, "duration": round(duration(out / "voice.wav"), 3),
                  "sections": timed, "words": words}
        with open(out / "timing.json", "w") as f:
            json.dump(timing, f, indent=2)
        print(f"      no voice: {timing['duration']:.1f}s at reading speed")
        return timing

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
    take = out / "parts" / "take.json"
    for i, (name, text) in enumerate(secs if not take.exists() else []):
        d = duration(out / "parts" / f"{i:02d}_{name}.wav")
        timed.append({"name": name, "text": text, "start": round(cursor, 3), "end": round(cursor + d, 3)})
        cursor += d
        if i < len(secs) - 1:
            cursor += PRE_REVEAL_GAP if secs[i + 1][0] == "reveal" else GAP
    if take.exists():
        timed = json.loads(take.read_text())
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
