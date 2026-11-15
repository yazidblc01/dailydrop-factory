// ---------- Editorial 3D kit: palettes, real-font 3D type, cut-out silhouettes, soft studio light, print-style overlays ----------
import React, {useEffect, useLayoutEffect, useMemo, useState} from 'react';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {AbsoluteFill, continueRender, delayRender, staticFile} from 'remotion';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import opentype from 'opentype.js';
import {ICONS} from '../icons';

export type V3 = [number, number, number];
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const smooth = (a: number, b: number, x: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
export const outCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const outBack = (x: number, s = 1.70158) => { const k = clamp01(x) - 1; return 1 + (s + 1) * k * k * k + s * k * k; };
export const outElastic = (x: number) => { const k = clamp01(x); return k === 0 || k === 1 ? k : Math.pow(2, -9 * k) * Math.sin((k * 8 - 0.75) * (2 * Math.PI) / 3) + 1; };
export const rnd = (i: number, salt = 0) => { const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return s - Math.floor(s); };

// ===== layout: what stays visible under the Shorts / Reels / TikTok buttons (1080 x 1920) =====
export const SAFE = {top: 270, bottom: 1440, left: 84, right: 996, rightLow: 912, lowFrom: 980};

// ===== palettes =====
export type PalName = 'paper' | 'green' | 'night';
export type Pal = {name: PalName; bg: string; bg2: string; ink: string; mute: string; rule: string; accent: string; onAccent: string; money: string; card: string; cardInk: string;
  display: string; dWeight: number; dItalic: boolean; dTrack: number; font3d: string; shadow: number; grain: number; blend: string; dark: boolean};
export const PAL: Record<PalName, Pal> = {
  paper: {name: 'paper', bg: '#EFE9DD', bg2: '#FBF8F1', ink: '#151412', mute: 'rgba(21,20,18,0.58)', rule: 'rgba(21,20,18,0.2)', accent: '#E3412A', onAccent: '#fff', money: '#2C7A5B',
    card: '#FFFDF8', cardInk: '#151412', display: 'Instrument Serif', dWeight: 400, dItalic: true, dTrack: -0.02, font3d: 'serif', shadow: 0.2, grain: 0.45, blend: 'multiply', dark: false},
  green: {name: 'green', bg: '#0C261E', bg2: '#19493C', ink: '#F3EBDA', mute: 'rgba(243,235,218,0.62)', rule: 'rgba(243,235,218,0.22)', accent: '#E8B84A', onAccent: '#1b1404', money: '#8FDDB0',
    card: '#F3EBDA', cardInk: '#0C261E', display: 'Fraunces', dWeight: 500, dItalic: true, dTrack: -0.035, font3d: 'fraunces', shadow: 0.42, grain: 0.3, blend: 'overlay', dark: true},
  night: {name: 'night', bg: '#0B0B0D', bg2: '#1D1D25', ink: '#F4F4EF', mute: 'rgba(244,244,239,0.56)', rule: 'rgba(244,244,239,0.18)', accent: '#C9FF3B', onAccent: '#0B0B0D', money: '#C9FF3B',
    card: '#F4F4EF', cardInk: '#0B0B0D', display: 'Bricolage Grotesque', dWeight: 800, dItalic: false, dTrack: -0.045, font3d: 'brico', shadow: 0.55, grain: 0.28, blend: 'overlay', dark: true},
};
export const MONO = 'JetBrains Mono', SANS = 'Inter';

// ===== fonts: CSS faces for overlays and canvas, opentype outlines for real 3D type =====
const FONT3D_FILES: Record<string, string> = {
  serif: 'instrument-serif-latin-400-normal.woff', serifItalic: 'instrument-serif-latin-400-italic.woff', fraunces: 'fraunces-latin-700-normal.woff',
  brico: 'bricolage-grotesque-latin-800-normal.woff', inter: 'inter-latin-800-normal.woff', mono: 'jetbrains-mono-latin-700-normal.woff',
};
const FONTS3D: Record<string, any> = {};
export const useEdFonts = () => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('editorial fonts'));
  useEffect(() => {
    const f = (fam: string, file: string, weight: string, style = 'normal') => new FontFace(fam, `url(${staticFile('fonts/' + file)})`, {weight, style});
    const faces = [
      f('Instrument Serif', 'instrument-serif-latin-400-normal.woff2', '400'), f('Instrument Serif', 'instrument-serif-latin-400-italic.woff2', '400', 'italic'),
      f('Fraunces', 'fraunces-latin-500-normal.woff2', '500'), f('Fraunces', 'fraunces-latin-500-italic.woff2', '500', 'italic'), f('Fraunces', 'fraunces-latin-700-normal.woff2', '700'),
      f('Bricolage Grotesque', 'bricolage-grotesque-latin-800-normal.woff2', '800'), f('Bricolage Grotesque', 'bricolage-grotesque-latin-500-normal.woff2', '500'),
      f('JetBrains Mono', 'jetbrains-mono-latin-500-normal.woff2', '500'), f('JetBrains Mono', 'jetbrains-mono-latin-700-normal.woff2', '700'),
      f('Inter', 'inter-latin-600-normal.woff2', '600'), f('Inter', 'inter-latin-800-normal.woff2', '800'),
    ];
    const css = Promise.all(faces.map((x) => x.load())).then((l) => l.forEach((x) => (document.fonts as any).add(x)));
    const three = Promise.all(Object.entries(FONT3D_FILES).map(async ([k, file]) => {
      if (!FONTS3D[k]) FONTS3D[k] = opentype.parse(await (await fetch(staticFile('fonts/' + file))).arrayBuffer());
    }));
    Promise.all([css, three]).then(() => { setReady(true); continueRender(handle); });
  }, [handle]);
  return ready;
};

