import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing, Sequence} from 'remotion';
import {
  RevealProps, Item, Theme, THEMES, Timeline, Callout, short, Background, Tile, Poster, Chart, Captions, Progress, LogoBadge, Flash,
} from './RankingReveal';

// A video is a chain of full-screen scenes, each with one idea, 1.5 to 3 seconds long.
export type SceneType = 'hook' | 'spotlight' | 'versus' | 'race' | 'linerace' | 'question' | 'reveal' | 'stat' | 'end' | 'mascot';
export type Mood = 'shock' | 'happy' | 'think' | 'laugh';
export type Scene = {
  type: SceneType;
  start: number;
  end: number;
  items?: string[];       // shorts of the items the scene is about
  bg?: string | null;     // background photo (public/ path), slowly zooming
  mascot?: Mood | null;   // the drop mascot reacts in the corner
  label?: string;         // small line under the big number
  rank?: number;          // countdown position (#6 ... #1), shown as a badge
  stamp?: string;         // a punchline stamped over the scene ("DEAD LAST")
  big?: string;           // stat scene: the giant number or word
  callouts?: Callout[];   // race scene: key moments called out (overtakes)
  keys?: number[][];      // race scene: [videoTime, raceProgress] keyframes
  mystery?: string;       // line race: the item shown as ??? until the reveal
  flip?: boolean;         // reveal: the ??? tile flips over to the real logo
  revealAt?: number;      // line race: when ??? turns into the real logo, right on the chart
  sub?: string;           // stat scene: the line above it
};
export type StoryProps = RevealProps & {scenes: Scene[]};

const ANTON = 'Anton';
const INTER = 'Inter';
const W = 1080;
const H = 1920;
const CX = W / 2;
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const src = (p: string) => (p.startsWith('http') ? p : staticFile(p));
const find = (p: StoryProps, s: string) => p.items.find((i) => i.short === s)!;

// ---------- shared scene pieces ----------
const useSceneTime = (sc: Scene) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  return {t, local: t - sc.start, dur: sc.end - sc.start, frame, fps};
};

// Photo background with a slow zoom, darkened top and bottom so text stays readable.
const PhotoBg: React.FC<{sc: Scene; T: Theme; backdrop?: Item}> = ({sc, T, backdrop}) => {
  const {local, dur} = useSceneTime(sc);
  const z = interpolate(local, [0, dur], [1.04, 1.16], clamp);
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {sc.bg ? (
        <Img src={src(sc.bg)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})`}} />
      ) : backdrop?.image ? (
        <AbsoluteFill style={{background: T.bg, alignItems: 'center', justifyContent: 'center'}}>
          <Img src={src(backdrop.image)} style={{width: 1300, height: 1300, objectFit: 'contain', filter: 'blur(60px) saturate(1.6)', opacity: 0.55, transform: `scale(${z})`}} />
        </AbsoluteFill>
      ) : (
        <Background T={T} />
      )}
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${T.bg}E6 0%, ${T.bg}55 30%, ${T.bg}66 60%, ${T.bg}F2 100%)`}} />
    </AbsoluteFill>
  );
};

// Every scene punches in: a quick zoom and fade on its first frames.
const Enter: React.FC<{sc: Scene; children: React.ReactNode}> = ({sc, children}) => {
  const {local, fps, frame} = useSceneTime(sc);
  if (local < 0 || local > sc.end - sc.start + 0.02) return null;
  const k = spring({frame: frame - sc.start * fps, fps, config: {damping: 14, stiffness: 180, mass: 0.6}});
  return <AbsoluteFill style={{opacity: Math.min(1, local / 0.08), transform: `scale(${1.14 - 0.14 * k})`}}>{children}</AbsoluteFill>;
};

// A number that counts from a to b over the first part of the scene.
const useCount = (sc: Scene, a: number, b: number, from = 0.15, to = 0.75) => {
  const {local, dur} = useSceneTime(sc);
  const u = interpolate(local, [dur * from, dur * to], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return a > 0 && b > 0 ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * u) : a + (b - a) * u;
};

