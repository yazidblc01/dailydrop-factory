// ---------- Money to scale, flat: the exact editorial look of EdScale, drawn in 2D (no WebGL).
// The automatic backup when the 3D render fails. Same props and same timeline as EdScale. ----------
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, Em, Grain, Head, MONO, Masthead, PAL, Pal, ProgressRule, Tag, clamp01, lerp, outBack, smooth, useEdFonts} from './kit';
import {EdScaleProps, THINGS, cmOf, height, money} from './Scale';
import {ICONS} from '../icons';

const BILL_MM = 0.109;
const STEPS = [1, 5, 10, 50, 100, 500, 1000];
const tickLabel = (c: number) => (c >= 100 ? `${+(c / 100).toFixed(1)} m` : `${c} cm`);

// a stack of $100 bills: green bands with paper straps, a lighter top face
const Stack2D: React.FC<{P: Pal; x: number; floor: number; w: number; h: number; bandPx: number}> = ({P, x, floor, w, h, bandPx}) => {
  if (h < 0.5) return null;
  const cap = Math.max(4, Math.min(18, w * 0.16));
  const band = Math.max(6, bandPx);
  return (
    <>
      <div style={{position: 'absolute', left: x - w / 2, top: floor - h, width: w, height: h, background: P.money,
        backgroundImage: `repeating-linear-gradient(180deg, rgba(255,255,255,0.10) 0 2px, rgba(0,0,0,0.12) 2px 4px), repeating-linear-gradient(180deg, transparent 0 ${band - 3}px, rgba(0,0,0,0.32) ${band - 3}px ${band}px)`,
        boxShadow: `inset -${Math.max(3, w * 0.14)}px 0 0 rgba(0,0,0,0.14)`}}>
        <div style={{position: 'absolute', left: w * 0.33, width: w * 0.34, top: 0, bottom: 0, background: '#F6EEDB', opacity: 0.9}} />
      </div>
      <div style={{position: 'absolute', left: x - w / 2 - 2, top: floor - h - cap, width: w + 4, height: cap, borderRadius: 2, background: '#b9d8ae', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.15)'}} />
    </>
  );
};
const Shadow: React.FC<{x: number; y: number; w: number; h: number; o: number}> = ({x, y, w, h, o}) => (
  <div style={{position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: '50%',
    background: `radial-gradient(closest-side, rgba(0,0,0,${o}), rgba(0,0,0,${o * 0.4}) 50%, transparent 100%)`}} />
);
const Can2D: React.FC<{P: Pal; x: number; floor: number; h: number}> = ({P, x, floor, h}) => {
  const w = h * 0.54, metal = P.dark ? '#d9dde2' : '#c9ccd1';
  return (
    <div style={{position: 'absolute', left: x - w / 2, top: floor - h, width: w, height: h}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: h * 0.05, bottom: h * 0.04, background: P.accent, borderRadius: w * 0.06, boxShadow: `inset -${w * 0.16}px 0 0 rgba(0,0,0,0.15), inset ${w * 0.1}px 0 0 rgba(255,255,255,0.18)`}} />
      <div style={{position: 'absolute', left: w * 0.08, right: w * 0.08, top: 0, height: h * 0.06, background: metal, borderRadius: '40% 40% 0 0'}} />
      <div style={{position: 'absolute', left: w * 0.06, right: w * 0.06, bottom: 0, height: h * 0.05, background: metal, borderRadius: '0 0 40% 40%'}} />
    </div>
  );
};
const Hoop2D: React.FC<{P: Pal; x: number; floor: number; h: number}> = ({P, x, floor, h}) => {
  const k = h / 352, board = P.dark ? '#f3ebda' : '#fffdf8';
  return (
    <svg width={220 * k} height={h} viewBox="0 0 220 352" style={{position: 'absolute', left: x - 40 * k, top: floor - h, overflow: 'visible'}}>
      <rect x={0} y={342} width={80} height={10} fill={P.ink} />
      <rect x={34} y={20} width={12} height={330} fill={P.ink} />
      <rect x={40} y={36} width={70} height={8} fill={P.ink} />
      <rect x={100} y={0} width={14} height={110} fill={board} stroke={P.ink} strokeWidth={3} />
      <rect x={114} y={44} width={100} height={6} fill={P.accent} />
      <path d="M118 50 L134 92 L194 92 L210 50" fill="none" stroke={P.ink} strokeWidth={1.5} opacity={0.55} />
    </svg>
  );
};
const Sil2D: React.FC<{icon: string; x: number; floor: number; h: number; fill: string}> = ({icon, x, floor, h, fill}) => (
  <svg viewBox="2 2 20 20" width={h} height={h} preserveAspectRatio="xMidYMax meet" style={{position: 'absolute', left: x - h / 2, top: floor - h}}><path d={ICONS[icon]} fill={fill} /></svg>
);