const glyphShapes = (fontKey: string, text: string, size: number, track = 0) => {
  const font = FONTS3D[fontKey];
  const path = font.getPath(text, 0, 0, size, {letterSpacing: track});
  const sp = new THREE.ShapePath();
  (sp as any).userData = {style: {fillRule: 'nonzero'}};
  for (const c of path.commands as any[]) {
    if (c.type === 'M') sp.moveTo(c.x, -c.y);
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  return SVGLoader.createShapes(sp as any);
};
export const textGeometry = (fontKey: string, text: string, size: number, depth: number, bevel = 0.012, align: 'center' | 'left' | 'right' = 'center', track = 0) => {
  const g = new THREE.ExtrudeGeometry(glyphShapes(fontKey, text, size, track), {depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 10});
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(align === 'center' ? -(b.min.x + b.max.x) / 2 : align === 'left' ? -b.min.x : -b.max.x, 0, -depth / 2);
  g.computeBoundingBox();
  return g;
};
export const Text3D: React.FC<{ready: boolean; font: string; text: string; size: number; depth?: number; bevel?: number; align?: 'center' | 'left' | 'right'; color: string; rough?: number; metal?: number;
  position?: V3; rotation?: V3; scale?: number | V3; track?: number; emissive?: number}> = ({ready, font, text, size, depth = size * 0.22, bevel = size * 0.02, align = 'center', color, rough = 0.6, metal = 0, track = 0, emissive = 0, ...rest}) => {
  const geo = useMemo(() => { if (!ready) return null; try { return textGeometry(font, text, size, depth, bevel, align, track); } catch (e) { (window as any).__edErr = String(e) + ' ' + ((e as any).stack || ''); console.error('TEXT3D', e); return null; } }, [ready, font, text, size, depth, bevel, align, track]);
  if (!geo) return null;
  return <mesh geometry={geo} castShadow receiveShadow {...(rest as any)}><meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={color} emissiveIntensity={emissive} /></mesh>;
};
export const textWidth = (fontKey: string, text: string, size: number) => (FONTS3D[fontKey] ? FONTS3D[fontKey].getAdvanceWidth(text, size) : 0);

// ===== cut-out silhouettes: an icon extruded into a standee, 1 unit tall, feet on y = 0 =====
const silGeo: Record<string, THREE.BufferGeometry> = {};
export const silhouetteGeometry = (icon: string, depth = 0.06) => {
  const key = icon + depth;
  if (silGeo[key]) return silGeo[key];
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${ICONS[icon]}"/></svg>`);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  const flat = new THREE.ShapeGeometry(shapes);
  flat.computeBoundingBox();
  const b = flat.boundingBox!, h = b.max.y - b.min.y;
  const g = new THREE.ExtrudeGeometry(shapes, {depth: depth * h, bevelEnabled: true, bevelThickness: 0.006 * h, bevelSize: 0.005 * h, bevelSegments: 2, curveSegments: 12});
  g.translate(-(b.min.x + b.max.x) / 2, -b.max.y, (-depth * h) / 2);   // svg y points down: the bottom of the icon is max y
  g.scale(1 / h, -1 / h, 1 / h);
  const idx = g.index;                                                // flipping y turns the faces inside out, so flip them back
  if (idx) { for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i); idx.setX(i, idx.getX(i + 2)); idx.setX(i + 2, a); } }
  else { const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) { const a = [p.getX(i), p.getY(i), p.getZ(i)]; p.setXYZ(i, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, a[0], a[1], a[2]); } }
  g.computeVertexNormals();
  silGeo[key] = g;
  return g;
};
export const Sil3D: React.FC<{icon: string; h: number; color: string; position?: V3; rotation?: V3; depth?: number; rough?: number}> = ({icon, h, color, depth = 0.06, rough = 0.7, ...rest}) => {
  const geo = useMemo(() => silhouetteGeometry(icon, depth), [icon, depth]);
  return <mesh geometry={geo} scale={h} castShadow receiveShadow {...(rest as any)}><meshStandardMaterial color={color} roughness={rough} /></mesh>;
};

