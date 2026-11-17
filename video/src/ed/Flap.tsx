// ---------- The board: a split-flap display (like an old departures board) that flips to each price in turn ----------
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {Backdrop, Cam, Em, clamp01, Grain, Head, Masthead, PAL, Pal, PalName, ProgressRule, RBox, Studio, V3, lerp, rnd, smooth, useEdFonts, FollowCard, Follow} from './kit';

type Row = {text: string; at: number; hot?: boolean};
export type EdFlapProps = {pal: PalName; duration: number; label: string; hookA: string; hookB: string; endA: string; endB: string; header: string; rows: Row[]; teaser?: {text: string; line: string; em: string}; music?: string | null; follow?: Follow};

const CHARS = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$.,%';
const COLS = 12, CW = 0.172, CHH = 0.285, GAP = 0.02, ROWGAP = 0.065, FLIP = 0.075;

// one material per character half, shared by every cell
const useGlyphs = (P: Pal, ready: boolean) => useMemo(() => {
  const make = (ch: string, half: 'top' | 'bottom', hot: boolean) => {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 76;
    const x = c.getContext('2d')!;
    const bg = hot ? P.accent : P.dark ? '#f3ebda' : '#1c1b19', fg = hot ? P.onAccent : P.dark ? '#0c261e' : '#f6f1e6';
    x.fillStyle = bg; x.fillRect(0, 0, 96, 76);
    const g = x.createLinearGradient(0, 0, 0, 76);
    if (half === 'top') { g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); }
    else { g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(0.25, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.08)'); }
    x.fillStyle = g; x.fillRect(0, 0, 96, 76);
    if (ready) {
      x.fillStyle = fg; x.font = '800 118px Inter, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(ch, 48, half === 'top' ? 82 : 6);
    }
    x.getImageData(0, 0, 1, 1);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({map: t, roughness: 0.75, side: THREE.DoubleSide});
  };
  const out: Record<string, THREE.Material> = {};
  for (const ch of CHARS) for (const half of ['top', 'bottom'] as const) for (const hot of [false, true]) out[ch + half + (hot ? 'h' : '')] = make(ch, half, hot);
  return out;
}, [P.name, ready]);

const halfGeo = new THREE.PlaneGeometry(CW, CHH / 2);

// what a cell shows at time t: it flips through a few characters, one after another, then stops on its target
const cellState = (target: string, prev: string, start: number, flips: number, t: number, seed: number) => {
  const seq = [prev];
  for (let i = 1; i < flips; i++) seq.push(CHARS[1 + Math.floor(rnd(seed, i) * (CHARS.length - 1))]);
  seq.push(target);
  if (target === prev) return {cur: target, next: target, ph: 0};
  const k = (t - start) / FLIP;
  if (k <= 0) return {cur: prev, next: prev, ph: 0};
  const i = Math.floor(k);
  if (i >= seq.length - 1) return {cur: target, next: target, ph: 0};
  return {cur: seq[i], next: seq[i + 1], ph: k - i};
};

const Cell: React.FC<{pos: V3; cur: string; next: string; ph: number; hot: boolean; mats: Record<string, THREE.Material>}> = ({pos, cur, next, ph, hot, mats}) => {
  const h = hot ? 'h' : '', q = CHH / 4;
  return (
    <group position={pos}>
      <mesh geometry={halfGeo} position={[0, q + 0.003, 0]} material={mats[next + 'top' + h]} receiveShadow />
      <mesh geometry={halfGeo} position={[0, -q - 0.003, 0]} material={mats[cur + 'bottom' + h]} receiveShadow />
      {ph > 0 && ph < 0.5 && (
        <group position={[0, 0.003, 0.004]} rotation={[ph * Math.PI, 0, 0]}><mesh geometry={halfGeo} position={[0, q, 0]} material={mats[cur + 'top' + h]} castShadow /></group>
      )}
      {ph >= 0.5 && (
        <group position={[0, -0.003, 0.004]} rotation={[(ph - 1) * Math.PI, 0, 0]}><mesh geometry={halfGeo} position={[0, -q, 0]} material={mats[next + 'bottom' + h]} castShadow /></group>
      )}
    </group>
  );
};

