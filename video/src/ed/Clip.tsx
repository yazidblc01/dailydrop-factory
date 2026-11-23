// ---------- Stream clips: streamers' GTA 6 Twitch moments as Daily Drop verticals ----------
// A reel is a list of segments played back to back:
//   single clip:      [cold open: 1 s of the peak] + [the trimmed moment]
//   streamers react:  [the same moment from 2 or 3 streamers], each labelled with the streamer's name
// Each segment: facecam on top and the game below (cut out of the streamer's layout), or the game framed on a
// blurred backdrop when there's no facecam. Hook on the seam, word-by-word captions, a punch-in on the peak reaction,
// the streamer's credit, then the follow card.
import React from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Drop, Follow, LogoOutro, SANS, MONO, clamp01, outBack, useEdFonts} from './kit';

type Box = {x: number; y: number; w: number; h: number};   // fractions of the source frame
type Word = {w: string; start: number; end: number};       // seconds into the segment
export type Seg = {src: string; srcW: number; srcH: number; from: number; dur: number;   // from: seconds into the source
  facecam?: Box | null; gamebox?: Box | null; star?: 'reaction' | 'gameplay'; peak?: number | null;
  words?: Word[]; credit: string; label?: string; flash?: boolean; face?: boolean;   // face: a real human facecam (not an avatar)
  blurs?: {t0: number; t1: number; x: number; y: number; w: number; h: number}[];   // nudity to blur: segment seconds, source fractions
  layout?: 'crop' | 'zoom'; bg?: string | null};   // bg: the small pre-blurred background video (zoom layout)   // crop: the game fills the screen; zoom: the whole game width in a band, the facecam large on top
export type EdClipProps = {segs: Seg[]; hook: string; badge: string; duration: number; follow?: Follow; react?: boolean;
  setup?: string; setupAt?: number};   // setup: one line of context shown for the first seconds of the story

const FPS = 30;

