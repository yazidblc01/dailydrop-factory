// ---------- Stream clips: streamers' GTA 6 Twitch moments as Daily Drop verticals ----------
// A reel is a list of segments played back to back:
//   single clip:      [cold open: 1 s of the peak] + [the trimmed moment]
//   streamers react:  [the same moment from 2 or 3 streamers], each labelled with the streamer's name
// Each segment: facecam on top and the game below (cut out of the streamer's layout), or the game framed on a
// blurred backdrop when there's no facecam. Hook on the seam, word-by-word captions, a punch-in on the peak reaction,
// the streamer's credit, then the follow card.
import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Drop, Follow, FollowCard, PAL, SANS, MONO, clamp01, outBack, useEdFonts} from './kit';

type Box = {x: number; y: number; w: number; h: number};   // fractions of the source frame
type Word = {w: string; start: number; end: number};       // seconds into the segment
export type Seg = {src: string; srcW: number; srcH: number; from: number; dur: number;   // from: seconds into the source
  facecam?: Box | null; gamebox?: Box | null; star?: 'reaction' | 'gameplay'; peak?: number | null;
  words?: Word[]; credit: string; label?: string; flash?: boolean};
export type EdClipProps = {segs: Seg[]; hook: string; badge: string; duration: number; follow?: Follow; react?: boolean};

const FPS = 30;

// a window of width W x height H showing the region r of the source, filled edge to edge
const Win: React.FC<{s: Seg; r: Box; W: number; H: number; top: number; blur?: boolean; muted?: boolean; zoom?: number}> =
  ({s, r, W, H, top, blur, muted, zoom = 1}) => {
  const k = Math.max(W / (r.w * s.srcW), H / (r.h * s.srcH)) * zoom;
  const vw = s.srcW * k, vh = s.srcH * k;
  const left = -r.x * vw + (W - r.w * vw) / 2, vtop = -r.y * vh + (H - r.h * vh) / 2;
  return (
    <div style={{position: 'absolute', left: 0, top, width: W, height: H, overflow: 'hidden'}}>
      <OffthreadVideo src={staticFile(s.src)} muted={muted} startFrom={Math.round(s.from * FPS)}
        style={{position: 'absolute', left, top: vtop, width: vw, height: vh, filter: blur ? 'blur(40px) brightness(0.45)' : undefined}} />
    </div>
  );
};

const groups = (words: Word[]) => {   // 1 to 4 words per caption, broken at pauses and punctuation
  const out: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (cur.length >= 4 || !next || next.start - w.end > 0.35 || /[.!?,]$/.test(w.w)) {
      out.push(cur);
      cur = [];
    }
  });
  return out;
};

// one segment, laid out (t = seconds into the segment)
const Shot: React.FC<{s: Seg; t: number; hook: string; badge: string; showHook: boolean}> = ({s, t, hook, badge, showHook}) => {
  const cam = s.facecam && s.facecam.w > 0.05 ? s.facecam : null;
  // when the reaction is the star, the streamer gets half the screen; otherwise the gameplay gets two thirds
  const camH = s.star === 'reaction' ? 940 : 680;
  const gameTop = cam ? camH : 360, gameH = cam ? 1920 - camH : 1200;
  // the part of the frame that is the game (streamers' layouts add chat boxes, bars and borders around it)
  const gb: Box = s.gamebox && s.gamebox.w > 0.2 && s.gamebox.h > 0.2 ? s.gamebox : {x: 0, y: 0, w: 1, h: 1};
  const gw = Math.min(gb.w, (gb.h * s.srcH * (1080 / gameH)) / s.srcW);
  let gx = gb.x + (gb.w - gw) / 2;                         // centered, but slid off a facecam sitting on the game
  const camOnGame = cam && cam.y < gb.y + gb.h && cam.y + cam.h > gb.y;
  if (camOnGame && cam.x + cam.w / 2 > 0.5 && gx + gw > cam.x) gx = Math.max(gb.x, cam.x - gw);
  if (camOnGame && cam.x + cam.w / 2 <= 0.5 && gx < cam.x + cam.w) gx = Math.min(gb.x + gb.w - gw, cam.x + cam.w);
  const game: Box = {x: gx, y: gb.y, w: gw, h: gb.h};
  // punch-in on the peak reaction: up to 12% over 0.35 s, held, then eased back
  const pk = s.peak ?? -9;
  const zoom = 1 + 0.12 * clamp01((t - (pk - 0.35)) / 0.35) * clamp01((pk + 1.4 - t) / 0.4);
  const caps = groups(s.words ?? []);
  const cap = caps.find((g) => t >= g[0].start - 0.05 && t <= g[g.length - 1].end + 0.25);
  const seam = cam ? camH : gameTop;
  const pop = outBack(clamp01(t / 0.35), 1.8);
  return (
    <AbsoluteFill style={{background: '#0d0718'}}>
      {!cam && <Win s={s} r={{x: 0.2, y: 0, w: 0.6, h: 1}} W={1080} H={1920} top={0} blur muted />}
      {cam && <Win s={s} r={cam} W={1080} H={camH} top={0} muted zoom={zoom} />}
      <Win s={s} r={game} W={1080} H={gameH} top={gameTop} zoom={cam ? 1 : zoom} />
      <div style={{position: 'absolute', left: 0, right: 0, top: seam - 3, height: 6, background: '#FF4FA0'}} />
      {showHook && (
        <div style={{position: 'absolute', left: 40, right: 40, top: seam - 70, textAlign: 'center', transform: `scale(${0.7 + 0.3 * pop})`}}>
          <span style={{display: 'inline-block', fontFamily: SANS, fontWeight: 900, fontSize: hook.length > 16 ? 70 : 90, lineHeight: 1.05, color: '#FFE07A',
            textTransform: 'uppercase', WebkitTextStroke: '10px #1a0a2e', paintOrder: 'stroke fill', textShadow: '0 8px 30px rgba(0,0,0,0.6)'}}>{hook}</span>
        </div>
      )}
      {s.label && (
        <div style={{position: 'absolute', left: 0, right: 0, top: seam + 40, textAlign: 'center'}}>
          <span style={{display: 'inline-block', fontFamily: SANS, fontWeight: 900, fontSize: 48, padding: '8px 22px', borderRadius: 16, background: '#FF4FA0', color: '#fff',
            transform: `scale(${outBack(clamp01(t / 0.3), 2)})`}}>{s.label}</span>
        </div>
      )}
      {cap && (
        <div style={{position: 'absolute', left: 50, right: 50, top: Math.min(1400, gameTop + gameH * 0.5), textAlign: 'center'}}>
          <span style={{display: 'inline-block', padding: '10px 22px', borderRadius: 20, background: 'rgba(13,7,24,0.82)', fontFamily: SANS, fontWeight: 900, fontSize: 58, lineHeight: 1.2, color: '#fff'}}>
            {cap.map((w, i) => {
              const now = t >= w.start - 0.03 && t <= w.end + 0.08;
              return <span key={i} style={{margin: '0 6px', padding: '0 6px', borderRadius: 8, background: now ? '#FFE07A' : 'transparent', color: now ? '#2A1046' : '#fff'}}>{w.w}</span>;
            })}
          </span>
        </div>
      )}
      <div style={{position: 'absolute', top: 160, left: 40}}>
        <span style={{fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: '0.12em', padding: '8px 16px', borderRadius: 999, background: '#FF4FA0', color: '#fff'}}>{badge}</span>
      </div>
      <div style={{position: 'absolute', top: 214, left: 40}}>
        <span style={{fontFamily: SANS, fontWeight: 800, fontSize: 26, padding: '7px 16px', borderRadius: 999, background: 'rgba(13,7,24,0.75)', color: '#fff'}}>🎥 {s.credit}</span>
      </div>
      {s.flash && <AbsoluteFill style={{background: '#fff', opacity: clamp01(1 - (s.dur - t) / 0.12) * 0.9}} />}
    </AbsoluteFill>
  );
};

