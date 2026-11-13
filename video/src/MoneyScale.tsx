import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {Background, LogoBadge, Progress, THEMES, ThemeName, Theme} from './RankingReveal';

// ---------- Money to scale v4: one continuous zoom-out. The stack grows, the world shrinks around it. ----------
// Objects stand in a lineup at real height and slide in and out smoothly. A ruler on the left keeps the scale honest.
// A $100 bill is 0.109 mm thick. Every object is drawn at its real height, so the comparison is honest.

const ANTON = 'Anton';
const INTER = 'Inter';
const W = 1080;
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const BILL_MM = 0.109;

export type MSStack = {label: string; value: number};
export type MSProps = {
  theme: ThemeName;
  duration: number;
  kicker: string;          // "$10,000 IN NVIDIA IN 2015"
  question: string;        // "How tall is it now, in $100 bills?"
  hero: MSStack;
  loser: MSStack;          // the comparison at the end
  years: [number, number];
  series: number[][];      // [u 0..1, value]
  sourceLabel: string;
  growStart: number;
  growEnd: number;
  compareAt: number;
  music?: string | null;    // "music/take-off.mp3"
  musicStart?: number;
};

const cm = (value: number) => (value / 100) * BILL_MM / 10;
const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const height = (c: number) => (c >= 100 ? `${(c / 100).toFixed(2)} m` : c >= 1 ? `${c.toFixed(1)} cm` : `${(c * 10).toFixed(1)} mm`);

// Real heights, in cm. Generic shapes, no brands.
type Obj = {key: string; name: string; h: number; w: number; draw: (w: number, h: number) => React.ReactNode};
const FILL = 'rgba(255,255,255,0.88)';
const OBJECTS: Obj[] = [
  {key: 'can', name: 'a soda can', h: 12.2, w: 6.6, draw: (w, h) => (
    <svg width={w} height={h} viewBox="0 0 66 122" preserveAspectRatio="none">
      <rect x="3" y="8" width="60" height="108" rx="6" fill="#ef4444" /><rect x="6" y="2" width="54" height="10" rx="4" fill="#d1d5db" />
      <rect x="6" y="112" width="54" height="8" rx="4" fill="#d1d5db" /><rect x="3" y="46" width="60" height="22" fill="rgba(255,255,255,0.85)" />
    </svg>)},
  {key: 'cat', name: 'a cat', h: 30, w: 20, draw: (w, h) => (
    <svg width={w} height={h} viewBox="0 0 26 30" preserveAspectRatio="none">
      <path d="M20 29 C27 29 26 21 22.5 19" stroke="#cbd5e1" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M5 30 C3.5 24 5 18.5 9 16.5 L17 16.5 C21 18.5 22.5 24 21 30 Z" fill="#cbd5e1" />
      <path d="M7.4 9 L7.6 2.2 L11.6 6 Z M18.6 9 L18.4 2.2 L14.4 6 Z" fill="#cbd5e1" />
      <ellipse cx="13" cy="11" rx="6.4" ry="5.8" fill="#cbd5e1" />
      <ellipse cx="10.6" cy="10.6" rx="0.9" ry="1.3" fill="#1f2937" /><ellipse cx="15.4" cy="10.6" rx="0.9" ry="1.3" fill="#1f2937" />
      <path d="M12.3 13 L13.7 13 L13 13.8 Z" fill="#f472b6" />
    </svg>)},
  {key: 'hydrant', name: 'a fire hydrant', h: 76, w: 40, draw: (w, h) => (
    <svg width={w} height={h} viewBox="0 0 40 76" preserveAspectRatio="none">
      <path d="M12 8 C12 2 28 2 28 8 Z" fill="#facc15" /><rect x="9" y="8" width="22" height="6" rx="2" fill="#facc15" />
      <rect x="11" y="14" width="18" height="54" rx="3" fill="#facc15" /><rect x="3" y="28" width="34" height="9" rx="4" fill="#facc15" />
      <rect x="7" y="68" width="26" height="8" rx="2" fill="#eab308" />
    </svg>)},
  {key: 'person', name: 'a grown man', h: 178, w: 52, draw: (w, h) => (
    <svg width={w} height={h} viewBox="0 0 52 178" preserveAspectRatio="none">
      <circle cx="26" cy="13" r="12" fill={FILL} />
      <path d="M10 30 C10 27 14 26 18 26 L34 26 C38 26 42 27 42 30 L48 88 C48 92 42 92 41 88 L37 52 L37 172 C37 178 29 178 29 172 L28 108 L24 108 L23 172 C23 178 15 178 15 172 L15 52 L11 88 C10 92 4 92 4 88 Z" fill={FILL} />
    </svg>)},
  {key: 'hoop', name: 'a basketball hoop', h: 305, w: 120, draw: (w, h) => (
    <svg width={w} height={h} viewBox="0 0 120 305" preserveAspectRatio="none">
      <rect x="14" y="20" width="8" height="285" fill="#9ca3af" /><rect x="18" y="0" width="70" height="46" rx="3" fill="#f9fafb" />
      <rect x="40" y="16" width="26" height="20" fill="none" stroke="#ef4444" strokeWidth="3" />
      <ellipse cx="66" cy="44" rx="22" ry="5" fill="none" stroke="#f97316" strokeWidth="4" />
      <path d="M46 46 L52 70 M58 48 L60 72 M70 48 L68 72 M84 46 L78 70" stroke="#e5e7eb" strokeWidth="2" />
    </svg>)},
  {key: 'giraffe', name: 'a giraffe', h: 550, w: 260, draw: (w, h) => (
    <svg width={w} height={h} viewBox="0 0 260 550" preserveAspectRatio="none">
      <path d="M150 20 L178 6 L186 14 L172 40 L168 250 C200 262 236 270 240 300 L240 550 L224 550 L220 380 L120 380 L114 550 L98 550 L94 340 C90 300 120 270 140 250 L144 50 Z" fill="#f59e0b" />
      <circle cx="150" cy="40" r="5" fill="#78350f" /><circle cx="190" cy="330" r="12" fill="#b45309" /><circle cx="140" cy="320" r="10" fill="#b45309" />
    </svg>)},
  {key: 'house', name: 'a two story house', h: 800, w: 900, draw: (w, h) => (
    <svg width={w} height={h} viewBox="0 0 900 800" preserveAspectRatio="none">
      <path d="M40 330 L450 20 L860 330 Z" fill="#9f1239" /><rect x="100" y="320" width="700" height="480" fill="#e5e7eb" />
      <rect x="180" y="400" width="140" height="120" fill="#60a5fa" /><rect x="580" y="400" width="140" height="120" fill="#60a5fa" />
      <rect x="400" y="580" width="110" height="220" fill="#7c2d12" />
    </svg>)},
];