const Big: React.FC<{size: number; color: string; T: Theme; children: React.ReactNode; style?: React.CSSProperties}> = ({size, color, T, children, style}) => (
  <div style={{fontFamily: ANTON, fontSize: size, lineHeight: 1, color, textShadow: T.shadow, textTransform: 'uppercase', textAlign: 'center', ...style}}>{children}</div>
);

// Countdown badge (#6 ... #1), top right, tilted
const RankBadge: React.FC<{sc: Scene; T: Theme}> = ({sc, T}) => {
  const {local} = useSceneTime(sc);
  if (!sc.rank) return null;
  const pop = interpolate(local, [0.1, 0.3], [0, 1], {...clamp, easing: Easing.out(Easing.back(3))});
  return (
    <div style={{position: 'absolute', left: 760, top: 290, width: 200, height: 200, borderRadius: 100, background: T.accent,
      display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${pop}) rotate(-10deg)`,
      boxShadow: `0 10px 40px rgba(0,0,0,0.5)`}}>
      <div style={{fontFamily: ANTON, fontSize: 120, color: T.onAccent, lineHeight: 1}}>#{sc.rank}</div>
    </div>
  );
};

// A punchline stamped across the scene, like a rubber stamp
const Stamp: React.FC<{sc: Scene; T: Theme}> = ({sc, T}) => {
  const {local, dur} = useSceneTime(sc);
  if (!sc.stamp) return null;
  const at = dur * 0.55;
  const k = interpolate(local, [at, at + 0.12], [0, 1], clamp);
  if (k <= 0) return null;
  return (
    <div style={{position: 'absolute', top: 1110, width: W, display: 'flex', justifyContent: 'center'}}>
      <div style={{fontFamily: ANTON, fontSize: 110, lineHeight: 1, color: T.bad, padding: '10px 36px', border: `12px solid ${T.bad}`,
        borderRadius: 18, transform: `rotate(-12deg) scale(${2.2 - 1.2 * k})`, opacity: k, background: 'rgba(0,0,0,0.35)', textTransform: 'uppercase'}}>
        {sc.stamp}
      </div>
    </div>
  );
};

// ---------- scenes ----------
const HookScene: React.FC<{p: StoryProps; sc: Scene; T: Theme}> = ({p, sc, T}) => {
  const {local} = useSceneTime(sc);
  const n = p.items.length;
  return (
    <Enter sc={sc}>
      <PhotoBg sc={sc} T={T} />
      <div style={{position: 'absolute', top: 300, left: 90, width: 900}}>
        <Big size={118} color={T.text} T={T}>{p.hook}</Big>
      </div>
      {p.items.map((it, i) => {
        // logos fan out in an arc below the question, popping in one after another
        const a = (i - (n - 1) / 2) * 0.32;
        const x = CX + Math.sin(a) * 520 - 95;
        const y = 1010 + (1 - Math.cos(a)) * 420 - 95;
        const pop = interpolate(local, [0.05 + i * 0.07, 0.25 + i * 0.07], [0, 1], {...clamp, easing: Easing.out(Easing.back(2))});
        const bob = Math.sin(local * 4 + i) * 8;
        return (
          <div key={it.short} style={{position: 'absolute', left: x, top: y + bob, transform: `scale(${pop}) rotate(${a * 25}deg)`}}>
            <Tile it={it} size={190} T={T} />
          </div>
        );
      })}
    </Enter>
  );
};

const SpotlightScene: React.FC<{p: StoryProps; sc: Scene; T: Theme}> = ({p, sc, T}) => {
  const it = find(p, sc.items![0]);
  const v = useCount(sc, it.start, it.end);
  const {local} = useSceneTime(sc);
  const badge = p.badges.find((b) => b.short === it.short && local > (sc.end - sc.start) * 0.75);
  return (
    <Enter sc={sc}>
      <PhotoBg sc={sc} T={T} backdrop={it} />
      <div style={{position: 'absolute', top: 330, width: W, display: 'flex', justifyContent: 'center', transform: `translateY(${Math.sin(local * 3) * 6}px)`}}>
        <Tile it={it} size={400} T={T} />
      </div>
      <div style={{position: 'absolute', top: 790, width: W}}>
        <Big size={104} color={T.text} T={T}>{it.short}</Big>
      </div>
      <div style={{position: 'absolute', top: 930, width: W}}>
        <Big size={190} color={badge ? T[badge.tone] : T.accent} T={T}>{short(v, p.unit)}</Big>
      </div>
      <div style={{position: 'absolute', top: 1150, width: W, textAlign: 'center', fontFamily: INTER, fontWeight: 900, fontSize: 40, color: T.dim, letterSpacing: 3, textTransform: 'uppercase'}}>
        {sc.label ?? `from ${short(it.start, p.unit)}`}
      </div>
      <RankBadge sc={sc} T={T} />
      <Stamp sc={sc} T={T} />
    </Enter>
  );
};

const VersusScene: React.FC<{p: StoryProps; sc: Scene; T: Theme}> = ({p, sc, T}) => {
  const [a, b] = sc.items!.map((s) => find(p, s));
  const va = useCount(sc, a.start, a.end);
  const vb = useCount(sc, b.start, b.end);
  const {local} = useSceneTime(sc);
  const vsPop = interpolate(local, [0.15, 0.35], [0, 1], {...clamp, easing: Easing.out(Easing.back(3))});
  const TILE = 250;
  const ROW_A = 400;           // top of the first row
  const ROW_B = 1010;          // top of the second row
  const MID = (ROW_A + TILE + ROW_B) / 2;  // exactly between the two rows
  const row = (it: Item, v: number, top: number, from: number) => (
    <div style={{position: 'absolute', top, left: 0, width: W, height: TILE, transform: `translateX(${interpolate(local, [0, 0.25], [from, 0], clamp)}px)`}}>
      <div style={{position: 'absolute', left: 130, top: 0}}><Tile it={it} size={TILE} T={T} /></div>
      <div style={{position: 'absolute', left: 430, top: 0, height: TILE, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8}}>
        <Big size={78} color={T.text} T={T} style={{textAlign: 'left'}}>{it.short}</Big>
        <Big size={128} color={T.accent} T={T} style={{textAlign: 'left'}}>{short(v, p.unit)}</Big>
      </div>
    </div>
  );
  return (
    <Enter sc={sc}>
      <PhotoBg sc={sc} T={T} backdrop={a} />
      {row(a, va, ROW_A, -700)}
      {row(b, vb, ROW_B, 700)}
      <div style={{position: 'absolute', top: MID - 3, left: 90, width: W - 180, height: 6, background: T.accent, opacity: 0.6 * vsPop, borderRadius: 3, boxShadow: `0 0 30px ${T.accent}`}} />
      <div style={{position: 'absolute', top: MID - 95, left: W / 2 - 95, width: 190, height: 190, borderRadius: 95, background: T.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${vsPop}) rotate(${(1 - vsPop) * -90}deg)`, boxShadow: `0 0 60px ${T.accent}`}}>
        <div style={{fontFamily: ANTON, fontSize: 96, lineHeight: 1, color: T.onAccent}}>VS</div>
      </div>
    </Enter>
  );
};

