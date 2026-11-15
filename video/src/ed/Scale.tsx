// ---------- Money to scale, editorial 3D: a stack of cash grows in a paper studio past cut-out silhouettes of real things,
// in front of a height-chart wall. One continuous pull-back, then a dive down to the loser's tiny stack. ----------
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {Backdrop, Cam, Em, Grain, Head, MONO, Masthead, PAL, Pal, PalName, ProgressRule, Sil3D, Studio, Tag, V3, clamp01, lerp, outBack, projector, rnd, smooth, useEdFonts} from './kit';

export type EdScaleProps = {pal: PalName; duration: number; label: string; hookA: string; hookB: string;
  hero: {label: string; value: number}; loser: {label: string; value: number}; years: [number, number]; growStart: number; growEnd: number; music?: string | null};

const BILL_MM = 0.109;
const cmOf = (v: number) => (v / 100) * BILL_MM / 10;
const height = (c: number) => (c >= 100 ? `${(c / 100).toFixed(2)} m` : c >= 10 ? `${c.toFixed(0)} cm` : `${c.toFixed(1)} cm`);
const money = (v: number) => '$' + Math.round(v).toLocaleString('en-US');

type Thing = {key: string; name: string; h: number; x: number; z: number; icon?: string; rot?: number};
const THINGS: Thing[] = [
  {key: 'can', name: 'a soda can', h: 12.2, x: 16, z: 3},
  {key: 'cat', name: 'a cat', h: 30, x: 31, z: 2, icon: 'cat'},
  {key: 'hydrant', name: 'a fire hydrant', h: 76, x: 80, z: -4, icon: 'hydrant'},
  {key: 'person', name: 'a person', h: 178, x: 152, z: -8, icon: 'person'},
  {key: 'hoop', name: 'a basketball hoop', h: 305, x: 285, z: -30},
  {key: 'bus', name: 'a double-decker bus', h: 440, x: 500, z: -120, icon: 'bus', rot: 0.9},
  {key: 'house', name: 'a house', h: 800, x: 900, z: -200, icon: 'house'},
];

const Can: React.FC<{P: Pal}> = ({P}) => (
  <group>
    <mesh position={[0, 6.1, 0]} castShadow><cylinderGeometry args={[3.3, 3.3, 11.4, 40]} /><meshStandardMaterial color={P.accent} roughness={0.45} metalness={0.2} /></mesh>
    <mesh position={[0, 11.95, 0]} castShadow><cylinderGeometry args={[2.7, 3.3, 0.5, 40]} /><meshStandardMaterial color={P.dark ? '#d9dde2' : '#c9ccd1'} roughness={0.3} metalness={0.9} /></mesh>
    <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[3.3, 2.8, 0.5, 40]} /><meshStandardMaterial color={P.dark ? '#d9dde2' : '#c9ccd1'} roughness={0.3} metalness={0.9} /></mesh>
  </group>
);
const Hoop: React.FC<{P: Pal}> = ({P}) => (
  <group rotation={[0, -0.75, 0]}>
    <mesh position={[0, 5, -105]} castShadow><boxGeometry args={[80, 10, 110]} /><meshStandardMaterial color={P.ink} roughness={0.7} /></mesh>
    <mesh position={[0, 170, -105]} castShadow><cylinderGeometry args={[6.5, 6.5, 330, 20]} /><meshStandardMaterial color={P.ink} roughness={0.7} /></mesh>
    <mesh position={[0, 338, -70]} rotation={[Math.PI / 2 - 0.1, 0, 0]} castShadow><cylinderGeometry args={[4.5, 4.5, 76, 12]} /><meshStandardMaterial color={P.ink} roughness={0.7} /></mesh>
    <mesh position={[0, 342, -32]} castShadow><boxGeometry args={[180, 105, 5]} /><meshStandardMaterial color={P.dark ? '#f3ebda' : '#fffdf8'} roughness={0.6} /></mesh>
    <mesh position={[0, 325, -29]}><boxGeometry args={[60, 46, 1]} /><meshStandardMaterial color={P.ink} roughness={0.7} /></mesh>
    <mesh position={[0, 325, -28.4]}><boxGeometry args={[49, 35, 1]} /><meshStandardMaterial color={P.dark ? '#f3ebda' : '#fffdf8'} roughness={0.6} /></mesh>
    <mesh position={[0, 305, -6]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[22.5, 1.6, 12, 40]} /><meshStandardMaterial color={P.accent} roughness={0.5} /></mesh>
    <mesh position={[0, 286, -6]}><cylinderGeometry args={[22, 13, 38, 14, 4, true]} /><meshBasicMaterial color={P.ink} wireframe transparent opacity={0.55} /></mesh>
  </group>
);

