import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  Sequence,
} from 'remotion';
import {loadFont} from '@remotion/fonts';

// Fonts ship with the project (video/public/fonts), so rendering never depends on the internet.
const ANTON = 'Anton';
const INTER = 'Inter';
loadFont({family: ANTON, url: staticFile('fonts/anton-latin-400-normal.woff2'), weight: '400'});
for (const w of ['600', '800', '900']) {
  loadFont({family: INTER, url: staticFile(`fonts/inter-latin-${w}-normal.woff2`), weight: w});
}

// ---------- Types (built by engine/render.py) ----------
export type Section = {name: string; text: string; start: number; end: number};
export type Word = {w: string; start: number; end: number};
export type Caption = {words: Word[]; start: number; end: number};
export type Item = {
  label: string;
  short: string;
  start: number;
  end: number;
  year?: number | null;
  image?: string | null;
  series?: number[][] | null;
  mentions?: number[];
};
export type Badge = {short: string; text: string; tone: 'good' | 'bad'};
export type Sfx = {whoosh?: string | null; impact?: string | null; tick?: string | null; riser?: string | null};
export type ThemeName = 'neon' | 'money' | 'blood' | 'ice' | 'paper';
export type RevealProps = {
  theme: ThemeName;
  duration: number;
  audio: string;
  music?: string | null;
  musicStart?: number;
  sfx?: Sfx;
  hook: string;
  unit: 'usd2' | 'usd0' | 'usd_compact' | 'num_compact';
  startLabel: string;
  endLabel: string;
  startOrder: 'given' | 'value';
  race: boolean;
  sections: Section[];
  hookWords: Word[];
  captions: Caption[];
  items: Item[];
  badges: Badge[];
  sourceLabel: string;
};

// ---------- Themes ----------
export type Theme = {
  bg: string; blobA: string; blobB: string; grid: string;
  text: string; dim: string; accent: string; bar: string; good: string; bad: string;
  onAccent: string; tileBorder: string; capText: string; capStroke: string; shadow: string; glow: number;
};
export const THEMES: Record<ThemeName, Theme> = {
  neon: {bg: '#07090D', blobA: 'rgba(59,130,246,0.38)', blobB: 'rgba(255,46,136,0.24)', grid: 'rgba(255,255,255,0.05)',
    text: '#F8FAFC', dim: 'rgba(248,250,252,0.62)', accent: '#FACC15', bar: '#3B82F6', good: '#22C55E', bad: '#EF4444',
    onAccent: '#07090D', tileBorder: 'transparent', capText: '#FFFFFF', capStroke: '#000000', shadow: '0 8px 0 rgba(0,0,0,0.7)', glow: 1},
  money: {bg: '#03140C', blobA: 'rgba(34,197,94,0.32)', blobB: 'rgba(250,204,21,0.16)', grid: 'rgba(163,230,53,0.07)',
    text: '#ECFDF5', dim: 'rgba(236,253,245,0.62)', accent: '#A3E635', bar: '#10B981', good: '#FDE047', bad: '#F87171',
    onAccent: '#03140C', tileBorder: 'transparent', capText: '#FFFFFF', capStroke: '#000000', shadow: '0 8px 0 rgba(0,0,0,0.7)', glow: 1},
  blood: {bg: '#120505', blobA: 'rgba(239,68,68,0.36)', blobB: 'rgba(249,115,22,0.24)', grid: 'rgba(255,255,255,0.045)',
    text: '#FFF7ED', dim: 'rgba(255,247,237,0.62)', accent: '#FDE047', bar: '#F97316', good: '#4ADE80', bad: '#EF4444',
    onAccent: '#120505', tileBorder: 'transparent', capText: '#FFFFFF', capStroke: '#000000', shadow: '0 8px 0 rgba(0,0,0,0.7)', glow: 1},
  ice: {bg: '#050D18', blobA: 'rgba(34,211,238,0.30)', blobB: 'rgba(99,102,241,0.34)', grid: 'rgba(165,243,252,0.06)',
    text: '#F0F9FF', dim: 'rgba(240,249,255,0.62)', accent: '#67E8F9', bar: '#6366F1', good: '#34D399', bad: '#FB7185',
    onAccent: '#050D18', tileBorder: 'transparent', capText: '#FFFFFF', capStroke: '#000000', shadow: '0 8px 0 rgba(0,0,0,0.7)', glow: 1},
  paper: {bg: '#F4EFE6', blobA: 'rgba(225,29,72,0.13)', blobB: 'rgba(37,99,235,0.12)', grid: 'rgba(17,24,39,0.07)',
    text: '#111827', dim: 'rgba(17,24,39,0.62)', accent: '#E11D48', bar: '#111827', good: '#16A34A', bad: '#DC2626',
    onAccent: '#FFFFFF', tileBorder: 'rgba(17,24,39,0.18)', capText: '#111827', capStroke: '#FFFFFF', shadow: '0 6px 0 rgba(17,24,39,0.12)', glow: 0.35},
};