export const EdScaleFlat: React.FC<EdScaleProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const P = PAL[p.pal];

  // growth: identical to EdScale (log scale, lingering a little at each thing)
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

  const diveAt = p.growEnd + 1.2, backAt = diveAt + 3.0;
  const dive = smooth(diveAt, diveAt + 0.9, t) * (1 - smooth(backAt, backAt + 1.0, t));
  const both = smooth(backAt, backAt + 1.0, t);
  const loserX = Math.max(finalCm * 0.58, 60);
  const stackW = (h: number) => Math.min(80, Math.max(15.6, h * 0.21));

  // the view in cm, mapped flat onto the frame
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
  const K = 900 / view.h;                                    // px per cm
  const shake = pulse * 5;
  const X = (x: number) => 540 + (x - view.cx) * K + Math.sin(t * 57) * shake;
  const Y = (y: number) => 960 - (y - view.cy) * K + Math.cos(t * 49) * shake;
  const floor = Y(0);

  // printed height lines
  const j = Math.max(1, STEPS.findIndex((st) => st * K >= 120));
  const coarse = STEPS[j] ?? 1000, fine = STEPS[j - 1] ?? 500;
  const fineO = smooth(40, 90, fine * K);
  const ticks: {c: number; o: number; lab: number}[] = [];
  for (let c = fine; c <= view.h * 0.86; c += fine) {
    const isC = Math.abs(c / coarse - Math.round(c / coarse)) < 1e-6;
    if (isC) ticks.push({c, o: 1, lab: 1});
    else if (fineO > 0.02) ticks.push({c, o: fineO * 0.6, lab: smooth(70, 110, fine * K)});
  }
  const wallK = (1 - dive) * smooth(p.growStart - 0.5, p.growStart + 0.5, t);

  const hookK = 1 - smooth(p.growStart - 0.6, p.growStart, t);
  const liveK = smooth(p.growStart - 0.2, p.growStart + 0.4, t) * (1 - clamp01(dive * 3)) * (1 - both);
  const endK = smooth(backAt + 0.5, backAt + 1.2, t);
  const w = stackW(nowCm);
  const bandPx = 1.09 * K * Math.max(1, nowCm / 1.09 / 22);  // a $10,000 strap every 1.09 cm, thinned out when tiny

  // things: same rules as the 3D for when each one shows
  const things = THINGS.map((o) => {
    const r = o.h / nowCm, lim = o.h > 400 ? 1.4 : 1.6;
    if (r > lim || r < 0.02 || o.h > finalCm || dive > 0.45 || (both > 0 && r > 1)) return null;
    const pt = passes.find((x) => x.o.key === o.key);
    const hop = pt && t > pt.at ? Math.max(0, Math.sin((t - pt.at) * 9)) * Math.exp(-(t - pt.at) * 4) * o.h * 0.1 : 0;
    const sIn = outBack(smooth(lim, lim * 0.84, r), 1.2);
    return {o, hop, sIn, r};
  }).filter(Boolean) as {o: typeof THINGS[number]; hop: number; sIn: number; r: number}[];

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.46} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.28} loop />}
      {passes.map((x, i) => <Sequence key={i} from={Math.round(x.at * fps)} durationInFrames={14}><Audio src={staticFile('sfx/pop.wav')} volume={0.85} /></Sequence>)}
      <Sequence from={Math.round(diveAt * fps)} durationInFrames={22}><Audio src={staticFile('sfx/thud.wav')} volume={0.9} /></Sequence>

      {/* height chart */}
      <div style={{opacity: wallK * (1 - both)}}>
        {ticks.map((k) => {
          const y = Y(k.c);
          if (y < 735 || y > floor - 4) return null;
          return (
            <React.Fragment key={k.c}>
              <div style={{position: 'absolute', left: 84, width: 912, top: y, height: k.lab > 0.9 ? 2 : 1, background: P.ink, opacity: 0.22 * k.o}} />
              {k.lab > 0.02 && y < 1400 && <div style={{position: 'absolute', left: 84, top: y - 30, fontFamily: MONO, fontWeight: 500, fontSize: 21, color: P.mute, opacity: k.o * k.lab}}>{tickLabel(k.c)}</div>}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 0, width: 1080, top: floor, height: 3, background: P.ink, opacity: 0.5 * (1 - dive * 0.6)}} />

      {/* shadows, things, stacks */}
      <Shadow x={X(0)} y={floor + 2} w={Math.max(40, w * K * 2.4)} h={Math.max(14, w * K * 0.4)} o={0.3} />
      {things.map(({o, hop, sIn, r}) => {
        const h = o.h * K * sIn, x = X(o.x), f = floor - hop * K;
        return (
          <React.Fragment key={o.key}>
            <Shadow x={x + (o.key === 'hoop' ? h * 0.2 : 0)} y={floor + 2} w={h * 0.8} h={Math.max(10, h * 0.08)} o={0.22 * sIn} />
            {o.key === 'can' ? <Can2D P={P} x={x} floor={f} h={h} /> : o.key === 'hoop' ? <Hoop2D P={P} x={x} floor={f} h={h} /> : <Sil2D icon={o.icon!} x={x} floor={f} h={h} fill={P.ink} />}
          </React.Fragment>
        );
      })}
      <Stack2D P={P} x={X(0)} floor={floor} w={w * K} h={nowCm * K} bandPx={bandPx} />
      {(dive > 0 || both > 0) && (
        <>
          <Shadow x={X(loserX)} y={floor + 2} w={15.6 * K * 2.4} h={Math.max(10, 15.6 * K * 0.4)} o={0.3} />
          <Stack2D P={P} x={X(loserX)} floor={floor} w={15.6 * K} h={loserCm * K} bandPx={1.09 * K} />
          {both < 0.6 && <Can2D P={P} x={X(loserX + 17)} floor={floor} h={12.2 * K} />}
        </>
      )}
      {/* bills dropping onto the stack while it grows */}
      {!done && t > p.growStart && Array.from({length: 5}, (_, i) => {
        const ph = (t * 1.5 + i / 5) % 1, bw = w * K;
        const x = X(0) + (Math.sin(i * 12.9) * 0.6) * bw * (1 - ph), y = Y(nowCm) - (1 - ph) * (60 + i * 14) - 6;
        return <div key={i} style={{position: 'absolute', left: x - bw / 2, top: y, width: bw, height: Math.max(3, bw * 0.12), background: '#b9d8ae', opacity: Math.min(1, ph * 4),
          transform: `rotate(${Math.sin(t * 5 + i) * 25 * (1 - ph)}deg)`, boxShadow: '0 2px 3px rgba(0,0,0,0.12)'}} />;
      })}

      {/* name tags */}
      {THINGS.map((o) => {
        const r = o.h / nowCm;
        const vis = smooth(1.6, 1.4, r) * smooth(0.55, 0.8, r) * (1 - clamp01(dive * 3)) * (1 - both);
        if (vis < 0.02 || o.h > finalCm) return null;
        const y = Y(o.h * 1.03) - 56;
        if (y < 700) return null;
        return <Tag key={o.key} P={P} x={Math.min(790, Math.max(290, X(o.x)))} y={y} opacity={vis} solid={r >= 1}>{o.name.replace(/^an? /, '').toUpperCase()} · {height(o.h).toUpperCase()}</Tag>;
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
          <div style={{fontFamily: P.display, fontStyle: P.dItalic ? 'italic' : 'normal', fontWeight: P.dWeight, fontSize: P.dItalic ? 62 : 52, color: P.ink, letterSpacing: P.dTrack + 'em'}}>Shorter than {(THINGS.find((o) => o.h > loserCm) ?? THINGS[THINGS.length - 1]).name}.</div>
        </div>
      )}
      {endK > 0.02 && (
        <>
          <Head P={P} top={372} size={P.dItalic ? 92 : 78} style={{opacity: endK}}>Same $10,000. Same {p.years[1] - p.years[0]} years. <Em P={P}>{height(finalCm)} against {height(loserCm)}.</Em></Head>
          <Tag P={P} x={Math.max(290, X(0))} y={Y(finalCm) - 72} opacity={endK} solid>{p.hero.label.toUpperCase()} · {money(p.hero.value)}</Tag>
          <Tag P={P} x={Math.min(780, X(loserX))} y={Y(loserCm) - 74} opacity={endK}>{p.loser.label.toUpperCase()} · {money(p.loser.value)}</Tag>
        </>
      )}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