// a window of width W x height H showing the region r of the source, filled edge to edge
export const Win: React.FC<{s: Seg; r: Box; W: number; H: number; top: number; blur?: boolean; muted?: boolean; zoom?: number; t?: number}> =
  ({s, r, W, H, top, blur, muted, zoom = 1, t}) => {
  const k = Math.max(W / (r.w * s.srcW), H / (r.h * s.srcH)) * zoom;
  const vw = s.srcW * k, vh = s.srcH * k;
  const left = -r.x * vw + (W - r.w * vw) / 2, vtop = -r.y * vh + (H - r.h * vh) / 2;
  return (
    <div style={{position: 'absolute', left: 0, top, width: W, height: H, overflow: 'hidden'}}>
      <OffthreadVideo src={staticFile(s.src)} muted={muted} startFrom={Math.round(s.from * FPS)}
        style={{position: 'absolute', left, top: vtop, width: vw, height: vh, filter: blur ? 'blur(40px) brightness(0.45)' : undefined}} />
      {t != null && (s.blurs ?? []).filter((b) => t >= b.t0 && t <= b.t1).map((b, i) => (
        <div key={i} style={{position: 'absolute', left: left + b.x * vw, top: vtop + b.y * vh, width: b.w * vw, height: b.h * vh, borderRadius: 24,
          backdropFilter: 'blur(38px)', WebkitBackdropFilter: 'blur(38px)', background: 'rgba(90,70,100,0.35)'}} />
      ))}
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

// the part of the frame that is the game, cut to a W x H window (streamers' layouts add chat boxes, bars and borders around it);
// centered, but slid off a facecam sitting on the game
export const gameRegion = (s: Seg, W: number, H: number): Box => {
  const cam = s.facecam && s.facecam.w > 0.05 ? s.facecam : null;
  const gb: Box = s.gamebox && s.gamebox.w > 0.2 && s.gamebox.h > 0.2 ? s.gamebox : {x: 0, y: 0, w: 1, h: 1};
  const gw = Math.min(gb.w, (gb.h * s.srcH * (W / H)) / s.srcW);
  let gx = gb.x + (gb.w - gw) / 2;
  const camOnGame = cam && cam.y < gb.y + gb.h && cam.y + cam.h > gb.y;
  if (camOnGame && cam.x + cam.w / 2 > 0.5 && gx + gw > cam.x) gx = Math.max(gb.x, cam.x - gw);
  if (camOnGame && cam.x + cam.w / 2 <= 0.5 && gx < cam.x + cam.w) gx = Math.min(gb.x + gb.w - gw, cam.x + cam.w);
  return {x: gx, y: gb.y, w: gw, h: gb.h};
};

// one segment, laid out (t = seconds into the segment): the game fills the screen, the streamer's face is a small square
const SQ = 330, SQX = 40, SQY = 240;
const square = (c: Box, s: Seg): Box => {          // the facecam cut to a square, centered on it
  const side = Math.min(c.w * s.srcW, c.h * s.srcH);
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  return {x: cx - side / 2 / s.srcW, y: cy - side / 2 / s.srcH, w: side / s.srcW, h: side / s.srcH};
};
// the zoom layout: the game at 1.15x (only the sides trimmed) in a full-width band from y=640, the facecam 16:9 on top,
// a blurred copy of the game behind everything. The hook, setup and captions sit in the blur under the band.
export const ZOOM = 1.15, BAND_Y = 640, BAND_MAX = 820;
export const zoomBand = (s: Seg): {r: Box; h: number} => {
  const gb: Box = s.gamebox && s.gamebox.w > 0.2 && s.gamebox.h > 0.2 ? s.gamebox : {x: 0, y: 0, w: 1, h: 1};
  const gw = gb.w / ZOOM;
  const gx = gb.x + (gb.w - gw) / 2;                                       // always centered: the same amount trimmed off each side
  const h = Math.min(BAND_MAX, Math.round((1080 * gb.h * s.srcH) / (gw * s.srcW)));
  return {r: {x: gx, y: gb.y, w: gw, h: gb.h}, h};
};
const ZoomShot: React.FC<{s: Seg; t: number; zoom: number}> = ({s, t, zoom}) => {
  const cam = s.face !== false && s.facecam && s.facecam.w > 0.05 ? s.facecam : null;
  const band = zoomBand(s);
  const FW = 640, FH = 360;
  return (
    <>
      {s.bg ? <Win s={{...s, src: s.bg, srcW: 360, srcH: 640, blurs: []}} r={{x: 0, y: 0, w: 1, h: 1}} W={1080} H={1920} top={0} muted />
        : <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 40%, #3a1458, #0d0718 70%)'}} />}
      {cam && (
        <div style={{position: 'absolute', left: (1080 - FW) / 2, top: 250, width: FW, height: FH, borderRadius: 28, overflow: 'hidden', border: '5px solid #FF4FA0',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)'}}>
          <Win s={s} r={cam} W={FW - 10} H={FH - 10} top={0} muted t={t} />
        </div>
      )}
      <div style={{position: 'absolute', left: 0, top: BAND_Y, width: 1080, height: band.h, overflow: 'hidden', boxShadow: '0 0 60px rgba(0,0,0,0.65)'}}>
        <Win s={s} r={band.r} W={1080} H={band.h} top={0} zoom={zoom} t={t} />
      </div>
      <div style={{position: 'absolute', top: BAND_Y - 52, left: 40}}>
        <span style={{fontFamily: SANS, fontWeight: 800, fontSize: 22, padding: '5px 12px', borderRadius: 999, background: 'rgba(13,7,24,0.7)', color: '#fff'}}>🎥 {s.credit}</span>
      </div>
    </>
  );
};
// where the hook, the setup line and the captions go: over the game (crop) or in the blur under the band (zoom)
export const textSpots = (s?: Seg) => {
  if (s?.layout !== 'zoom') return {hook: 660, setup: 820, cap: 1420};
  const b = BAND_Y + zoomBand(s).h;
  return {hook: b + 30, setup: b + 170, cap: Math.min(1600, b + 330)};
};

export const Shot: React.FC<{s: Seg; t: number; camY?: number}> = ({s, t, camY = SQY}) => {
  const cam = s.face !== false && s.facecam && s.facecam.w > 0.05 ? s.facecam : null;
  const game = gameRegion(s, 1080, 1920);
  // punch-in on the peak: up to 10% over 0.35 s, held, then eased back
  const pk = s.peak ?? -9;
  const zoom = 1 + 0.1 * clamp01((t - (pk - 0.35)) / 0.35) * clamp01((pk + 1.4 - t) / 0.4);
  const caps = groups(s.words ?? []);
  const cap = caps.find((g) => t >= g[0].start - 0.05 && t <= g[g.length - 1].end + 0.25);
  const zl = s.layout === 'zoom';
  const spots = textSpots(s);
  return (
    <AbsoluteFill style={{background: '#0d0718'}}>
      {zl ? <ZoomShot s={s} t={t} zoom={zoom} /> : <Win s={s} r={game} W={1080} H={1920} top={0} zoom={zoom} t={t} />}
      {!zl && cam && (
        <div style={{position: 'absolute', left: SQX, top: camY, width: SQ, height: SQ, borderRadius: 28, overflow: 'hidden', border: '5px solid #FF4FA0',
          boxShadow: '0 14px 34px rgba(0,0,0,0.6)'}}>
          <Win s={s} r={square(cam, s)} W={SQ - 10} H={SQ - 10} top={0} muted t={t} />
        </div>
      )}
      {!zl && <div style={{position: 'absolute', top: cam ? camY + SQ + 14 : camY, left: SQX}}>
        <span style={{fontFamily: SANS, fontWeight: 800, fontSize: 22, padding: '5px 12px', borderRadius: 999, background: 'rgba(13,7,24,0.7)', color: '#fff'}}>🎥 {s.credit}</span>
      </div>}
      {s.label && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 700, textAlign: 'center'}}>
          <span style={{display: 'inline-block', fontFamily: SANS, fontWeight: 900, fontSize: 44, padding: '8px 22px', borderRadius: 16, background: '#FF4FA0', color: '#fff',
            transform: `scale(${outBack(clamp01(t / 0.3), 2)})`}}>{s.label}</span>
        </div>
      )}
      {cap && (
        <div style={{position: 'absolute', left: 40, right: 40, top: spots.cap, textAlign: 'center'}}>
          <span style={{fontFamily: SANS, fontWeight: 900, fontSize: 54, lineHeight: 1.2, color: '#fff', WebkitTextStroke: '9px #000', paintOrder: 'stroke fill'}}>
            {cap.map((w, i) => {
              const now = t >= w.start - 0.03 && t <= w.end + 0.08;
              return <span key={i} style={{margin: '0 6px', color: now ? '#FFE07A' : '#fff'}}>{w.w}</span>;
            })}
          </span>
        </div>
      )}
      {s.flash && <AbsoluteFill style={{background: '#fff', opacity: clamp01(1 - (s.dur - t) / 0.12) * 0.9}} />}
    </AbsoluteFill>
  );
};

// the hook: a small headline over the game for the first 3 s, then gone
const Hook: React.FC<{text: string; t: number; top?: number}> = ({text, t, top = 660}) => {
  if (!text || t > 3.3) return null;
  const k = outBack(clamp01(t / 0.35), 1.8) * (1 - clamp01((t - 3.0) / 0.3));
  return (
    <div style={{position: 'absolute', left: 60, right: 60, top, textAlign: 'center', opacity: clamp01(k * 1.5), transform: `scale(${0.8 + 0.2 * k})`}}>
      <span style={{fontFamily: SANS, fontWeight: 900, fontSize: text.length > 18 ? 52 : 60, lineHeight: 1.08, color: '#FFE07A', textTransform: 'uppercase',
        WebkitTextStroke: '8px #1a0a2e', paintOrder: 'stroke fill', textShadow: '0 6px 20px rgba(0,0,0,0.6)'}}>{text}</span>
    </div>
  );
};

// our name, top right: bobs gently, and every 4 s does a little hop with a squash on landing
export const Brand: React.FC<{t: number}> = ({t}) => {
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

// the context line: what is going on, so someone scrolling in understands the moment before it lands
// where the facecam strip meets the game (the hook sits just above it, the setup line just below)

const Setup: React.FC<{text: string; t: number; top?: number}> = ({text, t, top = 820}) => {
  const hold = Math.min(3.5, Math.max(2.6, text.split(' ').length / 3.4 + 0.6));
  if (t < 0 || t > hold + 0.3) return null;
  const k = outBack(clamp01(t / 0.3), 1.6) * (1 - clamp01((t - hold) / 0.3));
  return (
    <div style={{position: 'absolute', left: 90, right: 90, top, display: 'flex', justifyContent: 'center', opacity: k}}>
      <span style={{display: 'inline-block', fontFamily: SANS, fontWeight: 700, fontSize: 34, lineHeight: 1.25, padding: '10px 20px', borderRadius: 16,
        background: 'rgba(13,7,24,0.72)', color: '#fff', textAlign: 'center'}}>{text}</span>
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
        <Shot s={s} t={t} />
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
      <Hook text={p.hook} t={frame / fps} top={textSpots(p.segs[0]).hook} />
      {p.setup && <Setup text={p.setup} t={frame / fps - (p.setupAt ?? 0)} top={textSpots(p.segs[p.segs.length - 1]).setup} />}
      <Brand t={frame / fps} />
      {p.follow && <LogoOutro t={frame / fps} at={p.follow.at} />}
    </AbsoluteFill>
  );
};

// ---------- GTA 5 vs GTA 6: the same action in both games, GTA 5 on top, GTA 6 below, playing together ----------
export type Pair = {top: Seg; bottom: Seg; dur: number; action: string};
export type EdVsProps = {pairs: Pair[]; hook: string; badge: string; duration: number; follow?: Follow};

const Half: React.FC<{s: Seg; top: number; label: string; tone: string; t: number; volume: number}> = ({s, top, label, tone, t, volume}) => {
  const H = 960;
  const r = gameRegion(s, 1080, H);
  const pk = s.peak ?? -9;
  const zoom = 1 + 0.08 * clamp01((t - (pk - 0.3)) / 0.3) * clamp01((pk + 1.2 - t) / 0.4);
  const k = Math.max(1080 / (r.w * s.srcW), H / (r.h * s.srcH)) * zoom;
  const vw = s.srcW * k, vh = s.srcH * k;
  return (
    <div style={{position: 'absolute', left: 0, top, width: 1080, height: H, overflow: 'hidden'}}>
      <OffthreadVideo src={staticFile(s.src)} volume={volume} startFrom={Math.round(s.from * FPS)}
        style={{position: 'absolute', left: -r.x * vw + (1080 - r.w * vw) / 2, top: -r.y * vh + (H - r.h * vh) / 2, width: vw, height: vh}} />
      <div style={{position: 'absolute', left: 60, top: top === 0 ? 240 : 40, transform: `scale(${outBack(clamp01(t / 0.3), 2)})`, transformOrigin: 'left center'}}>
        <span style={{display: 'inline-block', fontFamily: SANS, fontWeight: 900, fontSize: 64, padding: '6px 24px', borderRadius: 18, background: tone, color: '#fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)'}}>{label}</span>
      </div>
      <div style={{position: 'absolute', left: 40, top: top === 0 ? 386 : 136}}>
        <span style={{fontFamily: SANS, fontWeight: 800, fontSize: 24, padding: '6px 14px', borderRadius: 999, background: 'rgba(13,7,24,0.75)', color: '#fff'}}>🎥 {s.credit}</span>
      </div>
    </div>
  );
};

export const EdVs: React.FC<EdVsProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  useEdFonts();
  let at = 0;
  const parts = p.pairs.map((pr, i) => {
    const from = Math.round(at * fps), len = Math.max(1, Math.round(pr.dur * fps));
    at += pr.dur;
    const t = (frame - from) / fps;
    const pop = outBack(clamp01(t / 0.35), 1.8);
    return (
      <Sequence key={i} from={from} durationInFrames={len}>
        <AbsoluteFill style={{background: '#0d0718'}}>
          <Half s={pr.top} top={0} label="GTA 5" tone="#5b5f6b" t={t} volume={0.3} />
          <Half s={pr.bottom} top={960} label="GTA 6" tone="#FF4FA0" t={t} volume={1} />
          <div style={{position: 'absolute', left: 0, right: 0, top: 957, height: 6, background: '#FF4FA0'}} />
          <div style={{position: 'absolute', left: 40, right: 40, top: 890, textAlign: 'center', transform: `scale(${0.7 + 0.3 * pop})`}}>
            <span style={{display: 'inline-block', fontFamily: SANS, fontWeight: 900, fontSize: 84, lineHeight: 1.05, color: '#FFE07A', textTransform: 'uppercase',
              WebkitTextStroke: '10px #1a0a2e', paintOrder: 'stroke fill', textShadow: '0 8px 30px rgba(0,0,0,0.6)'}}>{i === 0 ? p.hook : pr.action}</span>
          </div>
        </AbsoluteFill>
        {i > 0 && <Audio src={staticFile('sfx/whoosh.mp3')} volume={0.35} endAt={Math.round(0.6 * fps)} />}
        {pr.bottom.peak != null && pr.bottom.peak > 0.2 && (
          <Sequence from={Math.round((pr.bottom.peak - 0.05) * fps)} durationInFrames={Math.round(1.2 * fps)}>
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
      {p.follow && <LogoOutro t={frame / fps} at={p.follow.at} />}
    </AbsoluteFill>
  );
};