// ---------- Layout: everything readable stays inside the Shorts safe box ----------
// YouTube covers the top ~290px (search, menu), the right ~190px from mid-height down (like, comment, share)
// and the bottom ~500px (title, channel, subscribe, nav). Text never goes there.
const W = 1080;
const H = 1920;
// Centered on the screen. The like/comment buttons only cover the lower right, below the chart area.
const SAFE = {left: 110, right: 970, top: 280, bottom: 1440};
const SAFE_W = SAFE.right - SAFE.left;
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const sec = (sections: Section[], name: string) => sections.find((s) => s.name === name);
const bump = (x: number) => (x < 0 ? 0 : Math.exp(-x * 9) * (1 - Math.exp(-x * 60)));
const src = (path: string) => (path.startsWith('http') ? path : staticFile(path));

// ---------- Number formats ----------
export const compact = (v: number, prefix: string) => {
  const a = Math.abs(v);
  const sc = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));
  if (a >= 1e12) return `${prefix}${sc(v / 1e12)}T`;
  if (a >= 1e9) return `${prefix}${sc(v / 1e9)}B`;
  if (a >= 1e6) return `${prefix}${sc(v / 1e6)}M`;
  if (a >= 1e4) return `${prefix}${sc(v / 1e3)}K`;
  return `${prefix}${Math.round(v).toLocaleString('en-US')}`;
};
// Short form for the screen: never more than 6 or 7 characters
export const short = (v: number, unit: RevealProps['unit']) => {
  if (unit === 'usd2') return `$${v.toFixed(2)}`;
  if (unit === 'num_compact') return compact(v, '');
  return compact(v, '$');
};

// ---------- Timeline ----------
export type Timeline = {hookEnd: number; chartIn: number; raceStart: number; raceEnd: number; revealAt: number; endIn: number; beatsEnd: number;
  keys?: number[][]};  // optional [videoTime, raceProgress] keyframes, so race moments land exactly when the voice says them
export const timeline = (p: RevealProps): Timeline => {
  const hook = sec(p.sections, 'hook')!;
  const beats = p.sections.filter((s) => s.name.startsWith('beat'));
  const tension = sec(p.sections, 'tension')!;
  const reveal = sec(p.sections, 'reveal')!;
  const twist = sec(p.sections, 'twist')!;
  const revealAt = reveal.start + 0.45;
  // Race topics: beat 1 holds the starting picture, then the race runs until the reveal slam.
  // Other topics: the start values hold through the beats and morph during the tension line.
  const raceStart = p.race ? (beats[1] ?? beats[0]).start : tension.start + 0.2;
  return {hookEnd: hook.end, chartIn: beats[0].start, raceStart, raceEnd: revealAt, revealAt, endIn: twist.start, beatsEnd: tension.start};
};

// Value of an item at race progress u (0 = start, 1 = today)
const seriesOf = (it: Item, race: boolean): number[][] =>
  race && it.series && it.series.length > 1 ? it.series : [[0, it.start], [1, it.end]];
const valueAt = (pts: number[][], tq: number) => {
  if (tq <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (tq <= pts[i][0]) {
      const [t0, v0] = pts[i - 1];
      const [t1, v1] = pts[i];
      const k = (tq - t0) / (t1 - t0 || 1);
      return v0 > 0 && v1 > 0 ? Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * k) : v0 + (v1 - v0) * k;
    }
  }
  return pts[pts.length - 1][1];
};
const progressAt = (t: number, tl: Timeline) =>
  tl.keys && tl.keys.length > 1
    ? interpolate(t, tl.keys.map((k) => k[0]), tl.keys.map((k) => k[1]), {...clamp, easing: Easing.inOut(Easing.sin)})
    : interpolate(t, [tl.raceStart, tl.raceEnd], [0, 1], {...clamp, easing: Easing.bezier(0.35, 0, 0.55, 1)});

