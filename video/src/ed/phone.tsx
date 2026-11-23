// ---------- the phone: a real 3D body with a light-mode chat painted on its screen every frame ----------
import React, {useMemo} from 'react';
import * as THREE from 'three';
import {V3, clamp01, lerp, outBack, outCubic, smooth} from './kit';

export type Msg = {from: 'me' | 'them'; text: string; at: number; big?: boolean};
export type ChatProps = {contact: string; clock: string; date: string; stamp: string; openAt: number; notifications: {at: number; text: string}[]; messages: Msg[]};

export const SW = 900, SH = 1680;
export const F = (w: number, s: number) => `${w} ${s}px Inter, "Noto Color Emoji", sans-serif`;
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|️|‍|\s)+$/u;
export const BLUE = '#0A84FF', GREY = '#E9E9EB', INK = '#0b0b0c';

export const wrap = (x: CanvasRenderingContext2D, text: string, maxW: number) => {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
};
export const statusBar = (x: CanvasRenderingContext2D, clock: string, col: string) => {
  x.fillStyle = col; x.font = F(800, 40); x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText(clock, 78, 66);
  x.fillStyle = '#050506'; x.beginPath(); x.roundRect(SW / 2 - 135, 30, 270, 74, 37); x.fill();
  x.fillStyle = '#0d1b3a'; x.beginPath(); x.arc(SW / 2 + 88, 67, 13, 0, 7); x.fill();
  x.fillStyle = col;
  for (let i = 0; i < 4; i++) { x.beginPath(); x.roundRect(668 + i * 14, 78 - i * 7, 9, 10 + i * 7, 3); x.fill(); }
  x.globalAlpha = 0.45; x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.roundRect(752, 50, 66, 32, 10); x.stroke(); x.globalAlpha = 1;
  x.beginPath(); x.roundRect(757, 55, 44, 22, 6); x.fill();
};
export const homeBar = (x: CanvasRenderingContext2D, col: string) => { x.fillStyle = col; x.beginPath(); x.roundRect(SW / 2 - 150, SH - 40, 300, 11, 6); x.fill(); };

const drawLock = (x: CanvasRenderingContext2D, t: number, p: ChatProps, wall: [string, string, string]) => {
  const g = x.createLinearGradient(0, 0, SW * 0.6, SH);
  g.addColorStop(0, wall[0]); g.addColorStop(0.55, wall[1]); g.addColorStop(1, wall[2]);
  x.fillStyle = g; x.fillRect(0, 0, SW, SH);
  for (const [cx, cy, r, c] of [[160, 1250, 800, 'rgba(255,255,255,0.22)'], [820, 420, 620, 'rgba(255,255,255,0.16)']] as [number, number, number, string][]) {
    const b = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    b.addColorStop(0, c); b.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = b; x.fillRect(0, 0, SW, SH);
  }
  statusBar(x, '', '#fff');
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = F(600, 48); x.fillText(p.date, SW / 2, 235);
  x.fillStyle = '#fff'; x.font = F(800, 250); x.fillText(p.clock, SW / 2, 470);
  // notifications wrap to 2 lines like iOS, with "..." if longer; newer ones push older ones up
  const shown = p.notifications.filter((n) => t >= n.at);
  const MAXW = SW - 72 - 188 - 40;
  x.font = F(600, 40);
  const lay = shown.map((n) => {
    let lines = wrap(x, n.text, MAXW);
    if (lines.length > 2) {
      let l2 = lines.slice(1).join(' ');
      while (x.measureText(l2 + '…').width > MAXW && l2.length > 1) l2 = l2.slice(0, -1);
      lines = [lines[0], l2.trimEnd() + '…'];
    }
    return {n, lines, h: lines.length > 1 ? 246 : 200};
  });
  lay.forEach(({n, lines, h}, i) => {
    const a = outBack((t - n.at) / 0.45, 1.1);
    const newer = lay.slice(i + 1).reduce((s, m) => s + outCubic((t - m.n.at) / 0.4) * (m.h + 22), 0);
    const tap = i === lay.length - 1 ? smooth(p.openAt - 0.3, p.openAt - 0.1, t) : 0;
    const y = 1330 - h - newer + (1 - a) * 160, s = 1 - tap * 0.04;
    x.save();
    x.globalAlpha = clamp01((t - n.at) / 0.2);
    x.translate(SW / 2, y + h / 2); x.scale(s, s); x.translate(-SW / 2, -(y + h / 2));
    x.fillStyle = 'rgba(0,0,0,0.07)'; x.beginPath(); x.roundRect(30, y + 8, SW - 60, h + 8, 54); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.06)'; x.beginPath(); x.roundRect(40, y + 16, SW - 80, h + 6, 54); x.fill();
    x.fillStyle = `rgba(255,255,255,${0.9 + tap * 0.1})`;
    x.beginPath(); x.roundRect(36, y, SW - 72, h, 50); x.fill();
    const ig = x.createLinearGradient(0, y + 52, 0, y + 148);
    ig.addColorStop(0, '#5ef07f'); ig.addColorStop(1, '#1eb84a');
    x.fillStyle = ig; x.beginPath(); x.roundRect(64, y + 52, 96, 96, 24); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(112, y + 96, 30, 25, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(92, y + 112); x.lineTo(86, y + 128); x.lineTo(108, y + 118); x.fill();
    x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = INK; x.font = F(800, 38); x.fillText(p.contact, 188, y + 86);
    x.font = F(600, 40);
    lines.forEach((l, k) => x.fillText(l, 188, y + 142 + k * 48));
    x.textAlign = 'right'; x.font = F(600, 30); x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillText('now', SW - 70, y + 82);
    x.restore();
  });
  for (const cx of [130, SW - 130]) { x.fillStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.arc(cx, 1520, 58, 0, 7); x.fill(); }
  homeBar(x, 'rgba(255,255,255,0.9)');
};