export const EdFlap: React.FC<EdFlapProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL[p.pal];
  const mats = useGlyphs(P, ready);
  const nR = p.rows.length;
  const BW = COLS * CW + (COLS - 1) * GAP, BH = nR * CHH + (nR - 1) * ROWGAP;
  const cellX = (c: number) => -BW / 2 + CW / 2 + c * (CW + GAP);
  const rowY = (r: number) => BH / 2 - CHH / 2 - r * (CHH + ROWGAP);

  const last = p.rows[nR - 1];
  const endAt = last.at + 2.4;
  const FOV = 24;
  const yaw = lerp(-0.3, 0.16, smooth(0, endAt, t)) + Math.sin(t * 0.4) * 0.015;
  const dist = lerp(14.4, 13.6, smooth(0, endAt, t));
  const target: V3 = [0.14, 0.32, 0];
  const camPos: V3 = [0.14 + Math.sin(yaw) * dist, 0.9, Math.cos(yaw) * dist];
  const hookK = 1 - smooth(endAt - 0.4, endAt, t);
  const endK = smooth(endAt + 0.1, endAt + 0.7, t);
  const frameCol = P.dark ? '#f3ebda' : '#111110';

  const clicks = useMemo(() => {
    const out: number[] = [];
    p.rows.forEach((r) => { for (let i = 0; i < 9; i++) out.push(r.at + i * 0.085); });
    return out;
  }, [p.rows]);

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.46} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.26} loop />}
      {clicks.map((at, i) => <Sequence key={i} from={Math.round(at * fps)} durationInFrames={4}><Audio src={staticFile('sfx/flap.wav')} volume={0.55} /></Sequence>)}
      <Sequence from={Math.round(endAt * fps)} durationInFrames={22}><Audio src={staticFile('sfx/thud.wav')} volume={0.8} /></Sequence>

      <ThreeCanvas width={1080} height={1920} shadows gl={{antialias: true}} camera={{fov: FOV, position: camPos}}>
        <Cam pos={camPos} target={target} fov={FOV} near={2} />
        <Studio ready={ready} P={P} floorY={-BH / 2 - 0.62} span={4} key3={[-2.2, 6, 7]} soft={1.4} lights={6} />
        <mesh position={[0, 0, -0.5]} receiveShadow><planeGeometry args={[60, 60]} /><shadowMaterial transparent opacity={P.shadow * 0.7} /></mesh>
        {/* cabinet, legs */}
        <RBox args={[BW + 0.3, BH + 0.32, 0.26]} r={0.07} color={frameCol} rough={0.5} position={[0, 0, -0.14]} />
        {[-1, 1].map((s) => <RBox key={s} args={[0.07, 0.62, 0.07]} r={0.02} color={frameCol} position={[s * (BW / 2 - 0.2), -BH / 2 - 0.42, -0.14]} />)}
        <RBox args={[BW + 0.1, 0.05, 0.5]} r={0.02} color={frameCol} position={[0, -BH / 2 - 0.6, -0.1]} />
        {p.rows.map((row, r) => row.text.padEnd(COLS, ' ').slice(0, COLS).split('').map((ch, c) => {
          const st = cellState(ch, ' ', row.at + c * 0.045, 5 + Math.floor(rnd(r * 31 + c, 9) * 6), t, r * 100 + c);
          const hot = !!row.hot && t > row.at + 1.25;
          return <Cell key={`${r}-${c}`} pos={[cellX(c), rowY(r), 0]} cur={st.cur} next={st.next} ph={st.ph} hot={hot} mats={mats} />;
        }))}
      </ThreeCanvas>

      {p.teaser && t < p.rows[0].at + 0.2 && (() => {
        // the punchline row first: it flips in big before the board fills, so the first second already says the point
        const k = 1 - smooth(p.rows[0].at - 0.5, p.rows[0].at, t);
        const cells = p.teaser.text.padEnd(COLS, ' ').slice(0, COLS).split('');
        return (
          <div style={{position: 'absolute', left: 0, right: 0, top: 690, opacity: k, transform: `translateY(${(1 - k) * -40}px)`}}>
            <div style={{margin: '0 auto', width: 872, padding: 24, borderRadius: 22, background: frameCol, boxShadow: '0 40px 70px rgba(20,0,40,0.45)', display: 'flex', gap: 8, boxSizing: 'border-box'}}>
              {cells.map((c, i) => {
                const flipK = clamp01((t - 0.1 - i * 0.04) / 0.22);
                return (
                  <div key={i} style={{flex: 1, height: 120, borderRadius: 7, background: P.accent, color: '#fff', fontFamily: 'Inter', fontWeight: 800, fontSize: 78, lineHeight: '120px', textAlign: 'center',
                    position: 'relative', transform: `perspective(400px) rotateX(${(1 - flipK) * 90}deg)`, transformOrigin: 'top'}}>
                    {c.trim()}<div style={{position: 'absolute', left: 0, right: 0, top: 59, height: 2, background: 'rgba(0,0,0,0.3)'}} />
                  </div>
                );
              })}
            </div>
            <div style={{textAlign: 'center', marginTop: 34, opacity: smooth(0.6, 0.9, t)}}><span style={{display: 'inline-block', padding: '14px 30px', borderRadius: 18, background: P.dark ? 'rgba(27,11,51,0.88)' : 'rgba(255,253,248,0.92)', fontFamily: P.display, fontWeight: P.dWeight, fontSize: P.dItalic ? 62 : 52, color: P.ink, boxShadow: '0 18px 36px rgba(0,0,0,0.25)'}}>{p.teaser.line} <Em P={P}>{p.teaser.em}</Em></span></div>
          </div>
        );
      })()}
      <Masthead P={P} label={p.label} />
      {hookK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 96 : 80} style={{opacity: hookK}}>{p.hookA} <Em P={P}>{p.hookB}</Em></Head>}
      {endK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 92 : 76} style={{opacity: endK}}>{p.endA} <Em P={P}>{p.endB}</Em></Head>}
      {p.follow && <FollowCard P={P} t={t} f={p.follow} />}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
