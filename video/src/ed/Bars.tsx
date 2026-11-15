// ---------- Data reel, editorial 3D: a bar chart made of solid blocks on a paper table, the year standing behind it as 3D type ----------
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Backdrop, Cam, Em, Grain, Head, MONO, Masthead, PAL, PalName, ProgressRule, RBox, SANS, Studio, Text3D, V3, clamp01, lerp, outBack, projector, smooth, useEdFonts} from './kit';

type Item = {label: string; end: number; k: number; dip: number};
export type EdBarsProps = {pal: PalName; duration: number; label: string; hookA: string; hookB: string; endA: string; endB: string; years: [number, number];
  raceStart: number; raceEnd: number; items: Item[]; music?: string | null};

const money = (v: number) => '$' + Math.round(v).toLocaleString('en-US');
const valueAt = (it: Item, u: number) => {
  if (u >= 1) return it.end;
  const g = Math.pow(u, it.k) - it.dip * Math.exp(-(((u - 0.66) / 0.08) ** 2)) * (1 - u) * 3.2 + 0.03 * Math.sin(u * 19 + it.end) * u * (1 - u) * 4;
  return 1000 * Math.pow(it.end / 1000, g);
};
const ease = (r: number) => r * r * (3 - 2 * r) * 0.35 + r * 0.65;

