// ---------- Map explainer (Vox style): GTA 6's map vs the real place ----------
// The real state draws itself in, a hook card ("6 places, 1 is fake"). Then the camera flies to each place: a numbered pin pops,
// the card says "GTA name = real place" with one fact. Last, the camera flies to the made-up place: a "?" pin and a red FAKE stamp.
// Only the pin being talked about carries its name; the others keep their number. Then it zooms out on all the pins, the ending card, the question and the logo outro.
// Layout (1080x1920): 0-150 free for the apps' buttons, header 160, title 258-428, map 460-1460 (map space 1080x1000), card 1490-1700.
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, clamp01, lerp, outBack, smooth, useEdFonts} from './kit';

type Place = {gta: string; real: string; fact: string; at: [number, number]; side: 'left' | 'right'};
export type EdMapProps = {pre: string; em: string; hook: string[]; land: string; near: string[]; regions: Place[];
  fake: {gta: string; fact: string; at: [number, number]}; end: string[]; ask: string;
  start: number; step: number; fakeAt: number; endAt: number; outroAt: number; duration: number; music?: string | null};

const P = PAL.paper;
const INK = '#1d1a22', PINK = '#FF4FA0', RED = '#E0263C', SEA = '#CFE3E8', LAND = '#FFF8EA';
const MAP_TOP = 460, ZOOM = 1.9;