// Full-screen stat: one giant number or word over a photo
const StatScene: React.FC<{p: StoryProps; sc: Scene; T: Theme}> = ({p, sc, T}) => {
  const {local, frame, fps} = useSceneTime(sc);
  const slam = spring({frame: frame - (sc.start + 0.25) * fps, fps, config: {damping: 10, stiffness: 170}});
  return (
    <Enter sc={sc}>
      <PhotoBg sc={sc} T={T} />
      <div style={{position: 'absolute', top: 470, width: W, opacity: interpolate(local, [0, 0.2], [0, 1], clamp)}}>
        <Big size={86} color={T.text} T={T}>{sc.sub}</Big>
      </div>
      <div style={{position: 'absolute', top: 640, width: W, transform: `scale(${2 - slam})`, opacity: Math.min(1, slam * 2)}}>
        <Big size={sc.big && sc.big.length > 6 ? 200 : 300} color={T.accent} T={T}>{sc.big}</Big>
      </div>
      <Stamp sc={sc} T={T} />
    </Enter>
  );
};

const RaceScene: React.FC<{p: StoryProps; sc: Scene; T: Theme}> = ({p, sc, T}) => {
  const tl: Timeline = {hookEnd: 0, chartIn: sc.start, raceStart: sc.start + 0.5, raceEnd: sc.end - 0.5,
    revealAt: sc.end - 0.5, endIn: sc.end, beatsEnd: sc.start, keys: sc.keys};
  const {local} = useSceneTime(sc);
  if (local < -0.05 || local > sc.end - sc.start + 0.3) return null;
  return (
    <AbsoluteFill>
      <PhotoBg sc={sc} T={T} />
      <Chart p={p} tl={tl} T={T} callouts={sc.callouts} />
    </AbsoluteFill>
  );
};