const TOP = 292, BOTTOM = 1478;
const drawChat = (x: CanvasRenderingContext2D, t: number, p: ChatProps) => {
  x.fillStyle = '#fff'; x.fillRect(0, 0, SW, SH);
  type Row = {m?: Msg; y: number; h: number; w: number; lines: string[]; a: number; fs: number; lh: number; emoji: boolean; last: boolean; typing?: number; stamp?: boolean};
  const rows: Row[] = [];
  let cur = 54, prev: Msg | null = null;
  const vis = p.messages.filter((m) => t >= m.at);
  vis.forEach((m, i) => {
    const a = clamp01((t - m.at) / 0.3), hk = m.at <= 0 ? 1 : outCubic(a);
    const emoji = EMOJI_ONLY.test(m.text);
    const fs = emoji ? 150 : m.big ? 104 : 54, lh = emoji ? 170 : m.big ? 116 : 66;
    x.font = F(m.big ? 800 : 600, fs);
    const lines = emoji ? [m.text] : wrap(x, m.text, 610);
    const w = Math.max(...lines.map((l) => x.measureText(l).width)) + (emoji ? 0 : m.big ? 84 : 62);
    const h = lines.length * lh + (emoji ? 0 : m.big ? 46 : 38);
    cur += (prev ? (prev.from === m.from ? 10 : 30) : 0) * hk;
    const next = vis[i + 1];
    rows.push({m, y: cur, h, w, lines, a: m.at <= 0 ? 1 : a, fs, lh, emoji, last: !next || next.from !== m.from});
    cur += h * hk;
    prev = m;
  });
  const upcoming = p.messages.find((m) => m.at > t);
  if (upcoming && upcoming.from === 'them' && t >= upcoming.at - 0.95 && upcoming.at - (prev ? (prev as Msg).at : 0) >= 1.0) {
    const a = smooth(upcoming.at - 0.95, upcoming.at - 0.75, t);
    cur += 30 * a;
    rows.push({y: cur, h: 88, w: 150, lines: [], a, fs: 0, lh: 0, emoji: false, last: true, typing: t});
    cur += 88 * a;
  }
  const scroll = Math.max(0, cur - (BOTTOM - TOP - 24));
  x.save();
  x.beginPath(); x.rect(0, TOP - 14, SW, BOTTOM - TOP + 14); x.clip();
  x.font = F(600, 28); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(0,0,0,0.42)';
  x.fillText(p.stamp, SW / 2, TOP + 22 - scroll);
  for (const r of rows) {
    const me = r.m?.from === 'me';
    const bx = me ? SW - 36 - r.w : 36, by = TOP + r.y - scroll;
    const s = 0.55 + 0.45 * outBack(r.a), ax = me ? bx + r.w : bx, ay = by + r.h;
    x.save();
    x.globalAlpha = Math.min(1, r.a * 2.2);
    x.translate(ax, ay); x.scale(s, s); x.translate(-ax, -ay);
    if (r.typing !== undefined) {
      x.fillStyle = GREY; x.beginPath(); x.roundRect(bx, by, r.w, r.h, 44); x.fill();
      for (let i = 0; i < 3; i++) {
        const k = 0.35 + 0.65 * Math.max(0, Math.sin(r.typing * 7 - i * 0.9));
        x.fillStyle = `rgba(0,0,0,${0.22 + 0.3 * k})`;
        x.beginPath(); x.arc(bx + 42 + i * 33, by + 44, 12, 0, 7); x.fill();
      }
    } else if (r.emoji) {
      x.font = F(600, r.fs); x.textAlign = me ? 'right' : 'left'; x.textBaseline = 'middle'; x.fillStyle = INK;
      x.fillText(r.lines[0], me ? SW - 40 : 40, by + r.h / 2 + 10);
    } else {
      const col = me ? BLUE : GREY;
      x.fillStyle = col;
      x.beginPath(); x.roundRect(bx, by, r.w, r.h, r.m!.big ? 56 : 44); x.fill();
      if (r.last) {
        x.beginPath();
        if (me) { x.moveTo(bx + r.w - 22, by + r.h - 34); x.quadraticCurveTo(bx + r.w - 4, by + r.h - 4, bx + r.w + 16, by + r.h + 2); x.quadraticCurveTo(bx + r.w - 18, by + r.h + 4, bx + r.w - 40, by + r.h - 10); }
        else { x.moveTo(bx + 22, by + r.h - 34); x.quadraticCurveTo(bx + 4, by + r.h - 4, bx - 16, by + r.h + 2); x.quadraticCurveTo(bx + 18, by + r.h + 4, bx + 40, by + r.h - 10); }
        x.fill();
      }
      x.font = F(r.m!.big ? 800 : 600, r.fs); x.textAlign = 'left'; x.textBaseline = 'middle';
      x.fillStyle = me ? '#fff' : INK;
      r.lines.forEach((l, i) => x.fillText(l, bx + (r.m!.big ? 42 : 31), by + (r.m!.big ? 23 : 19) + r.lh * (i + 0.5) + 2));
    }
    x.restore();
  }
  x.restore();
  // header
  x.fillStyle = 'rgba(248,248,248,0.97)'; x.fillRect(0, 0, SW, TOP - 16);
  x.fillStyle = 'rgba(0,0,0,0.1)'; x.fillRect(0, TOP - 17, SW, 2);
  statusBar(x, p.clock, INK);
  x.strokeStyle = BLUE; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(66, 150); x.lineTo(44, 176); x.lineTo(66, 202); x.stroke();
  const ag = x.createLinearGradient(0, 118, 0, 226);
  ag.addColorStop(0, '#B5BAC4'); ag.addColorStop(1, '#858B97');
  x.save(); x.beginPath(); x.arc(SW / 2, 168, 52, 0, 7); x.clip();
  x.fillStyle = ag; x.fillRect(SW / 2 - 60, 110, 120, 120);
  x.fillStyle = '#fff'; x.beginPath(); x.arc(SW / 2, 154, 19, 0, 7); x.fill();
  x.beginPath(); x.ellipse(SW / 2, 212, 36, 30, 0, 0, 7); x.fill(); x.restore();
  x.font = F(600, 29); x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = INK;
  x.fillText(p.contact + '  ›', SW / 2, 258);
  // input bar
  x.fillStyle = '#fff'; x.fillRect(0, BOTTOM, SW, SH - BOTTOM);
  x.fillStyle = GREY; x.beginPath(); x.arc(78, 1548, 40, 0, 7); x.fill();
  x.strokeStyle = '#7b7b80'; x.lineWidth = 5;
  x.beginPath(); x.moveTo(60, 1548); x.lineTo(96, 1548); x.moveTo(78, 1530); x.lineTo(78, 1566); x.stroke();
  x.strokeStyle = '#DCDCE0'; x.lineWidth = 3; x.beginPath(); x.roundRect(140, 1508, 722, 80, 40); x.stroke();
  x.font = F(600, 36); x.textAlign = 'left'; x.fillStyle = '#B4B4BA'; x.textBaseline = 'middle'; x.fillText('iMessage', 172, 1550);
  homeBar(x, INK);
};

