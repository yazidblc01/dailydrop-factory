// ---------- Explainer engine (engine/explain.py builds the props) ----------
// The same storytelling as the map reels (MapV), on any canvas: a world of elements (paths, shapes, text, arrows, counters,
// spinning groups, a dot that travels along a route) and a story in beats. Each beat moves the camera (optional 3D tilt),
// swaps the headline (one word on a highlighter swipe), shows its caption, reveals elements (fade, draw-on, wipe, pop),
// pulses some, hides others, and can slam a stat card that counts up. Layout matches MapV: headline 250-520 on a dark fade,
// stat card 1460-1690, caption under it.
import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, clamp01, lerp, outBack, outCubic, smooth, useEdFonts} from './kit';

type El = {id: string; type: string; anim?: string; dur?: number; delay?: number; [k: string]: any};
type Card = {big: string; line: string; myth?: string; src?: string};
type Beat = {say: string; head: [string, string, string]; cam: [number, number, number]; tilt?: number; show?: string[]; hide?: string[];
  pulse?: string[]; card?: Card; ask?: boolean; stagger?: number; start: number; end: number};
export type EdExplainProps = {els: El[]; base: string[]; beats: Beat[]; theme: {bg: string; accent: string; fade: string; stars?: boolean};
  voice: string | null; music: string | null; outroAt: number; duration: number};

const CX = 540, CY = 1020, INK = '#111';
const ANTON = 'Anton';
const FONT: Record<string, string> = {anton: ANTON, sans: SANS, serif: 'Fraunces'};

const useExtraFonts = () => {
  const [handle] = useState(() => delayRender('explain fonts'));
  useEffect(() => {
    const faces = [new FontFace(ANTON, `url(${staticFile('fonts/anton-latin-400-normal.woff2')})`, {weight: '400'}),
      new FontFace('Inter', `url(${staticFile('fonts/inter-latin-900-normal.woff2')})`, {weight: '900'})];
    Promise.all(faces.map((f) => f.load())).then((l) => { l.forEach((f) => (document.fonts as any).add(f)); continueRender(handle); });
  }, [handle]);
};

// "−$526", "5.26%", "380,010", "5M": prefix, number, decimals, suffix
const parseNum = (s: string) => {
  const m = s.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
  if (!m) return null;
  const raw = m[2].replace(/,/g, '');
  return {pre: m[1], n: parseFloat(raw), dec: raw.includes('.') ? raw.split('.')[1].length : 0, comma: m[2].includes(','), suf: m[3]};
};
const fmtNum = (v: number, dec: number, comma: boolean) => comma ? v.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec}) : v.toFixed(dec);

// a point along a polyline, k in 0..1
const along = (pts: [number, number][], k: number): [number, number] => {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let d = clamp01(k) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? d / seg[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)]; }
    d -= seg[i];
  }
  return pts[pts.length - 1];
};