const RevealScene: React.FC<{p: StoryProps; sc: Scene; T: Theme}> = ({p, sc, T}) => {
  const it = find(p, sc.items![0]);
  const {local, frame, fps} = useSceneTime(sc);
  const slam = spring({frame: frame - (sc.start + 0.35) * fps, fps, config: {damping: 9, stiffness: 160}});
  const same = p.items.every((i) => Math.abs(i.start - p.items[0].start) < 1e-6);
  const big = same ? `X${Math.round(it.end / it.start).toLocaleString('en-US')}` : short(it.end, p.unit);
  const shake = local > 0.35 ? Math.exp(-(local - 0.35) * 6) : 0;
  return (
    <Enter sc={sc}>
      <PhotoBg sc={sc} T={T} backdrop={it} />
      {/* rotating light rays behind the winner */}
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{position: 'absolute', top: 330, width: 900, height: 900, borderRadius: 450, opacity: 0.35,
          background: `repeating-conic-gradient(${T.accent} 0deg 8deg, transparent 8deg 24deg)`, transform: `rotate(${local * 25}deg)`,
          WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)'}} />
      </AbsoluteFill>
      <div style={{position: 'absolute', top: 470, width: W, display: 'flex', justifyContent: 'center', transform: `translate(${Math.sin(local * 90) * 18 * shake}px, ${Math.cos(local * 77) * 14 * shake}px)`}}>
        {sc.flip && local < 0.32 ? (
          <div style={{transform: `perspective(900px) rotateY(${interpolate(local, [0.12, 0.32], [0, 90], clamp)}deg)`}}><MysteryTile size={420} T={T} /></div>
        ) : (
          <div style={{transform: `perspective(900px) rotateY(${sc.flip ? interpolate(local, [0.32, 0.5], [-90, 0], clamp) : 0}deg)`}}><Tile it={it} size={420} T={T} ring={T.accent} /></div>
        )}
      </div>
      <div style={{position: 'absolute', top: 960, width: W, transform: `scale(${2.4 - 1.4 * slam})`, opacity: Math.min(1, slam * 2)}}>
        <Big size={300} color={T.accent} T={T}>{big}</Big>
      </div>
      <div style={{position: 'absolute', top: 1270, width: W, opacity: interpolate(local, [0.7, 0.9], [0, 1], clamp)}}>
        <Big size={70} color={T.text} T={T}>{sc.label ?? `${short(it.start, p.unit)} → ${short(it.end, p.unit)}`}</Big>
      </div>
      <RankBadge sc={sc} T={T} />
    </Enter>
  );
};

