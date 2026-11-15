// ---------- While we waited for GTA 6: six "GTA V day vs GTA 6 day" ticket pairs (the GTA 6 ticket flips over and gets stamped),
// then the six multiples rise as 3D blocks. Sunset look ("vice") or the paper look. flat=true: the finale in 2D (no WebGL). ----------
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Backdrop, Cam, Em, Grain, Head, MONO, Masthead, PAL, Pal, ProgressRule, RBox, Studio, Tag, Text3D, V3, clamp01, outBack, outCubic, projector, smooth, useEdFonts} from './kit';

type Round = {name: string; head: string; what: string; then: string; now: string; thenDate: string; nowDate: string; stamp: string; r: number};
export type EdWaitedProps = {pal: 'vice' | 'paper'; duration: number; label: string; badge: string; hookA: string; hookB: string; teaser: string;
  rounds: Round[]; hook: number; round: number; flat?: boolean; music?: string | null};

export const VICE: Pal = {...PAL.night, bg: '#2A1046', bg2: '#FF5E8A', ink: '#FFF3EA', mute: 'rgba(255,243,234,0.75)', rule: 'rgba(255,243,234,0.35)',
  accent: '#FF4FA0', onAccent: '#fff', card: '#FFF3EA', cardInk: '#2A1046', display: 'Instrument Serif', dWeight: 400, dItalic: true, dTrack: -0.02, font3d: 'serif',
  shadow: 0.45, grain: 0.22, blend: 'overlay', dark: true} as any;
const isVice = (P: Pal) => P.bg === VICE.bg;
const GOLD = '#FFE07A';

// a sunset sky with a striped sun and palm silhouettes (generic, no game art)
export const Sunset: React.FC<{t: number}> = ({t}) => (
  <AbsoluteFill>
    <AbsoluteFill style={{background: 'linear-gradient(180deg, #1B0B33 0%, #3D1460 28%, #9B2A7E 52%, #FF5E7A 70%, #FF9A4D 84%, #FFC46B 100%)'}} />
    <svg width={1080} height={1920} style={{position: 'absolute'}}>
      <defs>
        <linearGradient id="wsun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE07A" /><stop offset="1" stopColor="#FF4F8A" /></linearGradient>
        <clipPath id="wcut">{Array.from({length: 9}, (_, i) => <rect key={i} x={0} y={1390 + i * 26 + i * i * 0.6 + ((t * 18) % 26)} width={1080} height={22 - i * 1.6} />)}<rect x={0} y={0} width={1080} height={1390} /></clipPath>
      </defs>
      <circle cx={540} cy={1440 - t * 2} r={300} fill="url(#wsun)" opacity={0.85} clipPath="url(#wcut)" />
      {[[-40, 1700, 1, 0], [990, 1640, -1, 1], [880, 1760, -0.7, 2]].map(([x, y, s, k], i) => (
        <g key={i} transform={`translate(${x},${y}) scale(${s},${Math.abs(s)}) rotate(${Math.sin(t * 0.9 + k) * 1.2})`} fill="#1B0B26">
          <path d="M60 0 C64 -160 72 -320 96 -470 L108 -470 C90 -320 86 -160 84 0 Z" />
          {[-1, 1].map((d) => [0, 1, 2].map((q) => <path key={`${d}${q}`} d={`M102 -470 q ${d * (90 + q * 40)} ${-40 + q * 30} ${d * (190 + q * 50)} ${40 + q * 50} q ${-d * (90 + q * 20)} ${-40} ${-d * (190 + q * 50)} ${-30 - q * 40}`} />))}
        </g>
      ))}
    </svg>
    <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(20,6,40,0.55) 0%, rgba(20,6,40,0.15) 40%, rgba(0,0,0,0) 60%)'}} />
  </AbsoluteFill>
);

