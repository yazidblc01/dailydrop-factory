// ---------- Higher or lower, editorial 3D: two thick paper cards on a wall. The new card flips over to show its price and gets stamped. ----------
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {Backdrop, Cam, Em, Grain, Head, Masthead, PAL, Pal, PalName, ProgressRule, RBox, Studio, V3, clamp01, lerp, outBack, outCubic, smooth, useEdFonts} from './kit';

type Item = {name: string; sub: string; value: number};
export type EdHLProps = {pal: PalName; duration: number; label: string; hookA: string; hookB: string; endA: string; endB: string; unit: string; items: Item[]; start: number; round: number; music?: string | null};

const TW = 920, TH = 440, CWID = 2.36, CHT = (CWID * TH) / TW;
const usd = (v: number) => '$' + (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(2));
const tex = (draw: (x: CanvasRenderingContext2D) => void, w = TW, h = TH) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  draw(x); x.getImageData(0, 0, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
};

const useCards = (P: Pal, p: EdHLProps, ready: boolean) => useMemo(() => {
  const paper = P.card, ink = P.cardInk;
  const fronts = p.items.map((it, i) => tex((x) => {
    x.fillStyle = paper; x.fillRect(0, 0, TW, TH);
    if (!ready) return;
    x.strokeStyle = ink; x.lineWidth = 3; x.strokeRect(22, 22, TW - 44, TH - 44);
    x.fillStyle = ink; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    x.font = '400 92px "Instrument Serif", serif'; x.fillText(it.name, 54, 126);
    x.font = '500 30px "JetBrains Mono", monospace'; x.globalAlpha = 0.6; x.fillText(`${it.sub} · ${p.unit}`, 56, 178); x.globalAlpha = 1;
    x.fillRect(54, 208, TW - 108, 3);
    x.textAlign = 'right'; x.font = '400 226px "Instrument Serif", serif'; x.fillStyle = P.name === 'paper' || P.name === 'vice' ? P.accent : ink; x.fillText(usd(it.value), TW - 50, 398);
    x.textAlign = 'left'; x.font = '700 26px "JetBrains Mono", monospace'; x.fillStyle = ink; x.globalAlpha = 0.5; x.fillText(`NO. ${String(i + 1).padStart(2, '0')}`, 56, 392);
  }));
  const backs = p.items.map((it) => tex((x) => {
    x.fillStyle = ink; x.fillRect(0, 0, TW, TH);
    if (!ready) return;
    x.strokeStyle = paper; x.globalAlpha = 0.5; x.lineWidth = 3; x.strokeRect(22, 22, TW - 44, TH - 44); x.globalAlpha = 1;
    x.fillStyle = paper; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    x.font = '400 92px "Instrument Serif", serif'; x.fillText(it.name, 54, 126);
    x.font = '500 30px "JetBrains Mono", monospace'; x.globalAlpha = 0.65; x.fillText(`${it.sub} · ${p.unit}`, 56, 178); x.globalAlpha = 1;
    x.fillRect(54, 208, TW - 108, 3);
    x.textAlign = 'right'; x.font = 'italic 400 226px "Instrument Serif", serif'; x.fillStyle = P.accent; x.fillText('$ ? ? ?', TW - 50, 398);
  }));
  const stamp = (word: string, col: string) => tex((x) => {
    if (!ready) return;
    x.translate(300, 130); x.rotate(-0.16);
    x.globalAlpha = 0.9; x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 12;
    x.beginPath(); x.roundRect(-250, -84, 500, 168, 22); x.stroke();
    x.lineWidth = 4; x.beginPath(); x.roundRect(-232, -66, 464, 132, 12); x.stroke();
    x.font = '800 104px "Bricolage Grotesque", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(word, 0, 6);
  }, 600, 260);
  return {fronts, backs, higher: stamp('HIGHER', P.accent), lower: stamp('LOWER', P.name === 'paper' || P.name === 'vice' ? '#1f5fd1' : P.accent)};
}, [P.name, ready, p.items]);