// ---------- Background (always moving) ----------
export const Background: React.FC<{T: Theme}> = ({T}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const gy = (frame * 3) % 90;
  const b1x = 50 + Math.sin(t * 0.9) * 25;
  const b1y = 30 + Math.cos(t * 0.7) * 15;
  const b2x = 50 + Math.cos(t * 0.8) * 30;
  const b2y = 70 + Math.sin(t * 0.6) * 15;
  return (
    <AbsoluteFill style={{backgroundColor: T.bg, overflow: 'hidden'}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${b1x}% ${b1y}%, ${T.blobA}, transparent 45%), radial-gradient(circle at ${b2x}% ${b2y}%, ${T.blobB}, transparent 45%)`}} />
      <div
        style={{
          position: 'absolute', inset: -100, transform: `translateY(${gy}px)`,
          backgroundImage: `linear-gradient(${T.grid} 1px, transparent 1px), linear-gradient(90deg, ${T.grid} 1px, transparent 1px)`,
          backgroundSize: '90px 90px',
        }}
      />
    </AbsoluteFill>
  );
};

// ---------- Camera: small punch on every section, shake on the reveal ----------
const Camera: React.FC<{p: RevealProps; tl: Timeline; children: React.ReactNode}> = ({p, tl, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  let punch = 0;
  for (const s of p.sections) punch += bump(t - s.start) * 0.05;
  const k = t >= tl.revealAt ? Math.exp(-(t - tl.revealAt) * 5) : 0;
  const sx = Math.sin(t * 95) * 20 * k;
  const sy = Math.cos(t * 83) * 16 * k;
  return <AbsoluteFill style={{transform: `translate(${sx}px, ${sy}px) scale(${1 + punch})`}}>{children}</AbsoluteFill>;
};

// ---------- Logo tile: logos sit on a white card so dark logos (Apple) stay visible ----------
export const Tile: React.FC<{it: Item; size: number; T: Theme; ring?: string | null}> = ({it, size, T, ring}) => {
  const r = Math.round(size * 0.22);
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: r, flexShrink: 0, overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `2px solid ${T.tileBorder}`,
    boxShadow: ring ? `0 0 0 ${Math.max(4, size * 0.05)}px ${ring}, 0 0 ${size * 0.4}px ${ring}` : '0 6px 18px rgba(0,0,0,0.35)',
  };
  if (it.image) {
    return (
      <div style={{...base, background: '#FFFFFF'}}>
        <Img src={src(it.image)} style={{width: '78%', height: '78%', objectFit: 'contain'}} />
      </div>
    );
  }
  const txt = it.year ? String(it.year) : it.short.toUpperCase();
  const fs = size * (txt.length <= 3 ? 0.5 : txt.length <= 6 ? 0.3 : 0.2);
  return (
    <div style={{...base, background: T.accent, color: T.onAccent, fontFamily: ANTON, fontSize: fs, lineHeight: 1, textAlign: 'center', padding: size * 0.06}}>
      {txt}
    </div>
  );
};

// ---------- Poster: the opening frame and the end card share this layout, so the video loops ----------
const KEY = /expensive|cheapest|actually|most|best|biggest|richest|now|today|worst|\d/i;

export const Poster: React.FC<{p: RevealProps; tl: Timeline; T: Theme; mode: 'hook' | 'end'}> = ({p, tl, T, mode}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const visible = mode === 'hook' ? t <= tl.chartIn + 0.25 : t >= tl.endIn - 0.05;
  if (!visible) return null;
  const opacity = mode === 'hook'
    ? interpolate(t, [tl.chartIn - 0.02, tl.chartIn + 0.22], [1, 0], clamp)
    : interpolate(t, [tl.endIn - 0.05, tl.endIn + 0.2], [0, 1], clamp);
  // In the last half second the end card turns back into the opening frame (seamless loop)
  const back = mode === 'end' ? interpolate(t, [p.duration - 0.5, p.duration - 0.1], [0, 1], clamp) : 1;
  const results = mode === 'end' ? 1 - back : 0;

  // ----- question -----
  const tokens = p.hook.split(' ');
  const fs = p.hook.length <= 30 ? 124 : p.hook.length <= 46 ? 108 : 94;
  const wordTime = (i: number) => (p.hookWords[i] ? p.hookWords[i].start : (i / tokens.length) * tl.hookEnd);

  // ----- grid -----
  const n = p.items.length;
  const cols = n <= 4 ? n : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cellW = SAFE_W / cols;
  const gridTop = 820;
  const cellH = (SAFE.bottom - gridTop) / rows;
  const tile = Math.min(cellW * 0.66, cellH - 150, 200);
  const top = p.badges[0];
  const bottom = p.badges[1];
  const winner = p.items.find((i) => i.short === top.short)!;
  const allSameStart = p.items.every((i) => Math.abs(i.start - p.items[0].start) < 1e-6);
  const mult = allSameStart && winner.start > 0 ? `X${Math.round(winner.end / winner.start).toLocaleString('en-US')}` : '';

  // hook: one tile at a time flashes, "which one?" energy
  const spot = Math.floor(t / 0.22) % n;

  return (
    <AbsoluteFill style={{opacity}}>
      {/* question: fully on screen from frame 0, words light up as they are spoken */}
      <div style={{position: 'absolute', top: SAFE.top, left: SAFE.left, width: SAFE_W, height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{textAlign: 'center', lineHeight: 1.0}}>
          {tokens.map((tok, i) => {
            const spoken = mode === 'hook' ? t >= wordTime(i) : true;
            const pop = mode === 'hook' ? bump(t - wordTime(i)) : 0;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block', margin: '0 12px', fontFamily: ANTON, fontSize: fs, textTransform: 'uppercase',
                  color: KEY.test(tok) ? T.accent : T.text,
                  opacity: spoken ? 1 : 0.88,
                  transform: `scale(${1 + pop * 0.22}) translateY(${-pop * 10}px)`,
                  textShadow: T.shadow,
                }}
              >
                {tok}
              </span>
            );
          })}
        </div>
      </div>

      {/* teaser pill, which turns into the result banner on the end card */}
      <div style={{position: 'absolute', top: 680, left: SAFE.left, width: SAFE_W, display: 'flex', justifyContent: 'center'}}>
        <div style={{position: 'relative', height: 76}}>
          <Pill T={T} opacity={1 - results} pulse={mode === 'hook' ? t : 0}>
            {p.startLabel.toUpperCase()} <Arrow color={T.onAccent} /> ???
          </Pill>
          <Pill T={T} opacity={results} pulse={0}>
            {top.text}: {winner.short.toUpperCase()} {mult || short(winner.end, p.unit)}
          </Pill>
        </div>
      </div>

      {/* grid of logos */}
      {p.items.map((it, i) => {
        const r = Math.floor(i / cols);
        const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
        const c = i % cols;
        const x = SAFE.left + (SAFE_W - inRow * cellW) / 2 + c * cellW;
        const y = gridTop + r * cellH;
        const bob = Math.sin(t * 3.2 + i * 1.3) * 7;
        const isWin = it.short === top.short;
        const isLose = it.short === bottom.short;
        const hot = mode === 'hook' && i === spot;
        const ring = results > 0.5 && isWin ? T[top.tone] : hot ? T.accent : null;
        const scale = 1 + (hot ? 0.06 : 0) + (isWin ? 0.12 * results : 0);
        const valueTxt = short(it.end, p.unit);
        const valueColor = isWin ? T[top.tone] : isLose ? T[bottom.tone] : T.text;
        return (
          <div key={it.short} style={{position: 'absolute', left: x, top: y + bob, width: cellW, height: cellH, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transform: `scale(${scale})`}}>
            <Tile it={it} size={tile} T={T} ring={ring} />
            <div style={{fontFamily: INTER, fontWeight: 900, fontSize: Math.min(34, cellW / Math.max(it.short.length, 6) * 1.5), color: T.text, textAlign: 'center', lineHeight: 1}}>{it.short}</div>
            <div style={{position: 'relative', height: 50, width: cellW, textAlign: 'center'}}>
              <div style={{position: 'absolute', width: '100%', fontFamily: ANTON, fontSize: 46, lineHeight: 1, color: T.accent, opacity: 1 - results, transform: `scale(${1 + 0.08 * Math.sin(t * 8 + i)})`}}>?</div>
              <div style={{position: 'absolute', width: '100%', fontFamily: ANTON, fontSize: cols >= 4 ? 40 : 46, lineHeight: 1, color: valueColor, opacity: results}}>{valueTxt}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Arrow: React.FC<{color: string}> = ({color}) => (
  <svg width={44} height={30} viewBox="0 0 44 30" style={{margin: '0 6px', verticalAlign: 'middle'}}>
    <path d="M2 15 H34 M24 4 L38 15 L24 26" stroke={color} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Pill: React.FC<{T: Theme; opacity: number; pulse: number; children: React.ReactNode}> = ({T, opacity, pulse, children}) => (
  <div
    style={{
      position: 'absolute', left: '50%', top: 0, transform: `translateX(-50%) scale(${1 + 0.03 * Math.sin(pulse * 6)})`,
      whiteSpace: 'nowrap', opacity, background: T.accent, color: T.onAccent, borderRadius: 999,
      padding: '10px 34px', fontFamily: ANTON, fontSize: 52, lineHeight: 1.08, letterSpacing: 1,
      boxShadow: `0 0 ${40 * T.glow}px ${T.accent}88`,
    }}
  >
    {children}
  </div>
);

// ---------- Chart: bar race (or start-vs-today morph), rows re-sort smoothly ----------
export type Callout = {at: number; text: string; item?: string};
export const Chart: React.FC<{p: RevealProps; tl: Timeline; T: Theme; callouts?: Callout[]}> = ({p, tl, T, callouts = []}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  if (t < tl.chartIn - 0.05 || t > tl.endIn + 0.25) return null;

  const opacity = Math.min(
    interpolate(t, [tl.chartIn - 0.05, tl.chartIn + 0.15], [0, 1], clamp),
    interpolate(t, [tl.endIn - 0.05, tl.endIn + 0.2], [1, 0], clamp),
  );
  const series = p.items.map((it) => seriesOf(it, p.race));
  const t0 = Math.min(...series.map((s) => s[0][0]));
  const t1 = Math.max(...series.map((s) => s[s.length - 1][0]));
  const valuesAt = (u: number) => series.map((s) => valueAt(s, t0 + (t1 - t0) * u));

  // hard rank at a moment, then averaged over the last few frames so swaps glide instead of jump
  const span = Math.max(t1 - t0, 1e-6);
  const smoothValuesAt = (u: number) => {
    // average over the previous ~6 months of data so tiny wiggles do not cause swaps
    const acc = new Array(p.items.length).fill(0);
    const K = p.race ? 3 : 1;
    for (let j = 0; j < K; j++) {
      const v = valuesAt(Math.max(0, u - (j * 0.06) / span));
      v.forEach((x, i) => (acc[i] += Math.log(Math.max(x, 1e-9))));
    }
    return acc.map((x) => x / K);
  };
  const rankAt = (time: number) => {
    const u = progressAt(time, tl);
    const v = u >= 1 ? valuesAt(1) : smoothValuesAt(u);
    const order = p.items.map((_, i) => i);
    // values within ~4% count as tied and keep their order, so near-equal rows do not flicker
    const q = v.map((x) => (u >= 1 ? x : Math.round(x / 0.04)));
    if (!(u === 0 && p.startOrder === 'given')) order.sort((a, b) => q[b] - q[a] || a - b);
    const r = new Array(p.items.length);
    order.forEach((idx, k) => (r[idx] = k));
    return r as number[];
  };
  const n = p.items.length;
  // The order re-sorts in quick eased steps (every STEP seconds) instead of drifting, so rows never smear together
  const STEP = 0.4;
  const SWAP = 0.26;
  const checkpoint = (k: number) => Math.min(tl.raceStart + k * STEP, tl.raceEnd);
  const kNow = t < tl.raceStart ? -1 : Math.min(Math.floor((t - tl.raceStart) / STEP), Math.ceil((tl.raceEnd - tl.raceStart) / STEP));
  const from = kNow <= 0 ? rankAt(tl.raceStart - 0.01) : rankAt(checkpoint(kNow - 1));
  const to = kNow < 0 ? from : rankAt(checkpoint(kNow) + (checkpoint(kNow) >= tl.raceEnd ? 0.01 : 0));
  const e = kNow < 0 ? 1 : interpolate(t, [checkpoint(kNow), checkpoint(kNow) + SWAP], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  let smooth = from.map((r, i) => r + (to[i] - r) * e);
  if (!p.race) {
    // start-vs-today topics: values change in place, then the rows re-sort once, on the reveal slam
    const a0 = rankAt(tl.raceStart - 0.01);
    const a1 = rankAt(tl.raceEnd + 0.01);
    const e2 = interpolate(t, [tl.revealAt, tl.revealAt + 0.4], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
    smooth = a0.map((r, i) => r + (a1[i] - r) * e2);
  }
  const wsum = 1;

  const u = progressAt(t, tl);
  const vals = valuesAt(u);
  const maxV = Math.max(...vals);
  const revealed = t >= tl.revealAt;

  // ----- layout -----
  const HEAD_H = 190;
  const ROWS_TOP = SAFE.top + HEAD_H;
  const ROWS_BOTTOM = 1250;
  const ROW_H = (ROWS_BOTTOM - ROWS_TOP) / n;
  const TILE = Math.min(104, ROW_H - 18);
  const BAR_X = SAFE.left + TILE + 18;
  const VALUE_W = 170;
  const BAR_MAX = SAFE.right - BAR_X - VALUE_W;
  const NAME_FS = Math.max(26, Math.min(38, ROW_H * 0.28));
  const BAR_H = Math.max(26, ROW_H - NAME_FS - 26);

  // ----- callouts: a pill under the year at each key moment, and that row lights up -----
  const activeCallout = callouts.find((c) => t >= c.at && t < c.at + 1.8);
  const calloutPop = activeCallout ? spring({frame: frame - activeCallout.at * fps, fps, config: {damping: 9, stiffness: 200}}) : 0;

  // ----- header -----
  const year = Math.floor(t0 + (t1 - t0) * u);
  const titleIn = spring({frame: frame - tl.revealAt * fps, fps, config: {damping: 12}});
  const header = p.race ? (
    <>
      <div style={{fontFamily: ANTON, fontSize: 132, lineHeight: 1, color: T.text, textShadow: T.shadow}}>
        {revealed ? <span style={{color: T.accent, display: 'inline-block', transform: `scale(${1.5 - 0.5 * titleIn})`}}>{p.endLabel.toUpperCase()}</span> : year}
      </div>
      {activeCallout ? (
        <div style={{marginTop: 10, background: T.accent, color: T.onAccent, borderRadius: 999, padding: '8px 30px', fontFamily: ANTON, fontSize: 52, lineHeight: 1.05,
          letterSpacing: 1, textTransform: 'uppercase', transform: `scale(${calloutPop}) rotate(-2deg)`, boxShadow: `0 0 ${40 * T.glow}px ${T.accent}`}}>
          {activeCallout.text}
        </div>
      ) : (
        <div style={{fontFamily: INTER, fontWeight: 900, fontSize: 30, color: T.dim, letterSpacing: 3, textTransform: 'uppercase', marginTop: 4}}>
          {revealed ? `${p.startLabel}` : u > 0 ? `${p.startLabel} · race to today` : p.startLabel}
        </div>
      )}
    </>
  ) : (
    <div style={{fontFamily: ANTON, fontSize: 92, lineHeight: 1.02, color: u > 0.5 ? T.accent : T.text, textShadow: T.shadow, textTransform: 'uppercase'}}>
      {u > 0.5 ? p.endLabel : p.startLabel}
    </div>
  );

  return (
    <AbsoluteFill style={{opacity}}>
      <div style={{position: 'absolute', top: SAFE.top, left: SAFE.left, width: SAFE_W, height: HEAD_H - 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
        {header}
      </div>

      {p.items.map((it, i) => {
        const enter = spring({frame: frame - (tl.chartIn + i * 0.05) * fps, fps, config: {damping: 14, mass: 0.6, stiffness: 170}});
        const y = ROWS_TOP + ROW_H * (smooth[i] / wsum);
        const v = vals[i];
        const barW = Math.max(18, (v / maxV) * BAR_MAX);
        const badge = revealed ? p.badges.find((b) => b.short === it.short) : undefined;
        const tone = badge ? T[badge.tone] : null;
        const marks = [...(it.mentions || []), ...callouts.filter((c) => c.item === it.short).map((c) => c.at)];
        const hl = marks.reduce((a, m) => Math.max(a, interpolate(t - m, [0, 0.12, 1.4, 1.8], [0, 1, 1, 0], clamp)), 0);
        const color = tone ?? T.bar;
        const badgeIn = spring({frame: frame - tl.revealAt * fps, fps, config: {damping: 9}});
        return (
          <div key={it.short} style={{position: 'absolute', top: y, left: SAFE.left + (1 - enter) * -260, width: SAFE_W, height: ROW_H, opacity: Math.min(1, enter * 1.4), zIndex: Math.round(1000 - smooth[i])}}>
            <div style={{position: 'absolute', left: 0, top: (ROW_H - TILE) / 2, transform: `scale(${1 + hl * 0.12})`}}>
              <Tile it={it} size={TILE} T={T} ring={hl > 0.05 ? T.accent : tone} />
            </div>
            <div style={{position: 'absolute', left: BAR_X - SAFE.left, top: (ROW_H - NAME_FS - 8 - BAR_H) / 2, display: 'flex', alignItems: 'center', gap: 12}}>
              <span style={{fontFamily: INTER, fontWeight: 900, fontSize: NAME_FS, lineHeight: 1, color: hl > 0.05 ? T.accent : T.text}}>{it.short}</span>
              {badge && (
                <span style={{fontFamily: INTER, fontWeight: 900, fontSize: NAME_FS * 0.85, lineHeight: 1, color: T.onAccent, background: tone!, padding: '4px 12px', borderRadius: 8, transform: `scale(${badgeIn})`}}>
                  {badge.text}
                </span>
              )}
            </div>
            <div
              style={{
                position: 'absolute', left: BAR_X - SAFE.left, top: (ROW_H - NAME_FS - 8 - BAR_H) / 2 + NAME_FS + 8,
                height: BAR_H, width: barW, borderRadius: BAR_H * 0.28,
                background: `linear-gradient(90deg, ${color}, ${color}CC)`,
                boxShadow: `0 0 ${(tone ? 44 : 14 + hl * 30) * T.glow}px ${color}`,
              }}
            />
            <div
              style={{
                position: 'absolute', left: BAR_X - SAFE.left + barW + 14, top: (ROW_H - NAME_FS - 8 - BAR_H) / 2 + NAME_FS + 8,
                height: BAR_H, display: 'flex', alignItems: 'center',
                fontFamily: ANTON, fontSize: Math.min(52, BAR_H * 1.05), color: tone ?? T.text, whiteSpace: 'nowrap',
              }}
            >
              {short(v, p.unit)}
            </div>
          </div>
        );
      })}

      <div style={{position: 'absolute', top: 1262, left: SAFE.left, width: SAFE_W, fontFamily: INTER, fontWeight: 600, fontSize: 22, lineHeight: 1.2, color: T.dim, textAlign: 'center'}}>
        {p.sourceLabel}
      </div>
    </AbsoluteFill>
  );
};

// ---------- Effects ----------
export const Flash: React.FC<{at: number}> = ({at}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (frame < at * fps) return null;
  const o = interpolate(frame, [at * fps, at * fps + 6], [0.85, 0], clamp);
  return <AbsoluteFill style={{backgroundColor: 'white', opacity: o}} />;
};

const Vignette: React.FC<{from: number; to: number}> = ({from, to}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const o = interpolate(t, [from, from + 0.3, to - 0.05, to + 0.4], [0, 0.45, 0.45, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${o + 0.2}) 100%)`}} />;
};

