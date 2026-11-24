"""Recording mining: find the big moments in our streamers' past streams from how their chat reacted, cut them ourselves.

Viewer-made Twitch clips only cover what someone bothered to clip, in the window they picked. A stream's chat replay shows every
moment the audience reacted to: when messages per 10 seconds jump far above that stream's normal pace, something happened.
We cut a minute around each spike (the setup included), screen it like any clip, and it lands in the bank: the clip slots post
the best ones. Free: no Claude until a moment is screened, the same cheap screening as fresh clips.

Sources
  Twitch    allowlisted streamers' recordings (VODs) from the last 36 h, only the parts where they played GTA 6
            (known from their GTA 6 clips' times). Chat replay through TwitchDownloaderCLI (free, open source).
  YouTube   allowlisted YouTube streamers' past GTA 6 live streams (data/streamers.json "youtube"), chat replay through yt-dlp.

    python -m engine.vodmine --dry          what it would mine: VODs, GTA 6 windows, chat spikes; no downloads, no Claude
    python -m engine.vodmine                mine and screen (fills the bank, posts nothing)
"""
import argparse
import json
import re
import statistics
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from config import MEDIA_DIR

ROOT = Path(__file__).resolve().parents[1]
TDL = ROOT / "tools" / "bin" / "TwitchDownloaderCLI"
BIN, WINDOW_PAD = 10, 20 * 60          # chat counted per 10 s; fallback GTA 6 window = 20 min either side of each GTA 6 clip
BEFORE, AFTER = 45, 15                 # the cut around a spike: chat reacts a few seconds late, so most of it is before
MIN_RATIO, MIN_MSGS = 2.2, 12          # a spike: 2.2x the stream's usual pace and at least 12 messages in 10 s
HOLE = 120                             # 2 min with zero chat in a busy stream = a hole in the download
EDGE = 6 * 60                          # no moments in a stream's first or last 6 min (hellos, goodbyes)
PER_STREAM, GAP = 3, 300               # at most 3 moments per stream, at least 5 min apart
MAX_VODS, MAX_MINUTES = 6, 40          # per run (the run must end before the next clip slot)
STOP = set("""the a an to of in on at is it its it's this that these those and or but so if then than for with from by as be
been are was were am i you he she we they me him her us them my your his our their what why how who when where which just not no
do does did dont don't can cant can't will would should could have has had im i'm youre you're hes he's thats that's its there here
like get got go all one up out about too very really now oh yeah ok okay""".split())
GTA_CH = re.compile(r"grand theft auto (vi|6)|gta ?(vi|6)\b", re.I)
YT_TITLE = re.compile(r"gta ?(6|vi)\b|grand theft auto (6|vi)\b", re.I)