const W = 420, H = W * 1.43;
const priceSize = (s: string) => Math.min(W * 0.3, (W * 0.84) / (s.length * 0.5));
const Face: React.FC<{P: Pal; game: string; date: string; what: string; price: string; hot?: boolean}> = ({P, game, date, what, price, hot}) => {
  const vice = isVice(P);
  return (
    <div style={{position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 14, padding: `${W * 0.07}px ${W * 0.08}px`, boxSizing: 'border-box',
      background: hot ? (vice ? 'linear-gradient(160deg, #FF4FA0, #FF8A3D)' : P.accent) : P.card, color: hot ? '#fff' : P.cardInk,
      boxShadow: vice ? '0 30px 60px rgba(20,0,40,0.45), inset 0 0 0 2px rgba(255,255,255,0.25)' : '0 30px 50px rgba(0,0,0,0.20), 0 3px 8px rgba(0,0,0,0.12)'}}>
      <div style={{fontFamily: MONO, fontWeight: 700, fontSize: W * 0.052, letterSpacing: '0.14em', opacity: 0.75}}>RELEASE DAY</div>
      <div style={{fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: W * 0.22, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 10}}>{game}</div>
      <div style={{fontFamily: MONO, fontWeight: 500, fontSize: W * 0.058, marginTop: 6}}>{date}</div>
      <div style={{borderTop: `3px dashed ${hot ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.2)'}`, margin: `${W * 0.08}px -${W * 0.08}px ${W * 0.06}px`}} />
      <div style={{fontFamily: MONO, fontWeight: 700, fontSize: W * 0.046, letterSpacing: '0.1em', opacity: 0.75, whiteSpace: 'nowrap'}}>{what}</div>
      <div style={{fontFamily: P.display, fontSize: priceSize(price), lineHeight: 1, marginTop: 10, letterSpacing: '-0.02em', whiteSpace: 'nowrap'}}>{price}</div>
      {[0, 1].map((k) => <div key={k} style={{position: 'absolute', top: W * 0.56, [k ? 'right' : 'left']: -W * 0.045, width: W * 0.09, height: W * 0.09, borderRadius: '50%', background: vice ? '#8E2A80' : P.bg}} />)}
    </div>
  );
};
const BackFace: React.FC<{P: Pal; flipped?: boolean}> = ({P, flipped}) => (
  <div style={{position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: flipped ? 'rotateY(180deg)' : undefined, borderRadius: 14,
    boxShadow: '0 30px 50px rgba(0,0,0,0.3)', background: isVice(P) ? 'repeating-linear-gradient(45deg, #3D1460 0 18px, #4E1A78 18px 36px)' : `repeating-linear-gradient(45deg, ${P.ink} 0 18px, #2a2926 18px 36px)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: P.display, fontStyle: 'italic', fontSize: 220, color: isVice(P) ? '#FF4FA0' : P.accent}}>?</div>
);

const Finale3D: React.FC<{P: Pal; ready: boolean; rounds: Round[]; k: (i: number) => number}> = ({P, ready, rounds, k}) => {
  const camPos: V3 = [-0.6, 3.1, 19], target: V3 = [0, 1.55, 0];
  const proj = projector(camPos, target, 28);
  const vice = isVice(P), n = rounds.length;
  const xOf = (i: number) => -1.85 + i * (3.7 / (n - 1));
  return (
    <>
      <ThreeCanvas width={1080} height={1920} shadows gl={{antialias: true, alpha: true}} camera={{fov: 28, position: camPos}}>
        <Cam pos={camPos} target={target} fov={28} near={2} />
        <Studio ready={ready} P={P} span={5} key3={[2.6, 8, 4]} soft={1.4} lights={6} />
        {rounds.map((r, i) => {
          const last = i === n - 1, g = Math.max(0.001, k(i));
          const h = (0.25 + Math.log10(Math.max(r.r, 0.05) * 1.2 + 1) * 1.05) * g, x = xOf(i);
          const col = last ? (vice ? '#FF4FA0' : P.accent) : vice ? '#FFF3EA' : P.ink;
          return (
            <React.Fragment key={i}>
              <RBox args={[0.56, Math.max(0.02, h), 0.56]} r={0.05} color={col} rough={0.55} position={[x, Math.max(0.02, h) / 2, 0]} />
              {g > 0.6 && <Text3D ready={ready} font="serif" text={r.stamp} size={last ? 0.4 : 0.26} depth={0.08} color={col} position={[x, h + 0.02, 0.12]} scale={Math.min(1, (g - 0.6) / 0.4)} />}
            </React.Fragment>
          );
        })}
      </ThreeCanvas>
      {rounds.map((r, i) => { const a = proj([xOf(i), 0, 0.5]); return <Tag key={i} P={P} x={a.x} y={a.y + 10} size={18} solid={i === n - 1} opacity={smooth(0, 0.3, k(i))}>{r.name.toUpperCase()}</Tag>; })}
    </>
  );
};
const Finale2D: React.FC<{P: Pal; rounds: Round[]; k: (i: number) => number}> = ({P, rounds, k}) => {
  const vice = isVice(P), n = rounds.length, base = 1330, cw = 112, gap = (912 - n * cw) / (n - 1);
  return (
    <>
      {rounds.map((r, i) => {
        const last = i === n - 1, g = k(i), h = (60 + Math.log10(Math.max(r.r, 0.05) * 1.2 + 1) * 230) * g, x = 84 + i * (cw + gap);
        const col = last ? (vice ? '#FF4FA0' : P.accent) : vice ? '#FFF3EA' : P.ink;
        return (
          <React.Fragment key={i}>
            <div style={{position: 'absolute', left: x, width: cw, top: base - h, height: h, background: col, borderRadius: 8, boxShadow: `inset -14px 0 0 rgba(0,0,0,0.12), 0 18px 30px rgba(0,0,0,${vice ? 0.35 : 0.15})`}} />
            <div style={{position: 'absolute', left: x - 30, width: cw + 60, top: base - h - 64, textAlign: 'center', fontFamily: P.display, fontSize: last ? 64 : 44, color: col, opacity: smooth(0.6, 1, g)}}>{r.stamp}</div>
            <Tag P={P} x={x + cw / 2} y={base + 14} size={17} solid={last} opacity={smooth(0, 0.3, g)}>{r.name.toUpperCase()}</Tag>
          </React.Fragment>
        );
      })}
    </>
  );
};

export const EdWaited: React.FC<EdWaitedProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = p.pal === 'vice' ? VICE : PAL.paper;
  const vice = isVice(P);
  const n = p.rounds.length, F = p.hook + n * p.round;
  const i = Math.min(n - 1, Math.floor((t - p.hook) / p.round));
  const inRound = t >= p.hook && t < F;
  const b = p.hook + i * p.round, a = t - b;
  const R = p.rounds[Math.max(0, i)];
  const fin = p.rounds[n - 1];
  const pk = (j: number) => outBack(clamp01((t - F - 0.5 - j * 0.32) / 0.55), 1.15);

  // hook: question, two face-down tickets, the teaser
  const hookK = 1 - smooth(p.hook - 0.35, p.hook, t);
  // a round: ticket A slides in, ticket B drops face down, flips, gets stamped; both leave at the end
  const inA = outCubic(clamp01(a / 0.3)), inB = outBack(clamp01((a - 0.2) / 0.35), 1.2);
  const flip = 180 * (1 - smooth(0.85, 1.2, a));
  const stampK = clamp01((a - 1.45) / 0.18), out = smooth(p.round - 0.28, p.round, a);
  const headK = smooth(0, 0.2, a) * (1 - out);
  const endK = smooth(F + 0.1, F + 0.5, t);

  return (
    <AbsoluteFill>
      {vice ? <Sunset t={t} /> : <Backdrop P={P} horizon={0.5} />}
      {p.music && <Audio src={staticFile(p.music)} volume={0.3} loop />}
      {p.rounds.map((_, j) => {
        const bj = p.hook + j * p.round;
        return (
          <React.Fragment key={j}>
            <Sequence from={Math.round((bj + 0.02) * fps)} durationInFrames={20}><Audio src={staticFile('sfx/whoosh.mp3')} volume={0.35} /></Sequence>
            <Sequence from={Math.round((bj + 0.86) * fps)} durationInFrames={10}><Audio src={staticFile('sfx/flap.wav')} volume={0.9} /></Sequence>
            <Sequence from={Math.round((bj + 1.45) * fps)} durationInFrames={16}><Audio src={staticFile('sfx/stamp.wav')} volume={1} /></Sequence>
            <Sequence from={Math.round((F + 0.5 + j * 0.32) * fps)} durationInFrames={14}><Audio src={staticFile(j === n - 1 ? 'sfx/thud.wav' : 'sfx/pop.wav')} volume={0.9} /></Sequence>
          </React.Fragment>
        );
      })}

      {hookK > 0.01 && (
        <div style={{opacity: hookK}}>
          <Head P={P} top={372} size={P.dItalic ? 100 : 84} style={{transform: `translateY(${(1 - smooth(0, 0.3, t)) * 16}px)`}}>{p.hookA} <Em P={P}>{p.hookB}</Em></Head>
          {[0, 1].map((k) => (
            <div key={k} style={{position: 'absolute', left: k ? 420 : 300, top: k ? 930 : 900, width: 330, height: 330 * 1.43, transform: `rotate(${k ? 5 : -8}deg) translateY(${(1 - outBack(clamp01((t - 0.2 - k * 0.15) / 0.4), 1.3)) * 900}px)`}}>
              <BackFace P={P} />
            </div>
          ))}
          <Tag P={P} x={540} y={1400} solid size={24} opacity={smooth(0.7, 0.9, t)}>{p.teaser}</Tag>
        </div>
      )}

      {inRound && (
        <>
          <Head P={P} top={372} size={P.dItalic ? 88 : 74} width={760} style={{opacity: headK}}>{R.head}</Head>
          <div style={{position: 'absolute', top: 384, right: 84, fontFamily: MONO, fontWeight: 700, fontSize: 30, color: P.mute, opacity: headK}}>{i + 1}/{n}</div>
          <div style={{position: 'absolute', left: 70 - (1 - inA) * 700 - out * 900, top: 640, width: W, height: H, transform: 'rotate(-4deg)'}}>
            <Face P={P} game="GTA V" date={R.thenDate} what={R.what} price={R.then} />
          </div>
          <div style={{position: 'absolute', left: 560 - out * 1100, top: 700 - (1 - inB) * 1300, width: W, height: H, perspective: 1600}}>
            <div style={{position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `rotate(3deg) rotateY(${flip}deg)`}}>
              <Face P={P} game="GTA 6" date={R.nowDate} what={R.what} price={R.now} hot />
              <BackFace P={P} flipped />
            </div>
          </div>
          {stampK > 0 && (
            <div style={{position: 'absolute', left: 470 - out * 1100, top: 1290, opacity: Math.min(1, stampK * 3), transform: `rotate(-12deg) scale(${2.2 - 1.2 * stampK})`, transformOrigin: 'center',
              border: `9px solid ${vice ? GOLD : P.accent}`, borderRadius: 16, padding: '4px 26px', fontFamily: P.display, fontSize: 130, lineHeight: 1, color: vice ? GOLD : P.accent,
              background: vice ? 'rgba(42,16,70,0.6)' : 'rgba(255,253,248,0.7)', boxShadow: vice ? '0 0 40px rgba(255,224,122,0.45)' : 'none', whiteSpace: 'nowrap'}}>{R.stamp}</div>
          )}
        </>
      )}

      {t >= F - 0.05 && (
        <>
          {p.flat ? <Finale2D P={P} rounds={p.rounds} k={pk} /> : <Finale3D P={P} ready={ready} rounds={p.rounds} k={pk} />}
          <Head P={P} top={372} size={P.dItalic ? 92 : 76} style={{opacity: endK}}>13 years of waiting. <Em P={P}>{fin.name.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase())} went {fin.stamp}.</Em></Head>
        </>
      )}

      <Masthead P={P} label={p.label} />
      <div style={{position: 'absolute', top: 236, right: 84}}>
        <span style={{fontFamily: MONO, fontWeight: 700, fontSize: 20, letterSpacing: '0.1em', padding: '6px 12px', borderRadius: 6, color: '#fff', background: P.accent}}>{p.badge}</span>
      </div>
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