export const EdMap: React.FC<EdMapProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const n = p.regions.length;
  const seg = t < p.start ? -1 : t < p.fakeAt ? Math.floor((t - p.start) / p.step) : t < p.endAt ? n : n + 1;   // -1 hook, 0..n-1 places, n fake, n+1 end
  const segAt = (s: number) => (s < 0 ? 0 : s < n ? p.start + s * p.step : s === n ? p.fakeAt : p.endAt);
  const cam = (s: number): [number, number, number] =>
    s < 0 || s > n ? [540, 500, 1] : s === n ? [p.fake.at[0] + 60, p.fake.at[1] + 160, 1.7] : [p.regions[s].at[0] - 120, p.regions[s].at[1] - 40, ZOOM];
  const mv = smooth(segAt(seg), segAt(seg) + 0.7, t);
  const [ax, ay, az] = cam(seg - 1), [bx, by, bz] = cam(seg);
  const z = seg <= -1 ? 1 : lerp(az, bz, mv), cx = seg <= -1 ? 540 : lerp(ax, bx, mv), cy = seg <= -1 ? 500 : lerp(ay, by, mv);
  const draw = smooth(0.2, 1.5, t);
  const fade = 1 - smooth(p.outroAt - 0.2, p.outroAt, t);
  const titleK = outBack(clamp01(t / 0.35), 1.6);
  const cardK = outBack(clamp01((t - segAt(seg) - (seg < 0 ? 1.0 : 0.12)) / 0.3), 1.7);
  const popAt = (s: number) => segAt(s) + 0.35, stampAt = p.fakeAt + 1.0;

  const pin = (i: number, x: number, y: number, label: string, col: string, txt: string, big: boolean, k: number, side: 'left' | 'right') => {
    const r = (big ? 34 : 24) / z, s = outBack(k, 2);
    return (
      <g key={i} transform={`translate(${x},${y}) scale(${s})`} opacity={clamp01(k * 3)}>
        {big && <circle r={r + (16 + 10 * Math.sin(t * 6)) / z} fill="none" stroke={col} strokeWidth={5 / z} opacity={0.45} />}
        <circle r={r} fill={col} stroke="#fff" strokeWidth={5 / z} />
        <text y={(big ? 12 : 9) / z} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={(big ? 34 : 26) / z} fill="#fff">{txt}</text>
        {big && <text x={(side === 'left' ? -1 : 1) * (r + 14 / z)} y={10 / z} textAnchor={side === 'left' ? 'end' : 'start'} fontFamily={SANS} fontWeight={900}
          fontSize={(big ? 34 : 24) / z} fill={col} stroke={LAND} strokeWidth={8 / z} paintOrder="stroke">{label}</text>}
      </g>
    );
  };

  let card: React.ReactNode;
  if (seg < 0) {
    card = <div style={{...cardBox, background: '#FFE07A'}}>{p.hook.map((l, i) => <div key={i} style={{fontSize: 62}}>{l}</div>)}</div>;
  } else if (seg < n) {
    const r = p.regions[seg];
    card = (
      <div style={cardBox}>
        <div style={numPill(INK)}>{seg + 1}/{n + 1}</div>
        <div style={{display: 'flex', gap: 22, alignItems: 'baseline', fontSize: r.gta.length + r.real.length > 22 ? 50 : 58, whiteSpace: 'nowrap'}}>
          <span style={{color: PINK}}>{r.gta}</span><span style={{color: '#999'}}>=</span><span>{r.real}</span></div>
        <div style={factStyle}>{r.fact}</div>
      </div>
    );
  } else if (seg === n) {
    card = (
      <div style={{...cardBox, borderColor: RED}}>
        <div style={numPill(RED)}>{n + 1}/{n + 1}</div>
        <div style={{display: 'flex', gap: 22, alignItems: 'baseline', fontSize: 56, whiteSpace: 'nowrap'}}>
          <span style={{color: RED}}>{p.fake.gta}</span><span style={{color: '#999'}}>=</span>
          <span style={{opacity: smooth(stampAt, stampAt + 0.15, t)}}>❌ nothing</span></div>
        <div style={{...factStyle, opacity: smooth(stampAt + 0.3, stampAt + 0.6, t)}}>{p.fake.fact}</div>
      </div>
    );
  } else {
    card = (
      <div style={cardBox}>
        <div style={{fontSize: 56}}>{p.end[0]}</div>
        <div style={{fontSize: 40, whiteSpace: 'nowrap'}}>{p.end[1]}</div>
        <div style={{...factStyle, color: PINK, opacity: smooth(p.endAt + 1.2, p.endAt + 1.5, t)}}>{p.ask}</div>
      </div>
    );
  }

  return (
    <AbsoluteFill style={{background: SEA}}>
      {p.music && <Audio src={staticFile(p.music)} volume={0.25} loop />}
      <Sequence from={Math.round(1.0 * fps)} durationInFrames={24}><Audio src={staticFile('sfx/stamp.wav')} volume={0.7} /></Sequence>
      {p.regions.map((_, i) => (
        <React.Fragment key={i}>
          <Sequence from={Math.round(segAt(i) * fps)} durationInFrames={20}><Audio src={staticFile('sfx/whoosh.mp3')} volume={0.45} /></Sequence>
          <Sequence from={Math.round(popAt(i) * fps)} durationInFrames={15}><Audio src={staticFile('sfx/pop.wav')} volume={0.6} /></Sequence>
        </React.Fragment>
      ))}
      <Sequence from={Math.round(p.fakeAt * fps)} durationInFrames={20}><Audio src={staticFile('sfx/whoosh.mp3')} volume={0.45} /></Sequence>
      <Sequence from={Math.round(popAt(n) * fps)} durationInFrames={15}><Audio src={staticFile('sfx/pop.wav')} volume={0.6} /></Sequence>
      <Sequence from={Math.round(stampAt * fps)} durationInFrames={30}><Audio src={staticFile('sfx/impact.mp3')} volume={0.85} /></Sequence>
      <Sequence from={Math.round(p.endAt * fps)} durationInFrames={20}><Audio src={staticFile('sfx/whoosh.mp3')} volume={0.45} /></Sequence>
      <Sequence from={Math.round((p.endAt + 0.5) * fps)} durationInFrames={30}><Audio src={staticFile('sfx/news_ding.mp3')} volume={0.6} /></Sequence>

      {/* faint paper lines on the sea */}
      <AbsoluteFill style={{background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 7px)'}} />
      <AbsoluteFill style={{opacity: fade}}>
        <svg width={1080} height={1000} viewBox="0 0 1080 1000" style={{position: 'absolute', left: 0, top: MAP_TOP, overflow: 'hidden'}}>
          <g transform={`translate(540,500) scale(${z}) translate(${-cx},${-cy})`}>
            {p.near.map((d, i) => <path key={i} d={d} fill="#E9E1D2" stroke="#B8AB95" strokeWidth={2} vectorEffect="non-scaling-stroke" opacity={draw} />)}
            <path d={p.land} fill={LAND} fillOpacity={smooth(0.9, 1.6, t)} stroke={INK} strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinejoin="round"
              pathLength={1} style={{strokeDasharray: 1, strokeDashoffset: 1 - draw}} />
            {p.regions.map((r, i) => t >= popAt(i) &&
              pin(i, r.at[0], r.at[1], r.gta, PINK, String(i + 1), seg === i, clamp01((t - popAt(i)) / 0.3), r.side))}
            {t >= popAt(n) && pin(n, p.fake.at[0], p.fake.at[1], p.fake.gta, RED, '?', seg === n, clamp01((t - popAt(n)) / 0.3), 'right')}
            {t >= stampAt && (
              <g transform={`translate(${p.fake.at[0]},${p.fake.at[1] - 70 / z}) rotate(-8) scale(${(1.9 - 0.9 * outBack(clamp01((t - stampAt) / 0.22), 1.5)) / z})`}>
                <rect x={-95} y={-40} width={190} height={74} rx={12} fill="rgba(255,248,234,0.9)" stroke={RED} strokeWidth={7} />
                <text y={17} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={50} fill={RED} letterSpacing="0.04em">FAKE</text>
              </g>
            )}
          </g>
        </svg>
        <div style={{position: 'absolute', left: 0, right: 0, top: 1490, display: 'flex', justifyContent: 'center', transform: `scale(${cardK})`}}>{card}</div>
      </AbsoluteFill>

      <Masthead P={P} label="" top={160} />
      <div style={{position: 'absolute', left: 70, right: 70, top: 258, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: P.display, fontSize: 88, lineHeight: 1.0, color: INK, opacity: clamp01(titleK) * fade, transform: `scale(${0.92 + 0.08 * titleK})`}}>
        <span>{p.pre}<span style={{color: '#D6336C', fontStyle: 'italic'}}>{p.em}</span></span>
      </div>
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};

const cardBox: React.CSSProperties = {position: 'relative', width: 960, minHeight: 200, boxSizing: 'border-box', padding: '24px 30px', background: '#fff',
  border: `5px solid ${INK}`, borderRadius: 28, boxShadow: `10px 10px 0 ${INK}`, display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: 12, fontFamily: SANS, fontWeight: 900, color: INK, textAlign: 'center'};
const numPill = (bg: string): React.CSSProperties => ({position: 'absolute', top: -28, left: 40, background: bg, color: '#fff', fontSize: 30, padding: '4px 18px', borderRadius: 999});
const factStyle: React.CSSProperties = {fontSize: 36, fontWeight: 800, color: '#444'};