# ---------- the spikes ----------
def spikes(offsets, t0, t1, t_end=0):
    """offsets: seconds of each chat message. Returns [(spike second, messages in that 10 s, ratio to the usual pace, bin index)]."""
    n = int((t1 - t0) // BIN) + 1
    counts = [0] * n
    for o in offsets:
        if t0 <= o < t1:
            counts[int((o - t0) // BIN)] += 1
    # empty 10 s are gaps in the chat replay (or a dead stretch), not the usual pace: leave them out of both baselines
    live = [c for c in counts if c]
    usual = statistics.median(live) if live else 0                     # the stream's usual pace per 10 s
    out = []
    for i, c in enumerate(counts):
        if t0 + i * BIN < EDGE or (t_end and t_end - (t0 + i * BIN) < EDGE):
            continue                                                   # stream start (hellos) and end (goodbyes)
        base = statistics.median([x for x in counts[max(0, i - 60):i] if x] or [0])   # the last 10 minutes
        ratio = c / max(base, usual, 2.0)
        if c >= MIN_MSGS and ratio >= MIN_RATIO:
            out.append((t0 + i * BIN, c, ratio, i))
    out.sort(key=lambda x: -(x[2] * x[1] ** 0.5))
    picked = []
    for s in out:
        if all(abs(s[0] - p[0]) >= GAP for p in picked):
            picked.append(s)
        if len(picked) == PER_STREAM:
            break
    return picked


def chat_words(msgs, t, k=6):
    """What chat was saying right after the moment: the most repeated words/emotes, for the screener's context."""
    words = {}
    for o, body in msgs:
        if t - 5 <= o <= t + 25:
            for w in set(re.findall(r"[\w']+|[^\w\s]{2,}", body.lower())):
                if len(w) > 1 and w not in STOP:
                    words[w] = words.get(w, 0) + 1
    top = sorted(words.items(), key=lambda x: -x[1])[:k]
    return ", ".join(f"{w} x{n}" for w, n in top)


# ---------- Twitch ----------
def tdl_ready():
    if TDL.exists():
        return True
    print("      TwitchDownloaderCLI missing: run python tools/get_tdl.py")
    return False


def _tdl(vod_id, t0, t1, out):
    """One TwitchDownloaderCLI chat download: {message id: (second, text)}."""
    f = out / f"chat_{vod_id}_{int(t0)}_{int(t1)}.json"
    subprocess.run([str(TDL), "chatdownload", "--id", str(vod_id), "-b", str(int(t0)), "-e", str(int(t1)), "-o", str(f),
                    "--compression", "None", "-t", "4"], check=True, capture_output=True, timeout=900)
    j = json.loads(f.read_text())
    f.unlink(missing_ok=True)
    return {c.get("_id") or f"{c['content_offset_seconds']}_{i}": (float(c["content_offset_seconds"]), (c.get("message") or {}).get("body", ""))
            for i, c in enumerate(j.get("comments", []))}


def holes(offsets, t0, t1, min_len=HOLE):
    """Stretches of [t0, t1] with no chat at all for min_len seconds or more: Twitch sometimes ends a download page early."""
    ts = sorted(o for o in offsets if t0 <= o < t1)
    out, prev = [], t0
    for o in ts + [t1]:
        if o - prev >= min_len:
            out.append((prev, o))
        prev = o
    return out


def twitch_chat(vod_id, t0, t1, out):
    """Chat replay messages [(second, text)] for [t0, t1] of a VOD. Twitch's replay sometimes stops a download thread early
    and leaves a hole; holes in a busy chat are downloaded again (fresh start at the hole), twice at most."""
    got = _tdl(vod_id, t0, t1, out)
    for _ in range(2):
        offs = [o for o, _ in got.values()]
        if len(offs) / max(1, (t1 - t0) / BIN) < 3:          # a quiet chat: gaps are real
            break
        hs = holes(offs, t0, t1)[:12]
        if not hs:
            break
        before = len(got)
        for a, b in hs:
            try:
                got.update(_tdl(vod_id, a, b, out))
            except Exception:
                continue
        print(f"        refilled {len(hs)} chat hole(s): +{len(got) - before} messages")
        if len(got) == before:
            break
    return sorted(got.values())


def dur_s(d):
    """Twitch durations like 3h2m1s -> seconds."""
    m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", d or "")
    return sum(int(x or 0) * k for x, k in zip(m.groups(), (3600, 60, 1))) if m else 0


def vod_chapters(url):
    """The VOD's game chapters [(start s, end s, game)] through yt-dlp (Twitch marks every game switch). None if unknown."""
    r = subprocess.run(["yt-dlp", "-J", "--skip-download", "--no-warnings", url], capture_output=True, text=True, timeout=120)
    if r.returncode:
        return None
    ch = json.loads(r.stdout).get("chapters") or []
    return [(float(c.get("start_time") or 0), float(c.get("end_time") or 0), c.get("title") or "") for c in ch] or None


def twitch_targets(sc, st, tok):
    """Recent VODs with their GTA 6 windows (seconds into the VOD), from the streamer's GTA 6 clips' creation times."""
    gid = sc.game_id(tok)
    logins = list(sc.allowlist())
    users = []
    for i in range(0, len(logins), 100):
        users += sc.helix("users", tok, login=logins[i:i + 100])
    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=36)).strftime("%Y-%m-%dT%H:%M:%SZ")
    targets = []
    for u in users:
        vods = sc.helix("videos", tok, user_id=u["id"], type="archive", first=3)
        vods = [v for v in vods if datetime.fromisoformat(v["created_at"].replace("Z", "+00:00")) > now - timedelta(hours=36)]
        if not vods:
            continue
        clips = sc.helix("clips", tok, broadcaster_id=u["id"], started_at=since, ended_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"), first=100)
        gta = [c for c in clips if c["game_id"] == gid]
        for v in vods:
            start = datetime.fromisoformat(v["created_at"].replace("Z", "+00:00"))
            length = dur_s(v["duration"])
            done = st["mined"].get(v["id"], {})
            if done.get("done"):
                continue
            # where in this VOD they played GTA 6: the VOD's game chapters, else around each GTA 6 clip
            pairs = [((datetime.fromisoformat(c["created_at"].replace("Z", "+00:00")) - start).total_seconds(), c) for c in gta]
            pairs = [(m, c) for m, c in pairs if 0 <= m <= length + 120]
            marks = [m for m, _ in pairs]
            ch = vod_chapters(v["url"])
            if ch:
                wins = [[a, b or length] for a, b, g in ch if GTA_CH.search(g)]
            else:
                wins = []
                for m in sorted(marks):
                    a, b = max(0, m - WINDOW_PAD), min(length, m + WINDOW_PAD)
                    if wins and a <= wins[-1][1]:
                        wins[-1][1] = max(wins[-1][1], b)
                    else:
                        wins.append([a, b])
            if not wins:
                continue
            live = length > 0 and (now - (start + timedelta(seconds=length))).total_seconds() < 15 * 60    # still streaming
            until = done.get("until", 0)
            usable = length - (10 * 60 if live else 0)
            wins = [[max(a, until), min(b, usable)] for a, b in wins if min(b, usable) - max(a, until) > 120]
            if wins:
                # existing viewer clips: their moments already reach us through the normal pipeline
                clip_marks = [m for m, c in pairs if c["view_count"] >= sc.MIN_VIEWS]
                targets.append({"platform": "Twitch", "vod": v["id"], "login": u["login"], "name": u["display_name"], "url": v["url"],
                                "title": v["title"], "windows": wins, "live": live, "length": length, "clip_marks": clip_marks,
                                "views": v["view_count"], "src": "game chapters" if ch else "clip times"})
    targets.sort(key=lambda x: -x["views"])
    return targets


# ---------- YouTube ----------
def youtube_targets(st, allow):
    """Past GTA 6 live streams (last 36 h) of allowlisted YouTube channels: the whole stream is the window (titles say GTA 6)."""
    out = []
    for handle, name in allow.items():
        r = subprocess.run(["yt-dlp", "--flat-playlist", "-J", "--playlist-end", "6", f"https://www.youtube.com/{handle}/streams"],
                           capture_output=True, text=True, timeout=120)
        if r.returncode:
            print(f"      YouTube {handle}: {r.stderr.strip()[:120]}")
            continue
        for e in json.loads(r.stdout).get("entries", []):
            if not YT_TITLE.search(e.get("title") or "") or st["mined"].get(f"yt_{e['id']}", {}).get("done"):
                continue
            if e.get("live_status") not in ("was_live", None) or not e.get("duration"):
                continue                                        # still live or not a past stream
            out.append({"platform": "YouTube", "vod": f"yt_{e['id']}", "yt": e["id"], "login": handle, "name": name,
                        "url": f"https://www.youtube.com/watch?v={e['id']}", "title": e["title"], "windows": [[0, float(e["duration"])]],
                        "live": False, "length": float(e["duration"]), "clip_marks": [], "views": e.get("view_count") or 0})
    return out


def youtube_chat(yt_id, out):
    """The live chat replay [(second, text)] of a past YouTube stream, through yt-dlp (it saves it as a 'subtitle')."""
    base = out / f"yt_{yt_id}"
    subprocess.run(["yt-dlp", "--skip-download", "--write-subs", "--sub-langs", "live_chat", "-o", str(base), f"https://www.youtube.com/watch?v={yt_id}"],
                   check=True, capture_output=True, timeout=1800)
    f = next(out.glob(f"yt_{yt_id}*.live_chat.json"))
    msgs = []
    for line in f.read_text().splitlines():
        try:
            a = json.loads(line)["replayChatItemAction"]
            t = int(a["videoOffsetTimeMsec"]) / 1000
            for act in a.get("actions", []):
                r = act.get("addChatItemAction", {}).get("item", {}).get("liveChatTextMessageRenderer")
                if r:
                    msgs.append((t, "".join(x.get("text", "") for x in r.get("message", {}).get("runs", []))))
        except Exception:
            continue
    f.unlink(missing_ok=True)
    return msgs


# ---------- the cut ----------
def section(m, out):
    """Download the minute around a mined moment (yt-dlp cuts it straight from the recording), loudness-levelled like every clip."""
    from engine.streamclips import LEVEL
    v = m["vod_cut"]
    raw, lvl = out / "source.mp4", out / "level.mp4"
    if not lvl.exists():
        if not raw.exists():
            subprocess.run(["yt-dlp", "-q", "--no-warnings", "-S", "res:1080,fps", "--download-sections", f"*{v['start']:.0f}-{v['end']:.0f}",
                            "--force-keyframes-at-cuts", "-o", str(raw), v["url"]], check=True, timeout=600)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), *LEVEL, str(lvl)], check=True, capture_output=True, timeout=300)
    return lvl