export const drawPhoneScreen = (c: HTMLCanvasElement, t: number, p: ChatProps, wall: [string, string, string]) => {
  const x = c.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1;
  const k = smooth(p.openAt, p.openAt + 0.45, t);
  if (k < 1) drawLock(x, t, p, wall);
  if (k > 0) {
    x.save(); x.globalAlpha = k;
    const s = lerp(0.9, 1, outCubic(k));
    x.translate(SW / 2, SH / 2); x.scale(s, s); x.translate(-SW / 2, -SH / 2);
    drawChat(x, t, p);
    x.restore();
  }
  x.getImageData(0, 0, 1, 1);   // forces the 2D canvas to finish before the 3D renderer copies it
};

export const usePhoneScreen = () => useMemo(() => {
  const canvas = document.createElement('canvas');
  canvas.width = SW; canvas.height = SH;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return {canvas, tex};
}, []);

const rounded = (w: number, h: number, r: number) => {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
};
const panel = (w: number, h: number, r: number) => {
  const g = new THREE.ShapeGeometry(rounded(w, h, r), 14);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return g;
};
export const PW = 2.1, PH = 3.92, PD = 0.19, PR = 0.34;
// origin at the middle of the bottom edge, so it can stand on a surface and tip back
export const Phone3D: React.FC<{tex: THREE.Texture; position?: V3; rotation?: V3; body?: string; scale?: number; shadow?: boolean}> = ({tex, body = '#2a2b2e', shadow = false, ...rest}) => {
  const geo = useMemo(() => {
    const b = new THREE.ExtrudeGeometry(rounded(PW, PH, PR), {depth: PD, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 6, curveSegments: 24});
    b.translate(0, 0, -PD / 2);
    return {body: b, glass: panel(PW + 0.02, PH + 0.02, PR), screen: panel(PW - 0.09, PH - 0.09, PR - 0.045)};
  }, []);
  const z = PD / 2 + 0.036;
  return (
    <group {...(rest as any)}>
      <group position={[0, PH / 2 + 0.035, 0]}>
        <mesh geometry={geo.body} castShadow={shadow}><meshStandardMaterial color={body} metalness={0.9} roughness={0.32} /></mesh>
        <mesh geometry={geo.screen} position={[0, 0, z + 0.03]}><meshBasicMaterial map={tex} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-8} /></mesh>
        <mesh geometry={geo.screen} position={[0, 0, z + 0.045]}><meshStandardMaterial color="#ffffff" metalness={1} roughness={0.03} transparent opacity={0.05} depthWrite={false} /></mesh>
        <mesh geometry={geo.glass} position={[0, 0, -z]} rotation={[0, Math.PI, 0]}><meshStandardMaterial color={body} metalness={0.6} roughness={0.4} /></mesh>
      </group>
    </group>
  );
};