export const RBox: React.FC<{args: V3; r?: number; color: string; rough?: number; metal?: number; position?: V3; rotation?: V3; children?: React.ReactNode}> = ({args, r, color, rough = 0.6, metal = 0, children, ...rest}) => {
  const geo = useMemo(() => new RoundedBoxGeometry(args[0], args[1], args[2], 5, r ?? Math.min(...args) * 0.12), [args.join(), r]);
  return <mesh geometry={geo} castShadow receiveShadow {...(rest as any)}>{children ?? <meshStandardMaterial color={color} roughness={rough} metalness={metal} />}</mesh>;
};

// ===== studio: soft key light made of several lights, fill, reflections, a floor that only shows shadows =====
export const Cam: React.FC<{pos: V3; target: V3; fov: number; near?: number}> = ({pos, target, fov, near = 1}) => {
  const {camera} = useThree();
  const c = camera as THREE.PerspectiveCamera;
  c.position.set(...pos); c.fov = fov; c.near = near; c.far = 200; c.lookAt(...target); c.updateProjectionMatrix(); c.updateMatrixWorld();
  return null;
};
const EnvMap: React.FC<{intensity: number}> = ({intensity}) => {
  const {gl, scene} = useThree();
  useLayoutEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = tex;
    return () => { tex.dispose(); pm.dispose(); };
  }, [gl, scene]);
  (scene as any).environmentIntensity = intensity;
  return null;
};
// the 3D canvas only redraws when the frame changes, so redraw once more when the fonts arrive
export const Sync: React.FC<{ready: boolean}> = ({ready}) => {
  const advance = useThree((st) => st.advance);
  const [handle] = useState(() => delayRender('3d sync'));
  useEffect(() => {
    if (!ready) return;
    advance(performance.now());
    const id = requestAnimationFrame(() => { advance(performance.now()); continueRender(handle); });
    return () => cancelAnimationFrame(id);
  }, [ready, advance, handle]);
  return null;
};
export const Studio: React.FC<{ready: boolean; P: Pal; floorY?: number; span?: number; key3?: V3; soft?: number; lights?: number; env?: number; fill?: number; power?: number; floor?: boolean}> = ({ready, P, floorY = 0, span = 6, key3 = [3.2, 7, 5], soft = 0.9, lights = 5, env, fill, power, floor = true}) => {
  // on GitHub there is no graphics card, so REMOTION_ED_FAST=1 uses fewer shadow lights and smaller shadow maps
  const FAST = process.env.REMOTION_ED_FAST === '1';
  if (FAST) lights = Math.min(lights, 3);
  const MAP = FAST ? 1024 : 1536;
  const total = power ?? (P.dark ? 2.6 : 2.3);
  return (
    <>
      <Sync ready={ready} />
      <EnvMap intensity={env ?? (P.dark ? 0.35 : 0.55)} />
      <hemisphereLight args={[P.dark ? '#cfe0ff' : '#ffffff', P.dark ? '#0c1410' : '#cfc6b6', fill ?? (P.dark ? 0.35 : 0.85)]} />
      {Array.from({length: lights}, (_, i) => {
        const a = (i / lights) * Math.PI * 2, r = i === 0 ? 0 : soft;
        return <directionalLight key={i} position={[key3[0] + Math.cos(a) * r, key3[1], key3[2] + Math.sin(a) * r]} intensity={total / lights} castShadow
          shadow-mapSize={[MAP, MAP]} shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span} shadow-camera-near={0.5} shadow-camera-far={40} shadow-bias={-0.0006} shadow-normalBias={0.02} />;
      })}
      {floor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <shadowMaterial transparent opacity={P.shadow} />
        </mesh>
      )}
    </>
  );
};

// printed text on a surface (wall, table, paper): a canvas texture on a plane
export const usePrint = (ready: boolean, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, deps: any[]) => useMemo(() => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  if (ready) draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}, [ready, w, h, ...deps]);