const Stack: React.FC<{px: number; w: number; x: number; base: number; glow?: string}> = ({px, w, x, base, glow}) => {
  const top = Math.max(8, Math.min(26, w * 0.1));
  const h = Math.max(3, px);
  const strap = Math.max(4, px / Math.max(1, Math.round(h / 22))); // paper bands, about every 22 px
  return (
    <div style={{position: 'absolute', left: x, top: base - h - top, width: w + top, height: h + top}}>
      <div style={{position: 'absolute', left: top, top: 0, width: w, height: top, background: 'linear-gradient(90deg,#a7d8a0,#d5f0c9 50%,#a7d8a0)',
        transform: 'skewX(-45deg)', transformOrigin: 'bottom left', borderRadius: 2}} />
      <div style={{position: 'absolute', left: w, top: top / 2, width: top, height: h, background: '#2e6b34', transform: 'skewY(-45deg)', transformOrigin: 'top left'}} />
      <div style={{position: 'absolute', left: 0, top, width: w, height: h, overflow: 'hidden', borderRadius: 2,
        background: `repeating-linear-gradient(0deg, #4f9b55 0px, #6fbf6f 1px, #3f8547 2px, #6aba6a 3px)`,
        boxShadow: glow ? `0 0 80px ${glow}` : '0 20px 40px rgba(0,0,0,0.5)'}}>
        <div style={{position: 'absolute', inset: 0, background: `repeating-linear-gradient(0deg, transparent 0px, transparent ${strap - 2}px, rgba(0,0,0,0.22) ${strap - 2}px, rgba(0,0,0,0.22) ${strap}px)`}} />
        <div style={{position: 'absolute', left: w * 0.38, width: w * 0.24, top: 0, bottom: 0,
          background: 'linear-gradient(90deg, #e9dfb8, #fff6d6 50%, #e9dfb8)', opacity: 0.92}} />
      </div>
    </div>
  );
};

const valueAt = (pts: number[][], u: number) => {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const [t0, v0] = pts[i - 1];
      const [t1, v1] = pts[i];
      const k = (u - t0) / (t1 - t0 || 1);
      return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * k);
    }
  }
  return pts[pts.length - 1][1];
};

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const tickLabel = (c: number) => (c >= 100 ? `${+(c / 100).toFixed(1)} m` : `${+c.toFixed(1)} cm`);
const STEPS = [1, 5, 10, 50, 100, 500, 1000];  // each step divides the next, so coarse ticks never move