// ---------- Captions: only during the beats and the tension line, script words, numbers kept whole ----------
export const Captions: React.FC<{captions: Caption[]; T: Theme; top?: number}> = ({captions, T, top = 1290}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const g = captions.find((c) => t >= c.start - 0.03 && t <= c.end + 0.12);
  if (!g) return null;
  const gIn = spring({frame: frame - g.start * fps, fps, config: {damping: 12, mass: 0.4, stiffness: 220}});
  // fit the text to the safe width: one line when short, two lines when long, never off screen
  const chars = g.words.reduce((a, w) => a + w.w.length + 1, 0);
  const lines = chars > 24 ? 2 : 1;
  const perLine = chars / lines + 2;
  const fs = Math.min(58, Math.floor(SAFE_W / (perLine * 0.7)));
  return (
    <div
      style={{
        position: 'absolute', top, left: SAFE.left, width: SAFE_W, height: 140,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: INTER, fontWeight: 900, fontSize: fs, lineHeight: 1.08, textTransform: 'uppercase',
        WebkitTextStroke: `${Math.round(fs / 7)}px ${T.capStroke}`, paintOrder: 'stroke fill',
        transform: `scale(${0.8 + 0.2 * gIn})`,
      }}
    >
      <div style={{maxWidth: SAFE_W}}>
        {g.words.map((w, i) => {
          const active = t >= w.start && t <= w.end + 0.06;
          const isNum = /\d/.test(w.w);
          return (
            <span key={i} style={{display: 'inline-block', margin: `0 ${Math.round(fs * 0.32)}px`, color: active || isNum ? T.accent : T.capText, transform: `scale(${active ? 1.08 : 1})`}}>
              {w.w}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const Progress: React.FC<{duration: number; T: Theme}> = ({duration, T}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const w = Math.min(1, frame / (duration * fps)) * W;
  return <div style={{position: 'absolute', top: 0, left: 0, height: 12, width: w, background: T.accent, boxShadow: `0 0 20px ${T.accent}`}} />;
};

// ---------- Sound design ----------
const Sound: React.FC<{p: RevealProps; tl: Timeline}> = ({p, tl}) => {
  const {fps} = useVideoConfig();
  const sfx = p.sfx || {};
  const at = (s: number) => Math.max(0, Math.round(s * fps));
  const mentions = p.items.flatMap((it) => it.mentions || []);
  return (
    <>
      {p.music && <Audio src={staticFile(p.music)} volume={(p as {musicVolume?: number}).musicVolume ?? 0.13} trimBefore={Math.round((p.musicStart || 0) * fps)} loop />}
      {sfx.whoosh && [tl.chartIn, tl.endIn].map((s, i) => (
        <Sequence key={`w${i}`} from={at(s - 0.08)} durationInFrames={fps}>
          <Audio src={staticFile(sfx.whoosh!)} volume={0.35} />
        </Sequence>
      ))}
      {sfx.tick && mentions.map((m, i) => (
        <Sequence key={`t${i}`} from={at(m)} durationInFrames={fps}>
          <Audio src={staticFile(sfx.tick!)} volume={0.4} />
        </Sequence>
      ))}
      {sfx.riser && (
        <Sequence from={at(tl.beatsEnd)} durationInFrames={Math.max(1, at(tl.revealAt + 0.05) - at(tl.beatsEnd))}>
          <Audio src={staticFile(sfx.riser)} volume={0.4} />
        </Sequence>
      )}
      {sfx.impact && (
        <Sequence from={at(tl.revealAt - 0.03)} durationInFrames={fps * 2}>
          <Audio src={staticFile(sfx.impact)} volume={0.7} />
        </Sequence>
      )}
    </>
  );
};

// ---------- Logo badge: the drop chart mark, small, top left, on every frame ----------
export const LogoBadge: React.FC<{T: Theme}> = ({T}) => (
  <div
    style={{
      position: 'absolute', left: 40, top: 200, width: 76, height: 76, borderRadius: 38,
      background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 14px rgba(0,0,0,0.35)', opacity: 0.95,
    }}
  >
    <svg width={40} height={52} viewBox="0 0 400 520">
      <path d="M200 8 C200 8 36 222 36 344 A164 164 0 0 0 364 344 C364 222 200 8 200 8 Z" fill={T.onAccent} />
      <rect x="112" y="350" width="48" height="96" rx="10" fill={T.accent} />
      <rect x="176" y="290" width="48" height="156" rx="10" fill={T.accent} />
      <rect x="240" y="214" width="48" height="232" rx="10" fill={T.accent} />
    </svg>
  </div>
);

// ---------- Composition ----------
export const RankingReveal: React.FC<RevealProps> = (p) => {
  const T = THEMES[p.theme] ?? THEMES.neon;
  const tl = timeline(p);
  return (
    <AbsoluteFill>
      <Background T={T} />
      <Camera p={p} tl={tl}>
        <Poster p={p} tl={tl} T={T} mode="hook" />
        <Chart p={p} tl={tl} T={T} />
        <Poster p={p} tl={tl} T={T} mode="end" />
      </Camera>
      <Vignette from={tl.beatsEnd} to={tl.revealAt} />
      <Flash at={tl.revealAt} />
      <Captions captions={p.captions} T={T} />
      <LogoBadge T={T} />
      <Progress duration={p.duration} T={T} />
      <Sound p={p} tl={tl} />
      <Audio src={staticFile(p.audio)} />
    </AbsoluteFill>
  );
};
