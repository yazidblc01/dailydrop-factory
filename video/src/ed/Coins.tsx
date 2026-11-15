// ---------- The shrinking $100: one hundred $1 coins in neat stacks. As the years tick by, inflation takes coins away. ----------
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Backdrop, Cam, Em, Grain, Head, MONO, Masthead, PAL, PalName, ProgressRule, Studio, Text3D, V3, clamp01, lerp, outCubic, rnd, smooth, useEdFonts} from './kit';

export type EdCoinsProps = {pal: PalName; duration: number; label: string; hookA: string; hookB: string; endA: string; endB: string; start: number; end: number; cpi: [number, number][]; music?: string | null};

const R = 0.2, H = 0.055, PER = 10, COLS = 5, ROWS = 2, SPX = 0.52, SPZ = 0.56;

export const EdCoins: React.FC<EdCoinsProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL[p.pal];
  const y0 = p.cpi[0][0], y1 = p.cpi[p.cpi.length - 1][0];
  const cpiAt = (yr: number) => {
    for (let i = 1; i < p.cpi.length; i++) if (yr <= p.cpi[i][0]) { const [a, va] = p.cpi[i - 1], [b, vb] = p.cpi[i]; return lerp(va, vb, (yr - a) / (b - a)); }
    return p.cpi[p.cpi.length - 1][1];
  };
  const valueAtU = (u: number) => 100 * p.cpi[0][1] / cpiAt(lerp(y0, y1, u));
  const u = smooth(p.start, p.end, t) * 0.5 + clamp01((t - p.start) / (p.end - p.start)) * 0.5;
  const yearF = lerp(y0, y1, u), value = valueAtU(u);
  const uOfT = (tt: number) => smooth(p.start, p.end, tt) * 0.5 + clamp01((tt - p.start) / (p.end - p.start)) * 0.5;

  // when each coin leaves: coin i (0 = last to go) leaves when the value drops below i + 0.5
  const leaveAt = useMemo(() => {
    const out = new Array(100).fill(Infinity);
    for (let f = 0; f <= (p.end - p.start) * 60; f++) {
      const tt = p.start + f / 60, v = valueAtU(uOfT(tt));
      for (let i = 99; i >= 0 && v < i + 0.5; i--) if (out[i] === Infinity) out[i] = tt;
    }
    return out;
  }, [p.cpi, p.start, p.end]);

  // coin i sits in stack (i % 10), level floor(i / 10): the top level empties first, evenly across stacks
  const home = (i: number): V3 => {
    const s = i % (COLS * ROWS), lvl = Math.floor(i / (COLS * ROWS));
    return [((s % COLS) - (COLS - 1) / 2) * SPX, H / 2 + lvl * (H + 0.004), (Math.floor(s / COLS) - (ROWS - 1) / 2) * SPZ];
  };
  const done = t >= p.end;
  const FOV = 24;
  const yaw = lerp(-0.34, 0.24, smooth(0, p.end + 2, t)) + Math.sin(t * 0.4) * 0.015;
  const dist = lerp(12.8, 12.0, smooth(0, p.end, t)), pitch = 0.4;
  const target: V3 = [0.1, 1.05, 0];
  const camPos: V3 = [target[0] + Math.sin(yaw) * Math.cos(pitch) * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
  const hookK = 1 - smooth(p.start - 0.5, p.start, t);
  const liveK = smooth(p.start - 0.2, p.start + 0.3, t) * (1 - smooth(p.end + 0.4, p.end + 0.9, t));
  const endK = smooth(p.end + 0.6, p.end + 1.2, t);
  const brass = P.dark ? '#E8B84A' : '#C99A2E';
  const pops = leaveAt.filter((x) => x < Infinity);

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.5} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.26} loop />}
      {pops.filter((_, i) => i % 3 === 0).map((at, i) => <Sequence key={i} from={Math.round(at * fps)} durationInFrames={4}><Audio src={staticFile('sfx/flap.wav')} volume={0.5} /></Sequence>)}
      <Sequence from={Math.round(p.end * fps)} durationInFrames={22}><Audio src={staticFile('sfx/thud.wav')} volume={0.8} /></Sequence>

      <ThreeCanvas width={1080} height={1920} shadows gl={{antialias: true}} camera={{fov: FOV, position: camPos}}>
        <Cam pos={camPos} target={target} fov={FOV} near={2} />
        <Studio ready={ready} P={P} span={4} key3={[2.6, 7, 3.4]} soft={1.3} lights={6} env={P.dark ? 0.6 : 0.9} />
        {Array.from({length: 100}, (_, i) => {
          const h = home(i), la = leaveAt[i], k = t > la ? clamp01((t - la) / 0.7) : 0;
          if (k >= 1) return null;
          const e = outCubic(k), dir = rnd(i, 1) > 0.5 ? 1 : -1;
          const pos: V3 = [h[0] + dir * e * (1.2 + rnd(i, 2)), h[1] + Math.sin(k * Math.PI) * 1.1 + e * 0.6, h[2] + e * (rnd(i, 3) - 0.3) * 1.5];
          const drop = outCubic(clamp01((t - 0.25 - i * 0.012) / 0.45));
          return (
            <mesh key={i} position={[pos[0], pos[1] + (1 - drop) * 0.8, pos[2]]} rotation={[k * 5 * dir, 0, k * 3]} scale={(1 - k * k) * (drop > 0 ? 1 : 0.001)} castShadow receiveShadow>
              <cylinderGeometry args={[R, R, H, 36]} />
              <meshStandardMaterial color={brass} metalness={0.85} roughness={0.32} />
            </mesh>
          );
        })}
        {/* the amount, standing behind the stacks */}
        <Text3D ready={ready} font="serif" text={`$${Math.round(value)}`} size={1.1} depth={0.3} color={P.accent} position={[0, 0.005, -1.25]} rotation={[-0.12, 0, 0]}
          scale={[1, Math.max(0.001, smooth(p.start - 0.6, p.start, t)), 1]} rough={0.55} />
      </ThreeCanvas>

      <Masthead P={P} label={p.label} />
      {hookK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 96 : 80} style={{opacity: hookK}}>{p.hookA} <Em P={P}>{p.hookB}</Em></Head>}
      {liveK > 0.01 && (
        <div style={{position: 'absolute', top: 366, left: 84, width: 912, opacity: liveK, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
          <div style={{fontFamily: P.display, fontWeight: P.dWeight, fontSize: P.dItalic ? 200 : 168, lineHeight: 0.98, letterSpacing: P.dTrack + 'em', color: P.ink, fontVariantNumeric: 'tabular-nums'}}>{Math.floor(yearF)}</div>
          <div style={{textAlign: 'right', fontFamily: MONO, fontWeight: 700, fontSize: 28, color: P.mute, lineHeight: 1.35}}>
            <div>WHAT $100 FROM {y0}</div><div>STILL BUYS</div>
          </div>
        </div>
      )}
      {endK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 96 : 80} style={{opacity: endK}}>{p.endA} <Em P={P}>{p.endB}</Em></Head>}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
