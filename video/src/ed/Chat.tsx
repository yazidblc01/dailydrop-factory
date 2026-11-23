// ---------- The Vice City group chat: GTA 6's cast and its NPCs text about a streamer's viral moment ----------
// 0 to ~2.5 s: the actual clip, full screen, so the viewer knows what happened (context first).
// Then the clip shrinks into a video bubble in an iMessage group chat on the 3D phone (the one from Texts from the future),
// and the chat goes fast: ~1 s per message, typing dots, pop-in bubbles, tapbacks. The last message is the punchline:
// the camera pushes into the phone with a shake and a burst of tapbacks. Then the logo outro.
// Layout (1080x1920): 0-150 free for the apps' buttons, header 160, title 262-420, phone 450-1760, bottom free.
import React, {useEffect, useMemo, useState} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Backdrop, Cam, LogoOutro, Masthead, PAL, SANS, Studio, V3, clamp01, lerp, outBack, outCubic, projector, smooth, useEdFonts} from './kit';
import {BLUE, F, PH, PW, PD, Phone3D, SH, SW, SoftShadow, homeBar, statusBar, usePhoneScreen, useSoftShadow, wrap} from './phone';
import {Seg, Shot, Win, gameRegion} from './Clip';

export type ChatMsg = {who: string; text: string; at: number; clip?: boolean; taps?: string[]; big?: boolean};
export type EdChatProps = {msgs: ChatMsg[]; hook: string; cast: string[]; duration: number; outroAt: number; introDur: number;
  intro?: Seg | null; bubble?: Seg | null; credit?: string; music?: string | null; clock?: string};