export const EdExplain: React.FC<EdExplainProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  useExtraFonts();
  const B = p.beats;
  const found = B.findIndex((b) => t < b.end);
  const bi = found === -1 ? B.length - 1 : found;
  const cur = B[bi], prev = B[Math.max(0, bi - 1)];
  const since = t - cur.start;
  const mv = bi === 0 ? 1 : smooth(0, 1.1, since);
  const drift = 1 + 0.012 * Math.max(0, since);
  const z = lerp(prev.cam[2], cur.cam[2], mv) * drift;
  const cx = lerp(prev.cam[0], cur.cam[0], mv), cy = lerp(prev.cam[1], cur.cam[1], mv);
  const tilt = lerp(prev.tilt ?? 0, cur.tilt ?? 0, mv);
  const fade = 1 - smooth(p.outroAt - 0.2, p.outroAt, t);
  const intro = smooth(0, 0.8, t);

  // when each element appears (its first beat's start, plus its delay and the beat's stagger) and leaves
  const appear: Record<string, number> = {}, leave: Record<string, number> = {};
  p.base.forEach((id) => (appear[id] = 0));
  B.forEach((b) => {
    (b.show ?? []).forEach((id, i) => { if (!(id in appear)) appear[id] = b.start + 0.25 + i * (b.stagger ?? 0.12); });
    (b.hide ?? []).forEach((id) => { if (id in appear && !(id in leave) && appear[id] < b.start + 0.01) leave[id] = b.start; });
  });
  const pulseOn = new Set(cur.pulse ?? []);
  const sw = (w: number) => w / z;

  const render = (e: El): React.ReactNode => {
    const a0 = (appear[e.id] ?? Infinity) + (e.delay ?? 0);
    if (t < a0) return null;
    const dur = e.dur ?? (e.anim === 'draw' || e.anim === 'wipe' ? 1.1 : 0.35);
    const k = clamp01((t - a0) / dur);
    const out = e.id in leave ? 1 - smooth(leave[e.id], leave[e.id] + 0.4, t) : 1;
    if (out <= 0) return null;
    const anim = e.anim ?? 'fade';
    const op = (anim === 'fade' ? smooth(0, 1, k) : anim === 'pop' ? clamp01(k * 3) : 1) * out * (e.opacity ?? 1);
    const pulse = pulseOn.has(e.id) ? Math.sin((t - cur.start) * 6) : null;
    const glow = pulse !== null ? 'url(#glow)' : e.glow ? 'url(#glow)' : undefined;
    const c = e.c ?? [e.cx ?? e.x ?? 0, e.cy ?? e.y ?? 0];
    const pop = anim === 'pop' ? outBack(k, 2.2) : 1;
    const ps = pulse !== null ? 1 + 0.04 * (pulse + 1) : 1;
    const wrap = (node: React.ReactNode) => (pop !== 1 || ps !== 1)
      ? <g key={e.id} transform={`translate(${c[0]},${c[1]}) scale(${pop * ps}) translate(${-c[0]},${-c[1]})`} opacity={op}>{node}</g>
      : <g key={e.id} opacity={op}>{node}</g>;
    const stroke = e.stroke ?? 'none', strokeW = e.sw ?? 0;
    switch (e.type) {
      case 'path': {
        const draw = anim === 'draw' ? {pathLength: 1, style: {strokeDasharray: 1, strokeDashoffset: 1 - smooth(0, 1, k)}} : {};
        const fill = e.hatch ? 'url(#hatch)' : e.fill ?? 'none';
        const body = <path d={e.d} fill={fill} fillOpacity={anim === 'draw' ? smooth(0.6, 1, k) * (e.fillOpacity ?? 1) : e.fillOpacity ?? 1} stroke={stroke}
          strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" filter={glow} {...(draw as any)} />;
        const raised = e.raised ? <>
          <path d={e.d} fill="#000" opacity={0.5} transform="translate(6,14)" filter="url(#shadow)" />
          <path d={e.d} fill={e.edge ?? '#A99A7E'} transform="translate(0,7)" /></> : null;
        const tex = e.paper ? <path d={e.d} fill="#fff" filter="url(#paper)" /> : null;
        if (anim === 'wipe') {
          const w = smooth(0, 1, k);
          return <g key={e.id} opacity={out}><clipPath id={`w_${e.id}`}><rect x={e.wipe?.[0] ?? -2000} y={-4000} width={(e.wipe?.[1] ?? 3080) * w} height={12000} /></clipPath>
            <g clipPath={`url(#w_${e.id})`}>{raised}{body}{tex}</g></g>;
        }
        return wrap(<>{raised}{body}{tex}</>);
      }
      case 'circle':
        return wrap(<circle cx={e.cx} cy={e.cy} r={e.r} fill={e.fill ?? 'none'} stroke={stroke} strokeWidth={strokeW} filter={glow} />);
      case 'rect':
        return wrap(<rect x={e.x} y={e.y} width={anim === 'grow' ? e.w * smooth(0, 1, k) : e.w} height={e.h} rx={e.rx ?? 0} fill={e.fill ?? 'none'} stroke={stroke}
          strokeWidth={strokeW} filter={glow} />);
      case 'text': {
        const sz = e.ss ? e.size / z : e.size;    // ss: a constant size on screen, whatever the zoom
        return wrap(<text x={e.x + (e.ss && e.dx ? e.dx / z : 0)} y={e.y + (e.ss ? (e.dy ?? 0) / z : 0)} textAnchor={e.anchor ?? 'middle'} fontFamily={FONT[e.font ?? 'sans']} fontWeight={e.weight ?? 800} fontSize={sz}
          letterSpacing={(e.track ?? 0) * sz / e.size} fill={e.fill ?? '#fff'} stroke={e.halo ?? 'none'} strokeWidth={e.halo ? sz * 0.18 : 0} paintOrder="stroke"
          fontStyle={e.italic ? 'italic' : 'normal'}>{e.text}</text>);
      }
      case 'counter': {
        const kk = outCubic(clamp01((t - a0) / (e.dur ?? 1.2)));
        const v = lerp(e.from, e.to, kk);
        return wrap(<text x={e.x} y={e.y} textAnchor={e.anchor ?? 'middle'} fontFamily={FONT[e.font ?? 'anton']} fontSize={e.size} fill={e.fill ?? '#fff'}
          stroke={e.halo ?? 'none'} strokeWidth={e.halo ? e.size * 0.12 : 0} paintOrder="stroke">{e.prefix ?? ''}{fmtNum(v, e.dec ?? 0, e.comma ?? true)}{e.suffix ?? ''}</text>);
      }
      case 'arrow': {
        const d = smooth(0, 1, k);
        return <g key={e.id} opacity={out}><path d={e.d} fill="none" stroke={e.stroke ?? '#fff'} strokeWidth={e.sw ?? 6} strokeLinecap="round" pathLength={1}
          style={{strokeDasharray: 1, strokeDashoffset: 1 - d}} markerEnd={d > 0.97 ? `url(#head_${e.head ?? 'w'})` : undefined} filter={glow} /></g>;
      }
      case 'mover': {
        const [x, y] = along(e.pts, smooth(0, 1, clamp01((t - a0) / (e.dur ?? 1.5))));
        return <g key={e.id} opacity={out}><circle cx={x} cy={y} r={e.r * 1.9} fill={e.fill} opacity={0.3} /><circle cx={x} cy={y} r={e.r} fill={e.fill} stroke="#fff" strokeWidth={3} /></g>;
      }
      case 'group': {
        const rot = (e.spin ?? 0) * (t - a0) + (e.rot ?? 0);
        const kids = (e.children as El[]).map((ch, i) => <React.Fragment key={i}>{render({...ch, id: e.id, anim: 'none', delay: 0, opacity: ch.opacity})}</React.Fragment>);
        return wrap(<g transform={`rotate(${rot} ${e.cx} ${e.cy})`}>{kids}</g>);
      }
      case 'emoji':
        return wrap(<text x={e.x} y={e.y} textAnchor="middle" dominantBaseline="central" fontSize={e.size}>{e.text}</text>);
      default:
        return null;
    }
  };

  // sounds: a whoosh when the camera moves, a pop per reveal (a few), a tick for draw-ons, an impact per card, a ding on the question
  const sfx: [number, string, number][] = [[0.15, 'sfx/news_whoosh.mp3', 0.5]];
  B.forEach((b, i) => {
    if (i && (b.cam[0] !== B[i - 1].cam[0] || b.cam[1] !== B[i - 1].cam[1] || b.cam[2] !== B[i - 1].cam[2])) sfx.push([b.start, 'sfx/whoosh.mp3', 0.4]);
    if ((b.show ?? []).length) sfx.push([b.start + 0.25, 'sfx/pop.wav', 0.4]);
    if (b.card) sfx.push([b.start + 0.45, 'sfx/news_impact.mp3', 0.8]);
    if (b.ask) sfx.push([b.start + 0.2, 'sfx/news_ding.mp3', 0.6]);
  });

  const hs = bi === 0 ? t - 0.15 : since;
  const head = cur.head, hk = clamp01((hs - 0.05) / 0.3), swipe = smooth(0.25, 0.6, hs);
  const card = cur.card;
  const ck = card ? outBack(clamp01((since - 0.45) / 0.3), 1.6) : 0;
  const num = card ? parseNum(card.big) : null;
  const counted = num ? `${num.pre}${fmtNum(num.n * outCubic(clamp01((since - 0.5) / 0.7)), num.dec, num.comma)}${num.suf}` : card?.big;

  return (
    <AbsoluteFill style={{background: p.theme.bg, overflow: 'hidden'}}>
      {p.voice && <Audio src={staticFile(p.voice)} volume={1} />}
      {p.music && <Audio src={staticFile(p.music)} volume={p.voice ? 0.1 : 0.26} loop />}
      {sfx.map(([at, f, v], i) => <Sequence key={i} from={Math.max(0, Math.round(at * fps))} durationInFrames={30}><Audio src={staticFile(f)} volume={v} /></Sequence>)}

      {p.theme.stars && <AbsoluteFill style={{opacity: 0.8}}>
        <svg width={1080} height={1920}>{Array.from({length: 140}, (_, i) => {
          const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * 1080, y = (Math.sin(i * 37.3) * 0.5 + 0.5) * 1920, r = 0.8 + (Math.sin(i * 13.1) * 0.5 + 0.5) * 1.8;
          return <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.35 + 0.5 * Math.abs(Math.sin(t * 0.8 + i))} />;
        })}</svg></AbsoluteFill>}

      <AbsoluteFill style={{opacity: fade * intro, perspective: 1800, perspectiveOrigin: '50% 40%'}}>
        <AbsoluteFill style={{transform: `rotateX(${tilt}deg)`, transformOrigin: '50% 60%'}}>
          <svg width={1080} height={1920} viewBox="0 0 1080 1920">
            <defs>
              <filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
                <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.28  0 0 0 0.10 0" /><feComposite in2="SourceGraphic" operator="in" /></filter>
              <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="9" /></filter>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              <pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="16" height="16" fill={p.theme.accent} fillOpacity={0.28} /><rect width="6" height="16" fill={p.theme.accent} fillOpacity={0.85} /></pattern>
              {[['w', '#fff'], ['a', p.theme.accent], ['k', INK]].map(([n, c]) => (
                <marker key={n} id={`head_${n}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 Z" fill={c} /></marker>))}
            </defs>
            <g transform={`translate(${CX},${CY}) scale(${z}) translate(${-cx},${-cy})`}>
              {p.els.filter((e) => !e.fixed).map(render)}
            </g>
          </svg>
        </AbsoluteFill>
        {/* screen-fixed elements (year stamps, timers): not moved by the camera */}
        <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', left: 0, top: 0}}>{p.els.filter((e) => e.fixed).map(render)}</svg>
        <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(0,0,0,0.45) 100%)'}} />
      </AbsoluteFill>

      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 560, background: `linear-gradient(${p.theme.fade} 68%, transparent)`, opacity: fade}} />
      <Masthead P={PAL.night} label="" top={160} />
      <div style={{position: 'absolute', left: 60, right: 60, top: 248, height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: ANTON, fontSize: (head.join('').length > 34 ? 84 : 96), lineHeight: 1.08, color: '#fff', opacity: hk * fade, transform: `translateY(${(1 - outCubic(hk)) * 24}px)`}}>
        <span>{head[0]}<span style={{display: 'inline-block', padding: '0 14px', margin: '0 -2px', color: INK, transform: 'rotate(-1.5deg)',
          background: `linear-gradient(transparent 12%, ${p.theme.accent} 12%, ${p.theme.accent} 88%, transparent 88%) no-repeat left / ${swipe * 100}% 100%`}}>{head[1]}</span>{head[2]}</span>
      </div>

      {card && ck > 0 && (
        <div style={{position: 'absolute', left: 70, right: 70, top: 1460, background: '#fff', borderRadius: 6, padding: '26px 34px', opacity: fade,
          boxShadow: '0 18px 40px rgba(0,0,0,0.5)', transform: `scale(${ck})`, transformOrigin: '50% 100%'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 28}}>
            <div style={{fontFamily: ANTON, fontSize: counted && counted.length > 6 ? 110 : 150, lineHeight: 0.9, color: INK, whiteSpace: 'nowrap'}}>{counted}</div>
            <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 36, lineHeight: 1.25, color: '#222'}}>{card.line}</div>
          </div>
          {(card.myth || card.src) && <div style={{marginTop: 12, display: 'flex', alignItems: 'center', gap: 18, fontFamily: SANS, fontWeight: 800, fontSize: 26, color: '#777'}}>
            {card.myth && <span style={{position: 'relative', fontFamily: ANTON, fontSize: 52, color: '#E0263C'}}>{card.myth}
              <span style={{position: 'absolute', left: -6, top: '52%', height: 7, background: '#E0263C', width: `${smooth(1.2, 1.5, since) * 112}%`}} /></span>}
            {card.src && <span>Source: {card.src}</span>}</div>}
        </div>
      )}

      <div style={{position: 'absolute', left: 80, right: 80, top: card ? 1745 : 1640, textAlign: 'center', opacity: smooth(0, 0.2, since) * fade}}>
        <span style={{background: cur.ask ? p.theme.accent : '#fff', color: INK, fontFamily: SANS, fontWeight: 800, fontSize: card ? 38 : 44, lineHeight: 1.5, padding: '6px 16px',
          boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone'}}>{cur.say}</span>
      </div>
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};