# ---------- the run ----------
def run(dry=False, today=None):
    from engine import streamclips as sc
    today = today or datetime.now().date()
    t_start = time.time()
    st = sc.load_state()
    found = []
    out_root = MEDIA_DIR / "vodmine"
    out_root.mkdir(parents=True, exist_ok=True)
    targets = []
    try:
        tok = sc.token()
        targets += twitch_targets(sc, st, tok)
    except Exception as e:
        print(f"      Twitch recordings skipped: {str(e)[:160]}")
    try:
        allow = json.loads(sc.ALLOW.read_text()).get("youtube", {})
        targets += youtube_targets(st, allow) if allow else []
    except Exception as e:
        print(f"      YouTube recordings skipped: {str(e)[:160]}")
    print(f"      recordings to mine: {len(targets)} ({sum(1 for t in targets if t['platform'] == 'Twitch')} Twitch, "
          f"{sum(1 for t in targets if t['platform'] == 'YouTube')} YouTube)")
    screened = 0
    try:
        for tg in targets[:MAX_VODS]:
            if (time.time() - t_start) / 60 > MAX_MINUTES:
                print("      time's up for this run, the rest next time")
                break
            mins = sum(b - a for a, b in tg["windows"]) / 60
            print(f"      {tg['platform']} {tg['name']}: {tg['title'][:60]} ({mins:.0f} min of GTA 6 from {tg.get('src', 'title')}"
                  f"{', still live' if tg['live'] else ''})")
            try:
                if tg["platform"] == "Twitch":
                    if not tdl_ready():
                        continue
                    msgs = []
                    for a, b in tg["windows"]:
                        msgs += twitch_chat(tg["vod"], a, b, out_root)
                else:
                    msgs = youtube_chat(tg["yt"], out_root)
            except Exception as e:
                print(f"        chat replay failed: {str(e)[:160]}")
                continue
            offs = [o for o, _ in msgs]
            hits = []
            for a, b in tg["windows"]:
                hits += spikes(offs, a, b, 0 if tg["live"] else tg["length"])
            kept = []
            for h in sorted(hits, key=lambda x: -(x[2] * x[1] ** 0.5)):
                if all(abs(h[0] - k[0]) >= GAP for k in kept):
                    kept.append(h)
            hits = kept[:PER_STREAM]
            nb = max(1, int(sum(b - a for a, b in tg["windows"]) / BIN))
            filled = min(nb, len({int(o // BIN) for o in offs if any(a <= o < b for a, b in tg["windows"])}))
            print(f"        {len(msgs)} chat messages ({len(msgs) / nb:.0f} per 10 s on average, {100 - 100 * filled / nb:.0f}% of 10 s with no chat), "
                  f"{len(hits)} spike(s)")
            mark = st["mined"].setdefault(tg["vod"], {})
            mark.update({"at": datetime.now(timezone.utc).isoformat(), "until": max([b for _, b in tg["windows"]] + [mark.get("until", 0)]),
                         "done": not tg["live"]})
            for t, n, ratio, _ in hits:
                if any(-120 <= cm - t <= 60 for cm in tg["clip_marks"]):
                    print(f"        {t / 60:.1f} min: a viewer clip already covers it, skipped")
                    continue
                cid = f"{tg['vod']}_{int(t)}"
                if cid in st["used"]:
                    continue
                said = chat_words(msgs, t)
                s0, s1 = max(0.0, t - BEFORE), min(tg["length"], t + AFTER)
                print(f"        {t / 60:.1f} min: {n} messages in 10 s ({ratio:.1f}x usual), chat: {said}")
                if dry:
                    continue
                st["used"].append(cid)
                link = f"{tg['url']}?t={int(s0)}s" if tg["platform"] == "Twitch" else f"{tg['url']}&t={int(s0)}s"
                c = {"id": cid, "login": tg["login"], "broadcaster_name": tg["name"], "url": link, "platform": tg["platform"],
                     "title": (f"{tg['title'][:80]} (a moment from the stream recording: chat exploded, {n} messages in 10 s, "
                               f"{ratio:.0f}x the usual pace; chat said: {said}. use=false if the game on screen is not GTA 6)"),
                     "view_count": n}
                cut = {"url": tg["url"], "start": s0, "end": s1}
                out = MEDIA_DIR / f"mine__{cid[:40]}".replace("-", "_")
                out.mkdir(parents=True, exist_ok=True)
                try:
                    info = sc.media_info(section({"vod_cut": cut}, out))
                    a = sc.audio(info["src"])
                    v = sc.screen(c, info["src"], info["dur"], info["words"], sc.peaks(a), out)
                    screened += 1
                except Exception as e:
                    print(f"          skipped: {str(e)[:120]}")
                    continue
                st["seen"][cid] = {"at": datetime.now(timezone.utc).isoformat(), "login": tg["login"], "name": tg["name"], "url": link,
                                   "title": tg["title"][:100], "views": n, "platform": tg["platform"], "vod_cut": cut, "mined": True,
                                   **{k: v.get(k) for k in sc.SEEN_KEYS}}
                print(f"          screen: {'yes' if v['use'] else 'no'} ({v.get('score')}/10, {v.get('moment')}) {str(v.get('why'))[:110]}")
                found.append((cid, v.get("use"), v.get("score")))
    finally:
        cut_old = (datetime.now(timezone.utc) - timedelta(days=4)).isoformat()
        st["mined"] = {k: x for k, x in st["mined"].items() if x.get("at", "") > cut_old}
        if not dry:
            sc.save_state(st)
    good = [f for f in found if f[1]]
    print(f"      mined: {screened} moment(s) screened, {len(good)} approved for the bank")
    return None, None


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    run(a.dry)