const EndScene: React.FC<{p: StoryProps; sc: Scene; T: Theme}> = ({p, sc, T}) => {
  const tl: Timeline = {hookEnd: 0, chartIn: -100, raceStart: 0, raceEnd: 0, revealAt: 0, endIn: sc.start, beatsEnd: 0};
  const {local} = useSceneTime(sc);
  if (local < -0.05) return null;
  return (
    <AbsoluteFill>
      <Background T={T} />
      <Poster p={p} tl={tl} T={T} mode="end" />
    </AbsoluteFill>
  );
};


// ---------- line race: logos ride the tips of their lines; the leader is hidden as ??? ----------
const LINE_COLORS = ['#3B82F6', '#22C55E', '#F97316', '#EAB308', '#EC4899', '#A855F7', '#14B8A6', '#EF4444'];
const seriesValue = (pts: number[][], tq: number) => {
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
const niceSteps = (lo: number, hi: number) => {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= lo * 1.05 && v <= hi / 1.05) out.push(v);
    }
  }
  return out.length > 4 ? out.filter((_, i) => i % 2 === 0) : out;
};

const MysteryTile: React.FC<{size: number; T: Theme; ring?: string | null}> = ({size, T, ring}) => (
  <div style={{width: size, height: size, borderRadius: size * 0.22, background: '#0B0B0F', border: `3px solid ${T.accent}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ANTON, fontSize: size * 0.55, color: T.accent,
    boxShadow: ring ? `0 0 0 ${Math.max(4, size * 0.05)}px ${ring}, 0 0 ${size * 0.5}px ${ring}` : `0 0 ${size * 0.4}px ${T.accent}88`}}>?</div>
);

const LineRaceScene: React.FC<{p: StoryProps; sc: Scene; T: Theme}> = ({p, sc, T}) => {
  const {t, frame, fps} = useSceneTime(sc);
  if (t > sc.end + 0.3) return null;
  const items = p.items.filter((i) => i.series && i.series.length > 1);
  const t0 = Math.min(...items.map((i) => i.series![0][0]));
  const t1 = Math.max(...items.map((i) => i.series![i.series!.length - 1][0]));
  const keys = sc.keys && sc.keys.length > 1 ? sc.keys : [[sc.start + 0.3, 0], [sc.end - 0.4, 1]];
  const u = interpolate(t, keys.map((k) => k[0]), keys.map((k) => k[1]), {...clamp, easing: Easing.inOut(Easing.sin)});
  const now = t0 + (t1 - t0) * Math.max(u, 0.002);
  const cur = items.map((it) => seriesValue(it.series!, now));

  // reveal, on the chart itself: ??? flips into the real logo, the multiple slams in
  const rv = sc.revealAt ?? 1e9;
  const revealed = t >= rv + 0.25;
  const flip = interpolate(t, [rv, rv + 0.25, rv + 0.5], [0, 90, 0], clamp);
  const slam = spring({frame: frame - (rv + 0.3) * fps, fps, config: {damping: 9, stiffness: 160}});

  // layout: the chart uses the whole screen between the year and the captions
  const X0 = 90, X1 = 610, Y1 = 470, Y0 = 1350;
  const LABEL_TOP = 440, LABEL_BOTTOM = 1380;
  const allStart = items.map((it) => it.series![0][1]);
  const lo = Math.log(Math.min(...allStart, ...cur) * 0.8);
  const hi = Math.log(Math.max(...cur) * 1.12);
  const x = (tt: number) => X0 + ((tt - t0) / (now - t0 || 1e-6)) * (X1 - X0);
  const y = (v: number) => Y0 - ((Math.log(v) - lo) / (hi - lo || 1)) * (Y0 - Y1);

  const active = !revealed ? (sc.callouts || []).find((c) => t >= c.at && t < c.at + 1.8) : undefined;
  const pop = active ? spring({frame: frame - active.at * fps, fps, config: {damping: 9, stiffness: 200}}) : 0;
  const isMystery = (it: Item) => it.short === sc.mystery;
  const hidden = (it: Item) => isMystery(it) && !revealed;
  const nameOf = (it: Item) => (hidden(it) ? '???' : it.short);
  const color = (i: number) => (isMystery(items[i]) ? T.accent : LINE_COLORS[i % LINE_COLORS.length]);

  // labels (logo + value) in a column on the right: pushed apart, and kept inside the chart area
  const LABEL_H = Math.min(104, (LABEL_BOTTOM - LABEL_TOP) / items.length);
  const order = items.map((_, i) => i).sort((a, b) => cur[b] - cur[a]);
  const ly: number[] = [];
  order.forEach((i, k) => {
    const want = y(cur[i]) - LABEL_H / 2;
    ly[i] = k === 0 ? Math.max(want, LABEL_TOP) : Math.max(want, ly[order[k - 1]] + LABEL_H);
  });
  for (let k = order.length - 1; k >= 0; k--) {
    const limit = k === order.length - 1 ? LABEL_BOTTOM - LABEL_H : ly[order[k + 1]] - LABEL_H;
    ly[order[k]] = Math.min(ly[order[k]], limit);
  }
  const size = Math.min(84, LABEL_H - 12);
  const winnerIdx = items.findIndex(isMystery);
  const mult = winnerIdx >= 0 && items[winnerIdx].start > 0 ? Math.round(items[winnerIdx].end / items[winnerIdx].start) : 0;
  const same = items.every((i) => Math.abs(i.start - items[0].start) < 1e-6);

  return (
    <AbsoluteFill>
      <Background T={T} />
      <div style={{position: 'absolute', top: 205, width: W, textAlign: 'center'}}>
        <div style={{fontFamily: ANTON, fontSize: 150, lineHeight: 1, color: T.text, textShadow: T.shadow}}>{Math.floor(now)}</div>
        {active && (
          <div style={{display: 'inline-block', marginTop: 10, background: T.accent, color: T.onAccent, borderRadius: 999, padding: '8px 30px',
            fontFamily: ANTON, fontSize: 56, textTransform: 'uppercase', transform: `scale(${pop}) rotate(-2deg)`, boxShadow: `0 0 ${40 * T.glow}px ${T.accent}`}}>
            {active.text}
          </div>
        )}
      </div>
      <svg width={W} height={1920} style={{position: 'absolute', top: 0, left: 0}}>
        {niceSteps(Math.exp(lo), Math.exp(hi)).map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1 + 20} y1={y(v)} y2={y(v)} stroke={T.grid} strokeWidth={3} strokeDasharray="10 10" />
            <text x={X0} y={y(v) - 10} fill={T.dim} fontFamily={INTER} fontWeight={800} fontSize={28}>{short(v, p.unit)}</text>
          </g>
        ))}
        {items.map((it, i) => {
          const pts = it.series!.filter((q) => q[0] <= now).map((q) => `${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`);
          pts.push(`${x(now).toFixed(1)},${y(cur[i]).toFixed(1)}`);
          const hl = active && active.item === nameOf(it);
          return (
            <g key={it.short}>
              {isMystery(it) && <polyline points={pts.join(' ')} fill="none" stroke={T.accent} strokeOpacity={0.3} strokeWidth={28} strokeLinejoin="round" strokeLinecap="round" />}
              <polyline points={pts.join(' ')} fill="none" stroke={color(i)} strokeWidth={isMystery(it) || hl ? 12 : 7} strokeLinejoin="round" strokeLinecap="round" />
              <line x1={x(now)} y1={y(cur[i])} x2={X1 + 46} y2={ly[i] + LABEL_H / 2} stroke={color(i)} strokeWidth={3} strokeOpacity={0.8} />
              <circle cx={x(now)} cy={y(cur[i])} r={isMystery(it) ? 13 : 9} fill={color(i)} />
            </g>
          );
        })}
      </svg>
      {items.map((it, i) => {
        const hl = active && active.item === nameOf(it);
        const tile = hidden(it) || (isMystery(it) && t < rv + 0.25)
          ? <MysteryTile size={size} T={T} ring={hl ? T.accent : null} />
          : <Tile it={it} size={size} T={T} ring={isMystery(it) ? T.accent : hl ? T.accent : color(i)} />;
        return (
          <div key={it.short} style={{position: 'absolute', left: X1 + 46, top: ly[i], height: LABEL_H, display: 'flex', alignItems: 'center', gap: 12,
            transform: `scale(${hl ? 1 + 0.12 * pop : isMystery(it) && revealed ? 1 + 0.1 * slam : 1})`, transformOrigin: 'left center'}}>
            <div style={{transform: isMystery(it) ? `perspective(600px) rotateY(${flip}deg)` : undefined}}>{tile}</div>
            <div style={{fontFamily: ANTON, fontSize: size * 0.6, lineHeight: 1, color: isMystery(it) ? T.accent : T.text, textShadow: T.shadow, whiteSpace: 'nowrap'}}>
              {short(cur[i], p.unit)}
            </div>
          </div>
        );
      })}
      <div style={{position: 'absolute', top: 1362, left: X0, width: X1 - X0 + 40, fontFamily: INTER, fontWeight: 600, fontSize: 19, lineHeight: 1.2, color: T.dim}}>{p.sourceLabel}</div>
      {revealed && mult > 0 && (
        <div style={{position: 'absolute', top: 560, left: X0, width: X1 - X0, display: 'flex', justifyContent: 'center'}}>
          <div style={{background: T.accent, color: T.onAccent, borderRadius: 28, padding: '10px 34px', fontFamily: ANTON, fontSize: 150, lineHeight: 1,
            transform: `scale(${2.2 - 1.2 * slam}) rotate(-4deg)`, opacity: Math.min(1, slam * 2), boxShadow: `0 0 60px ${T.accent}`}}>
            {same ? `×${mult.toLocaleString('en-US')}` : short(items[winnerIdx].end, p.unit)}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// The question on top of the race for the first seconds, the race dimmed underneath
const QuestionScene: React.FC<{p: StoryProps; sc: Scene; T: Theme}> = ({p, sc, T}) => {
  const {t} = useSceneTime(sc);
  if (t > sc.end + 0.3 || t < sc.start - 0.05) return null;
  const o = sc.start > 0
    ? interpolate(t, [sc.start, sc.start + 0.35], [0, 1], clamp)   // back at the end, for the loop
    : interpolate(t, [sc.end - 0.15, sc.end + 0.25], [1, 0], clamp);
  const words = p.hook.split(' ');
  return (
    <AbsoluteFill style={{opacity: o}}>
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${T.bg}F5 0%, ${T.bg}D0 40%, ${T.bg}55 70%, ${T.bg}00 100%)`}} />
      <div style={{position: 'absolute', top: 230, left: 80, width: 920, textAlign: 'center', lineHeight: 1}}>
        {words.map((w, i) => (
          <span key={i} style={{display: 'inline-block', margin: '0 12px', fontFamily: ANTON, fontSize: p.hook.length > 46 ? 104 : 120, textTransform: 'uppercase',
            color: /\d|most|best|biggest|richest|mystery/i.test(w) ? T.accent : T.text, textShadow: T.shadow}}>{w}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------- the mascot: our drop, with a face ----------
const Mascot: React.FC<{p: StoryProps; T: Theme}> = ({p, T}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const sc = p.scenes.find((s) => s.mascot && t >= s.start && t < s.end);
  if (!sc) return null;
  const local = t - sc.start;
  const pop = spring({frame: frame - (sc.start + 0.2) * fps, fps, config: {damping: 8, stiffness: 200}});
  const squash = 1 + Math.sin(local * 9) * 0.04;
  const mood = sc.mascot!;
  const eyeY = mood === 'shock' ? 300 : 320;
  const pupil = mood === 'think' ? -12 : 0;
  const mouth =
    mood === 'shock' ? <ellipse cx="200" cy="420" rx="34" ry="44" fill={T.onAccent} /> :
    mood === 'think' ? <path d="M165 425 Q200 410 240 425" stroke={T.onAccent} strokeWidth="16" fill="none" strokeLinecap="round" /> :
    <path d={mood === 'laugh' ? 'M140 395 Q200 490 260 395 Z' : 'M150 405 Q200 455 250 405'} stroke={T.onAccent} strokeWidth="16" fill={mood === 'laugh' ? T.onAccent : 'none'} strokeLinecap="round" />;
  return (
    <div style={{position: 'absolute', left: 50, top: sc.type === 'reveal' || sc.type === 'mascot' ? 420 : 1010, width: 210, height: 273,
      transform: `scale(${pop}) scaleY(${squash})`, transformOrigin: 'bottom center'}}>
      <svg width={210} height={273} viewBox="0 0 400 520">
        <path d="M200 8 C200 8 36 222 36 344 A164 164 0 0 0 364 344 C364 222 200 8 200 8 Z" fill={T.accent} stroke={T.onAccent} strokeWidth="10" />
        <circle cx="145" cy={eyeY} r={mood === 'shock' ? 40 : 32} fill="white" />
        <circle cx="255" cy={eyeY} r={mood === 'shock' ? 40 : 32} fill="white" />
        <circle cx={145 + pupil} cy={eyeY + (mood === 'think' ? -10 : 4)} r="15" fill="#111" />
        <circle cx={255 + pupil} cy={eyeY + (mood === 'think' ? -10 : 4)} r="15" fill="#111" />
        {mouth}
      </svg>
    </div>
  );
};

// ---------- composition ----------
const SCENES: Record<SceneType, React.FC<{p: StoryProps; sc: Scene; T: Theme}>> = {
  hook: HookScene, spotlight: SpotlightScene, versus: VersusScene, race: RaceScene, linerace: LineRaceScene, question: QuestionScene,
  reveal: RevealScene, stat: StatScene, end: EndScene, mascot: () => null,
};

export const StoryReel: React.FC<StoryProps> = (p) => {
  const T = THEMES[p.theme] ?? THEMES.neon;
  const {fps} = useVideoConfig();
  const lr = p.scenes.find((s) => s.type === 'linerace' && s.revealAt);
  const reveal = p.scenes.find((s) => s.type === 'reveal') ?? (lr ? {...lr, start: lr.revealAt!} : undefined);
  const sfx = p.sfx || {};
  return (
    <AbsoluteFill style={{backgroundColor: T.bg}}>
      {p.scenes.map((sc, i) => {
        const S = SCENES[sc.type];
        return <S key={i} p={p} sc={sc} T={T} />;
      })}
      <Mascot p={p} T={T} />
      {reveal && <Flash at={reveal.start + 0.35} />}
      {/* no captions on the hook and end cards: the question is already on screen */}
      <Captions captions={p.captions.filter((c) => !p.scenes.some((sc) => (sc.type === 'hook' || sc.type === 'end' || sc.type === 'question') && c.start >= sc.start - 0.05 && c.start < sc.end))} T={T} top={1415} />
      <LogoBadge T={T} />
      <Progress duration={p.duration} T={T} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.13} loop />}
      {sfx.whoosh && p.scenes.map((sc, i) => (
        <Sequence key={`w${i}`} from={Math.max(0, Math.round((sc.start - 0.06) * fps))} durationInFrames={fps}>
          <Audio src={staticFile(sfx.whoosh!)} volume={0.3} />
        </Sequence>
      ))}
      {sfx.impact && reveal && (
        <Sequence from={Math.round((reveal.start + 0.33) * fps)} durationInFrames={fps * 2}>
          <Audio src={staticFile(sfx.impact)} volume={0.7} />
        </Sequence>
      )}
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
    </AbsoluteFill>
  );
};