const useCash = (P: Pal, ready: boolean) => useMemo(() => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  const base = new THREE.Color(P.money), dark = base.clone().multiplyScalar(0.72), light = base.clone().lerp(new THREE.Color('#ffffff'), 0.28);
  x.fillStyle = '#' + base.getHexString(); x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 32; i++) { x.fillStyle = '#' + (i % 2 ? dark : light).getHexString(); x.fillRect(0, i * 8, 256, 3); }
  x.fillStyle = '#' + dark.clone().multiplyScalar(0.7).getHexString(); x.fillRect(0, 0, 256, 6);
  x.fillStyle = '#F6EEDB'; x.fillRect(84, 6, 88, 250);
  x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(84, 6, 3, 250); x.fillRect(169, 6, 3, 250);
  x.fillStyle = 'rgba(0,0,0,0.5)'; x.font = '700 17px "JetBrains Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('$10,000', 128, 132);
  const side = new THREE.CanvasTexture(c);
  side.wrapS = side.wrapT = THREE.RepeatWrapping; side.colorSpace = THREE.SRGBColorSpace; side.anisotropy = 8;
  const t = document.createElement('canvas');
  t.width = 512; t.height = 216;
  const y = t.getContext('2d')!;
  y.fillStyle = '#' + light.getHexString(); y.fillRect(0, 0, 512, 216);
  y.strokeStyle = '#' + dark.getHexString(); y.lineWidth = 8; y.strokeRect(14, 14, 484, 188); y.lineWidth = 2; y.strokeRect(28, 28, 456, 160);
  y.fillStyle = '#' + dark.getHexString(); y.beginPath(); y.ellipse(256, 108, 60, 74, 0, 0, 7); y.fill();
  y.fillStyle = '#' + light.getHexString(); y.font = '400 110px "Instrument Serif", serif'; y.textAlign = 'center'; y.textBaseline = 'middle'; y.fillText('$', 256, 114);
  y.fillStyle = '#' + dark.getHexString(); y.font = '400 70px "Instrument Serif", serif'; y.fillText('100', 104, 72); y.fillText('100', 408, 150);
  const top = new THREE.CanvasTexture(t);
  top.colorSpace = THREE.SRGBColorSpace; top.anisotropy = 8;
  return {side, top, edge: '#' + dark.getHexString()};
}, [P.name, ready]);

const Stack: React.FC<{h: number; w: number; x?: number; cash: ReturnType<typeof useCash>; bands: number; flow: number}> = ({h, w, x = 0, cash, bands, flow}) => {
  const side = useMemo(() => cash.side.clone(), [cash.side]);
  side.repeat.set(1, bands); side.offset.set(0, -flow); side.needsUpdate = true;
  return (
    <mesh position={[x, h / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[w, h, w * 0.42]} />
      {[0, 1, 4, 5].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} map={side} roughness={0.85} />)}
      <meshStandardMaterial attach="material-2" map={cash.top} roughness={0.8} />
      <meshStandardMaterial attach="material-3" color={cash.edge} roughness={0.85} />
    </mesh>
  );
};