// our name, top right: bobs gently, and every 4 s does a little hop with a squash on landing
const Brand: React.FC<{t: number}> = ({t}) => {
  const ph = t % 4;
  const hop = ph < 0.5 ? Math.sin((ph / 0.5) * Math.PI) * 26 : 0;
  const squash = ph >= 0.5 && ph < 0.68 ? Math.sin(((ph - 0.5) / 0.18) * Math.PI) * 0.1 : 0;
  const bob = Math.sin(t * 2.2) * 4;
  const pop = outBack(clamp01(t / 0.5), 2);
  return (
    <div style={{position: 'absolute', top: 156, right: 40, transformOrigin: '50% 100%',
      transform: `translateY(${-hop + bob}px) scale(${pop * (1 + squash)}, ${pop * (1 - squash)})`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px 8px 12px', borderRadius: 999, background: 'rgba(13,7,24,0.78)',
        border: '2px solid #FF4FA0', boxShadow: '0 8px 24px rgba(0,0,0,0.45)'}}>
        <div style={{transform: `rotate(${Math.sin(t * 3) * 8}deg)`}}><Drop size={34} fill="#FF4FA0" bars="#0d0718" /></div>
        <span style={{fontFamily: 'Instrument Serif', fontSize: 36, color: '#FFF3EA', lineHeight: 1, whiteSpace: 'nowrap'}}>The Daily <i style={{color: '#FF4FA0'}}>Drop</i></span>
      </div>
    </div>
  );
};

export const EdClip: React.FC<EdClipProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  useEdFonts();
  let at = 0;
  const parts = p.segs.map((s, i) => {
    const from = Math.round(at * fps), len = Math.max(1, Math.round(s.dur * fps));
    at += s.dur;
    const t = (frame - from) / fps;
    return (
      <Sequence key={i} from={from} durationInFrames={len}>
        <Shot s={s} t={t} hook={p.hook} badge={p.badge} showHook />
        {i > 0 && <Audio src={staticFile('sfx/whoosh.mp3')} volume={0.35} endAt={Math.round(0.6 * fps)} />}
        {s.peak != null && s.peak > 0.2 && (
          <Sequence from={Math.round((s.peak - 0.05) * fps)} durationInFrames={Math.round(1.2 * fps)}>
            <Audio src={staticFile('sfx/impact.mp3')} volume={0.3} />
          </Sequence>
        )}
      </Sequence>
    );
  });
  return (
    <AbsoluteFill style={{background: '#0d0718'}}>
      {parts}
      <Brand t={frame / fps} />
      {p.follow && <FollowCard P={PAL.vice} t={frame / fps} f={p.follow} />}
    </AbsoluteFill>
  );
};