// soft contact shadow: a blurred ellipse lying on the floor under the phone (a light-cast shadow of a thin slab looks broken)
export const useSoftShadow = () => useMemo(() => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.35, 'rgba(0,0,0,0.55)'); g.addColorStop(0.7, 'rgba(0,0,0,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  return t;
}, []);
export const SoftShadow: React.FC<{tex: THREE.Texture; position: V3; size: [number, number]; opacity: number; rotation?: number}> = ({tex, position, size, opacity, rotation = 0}) => (
  <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]} renderOrder={-1}>
    <planeGeometry args={size} />
    <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} toneMapped={false} color="#000" />
  </mesh>
);


// the hook of a texts reel: the lock-screen notifications shown big over the scene for the first ~2.5 s
export const BigNotes: React.FC<{p: ChatProps; t: number; dark: boolean; accent: string}> = ({p, t, dark, accent}) => {
  const out = 1 - Math.min(1, Math.max(0, (t - (p.openAt - 0.5)) / 0.4));
  const shown = p.notifications.filter((n) => t >= n.at);
  if (out <= 0 || !shown.length) return null;
  return (
    <div style={{position: 'absolute', left: 84, right: 84, top: 560, display: 'flex', flexDirection: 'column-reverse', gap: 22, opacity: out}}>
      {shown.map((n, i) => {
        const k = Math.min(1, (t - n.at) / 0.22);
        return (
          <div key={i} style={{borderRadius: 40, background: dark ? 'rgba(255,243,234,0.94)' : 'rgba(255,255,255,0.96)', padding: '30px 38px', boxShadow: '0 30px 60px rgba(20,0,40,0.35)',
            transform: `scale(${0.85 + 0.15 * k}) translateY(${(1 - k) * 30}px)`, opacity: k}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
              <div style={{width: 64, height: 64, borderRadius: 15, background: 'linear-gradient(#5CF777,#0FC23B)'}} />
              <div style={{fontFamily: 'Inter', fontWeight: 700, fontSize: 32, color: '#1b1430'}}>{p.contact}</div>
              <div style={{marginLeft: 'auto', fontFamily: 'Inter', fontSize: 26, color: '#6b5a7e'}}>now</div>
            </div>
            <div style={{fontFamily: 'Inter', fontSize: 50, fontWeight: 600, color: '#1b1430', marginTop: 14, lineHeight: 1.15}}>{n.text}</div>
          </div>
        );
      })}
    </div>
  );
};