// ---------- memoji-style avatars (our own drawings) ----------
type Look = {skin: string; skin2: string; hair: string; bg1: string; bg2: string; lips: string; hairShape: string; extra: string};
const LOOKS: Record<string, Look> = {
  lucia: {skin: '#e3b48f', skin2: '#c58c66', hair: '#2a1a14', bg1: '#ffd1e3', bg2: '#f08cb8', lips: '#c23e6a',
    hairShape: `<path d="M52 110 Q45 45 100 40 Q155 45 148 110 Q140 70 100 62 Q60 70 52 110Z" fill="H"/><path d="M100 40 Q130 20 150 30 Q140 45 120 48Z" fill="H"/><ellipse cx="148" cy="26" rx="14" ry="12" fill="H"/>`,
    extra: `<circle cx="146" cy="126" r="7" fill="none" stroke="#f2c14e" stroke-width="3"/><path d="M60 92 Q75 60 100 60 Q80 68 66 100Z" fill="#3a2418"/>`},
  jason: {skin: '#e8b996', skin2: '#c48a65', hair: '#3b2a20', bg1: '#cfe3ff', bg2: '#7fa8e8', lips: '#b0605a',
    hairShape: `<path d="M52 100 Q48 40 100 36 Q152 40 148 100 Q146 70 132 62 Q100 74 68 62 Q54 70 52 100Z" fill="H"/>`,
    extra: `<path d="M56 112 Q60 160 100 162 Q140 160 144 112 Q140 140 120 146 Q100 150 80 146 Q60 140 56 112Z" fill="#4a3426"/><path d="M84 130 Q100 124 116 130" stroke="#4a3426" stroke-width="6" fill="none" stroke-linecap="round"/>`},
  grandma: {skin: '#f1cdb0', skin2: '#d2a184', hair: '#d9d6e2', bg1: '#e7d6ff', bg2: '#b39ae6', lips: '#c96a8a',
    hairShape: `<path d="M50 105 Q46 50 100 44 Q154 50 150 105 Q146 72 100 66 Q56 72 50 105Z" fill="H"/><circle cx="100" cy="40" r="20" fill="H"/>`,
    extra: `<circle cx="82" cy="101" r="13" fill="none" stroke="#6a4a8a" stroke-width="3"/><circle cx="118" cy="101" r="13" fill="none" stroke="#6a4a8a" stroke-width="3"/><path d="M95 101 L105 101" stroke="#6a4a8a" stroke-width="3"/>`},
  cop: {skin: '#b98462', skin2: '#8f5f42', hair: '#1a1210', bg1: '#d9f2e6', bg2: '#7cc9a5', lips: '#8f4a56',
    hairShape: `<path d="M55 95 Q55 55 100 52 Q145 55 145 95Z" fill="H"/>`,
    extra: `<path d="M46 74 Q100 30 154 74 L150 84 Q100 64 50 84Z" fill="#1f2d5a"/><path d="M50 82 Q100 70 150 82 L156 92 Q100 82 44 92Z" fill="#111a38"/><circle cx="100" cy="58" r="8" fill="#f2c14e"/><path d="M80 128 Q100 122 120 128" stroke="#3b2418" stroke-width="5" fill="none" stroke-linecap="round"/>`},
  tourist: {skin: '#f3c9a8', skin2: '#d69c78', hair: '#c9873f', bg1: '#fff1c2', bg2: '#ffc46b', lips: '#c86a6a',
    hairShape: `<path d="M54 100 Q50 46 100 42 Q150 46 146 100 Q140 66 100 62 Q60 66 54 100Z" fill="H"/>`,
    extra: `<rect x="64" y="90" width="30" height="20" rx="8" fill="#141414"/><rect x="106" y="90" width="30" height="20" rx="8" fill="#141414"/><path d="M94 98 L106 98" stroke="#141414" stroke-width="4"/>`},
  bro: {skin: '#d8a07a', skin2: '#b07650', hair: '#141010', bg1: '#ffd6c2', bg2: '#ff8f6b', lips: '#a85a52',
    hairShape: `<path d="M58 88 Q60 52 100 50 Q140 52 142 88 Q130 70 100 68 Q70 70 58 88Z" fill="H"/>`,
    extra: `<path d="M40 74 Q100 40 160 74 L160 84 Q100 60 40 84Z" fill="#ff4fa0"/><path d="M36 84 L92 84 L92 92 L36 92Z" fill="#d83a85"/>`},
  npc: {skin: '#c99273', skin2: '#a26c4e', hair: '#2c1d16', bg1: '#dde3ea', bg2: '#9aa7b6', lips: '#9c5a52',
    hairShape: `<path d="M54 98 Q52 50 100 46 Q148 50 146 98 Q138 68 100 64 Q62 68 54 98Z" fill="H"/>`, extra: ''},
};
const avatarSvg = (key: string) => {
  const L = LOOKS[key] ?? LOOKS.npc;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>
<radialGradient id="bg" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="${L.bg1}"/><stop offset="1" stop-color="${L.bg2}"/></radialGradient>
<radialGradient id="sk" cx="45%" cy="38%" r="65%"><stop offset="0" stop-color="${L.skin}"/><stop offset="1" stop-color="${L.skin2}"/></radialGradient>
<clipPath id="c"><circle cx="100" cy="100" r="100"/></clipPath></defs><g clip-path="url(#c)"><rect width="200" height="200" fill="url(#bg)"/>
${L.hairShape.split('"H"').join(`"${L.hair}"`)}
<path d="M70 150 Q100 175 130 150 L140 200 L60 200Z" fill="${L.skin2}"/><ellipse cx="100" cy="102" rx="46" ry="54" fill="url(#sk)"/>
<ellipse cx="55" cy="108" rx="9" ry="13" fill="${L.skin2}"/><ellipse cx="145" cy="108" rx="9" ry="13" fill="${L.skin2}"/>
<ellipse cx="82" cy="100" rx="8" ry="10" fill="#fff"/><ellipse cx="118" cy="100" rx="8" ry="10" fill="#fff"/>
<circle cx="83" cy="102" r="5.5" fill="#2b1a14"/><circle cx="117" cy="102" r="5.5" fill="#2b1a14"/><circle cx="85" cy="100" r="1.8" fill="#fff"/><circle cx="119" cy="100" r="1.8" fill="#fff"/>
<path d="M70 86 Q82 80 93 85" stroke="#2b1a14" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M107 85 Q118 80 130 86" stroke="#2b1a14" stroke-width="4.5" fill="none" stroke-linecap="round"/>
<path d="M97 108 Q100 120 104 118" stroke="${L.skin2}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M88 132 Q100 140 112 132 Q100 136 88 132Z" fill="${L.lips}"/>
<ellipse cx="74" cy="120" rx="8" ry="5" fill="#ff7aa0" opacity=".25"/><ellipse cx="126" cy="120" rx="8" ry="5" fill="#ff7aa0" opacity=".25"/>${L.extra}</g></svg>`;
};
export const NAMES: Record<string, string> = {lucia: 'Lucia', jason: 'Jason', grandma: 'Grandma', cop: 'Officer Diaz', tourist: 'Tourist', bro: 'Gym Bro', npc: 'Random NPC'};

const svgUrl = (k: string) => `data:image/svg+xml;utf8,${encodeURIComponent(avatarSvg(k))}`;
const useAvatars = (keys: string[]) => {
  const [imgs] = useState<Record<string, HTMLImageElement>>(() => ({}));
  const [handle] = useState(() => delayRender('avatars'));
  useEffect(() => {
    let left = keys.length;
    if (!left) { continueRender(handle); return; }
    for (const k of keys) {
      const im = new Image();
      im.onload = im.onerror = () => { if (--left === 0) continueRender(handle); };
      im.src = svgUrl(k);
      imgs[k] = im;
    }
  }, []);
  return imgs;
};

// ---------- the chat, painted on the phone's screen ----------
const GREY = '#E9E9EB', INK = '#0b0b0c';
const HEAD = 300, BOTTOM = 1478, AV = 64, LEFT = 120, VW = 560, VH = 316;
type Rect = {x: number; y: number; w: number; h: number};

const drawGroup = (x: CanvasRenderingContext2D, t: number, p: EdChatProps, av: Record<string, HTMLImageElement>): Rect | null => {
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1;
  x.fillStyle = '#fff'; x.fillRect(0, 0, SW, SH);
  type Row = {m?: ChatMsg; y: number; h: number; w: number; lines: string[]; a: number; fs: number; lh: number; name: boolean; tail: boolean; typing?: boolean; who: string};
  const rows: Row[] = [];
  const vis = p.msgs.filter((m) => t >= m.at);
  let cur = 30;
  vis.forEach((m, i) => {
    const prev = vis[i - 1], next = vis[i + 1];
    const a = clamp01((t - m.at) / 0.28), hk = outCubic(a);
    const me = m.who === 'jason';
    const name = !me && (!prev || prev.who !== m.who);
    const fs = m.big ? 70 : 52, lh = m.big ? 80 : 63;
    x.font = F(m.big ? 800 : 500, fs);
    const lines = m.clip ? [] : wrap(x, m.text, m.big ? 640 : 600);
    const w = m.clip ? VW : Math.max(...lines.map((l) => x.measureText(l).width)) + 60;
    const h = m.clip ? VH + 46 : lines.length * lh + 34;
    cur += ((prev ? (prev.who === m.who ? 8 : 26) : 0) + (name ? 40 : 0) + (m.taps?.length ? 26 : 0)) * hk;
    rows.push({m, y: cur, h, w, lines, a, fs, lh, name, tail: !next || next.who !== m.who, who: m.who});
    cur += h * hk;
  });
  // typing dots before someone else's message, when there's room for them
  const up = p.msgs.find((m) => m.at > t);
  const last = vis[vis.length - 1];
  if (up && up.who !== 'jason' && t >= up.at - 0.5 && (!last || up.at - last.at >= 0.75)) {
    const a = smooth(up.at - 0.5, up.at - 0.38, t);
    const name = !last || last.who !== up.who;
    cur += (26 + (name ? 40 : 0)) * a;
    rows.push({y: cur, h: 84, w: 150, lines: [], a, fs: 0, lh: 0, name, tail: true, typing: true, who: up.who});
    cur += 84 * a;
  }
  const scroll = Math.max(0, cur - (BOTTOM - HEAD - 40));
  let clipRect: Rect | null = null;
  x.save();
  x.beginPath(); x.rect(0, HEAD, SW, BOTTOM - HEAD); x.clip();
  for (const r of rows) {
    const me = r.who === 'jason';
    const bx = me ? SW - 36 - r.w : LEFT, by = HEAD + r.y - scroll;
    const s = 0.5 + 0.5 * outBack(r.a, 1.6), ax = me ? bx + r.w : bx, ay = by + r.h;
    x.save();
    x.globalAlpha = Math.min(1, r.a * 2.5);
    if (r.name) { x.font = F(500, 27); x.fillStyle = '#8a8a8e'; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillText(NAMES[r.who] ?? r.who, LEFT + 22, by - 12); }
    if (!me && r.tail && av[r.who]) x.drawImage(av[r.who], 36, by + r.h - AV, AV, AV);
    x.translate(ax, ay); x.scale(s, s); x.translate(-ax, -ay);
    if (r.typing) {
      x.fillStyle = GREY; x.beginPath(); x.roundRect(bx, by, r.w, r.h, 42); x.fill();
      for (let i = 0; i < 3; i++) {
        const k = 0.35 + 0.65 * Math.max(0, Math.sin(t * 9 - i * 0.9));
        x.fillStyle = `rgba(0,0,0,${0.2 + 0.32 * k})`; x.beginPath(); x.arc(bx + 42 + i * 33, by + 42, 12, 0, 7); x.fill();
      }
    } else if (r.m!.clip) {
      x.fillStyle = '#111'; x.beginPath(); x.roundRect(bx, by, VW, VH, 38); x.fill();
      x.font = F(500, 26); x.fillStyle = '#8a8a8e'; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      x.fillText(p.credit ? '🎥 ' + p.credit : '', bx + 8, by + VH + 36);
      if (s > 0.98) clipRect = {x: bx, y: by, w: VW, h: VH};
    } else {
      x.fillStyle = me ? BLUE : GREY;
      x.beginPath(); x.roundRect(bx, by, r.w, r.h, r.m!.big ? 50 : 42); x.fill();
      if (r.tail) {
        x.beginPath();
        if (me) { x.moveTo(bx + r.w - 22, by + r.h - 34); x.quadraticCurveTo(bx + r.w - 4, by + r.h - 4, bx + r.w + 16, by + r.h + 2); x.quadraticCurveTo(bx + r.w - 18, by + r.h + 4, bx + r.w - 40, by + r.h - 10); }
        else { x.moveTo(bx + 22, by + r.h - 34); x.quadraticCurveTo(bx + 4, by + r.h - 4, bx - 16, by + r.h + 2); x.quadraticCurveTo(bx + 18, by + r.h + 4, bx + 40, by + r.h - 10); }
        x.fill();
      }
      x.font = F(r.m!.big ? 800 : 500, r.fs); x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = me ? '#fff' : INK;
      r.lines.forEach((l, i) => x.fillText(l, bx + 30, by + 17 + r.lh * (i + 0.5) + 2));
    }
    x.restore();
    // tapbacks: little bubbles on the top corner, popping in one after another
    (r.m?.taps ?? []).forEach((e, i) => {
      const k = outBack(clamp01((t - r.m!.at - 0.4 - i * 0.12) / 0.3), 2.2);
      if (k <= 0.01) return;
      const cx = me ? bx + 10 + i * 70 : Math.min(bx + r.w - 10, SW - 60) - i * 70, cy = by - 6;
      x.save(); x.translate(cx, cy); x.scale(k, k);
      x.fillStyle = me ? GREY : '#d9e8ff'; x.strokeStyle = '#fff'; x.lineWidth = 5;
      x.beginPath(); x.arc(0, 0, 34, 0, 7); x.fill(); x.stroke();
      x.font = F(500, 36); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = INK; x.fillText(e, 0, 3);
      x.restore();
    });
  }
  x.restore();
  // header: status bar, back arrow, the group's faces and its name
  x.fillStyle = 'rgba(247,247,249,0.98)'; x.fillRect(0, 0, SW, HEAD - 2);
  x.fillStyle = 'rgba(0,0,0,0.1)'; x.fillRect(0, HEAD - 2, SW, 2);
  statusBar(x, p.clock ?? '9:41', INK);
  x.strokeStyle = BLUE; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(66, 150); x.lineTo(44, 176); x.lineTo(66, 202); x.stroke();
  const cast = p.cast.slice(0, 4), S = 86, step = 64, x0 = SW / 2 - ((cast.length - 1) * step) / 2;
  cast.forEach((k, i) => {
    if (!av[k]) return;
    x.fillStyle = 'rgba(247,247,249,1)'; x.beginPath(); x.arc(x0 + i * step, 172, S / 2 + 5, 0, 7); x.fill();
    x.drawImage(av[k], x0 + i * step - S / 2, 172 - S / 2, S, S);
  });
  x.font = F(600, 30); x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = INK;
  x.fillText('Vice City 🌴  ›', SW / 2, 268);
  // input bar
  x.fillStyle = '#fff'; x.fillRect(0, BOTTOM, SW, SH - BOTTOM);
  x.fillStyle = GREY; x.beginPath(); x.arc(78, 1548, 40, 0, 7); x.fill();
  x.strokeStyle = '#7b7b80'; x.lineWidth = 5; x.beginPath(); x.moveTo(60, 1548); x.lineTo(96, 1548); x.moveTo(78, 1530); x.lineTo(78, 1566); x.stroke();
  x.strokeStyle = '#DCDCE0'; x.lineWidth = 3; x.beginPath(); x.roundRect(140, 1508, 722, 80, 40); x.stroke();
  x.font = F(500, 36); x.textAlign = 'left'; x.fillStyle = '#B4B4BA'; x.textBaseline = 'middle'; x.fillText('iMessage', 172, 1550);
  homeBar(x, INK);
  x.getImageData(0, 0, 1, 1);
  return clipRect;
};

// ---------- the title: stays on top the whole reel ----------
const Title: React.FC<{text: string; k: number}> = ({text, k}) => (
  <div style={{position: 'absolute', left: 50, right: 50, top: 258, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    opacity: k, transform: `scale(${0.9 + 0.1 * k})`}}>
    <span style={{fontFamily: SANS, fontWeight: 900, fontSize: text.length > 30 ? 64 : 74, lineHeight: 1.06, color: '#FFE07A', textTransform: 'uppercase',
      WebkitTextStroke: '9px #1a0a2e', paintOrder: 'stroke fill', textShadow: '0 6px 18px rgba(0,0,0,0.45)'}}>{text}</span>
  </div>
);

// ---------- camera: the phone's top edge sits at y=450 whatever the distance ----------
const FOV = 24, TAN = Math.tan((FOV / 2) * Math.PI / 180);
const TOPY = PH + 0.07, PHONE_TOP = 450;
const camFor = (d: number, dx = 0): {pos: V3; target: V3} => {
  const ppu = 1920 / (2 * d * TAN);
  const ty = TOPY - (960 - PHONE_TOP) / ppu;
  return {pos: [dx, ty + 0.35, d], target: [dx * 0.6, ty, 0]};
};
const ROT: V3 = [-0.05, 0, 0];

export const EdChat: React.FC<EdChatProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL.vice;
  const av = useAvatars(useMemo(() => Array.from(new Set([...p.cast, ...p.msgs.map((m) => m.who)])).filter((k) => k !== 'jason' || p.cast.includes('jason')), []));
  const {canvas, tex} = usePhoneScreen();
  const shadowTex = useSoftShadow();
  const T0 = p.introDur;
  const rect0 = ready && t >= T0 ? drawGroup(canvas.getContext('2d')!, t, p, av) : null;
  if (ready && t >= T0) tex.needsUpdate = true;

  // the phone rises in as the clip shrinks into its bubble
  const rise = outCubic(clamp01((t - T0) / 0.45));
  const phonePos: V3 = [0, lerp(-4.6, 0, rise), 0];
  // the punchline: a fast push in with a shake
  const punch = p.msgs[p.msgs.length - 1];
  const pk = punch ? smooth(punch.at, punch.at + 0.32, t) : 0;
  const shake = punch && t > punch.at && t < punch.at + 0.6 ? Math.sin((t - punch.at) * 62) * 0.06 * (1 - (t - punch.at) / 0.6) : 0;
  const d = lerp(13.7, 11.3, pk);
  const {pos: camPos, target: camTarget} = camFor(d, shake);
  const proj = projector(camPos, camTarget, FOV);

  // canvas (u, v) on the screen -> screen pixels, through the phone's pose
  const toScreen = (u: number, v: number) => {
    const lp = new THREE.Vector3((u / SW - 0.5) * (PW - 0.09), PH / 2 + 0.035 + (0.5 - v / SH) * (PH - 0.09), PD / 2 + 0.036 + 0.03);
    lp.applyEuler(new THREE.Euler(...ROT));
    return proj([lp.x + phonePos[0], lp.y + phonePos[1], lp.z + phonePos[2]]);
  };
  let bub: {x: number; y: number; w: number; h: number; cut: number} | null = null;
  if (rect0) {
    const a = toScreen(rect0.x, rect0.y), b = toScreen(rect0.x + rect0.w, rect0.y + rect0.h), top = toScreen(0, HEAD).y;
    bub = {x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, cut: Math.max(0, top - a.y)};
  }
  // the clip's rectangle: full screen during the intro, then morphing into the bubble
  const m = clamp01((t - T0) / 0.45), mk = outCubic(m);
  const showBubble = p.bubble && t >= T0 && (bub || m < 1);
  const target = bub ?? {x: 260, y: 900, w: 412, h: 232, cut: 0};
  const R = {x: lerp(0, target.x, mk), y: lerp(0, target.y, mk), w: lerp(1080, target.w, mk), h: lerp(1920, target.h, mk), r: lerp(0, 28 * target.w / 412, mk)};

  const sounds = p.msgs.filter((x) => x.at > T0);
  const outro = p.outroAt;
  return (
    <AbsoluteFill style={{background: '#1B0B33'}}>
      <Backdrop P={P} horizon={0.4} />
      {p.music && <Sequence from={Math.round(T0 * fps)}><Audio src={staticFile(p.music)} volume={0.26} loop /></Sequence>}
      {sounds.map((x, i) => <Sequence key={i} from={Math.round(x.at * fps)} durationInFrames={20}><Audio src={staticFile(x.who === 'jason' ? 'sfx/sent.wav' : 'sfx/received.wav')} volume={0.9} /></Sequence>)}
      {sounds.filter((x) => x.taps?.length).map((x, i) => <Sequence key={'t' + i} from={Math.round((x.at + 0.4) * fps)} durationInFrames={15}><Audio src={staticFile('sfx/pop.wav')} volume={0.6} /></Sequence>)}
      {punch && <Sequence from={Math.round(punch.at * fps)} durationInFrames={24}><Audio src={staticFile('sfx/thud.wav')} volume={0.9} /></Sequence>}

      {t >= T0 - 0.05 && (
        <ThreeCanvas width={1080} height={1920} shadows gl={{antialias: true}} camera={{fov: FOV, position: camPos}}>
          <Cam pos={camPos} target={camTarget} fov={FOV} near={2} />
          <Studio ready={ready} P={P} span={7} key3={[2.6, 11, 6]} soft={2.2} lights={6} />
          <Phone3D tex={tex} position={phonePos} rotation={ROT} body="#c9ccd1" />
          {rise > 0.6 && <SoftShadow tex={shadowTex} position={[0, 0.003, 0.02]} size={[2.9, 0.62]} opacity={0.6 * rise} />}
        </ThreeCanvas>
      )}

      {/* the clip: full screen first (with its sound), then a muted video bubble in the chat */}
      {p.intro && t < T0 && (
        <AbsoluteFill><Shot s={p.intro} t={t} camY={470} />
          <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 560, background: 'linear-gradient(rgba(10,5,20,0.78) 55%, rgba(10,5,20,0))'}} /></AbsoluteFill>
      )}
      {showBubble && p.bubble && (
        <div style={{position: 'absolute', left: R.x, top: R.y, width: R.w, height: R.h, borderRadius: R.r, overflow: 'hidden',
          clipPath: m >= 1 && target.cut > 0 ? `inset(${target.cut}px 0 0 0)` : undefined, boxShadow: m < 1 ? '0 30px 80px rgba(0,0,0,0.5)' : undefined}}>
          <Sequence from={Math.round(T0 * fps)} layout="none">
            <Win s={p.bubble} r={gameRegion(p.bubble, R.w, R.h)} W={R.w} H={R.h} top={0} muted t={t - T0} />
          </Sequence>
          {m >= 1 && <div style={{position: 'absolute', left: 14, bottom: 12, width: 44, height: 44, borderRadius: 22, background: 'rgba(0,0,0,0.45)',
            display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22}}>🔇</div>}
        </div>
      )}

      <Masthead P={P} label="" top={160} />
      <Title text={p.hook} k={outBack(clamp01(t / 0.3), 1.6)} />
      <LogoOutro t={t} at={outro} />
    </AbsoluteFill>
  );
};