export const EdHL: React.FC<EdHLProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL[p.pal];
  const cards = useCards(P, p, ready);
  const rounds = p.items.length - 1;
  const endAt = p.start + rounds * p.round;

  // each round: the challenger slides in face down, flips, gets stamped, then moves up to become the reference
  const TOPY = 0.3, BOTY = -0.97;
  const state = (i: number) => {
    // item i is the challenger in round i-1 (i >= 1), then the reference in round i
    const born = i === 0 ? 0.5 : p.start + (i - 1) * p.round;
    const tt = t - born;
    if (tt < 0) return null;
    const flipAt = 1.9, moveAt = p.round - 0.55;
    if (i === 0) {
      const up = smooth(p.start + p.round - 0.55, p.start + p.round, t);
      return {y: lerp(TOPY, TOPY + 3.2, up), x: 0, flip: 1, enter: outBack(tt / 0.6, 1.1), stamp: -1, tilt: 0};
    }
    const enter = outCubic(tt / 0.5);
    const flip = smooth(flipAt, flipAt + 0.42, tt);
    const move = smooth(moveAt, moveAt + 0.55, tt);
    const leave = smooth(moveAt + p.round, moveAt + p.round + 0.55, tt);
    return {y: lerp(lerp(BOTY - 3, BOTY, enter), TOPY, move) + leave * 3.2, x: 0, flip, enter: 1, stamp: tt - (flipAt + 0.5), tilt: Math.sin(tt * 3) * 0.01 * (1 - flip)};
  };

  const FOV = 24, dist = 13.2;
  const yaw = lerp(-0.16, 0.14, smooth(0, endAt, t)) + Math.sin(t * 0.5) * 0.015;
  const stampShake = p.items.reduce((s, _, i) => { const st = state(i); return st && st.stamp > 0 && st.stamp < 0.3 ? s + Math.exp(-st.stamp * 14) * 0.03 : s; }, 0);
  const target: V3 = [0.12, -0.12, 0];
  const camPos: V3 = [0.12 + Math.sin(yaw) * dist + Math.sin(t * 61) * stampShake, 0.3 + Math.cos(t * 53) * stampShake, Math.cos(yaw) * dist];
  const hookK = 1 - smooth(endAt - 0.3, endAt + 0.2, t);
  const endK = smooth(endAt + 0.3, endAt + 0.9, t);
  const edge = P.dark ? '#d9cfba' : '#e2dccd';

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.5} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.26} loop />}
      {p.items.slice(1).map((_, i) => {
        const b = p.start + i * p.round;
        return (
          <React.Fragment key={i}>
            <Sequence from={Math.round((b + 1.9) * fps)} durationInFrames={8}><Audio src={staticFile('sfx/flap.wav')} volume={1} /></Sequence>
            <Sequence from={Math.round((b + 2.4) * fps)} durationInFrames={14}><Audio src={staticFile('sfx/stamp.wav')} volume={1} /></Sequence>
          </React.Fragment>
        );
      })}

      <ThreeCanvas width={1080} height={1920} shadows gl={{antialias: true}} camera={{fov: FOV, position: camPos}}>
        <Cam pos={camPos} target={target} fov={FOV} near={2} />
        <Studio ready={ready} P={P} floor={false} span={4.5} key3={[-2.4, 5.5, 7]} soft={1.5} lights={6} />
        <mesh position={[0, 0, -0.3]} receiveShadow><planeGeometry args={[60, 60]} /><shadowMaterial transparent opacity={P.shadow * 0.85} /></mesh>
        {p.items.map((it, i) => {
          const st = state(i);
          if (!st || st.y > 3.4) return null;
          const higher = i > 0 && it.value >= p.items[i - 1].value;
          const sk = clamp01(st.stamp / 0.2);
          return (
            <group key={i} position={[st.x, st.y, 0]} rotation={[(1 - st.flip) * Math.PI, 0, st.tilt + (i % 2 ? 0.012 : -0.012)]} scale={st.enter}>
              <RBox args={[CWID, CHT, 0.07]} r={0.03} color={edge} rough={0.8} />
              <mesh position={[0, 0, 0.0362]}><planeGeometry args={[CWID - 0.03, CHT - 0.03]} /><meshStandardMaterial map={cards.fronts[i]} roughness={0.85} /></mesh>
              <mesh position={[0, 0, -0.0362]} rotation={[Math.PI, 0, 0]}><planeGeometry args={[CWID - 0.03, CHT - 0.03]} /><meshStandardMaterial map={cards.backs[i]} roughness={0.85} /></mesh>
              {st.stamp > 0 && (
                <mesh position={[0.9, 0.44, 0.05]} rotation={[0, 0, 0.1]} scale={lerp(2.0, 0.82, outBack(sk, 1.1))}>
                  <planeGeometry args={[1.25, 0.54]} />
                  <meshBasicMaterial map={higher ? cards.higher : cards.lower} transparent opacity={Math.min(1, sk * 3)} depthWrite={false} toneMapped={false} />
                </mesh>
              )}
            </group>
          );
        })}
      </ThreeCanvas>

      <Masthead P={P} label={p.label} />
      {hookK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 96 : 80} style={{opacity: hookK}}>{p.hookA} <Em P={P}>{p.hookB}</Em></Head>}
      {endK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 92 : 76} style={{opacity: endK}}>{p.endA} <Em P={P}>{p.endB}</Em></Head>}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