export const EdBars: React.FC<EdBarsProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL[p.pal];
  const n = p.items.length;

  const raw = clamp01((t - p.raceStart) / (p.raceEnd - p.raceStart));
  const u = ease(raw);
  const vals = p.items.map((it) => valueAt(it, u));
  const maxV = Math.max(...vals);
  const rankAt = (uu: number) => { const vs = p.items.map((it) => valueAt(it, uu)); return vs.map((v, i) => vs.filter((o, j) => o > v + 1e-9 || (Math.abs(o - v) <= 1e-9 && j < i)).length); };
  // ranks averaged over a short window, so bars slide past each other instead of jumping
  const soft = useMemo(() => {
    const acc = new Array(n).fill(0), K = 9;
    for (let s = 0; s < K; s++) { const r = rankAt(clamp01(u + (s / (K - 1) - 0.5) * 0.022)); r.forEach((x, i) => (acc[i] += x / K)); }
    const k = smooth(0.012, 0.05, u);
    return acc.map((x: number, i: number) => lerp(i, x, k));
  }, [u, n]);
  const rank = rankAt(u);
  const leader = rank.indexOf(0);
  const year = Math.min(p.years[1], Math.floor(lerp(p.years[0], p.years[1] + 0.999, u)));
  const done = t >= p.raceEnd;

  const changes = useMemo(() => {
    const out: {at: number; i: number}[] = [];
    let prev = -1;
    for (let f = 0; f <= 600; f++) {
      const r = f / 600, l = rankAt(ease(r)).indexOf(0);
      if (l !== prev && r > 0.04) out.push({at: p.raceStart + r * (p.raceEnd - p.raceStart), i: l});
      prev = l;
    }
    return out;
  }, [p.items, p.raceStart, p.raceEnd]);
  const change = [...changes].reverse().find((c) => t >= c.at && t < c.at + 1.6);
  const ck = change ? t - change.at : 9;

  // table layout
  const X0 = -0.98, LEN = 1.86, ROW = 0.53, Z0 = -0.78, TH = 0.09, DEP = 0.2;
  const rowZ = (r: number) => Z0 + r * ROW;
  const intro = (i: number) => outBack(smooth(0.5 + i * 0.12, 1.2 + i * 0.12, t), 1.3);

  const FOV = 26;
  const fin = smooth(p.raceEnd, p.raceEnd + 1.6, t);
  const yaw = 0;
  const dist = lerp(11.2, 10.3, smooth(0, p.raceEnd, t)) - fin * 0.15, pitch = lerp(0.78, 0.64, smooth(0, p.raceEnd, t));
  const target: V3 = [0.1, 0.1, -0.2];
  const camPos: V3 = [target[0] + Math.sin(yaw) * Math.cos(pitch) * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
  const proj = projector(camPos, target, FOV);

  const hookK = 1 - smooth(p.raceStart - 0.6, p.raceStart, t);
  const endK = smooth(p.raceEnd + 0.5, p.raceEnd + 1.2, t);
  const yearK = smooth(p.raceStart - 0.5, p.raceStart + 0.3, t);

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.5} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.28} loop />}
      {changes.map((c, i) => <Sequence key={i} from={Math.round(c.at * fps)} durationInFrames={14}><Audio src={staticFile('sfx/pop.wav')} volume={0.85} /></Sequence>)}
      <Sequence from={Math.round(p.raceEnd * fps)} durationInFrames={22}><Audio src={staticFile('sfx/thud.wav')} volume={0.9} /></Sequence>

      <ThreeCanvas width={1080} height={1920} shadows gl={{antialias: true}} camera={{fov: FOV, position: camPos}}>
        <Cam pos={camPos} target={target} fov={FOV} near={2} />
        <Studio ready={ready} P={P} span={4} key3={[2.4, 7, 2.2]} soft={1.3} lights={6} />
        {/* the year, standing behind the chart */}
        <Text3D ready={ready} font="serif" text={String(year)} size={0.6} depth={0.22} color={P.dark ? '#2a5a4a' : '#d3cab8'} position={[0.6, 0.005, -1.62]} rotation={[-0.2, 0, 0]}
          scale={[1, Math.max(0.001, yearK * (1 - smooth(p.raceEnd + 0.3, p.raceEnd + 0.9, t))), 1]} rough={0.9} />
        {/* baseline rail */}
        <RBox args={[0.035, 0.05, n * ROW + 0.1]} color={P.ink} position={[X0 - 0.04, 0.025, rowZ((n - 1) / 2)]} />
        {p.items.map((it, i) => {
          const len = Math.max(0.03, (vals[i] / maxV) * LEN) * intro(i);
          const hero = i === leader && t > p.raceStart;
          return <RBox key={it.label} args={[len, TH, DEP]} r={0.035} color={hero ? P.accent : P.ink} rough={hero ? 0.5 : 0.75} position={[X0 + len / 2, TH / 2 + 0.002, rowZ(soft[i])]} />;
        })}
      </ThreeCanvas>

      {/* labels: name and value above each bar */}
      {p.items.map((it, i) => {
        const a = proj([X0, TH + 0.02, rowZ(soft[i]) - DEP / 2 - 0.02]), e = proj([X0 + LEN, TH + 0.02, rowZ(soft[i]) - DEP / 2 - 0.02]);
        const hero = i === leader && t > p.raceStart;
        const k = smooth(0.9 + i * 0.12, 1.4 + i * 0.12, t);
        return (
          <div key={it.label} style={{position: 'absolute', left: a.x, width: e.x - a.x, top: a.y - 41, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', opacity: k}}>
            <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 31, letterSpacing: '-0.02em', color: hero ? P.accent : P.ink}}>{it.label}</div>
            <div style={{fontFamily: MONO, fontWeight: hero ? 700 : 500, fontSize: 29, color: hero ? P.accent : P.mute, fontVariantNumeric: 'tabular-nums'}}>{money(vals[i])}</div>
          </div>
        );
      })}

      <Masthead P={P} label={p.label} />
      {hookK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 92 : 78} style={{opacity: hookK}}>{p.hookA} <Em P={P}>{p.hookB}</Em></Head>}
      {change && !done && hookK < 0.05 && (
        <Head P={P} top={380} size={P.dItalic ? 84 : 70} style={{opacity: smooth(0, 0.25, ck) * (1 - smooth(1.2, 1.6, ck)), transform: `translateY(${(1 - smooth(0, 0.3, ck)) * 14}px)`}}>
          <Em P={P}>{p.items[change.i].label}</Em> takes the lead.
        </Head>
      )}
      {endK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 92 : 78} style={{opacity: endK}}>{p.endA} <Em P={P}>{p.endB}</Em></Head>}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