export const MoneyScale: React.FC<MSProps> = (p) => {
  const T = THEMES[p.theme] ?? THEMES.money;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  // ----- growth: one smooth curve on a log scale, slowing down a little around each object it passes -----
  const finalCm = cm(p.hero.value);
  const startCm = cm(p.series[0][1]);
  const L0 = Math.log(startCm), L1 = Math.log(finalCm);
  const goals = OBJECTS.filter((o) => o.h > startCm && o.h < finalCm);
  const marks = goals.map((o) => (Math.log(o.h) - L0) / (L1 - L0));
  const N = 400;
  const cum: number[] = [0];
  for (let i = 1; i <= N; i++) {
    const u = (i - 0.5) / N;
    let d = 1 + 1.4 * Math.exp(-((u / 0.07) ** 2)) + 1.6 * Math.exp(-(((1 - u) / 0.08) ** 2)); // ease in and out
    for (const m of marks) d += 1.5 * Math.exp(-(((u - m) / 0.035) ** 2)); // linger a bit on each pass
    cum.push(cum[i - 1] + d);
  }
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
  const v = (nowCm * 10 / BILL_MM) * 100;
  let uYear = 1;
  for (let i = 0; i <= 200; i++) if (valueAt(p.series, i / 200) >= v) { uYear = i / 200; break; }
  const year = Math.round(p.years[0] + (p.years[1] - p.years[0]) * uYear);
  const done = t >= p.growEnd;
  const compare = interpolate(t, [p.compareAt, p.compareAt + 1.1], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});

  // ----- camera: always frames the stack with headroom, so it never jumps -----
  const BASE = 1320;
  const ROOM = 640;
  const growPx = ROOM / Math.max(14, nowCm * 1.6);
  const finalPx = 540 / finalCm;
  const pxPerCm = growPx + (finalPx - growPx) * compare;

  // ----- the lineup: objects near the stack's size, fading in as they come into frame and out once they are tiny -----
  const stackW = 200;
  const stackX = interpolate(compare, [0, 1], [215, 170]);
  const LINE_X = 500, LINE_END = 965;
  const lineup = goals.map((o) => {
    const r = o.h / nowCm;
    const wgt = smooth(1.75, 1.35, r) * smooth(0.05, 0.11, r) * (1 - compare);
    return {o, r, wgt, w: o.w * pxPerCm, h: o.h * pxPerCm};
  }).filter((x) => x.wgt > 0.01);
  const need = lineup.reduce((a, x) => a + (x.w + 28) * x.wgt, 0);
  // the row starts after the stack; if it is too wide it shifts left (into the gap), never off the right edge
  let cx = Math.max(stackX + stackW + 50, Math.min(LINE_X, LINE_END - need + 28));
  const placed = lineup.map((x) => {
    const at = cx;
    cx += (x.w + 28) * x.wgt;
    return {...x, x: Math.min(at, LINE_END - x.w)};
  });
  const nextObj = placed.find((x) => x.r > 1);

  // ----- "taller than" moments -----
  const passes = goals.map((o, i) => ({o, at: timeOfU(marks[i])}));
  const pass = [...passes].reverse().find((x) => t >= x.at && t < x.at + 1.25);
  const pk = pass ? t - pass.at : 0;
  const callIn = pass ? smooth(0, 0.22, pk) : 0;
  const callOut = pass ? 1 - smooth(0.95, 1.25, pk) : 0;
  const glowPulse = pass ? Math.exp(-pk * 3) : 0;

  // ----- ruler ticks: several step sizes, each fading by how far apart its ticks are on screen -----
  const topCm = (BASE - 560) / pxPerCm;
  const ticks: {c: number; o: number; label: number}[] = [];
  const j = Math.max(1, STEPS.findIndex((st) => st * pxPerCm >= 120));
  const coarse = STEPS[j], fine = STEPS[j - 1];
  const fineO = smooth(40, 90, fine * pxPerCm);
  for (let c = fine; c <= topCm; c += fine) {
    const isCoarse = Math.abs(c / coarse - Math.round(c / coarse)) < 1e-6;
    if (isCoarse) ticks.push({c, o: 1, label: 1});
    else if (fineO > 0.02) ticks.push({c, o: fineO * 0.7, label: smooth(70, 110, fine * pxPerCm)});
  }

  const falling = !done && t > p.growStart ? [0, 1, 2].map((i) => {
    const ph = (t * 1.3 + i / 3) % 1;
    return {x: stackX + 20 + ((i * 61) % 150), y: BASE - nowCm * pxPerCm - 170 + ph * 150, r: (i * 47 + t * 80) % 360, o: Math.sin(ph * Math.PI)};
  }) : [];

  const hookOn = t < p.growStart - 0.3;
  const hookK = smooth(p.growStart - 0.6, p.growStart, t);
  const stackTop = BASE - nowCm * pxPerCm;

  return (
    <AbsoluteFill style={{fontFamily: INTER}}>
      <Background T={T} />
      <Progress duration={p.duration} T={T} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.3} startFrom={Math.round((p.musicStart || 0) * fps)} loop />}
      {passes.map((x, i) => (
        <Sequence key={`pop${i}`} from={Math.round(x.at * fps)} durationInFrames={Math.round(0.4 * fps)}>
          <Audio src={staticFile('sfx/pop.wav')} volume={0.8} />
        </Sequence>
      ))}
      <Sequence from={Math.round(p.compareAt * fps)} durationInFrames={Math.round(0.7 * fps)}>
        <Audio src={staticFile('sfx/thud.wav')} volume={0.9} />
      </Sequence>
      {glowPulse > 0.01 && <AbsoluteFill style={{background: `radial-gradient(60% 40% at 30% 70%, ${T.good}, transparent 70%)`, opacity: glowPulse * 0.22}} />}

      {/* header */}
      <div style={{position: 'absolute', top: 292, left: 110, width: 860, textAlign: 'center'}}>
        <div style={{display: 'inline-block', fontFamily: ANTON, fontSize: interpolate(hookK, [0, 1], [92, 46]), lineHeight: 1.05, color: T.text,
          letterSpacing: 1, padding: hookK > 0.5 ? '6px 22px' : 0, borderRadius: 14, background: hookK > 0.5 ? 'rgba(255,255,255,0.08)' : 'transparent'}}>
          {p.kicker}
        </div>
        {hookOn && <div style={{fontFamily: INTER, fontWeight: 800, fontSize: 50, color: T.accent, marginTop: 24, opacity: 1 - hookK}}>{p.question}</div>}
      </div>

      {!hookOn && (
        <div style={{position: 'absolute', top: 372, left: 110, width: 860, textAlign: 'center', opacity: hookK * (1 - compare)}}>
          <div style={{fontFamily: ANTON, fontSize: 120, lineHeight: 1.0, color: done ? T.good : T.accent, textShadow: `0 0 40px ${done ? T.good : T.accent}44`,
            fontVariantNumeric: 'tabular-nums'}}>{height(nowCm)}</div>
          <div style={{display: 'inline-flex', gap: 14, marginTop: 10, fontFamily: INTER, fontWeight: 800, fontSize: 34, color: T.text, fontVariantNumeric: 'tabular-nums'}}>
            <span style={{padding: '4px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.10)'}}>{year}</span>
            <span style={{padding: '4px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.10)'}}>{money(v)}</span>
          </div>
        </div>
      )}

      {/* ruler */}
      <div style={{opacity: 1 - compare}}>
        {ticks.map((k, i) => {
          const y = BASE - k.c * pxPerCm;
          return (
            <div key={i} style={{position: 'absolute', left: 110, top: y, width: 860, opacity: k.o}}>
              <div style={{position: 'absolute', left: 0, top: 0, width: 860, borderTop: '1px solid rgba(255,255,255,0.09)'}} />
              {k.label > 0.02 && <div style={{position: 'absolute', left: 0, top: -30, fontFamily: INTER, fontWeight: 700, fontSize: 21,
                color: 'rgba(255,255,255,0.5)', opacity: k.label, fontVariantNumeric: 'tabular-nums'}}>{tickLabel(k.c)}</div>}
            </div>
          );
        })}
      </div>

      {/* ground */}
      <div style={{position: 'absolute', left: 110, width: 860, top: BASE, height: 120, background: 'linear-gradient(180deg, rgba(255,255,255,0.07), transparent)'}} />
      <div style={{position: 'absolute', left: 110, width: 860, top: BASE, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.45)'}} />

      {/* lineup of real things */}
      {placed.map(({o, x, w, h, wgt, r}) => (
        <div key={o.key} style={{position: 'absolute', left: x, top: BASE - h, width: w, height: h,
          opacity: wgt * (r < 1 ? 0.5 : 0.95), filter: r < 1 ? 'saturate(0.4)' : 'none'}}>
          {o.draw(w, h)}
        </div>
      ))}
      {nextObj && !done && (
        <div style={{opacity: nextObj.wgt}}>
          <div style={{position: 'absolute', left: stackX, top: BASE - nextObj.h, width: nextObj.x + nextObj.w - stackX, borderTop: '3px dashed rgba(255,255,255,0.35)'}} />
          <div style={{position: 'absolute', left: 300, width: Math.max(0, nextObj.x + nextObj.w - 300), top: BASE - nextObj.h - 38, textAlign: 'right',
            fontFamily: INTER, fontWeight: 800, fontSize: 24, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap'}}>
            {o_name(nextObj.o.name)}, {height(nextObj.o.h)}
          </div>
        </div>
      )}

      {/* the stack */}
      <Stack px={nowCm * pxPerCm} w={stackW} x={stackX} base={BASE} glow={done || glowPulse > 0.05 ? `${T.good}${done ? '66' : '44'}` : undefined} />
      {falling.map((b, i) => (
        <div key={i} style={{position: 'absolute', left: b.x, top: b.y, width: 76, height: 34, borderRadius: 4, background: '#7cc47c',
          border: '2px solid #2e6b34', transform: `rotate(${b.r}deg)`, opacity: b.o * 0.9}} />
      ))}
      <div style={{position: 'absolute', left: stackX, width: stackW + 20, top: BASE + 14, textAlign: 'center', fontFamily: INTER, fontWeight: 900,
        fontSize: 32, color: T.text}}>{p.hero.label}</div>

      {/* taller than */}
      {pass && callIn * callOut > 0.01 && (
        <div style={{position: 'absolute', top: 566, left: 110, width: 860, display: 'flex', justifyContent: 'center'}}>
          <div style={{transform: `translateY(${(1 - callIn) * 24}px) scale(${1.1 - 0.1 * callIn})`, opacity: callIn * callOut,
            background: T.good, color: '#04110A', borderRadius: 18, padding: '6px 26px', fontFamily: ANTON, fontSize: 52, letterSpacing: 1.5, whiteSpace: 'nowrap',
            boxShadow: `0 10px 40px ${T.good}55`}}>
            TALLER THAN {pass.o.name.toUpperCase()}
          </div>
        </div>
      )}

      {/* the end: same money in the worst pick */}
      {compare > 0 && (() => {
        const lc = cm(p.loser.value);
        const lpx = Math.max(4, lc * pxPerCm);
        const hTop = BASE - finalCm * pxPerCm;
        const tag = (text: string, color: string, x: number, y: number) => (
          <div style={{position: 'absolute', left: x - 60, width: stackW + 140, top: y - 118, textAlign: 'center', opacity: smooth(0.5, 1, compare)}}>
            <span style={{display: 'inline-block', fontFamily: ANTON, fontSize: 50, color, padding: '2px 18px', borderRadius: 14,
              background: 'rgba(0,0,0,0.35)', border: `2px solid ${color}66`, fontVariantNumeric: 'tabular-nums'}}>{text}</span>
          </div>
        );
        return (
          <>
            <div style={{position: 'absolute', top: 372, left: 110, width: 860, textAlign: 'center', opacity: compare}}>
              <div style={{fontFamily: ANTON, fontSize: 100, lineHeight: 1.0, color: T.text}}>
                <span style={{color: T.good}}>{height(finalCm)}</span> <span style={{fontSize: 60, color: T.dim}}>VS</span> <span style={{color: T.bad}}>{height(lc)}</span>
              </div>
              <div style={{fontFamily: INTER, fontWeight: 800, fontSize: 34, color: T.dim, marginTop: 10}}>same money, {p.hero.label} vs {p.loser.label}</div>
            </div>
            {tag(money(p.hero.value), T.good, stackX, hTop)}
            <div style={{opacity: compare}}>
              <Stack px={lpx} w={stackW} x={600} base={BASE} />
              <div style={{position: 'absolute', left: 600, width: stackW + 20, top: BASE + 14, textAlign: 'center', fontFamily: INTER,
                fontWeight: 900, fontSize: 32, color: T.dim}}>{p.loser.label}</div>
            </div>
            {tag(money(p.loser.value), T.bad, 600, BASE - lpx - 20)}
          </>
        );
      })()}

      <div style={{position: 'absolute', top: 1392, left: 110, width: 860, textAlign: 'center', fontFamily: INTER, fontWeight: 600, fontSize: 22, color: T.dim}}>
        {p.sourceLabel}
      </div>
      <LogoBadge T={T} />
    </AbsoluteFill>
  );
};

const o_name = (n: string) => n.replace(/^an? /, '');