const STEPS = [1, 5, 10, 50, 100, 500, 1000];
const tickLabel = (c: number) => (c >= 100 ? `${+(c / 100).toFixed(1)} m` : `${c} cm`);

export const EdScale: React.FC<EdScaleProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL[p.pal];
  const cash = useCash(P, ready);

  // growth: smooth on a log scale, lingering a little as it passes each thing
  const startCm = cmOf(10000), finalCm = cmOf(p.hero.value), loserCm = cmOf(p.loser.value);
  const L0 = Math.log(startCm), L1 = Math.log(finalCm);
  const goals = THINGS.filter((o) => o.h > startCm && o.h < finalCm);
  const marks = goals.map((o) => (Math.log(o.h) - L0) / (L1 - L0));
  const N = 400;
  const cum = useMemo(() => {
    const c = [0];
    for (let i = 1; i <= N; i++) {
      const u = (i - 0.5) / N;
      let d = 1 + 1.4 * Math.exp(-((u / 0.07) ** 2)) + 1.8 * Math.exp(-(((1 - u) / 0.08) ** 2));
      for (const m of marks) d += 1.5 * Math.exp(-(((u - m) / 0.035) ** 2));
      c.push(c[i - 1] + d);
    }
    return c;
  }, [marks.join()]);
  const growDur = p.growEnd - p.growStart;
  const timeOfU = (u: number) => p.growStart + (cum[Math.round(u * N)] / cum[N]) * growDur;
  let u = 0;
  if (t >= p.growEnd) u = 1;
  else if (t > p.growStart) {
    const target = ((t - p.growStart) / growDur) * cum[N];
    let i = 1;
    while (i < N && cum[i] < target) i++;
    u = (i - 1 + (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)) / N;
  }
  const nowCm = Math.exp(L0 + (L1 - L0) * u);
  const value = (nowCm * 10 / BILL_MM) * 100;
  const year = Math.round(lerp(p.years[0], p.years[1], Math.pow(u, 0.8)));
  const done = t >= p.growEnd;
  const passes = goals.map((o, i) => ({o, at: timeOfU(marks[i])}));
  const lastPass = [...passes].reverse().find((x) => t >= x.at);
  const pk = lastPass ? t - lastPass.at : 9;
  const pulse = Math.exp(-pk * 3);

  // after the growth: hold, dive to the loser's stack, pull back to show both
  const diveAt = p.growEnd + 1.2, backAt = diveAt + 3.0;
  const dive = smooth(diveAt, diveAt + 0.9, t) * (1 - smooth(backAt, backAt + 1.0, t));
  const both = smooth(backAt, backAt + 1.0, t);
  const loserX = Math.max(finalCm * 0.58, 60);
  const stackW = (h: number) => Math.min(80, Math.max(15.6, h * 0.21));

  // the view: what the camera frames, in cm. Everything is scaled so the view is always 1 unit tall
  const growView = Math.max(42, nowCm * 1.88);
  const vA = {h: growView, cx: growView * 0.29, cy: growView * 0.33};
  const vDive = {h: 30, cx: loserX + 5, cy: 9};
  const vBoth = {h: finalCm * 1.88, cx: finalCm * 1.88 * 0.29, cy: finalCm * 1.88 * 0.33};
  const mix = (a: typeof vA, b: typeof vA, k: number) => {
    if (k <= 0) return a;
    if (k >= 1) return b;
    const h = Math.exp(lerp(Math.log(a.h), Math.log(b.h), k));
    const kk = Math.abs(a.h - b.h) < 1e-6 ? k : (a.h - h) / (a.h - b.h);
    return {h, cx: lerp(a.cx, b.cx, kk), cy: lerp(a.cy, b.cy, kk)};
  };
  const view = both > 0 ? mix(vDive, vBoth, both) : mix(vA, vDive, dive);
  const S = 1 / view.h;
  const N3 = (x: number, y: number, z: number): V3 => [(x - view.cx) * S, (y - view.cy) * S, z * S];
  const floorY = -view.cy * S;

  const FOV = 30, DIST = 3.3;
  const yaw = lerp(-0.4, 0.28, smooth(p.growStart - 2, p.growEnd, t)) + 0.5 * dive - 0.2 * both + Math.sin(t * 0.5) * 0.02;
  const pitch = lerp(0.09, 0.15, u) + 0.12 * dive;
  const shake = pulse * 0.008;
  const camPos: V3 = [Math.sin(yaw) * Math.cos(pitch) * DIST + Math.sin(t * 57) * shake, Math.sin(pitch) * DIST + Math.cos(t * 49) * shake, Math.cos(yaw) * Math.cos(pitch) * DIST];
  const proj = projector(camPos, [0, 0, 0], FOV);
  const Pj = (x: number, y: number, z: number) => proj(N3(x, y, z));

  // height-chart wall: printed lines behind everything (real 3D, so shadows and perspective are right)
  const WALL = -0.34;
  const w = stackW(nowCm);
  const pxPerCm = S * 1100;
  const j = Math.max(1, STEPS.findIndex((st) => st * pxPerCm >= 120));
  const coarse = STEPS[j] ?? 1000, fine = STEPS[j - 1] ?? 500;
  const fineO = smooth(40, 90, fine * pxPerCm);
  const ticks: {c: number; o: number; lab: number}[] = [];
  for (let c = fine; c <= view.h * 0.86; c += fine) {
    const isC = Math.abs(c / coarse - Math.round(c / coarse)) < 1e-6;
    if (isC) ticks.push({c, o: 1, lab: 1});
    else if (fineO > 0.02) ticks.push({c, o: fineO * 0.6, lab: smooth(70, 110, fine * pxPerCm)});
  }
  const wallK = (1 - dive) * smooth(p.growStart - 0.5, p.growStart + 0.5, t);

  const hookK = 1 - smooth(p.growStart - 0.6, p.growStart, t);
  const liveK = smooth(p.growStart - 0.2, p.growStart + 0.4, t) * (1 - clamp01(dive * 3)) * (1 - both);
  const endK = smooth(backAt + 0.5, backAt + 1.2, t);
  const rainN = !done && t > p.growStart ? 6 : 0;
  const lineColor = P.dark ? '#f3ebda' : '#151412';

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.46} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.28} loop />}
      {passes.map((x, i) => <Sequence key={i} from={Math.round(x.at * fps)} durationInFrames={14}><Audio src={staticFile('sfx/pop.wav')} volume={0.85} /></Sequence>)}
      <Sequence from={Math.round(diveAt * fps)} durationInFrames={22}><Audio src={staticFile('sfx/thud.wav')} volume={0.9} /></Sequence>

      <ThreeCanvas width={1080} height={1920} shadows gl={{antialias: true}} camera={{fov: FOV, position: camPos}}>
        <Cam pos={camPos} target={[0, 0, 0]} fov={FOV} near={0.6} />
        <Studio ready={ready} P={P} floorY={floorY} span={2.4} key3={[1.5, 4.6, 3.2]} soft={0.7} lights={6} />
        {/* wall: shadow catcher plus printed lines */}
        <mesh position={[0, floorY + 7.5, WALL]} receiveShadow><planeGeometry args={[30, 15]} /><shadowMaterial transparent opacity={P.shadow * 0.55} /></mesh>
        {ticks.map((k) => {
          const y = (k.c - view.cy) * S;
          if (proj([0, y, WALL]).y < 735) return null;
          return (
            <mesh key={k.c} position={[0, y, WALL + 0.002]}>
              <planeGeometry args={[30, k.lab > 0.9 ? 0.0032 : 0.0018]} />
              <meshBasicMaterial color={lineColor} transparent opacity={0.3 * k.o * wallK} />
            </mesh>
          );
        })}
        <mesh position={[0, floorY + 0.0005, WALL + 0.003]}><planeGeometry args={[30, 0.004]} /><meshBasicMaterial color={lineColor} transparent opacity={0.5 * (1 - dive)} /></mesh>

        {/* the world, in centimetres */}
        <group position={[-view.cx * S, floorY, 0]} scale={S}>
          <Stack h={nowCm} w={w} cash={cash} bands={Math.max(1, Math.min(22, nowCm / 1.09))} flow={Math.log(nowCm) * 2.2} />
          {(dive > 0 || both > 0) && <Stack h={loserCm} w={15.6} x={loserX} cash={cash} bands={Math.max(1, loserCm / 1.09)} flow={0} />}
          {(dive > 0 || both > 0) && both < 0.6 && <group position={[loserX + 17, 0, 2]}><Can P={P} /></group>}
          {THINGS.map((o) => {
            const r = o.h / nowCm, lim = o.h > 400 ? 1.4 : 1.6;
            if (r > lim || r < 0.02 || o.h > finalCm) return null;
            if (dive > 0.45) return null;
            if (both > 0 && r > 1) return null;
            const pt = passes.find((x) => x.o.key === o.key);
            const hop = pt && t > pt.at ? Math.max(0, Math.sin((t - pt.at) * 9)) * Math.exp(-(t - pt.at) * 4) * o.h * 0.1 : 0;
            const sIn = outBack(smooth(lim, lim * 0.84, r), 1.2);
            return (
              <group key={o.key} position={[o.x, hop, o.z]} scale={sIn} rotation={[0, (o.rot ?? 0) + yaw * (o.icon ? 1 : 0.5), 0]}>
                {o.key === 'can' ? <Can P={P} /> : o.key === 'hoop' ? <Hoop P={P} /> : <Sil3D icon={o.icon!} h={o.h} color={P.ink} depth={0.028} />}
              </group>
            );
          })}
        </group>

        {/* bills landing on the stack */}
        {Array.from({length: rainN}, (_, i) => {
          const ph = (t * 1.5 + i / rainN) % 1;
          const top = N3(0, nowCm, 0), wn = w * S;
          return (
            <mesh key={i} position={[top[0] + (rnd(i, 1) - 0.5) * wn * 1.2 * (1 - ph), top[1] + (1 - ph) * (0.045 + rnd(i, 2) * 0.03) + 0.002, (rnd(i, 3) - 0.5) * wn * 0.5 * (1 - ph)]}
              rotation={[Math.PI / 2 + Math.sin(t * 5 + i) * 0.6 * (1 - ph), 0, rnd(i, 4) * 6 + t * 2 * (1 - ph)]} castShadow>
              <planeGeometry args={[wn, wn * 0.42]} />
              <meshStandardMaterial map={cash.top} side={THREE.DoubleSide} transparent opacity={Math.min(1, ph * 4)} roughness={0.8} />
            </mesh>
          );
        })}
      </ThreeCanvas>

      {/* wall labels */}
      <div style={{opacity: wallK * (1 - both)}}>
        {ticks.filter((k) => k.lab > 0.02).map((k) => {
          const a = proj([-0.42, (k.c - view.cy) * S, WALL]);
          if (a.y < 740 || a.y > 1400) return null;
          return <div key={k.c} style={{position: 'absolute', left: 84, top: a.y - 30, fontFamily: MONO, fontWeight: 500, fontSize: 21, color: P.mute, opacity: k.o * k.lab}}>{tickLabel(k.c)}</div>;
        })}
      </div>

      {/* name tags */}
      {THINGS.map((o) => {
        const r = o.h / nowCm;
        const vis = smooth(1.6, 1.4, r) * smooth(0.55, 0.8, r) * (1 - clamp01(dive * 3)) * (1 - both);
        if (vis < 0.02 || o.h > finalCm) return null;
        const a = Pj(o.x, o.h * 1.03, o.z);
        if (a.y - 56 < 700) return null;
        return <Tag key={o.key} P={P} x={Math.min(790, a.x)} y={a.y - 56} opacity={vis} solid={r >= 1}>{o.name.replace(/^an? /, '').toUpperCase()} · {height(o.h).toUpperCase()}</Tag>;
      })}

      <Masthead P={P} label={p.label} />
      {hookK > 0.01 && (
        <Head P={P} top={372} size={P.dItalic ? 92 : 78} style={{opacity: hookK}}>{p.hookA} <Em P={P}>{p.hookB}</Em></Head>
      )}
      {liveK > 0.01 && (
        <div style={{position: 'absolute', top: 362, left: 84, width: 912, opacity: liveK}}>
          <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
            <div style={{fontFamily: P.display, fontWeight: P.dWeight, fontSize: P.dItalic ? 190 : 160, lineHeight: 0.98, letterSpacing: P.dTrack + 'em', color: P.accent, fontVariantNumeric: 'tabular-nums'}}>{height(nowCm)}</div>
            <div style={{textAlign: 'right', fontFamily: MONO, fontWeight: 700, fontSize: 30, color: P.ink, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums'}}>
              <div>{money(value)}</div><div style={{color: P.mute, fontWeight: 500}}>{year}</div>
            </div>
          </div>
          {lastPass && (
            <div style={{fontFamily: P.display, fontWeight: P.dWeight, fontSize: P.dItalic ? 62 : 52, letterSpacing: P.dTrack + 'em', color: P.ink, marginTop: 6,
              opacity: smooth(0, 0.25, pk), transform: `translateY(${(1 - smooth(0, 0.3, pk)) * 14}px)`}}>
              Taller than <Em P={P}>{lastPass.o.name}.</Em>
            </div>
          )}
        </div>
      )}
      {dive > 0.02 && both < 0.05 && (
        <div style={{position: 'absolute', top: 372, left: 84, width: 912, opacity: smooth(0.5, 0.95, dive)}}>
          <div style={{fontFamily: P.display, fontWeight: P.dWeight, fontSize: P.dItalic ? 78 : 66, lineHeight: 1, letterSpacing: P.dTrack + 'em', color: P.ink}}>The same $10,000 in {p.loser.label}:</div>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 26}}>
            <div style={{fontFamily: P.display, fontWeight: P.dWeight, fontSize: P.dItalic ? 190 : 160, lineHeight: 1, letterSpacing: P.dTrack + 'em', color: P.accent}}>{height(loserCm)}</div>
            <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 30, color: P.ink}}>{money(p.loser.value)}</div>
          </div>
          <div style={{fontFamily: P.display, fontStyle: P.dItalic ? 'italic' : 'normal', fontWeight: P.dWeight, fontSize: P.dItalic ? 62 : 52, color: P.ink, letterSpacing: P.dTrack + 'em'}}>Shorter than a soda can.</div>
        </div>
      )}
      {endK > 0.02 && (() => {
        const a = Pj(0, finalCm, 0), b = Pj(loserX, loserCm, 0);
        return (
          <>
            <Head P={P} top={372} size={P.dItalic ? 92 : 78} style={{opacity: endK}}>Same $10,000. Same {p.years[1] - p.years[0]} years. <Em P={P}>{height(finalCm)} against {height(loserCm)}.</Em></Head>
            <Tag P={P} x={Math.max(290, a.x)} y={a.y - 62} opacity={endK} solid>{p.hero.label.toUpperCase()} · {money(p.hero.value)}</Tag>
            <Tag P={P} x={Math.min(780, b.x)} y={b.y - 64} opacity={endK}>{p.loser.label.toUpperCase()} · {money(p.loser.value)}</Tag>
          </>
        );
      })()}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