export const projector = (pos: V3, target: V3, fov: number, w = 1080, h = 1920) => {
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, 300);
  cam.position.set(...pos); cam.lookAt(...target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return (p: V3) => { const v = new THREE.Vector3(...p).project(cam); return {x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z}; };
};

// ===== print-style overlays =====
export const Backdrop: React.FC<{P: Pal; horizon?: number}> = ({P, horizon = 0.42}) => (
  <AbsoluteFill style={{background: P.bg}}>
    <AbsoluteFill style={{background: `radial-gradient(95% 60% at 50% ${horizon * 100}%, ${P.bg2}, transparent 78%)`}} />
  </AbsoluteFill>
);
export const Grain: React.FC<{P: Pal}> = ({P}) => (
  <AbsoluteFill style={{mixBlendMode: P.blend as any, opacity: P.grain, pointerEvents: 'none'}}>
    <svg width="1080" height="1920">
      <filter id="edgrain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" /><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.55 0" /></filter>
      <rect width="1080" height="1920" filter="url(#edgrain)" />
    </svg>
  </AbsoluteFill>
);
export const Drop: React.FC<{size: number; fill: string; bars: string}> = ({size, fill, bars}) => (
  <svg width={size * 0.82} height={size} viewBox="0 0 82 100" style={{display: 'block'}}>
    <path d="M41 3 C41 3 6 42 6 64 A35 35 0 0 0 76 64 C76 42 41 3 41 3 Z" fill={fill} />
    <rect x="23" y="63" width="9" height="16" rx="2.5" fill={bars} /><rect x="36.5" y="52" width="9" height="27" rx="2.5" fill={bars} /><rect x="50" y="41" width="9" height="38" rx="2.5" fill={bars} />
  </svg>
);
export const Logo: React.FC<{P: Pal; size?: number}> = ({P, size = 44}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: size * 0.26}}>
    <Drop size={size} fill={P.accent} bars={P.bg} />
    <div style={{fontFamily: P.display, fontWeight: P.dWeight, fontSize: size * (P.dItalic ? 1.02 : 0.86), letterSpacing: P.dTrack + 'em', color: P.ink, lineHeight: 1, whiteSpace: 'nowrap'}}>
      {P.dItalic ? <>The Daily <i>Drop</i></> : 'daily drop'}
    </div>
  </div>
);
export const Masthead: React.FC<{P: Pal; label: string; opacity?: number}> = ({P, label, opacity = 1}) => (
  <div style={{position: 'absolute', top: 276, left: 84, width: 912, opacity}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <Logo P={P} />
      <div style={{fontFamily: MONO, fontWeight: 500, fontSize: 21, letterSpacing: '0.14em', color: P.mute}}>{label}</div>
    </div>
    <div style={{height: 2, background: P.ink, marginTop: 16}} />
  </div>
);
export const Head: React.FC<{P: Pal; top: number; size: number; children: React.ReactNode; style?: React.CSSProperties; width?: number; left?: number}> = ({P, top, size, children, style, width = 912, left = 84}) => (
  <div style={{position: 'absolute', top, left, width, fontFamily: P.display, fontWeight: P.dWeight, fontSize: size, lineHeight: P.dItalic ? 1.0 : 0.98, letterSpacing: P.dTrack + 'em', color: P.ink, ...style}}>{children}</div>
);
export const Em: React.FC<{P: Pal; children: React.ReactNode}> = ({P, children}) => <span style={{color: P.accent, fontStyle: P.dItalic ? 'italic' : 'normal'}}>{children}</span>;
export const Tag: React.FC<{P: Pal; x: number; y: number; children: React.ReactNode; opacity?: number; solid?: boolean; size?: number; align?: 'center' | 'left'}> = ({P, x, y, children, opacity = 1, solid, size = 21, align = 'center'}) => (
  <div style={{position: 'absolute', left: align === 'center' ? x - 200 : x, width: 400, top: y, textAlign: align, opacity}}>
    <span style={{display: 'inline-block', fontFamily: MONO, fontWeight: 700, fontSize: size, letterSpacing: '0.06em', padding: '6px 12px 5px', borderRadius: 6, whiteSpace: 'nowrap',
      color: solid ? P.onAccent : P.ink, background: solid ? P.accent : P.dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,253,248,0.82)', border: solid ? 'none' : `1.5px solid ${P.rule}`}}>{children}</span>
  </div>
);
export const ProgressRule: React.FC<{P: Pal; k: number}> = ({P, k}) => (
  <div style={{position: 'absolute', top: 0, left: 0, height: 7, width: `${k * 100}%`, background: P.accent}} />
);
