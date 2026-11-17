// ---------- The receipt: a real paper receipt prints out of a slot, line by line, then gets stamped with the total change ----------
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {Backdrop, Cam, Em, Grain, Head, Masthead, PAL, PalName, ProgressRule, RBox, Studio, V3, clamp01, lerp, outBack, smooth, useEdFonts, FollowCard, Follow} from './kit';

type Item = {name: string; a: number; b: number};
export type EdReceiptProps = {pal: PalName; duration: number; label: string; hookA: string; hookB: string; endA: string; endB: string; store: string; sub: string; colA: string; colB: string;
  items: Item[]; printStart: number; printEnd: number; music?: string | null; follow?: Follow};

const CW = 720, CH = 850;
const usd = (v: number) => '$' + v.toFixed(2);

export const EdReceipt: React.FC<EdReceiptProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL[p.pal];
  const totA = p.items.reduce((s, i) => s + i.a, 0), totB = p.items.reduce((s, i) => s + i.b, 0);
  const pct = Math.round((totB / totA - 1) * 100);

  // the printed receipt (drawn once), and where each line sits so the feed can pause on them
  const {tex, stampTex, lines} = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const x = c.getContext('2d')!;
    const lines: number[] = [];
    if (ready) {
      x.fillStyle = '#FFFEFA'; x.fillRect(0, 0, CW, CH);
      const ink = '#1a1917', red = PAL.paper.accent;
      const M = (w: number, s: number) => `${w} ${s}px "JetBrains Mono", monospace`;
      x.fillStyle = ink; x.textBaseline = 'middle';
      // logo drop
      x.save(); x.translate(CW / 2 - 21, 34); x.scale(0.52, 0.52);
      x.fillStyle = red; x.beginPath(); x.moveTo(41, 3); x.bezierCurveTo(41, 3, 6, 42, 6, 64); x.arc(41, 64, 35, Math.PI, 0, true); x.bezierCurveTo(76, 42, 41, 3, 41, 3); x.fill();
      x.fillStyle = '#FFFEFA'; x.fillRect(23, 63, 9, 16); x.fillRect(36.5, 52, 9, 27); x.fillRect(50, 41, 9, 38); x.restore();
      x.fillStyle = ink; x.textAlign = 'center';
      x.font = '400 62px "Instrument Serif", serif'; x.fillText(p.store, CW / 2, 128);
      x.font = M(500, 25); x.fillText(p.sub, CW / 2, 180);
      const dash = (y: number) => { x.strokeStyle = ink; x.lineWidth = 3; x.setLineDash([12, 9]); x.beginPath(); x.moveTo(40, y); x.lineTo(CW - 40, y); x.stroke(); x.setLineDash([]); };
      dash(222);
      x.font = M(700, 27); x.textAlign = 'left'; x.fillText('ITEM', 40, 262); x.textAlign = 'right'; x.fillText(p.colA, 500, 262); x.fillText(p.colB, CW - 40, 262);
      lines.push(282);
      let y = 326;
      for (const it of p.items) {
        x.font = M(500, 31); x.textAlign = 'left'; x.fillStyle = ink; x.fillText(it.name, 40, y);
        x.textAlign = 'right'; x.fillStyle = 'rgba(26,25,23,0.6)'; x.fillText(usd(it.a), 500, y);
        x.font = M(700, 31); x.fillStyle = ink; x.fillText(usd(it.b), CW - 40, y);
        lines.push(y + 30);
        y += 64;
      }
      dash(y - 8); y += 46;
      x.font = M(700, 38); x.textAlign = 'left'; x.fillStyle = ink; x.fillText('TOTAL', 40, y);
      x.textAlign = 'right'; x.font = M(500, 34); x.fillStyle = 'rgba(26,25,23,0.6)'; x.fillText(usd(totA), 500, y);
      x.font = M(700, 44); x.fillStyle = red; x.fillText(usd(totB), CW - 40, y);
      lines.push(y + 40);
      lines.push(CH);
      x.getImageData(0, 0, 1, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapT = THREE.RepeatWrapping;
    // the stamp
    const s = document.createElement('canvas');
    s.width = s.height = 512;
    const z = s.getContext('2d')!;
    if (ready) {
      z.translate(256, 256); z.rotate(-0.24);
      z.strokeStyle = PAL.paper.accent; z.fillStyle = PAL.paper.accent; z.globalAlpha = 0.88;
      z.lineWidth = 16; z.beginPath(); z.arc(0, 0, 222, 0, 7); z.stroke();
      z.lineWidth = 5; z.beginPath(); z.arc(0, 0, 196, 0, 7); z.stroke();
      z.textAlign = 'center'; z.textBaseline = 'middle';
      z.font = '400 190px "Instrument Serif", serif'; z.fillText(`+${pct}%`, 0, -4);
      z.font = '700 31px "JetBrains Mono", monospace'; z.fillText(`SINCE ${p.colA}`, 0, 112); z.fillText('SAME CART', 0, -122);
      z.getImageData(0, 0, 1, 1);
    }
    const stampTex = new THREE.CanvasTexture(s);
    stampTex.colorSpace = THREE.SRGBColorSpace; stampTex.anisotropy = 8;
    return {tex, stampTex, lines};
  }, [ready, p.items, pct]);

  // feed: the paper advances line by line, with a tiny pause on each
  const W = 1.62, L = (W * CH) / CW, BOT = -1.0;
  const n = Math.max(1, lines.length);
  const raw = clamp01((t - p.printStart) / (p.printEnd - p.printStart));
  const seg = Math.min(n - 1, Math.floor(raw * n)), f = raw * n - seg;
  const yPrev = seg === 0 ? 0 : lines[seg - 1], yNext = lines[seg] ?? CH;
  const k = ready ? Math.max(0.02, lerp(yPrev, yNext, smooth(0, 0.62, f)) / CH) : 0.02;
  const vis = L * k;
  const lineTimes = lines.map((_, i) => p.printStart + (i / n) * (p.printEnd - p.printStart));

  const geo = useMemo(() => {
    const SEG = 48, g = new THREE.PlaneGeometry(W, vis, 6, SEG);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), fromSlot = y + vis / 2, fromEnd = vis - fromSlot;
      const curl = 0.2 * Math.exp(-fromEnd / 0.22) + 0.03 * Math.sin(fromSlot * 2.4 - t * 1.1) * Math.min(1, fromSlot / 0.5) + 0.05 * Math.exp(-fromSlot / 0.12);
      pos.setZ(i, curl + 0.012 * Math.sin(pos.getX(i) * 3.2) * Math.min(1, fromSlot));
    }
    g.computeVertexNormals();
    return g;
  }, [vis, Math.round(t * 30)]);
  tex.repeat.set(1, k); tex.offset.set(0, 1 - k); tex.needsUpdate = true;

  const stampAt = p.printEnd + 0.7, sk = clamp01((t - stampAt) / 0.22), stamped = t >= stampAt;
  const shake = stamped ? Math.exp(-(t - stampAt) * 9) * 0.03 : 0;

  const FOV = 24;
  const yaw = lerp(0.22, 0.06, smooth(0, p.printEnd, t)) + Math.sin(t * 0.45) * 0.02;
  const dist = lerp(13.4, 12.3, smooth(0, p.printEnd, t));
  const target: V3 = [0, 0.02, 0];
  const camPos: V3 = [Math.sin(yaw) * dist + Math.sin(t * 60) * shake, -3.4 + Math.cos(t * 53) * shake, Math.cos(yaw) * dist];
  const hookK = 1 - smooth(p.printEnd + 0.2, p.printEnd + 0.7, t);
  const endK = smooth(stampAt + 0.25, stampAt + 0.8, t);

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.48} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.26} loop />}
      {lineTimes.map((at, i) => <Sequence key={i} from={Math.round(at * fps)} durationInFrames={8}><Audio src={staticFile('sfx/print.wav')} volume={0.5} /></Sequence>)}
      <Sequence from={Math.round(stampAt * fps)} durationInFrames={14}><Audio src={staticFile('sfx/stamp.wav')} volume={1} /></Sequence>

      <ThreeCanvas width={1080} height={1920} shadows gl={{antialias: true}} camera={{fov: FOV, position: camPos}}>
        <Cam pos={camPos} target={target} fov={FOV} near={2} />
        <Studio ready={ready} P={P} floor={false} span={4} key3={[-2.6, 4.5, 7]} soft={1.4} lights={6} />
        {/* wall behind: catches the shadows */}
        <mesh position={[0, 0, -0.22]} receiveShadow><planeGeometry args={[60, 60]} /><shadowMaterial transparent opacity={P.shadow * 0.9} /></mesh>
        {/* the printer */}
        <RBox args={[2.2, 0.5, 0.42]} r={0.11} color={P.dark ? '#e9e1cf' : '#1b1a18'} rough={0.45} position={[0, BOT - 0.26, 0.06]} />
        <RBox args={[1.62, 0.035, 0.1]} r={0.015} color="#050505" position={[0, BOT - 0.012, 0.3]} />
        <mesh position={[0.86, BOT - 0.3, 0.32]}><sphereGeometry args={[0.03, 16, 16]} /><meshBasicMaterial color={t > p.printStart && t < p.printEnd && Math.sin(t * 22) > 0 ? P.accent : '#59d37a'} /></mesh>
        {/* the paper */}
        <mesh geometry={geo} position={[0, BOT + vis / 2, -0.19]} castShadow receiveShadow>
          <meshStandardMaterial map={tex} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        {stamped && (
          <mesh position={[0.5, BOT + L * 0.86, 0.04]} scale={lerp(2.0, 0.7, outBack(sk, 1.1))}>
            <planeGeometry args={[1.0, 1.0]} />
            <meshBasicMaterial map={stampTex} transparent opacity={Math.min(1, sk * 3)} depthWrite={false} toneMapped={false} />
          </mesh>
        )}
      </ThreeCanvas>

      <Masthead P={P} label={p.label} />
      {hookK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 96 : 80} style={{opacity: hookK}}>{p.hookA} <Em P={P}>{p.hookB}</Em></Head>}
      {endK > 0.01 && <Head P={P} top={372} size={P.dItalic ? 96 : 80} style={{opacity: endK}}>{p.endA} <Em P={P}>{p.endB}</Em></Head>}
      {p.follow && <FollowCard P={P} t={t} f={p.follow} />}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
