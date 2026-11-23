// ---------- Bars v2: a bar chart race of countries (World Bank data), many themes ----------
// A dark glass panel over the sunset, a theme badge, a neon year and a timeline rail. Fat glossy bars (flag + name inside,
// value at the tip) slide and swap smoothly; the crown follows #1; each overtake pops a green banner. Then a question and the outro.
// Layout (1080x1920): 0-150 free, header 160, title 258-428, panel 450-1620, banner/question 1648, bottom free.
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, clamp01, lerp, outBack, smooth, useEdFonts} from './kit';

type Country = {name: string; flag: string; color: string; v: (number | null)[]};
type Toast = {t: number; text: string};
export type EdBarRaceProps = {theme: string; titleA: string; titleEm: string; unit: string; years: number[]; countries: Country[]; toasts: Toast[];
  hook: number; race: number; outroAt: number; duration: number; ask: string; endAsk: string; source: string; music?: string | null};

const P = PAL.vice;
const X0 = 134, PAD = 96, W = 560, ROW0 = 662, STEP = 116, BH = 96, SHOW = 8;

const fmt = (v: number, unit: string) => {
  if (unit === 'usd_big') return v >= 1e12 ? `$${(v / 1e12).toFixed(1)}T` : `$${Math.round(v / 1e9)}B`;
  if (unit === 'people') return v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : `${Math.round(v / 1e6)}M`;
  if (unit === 'usd') return `$${Math.round(v).toLocaleString('en-US')}`;
  if (unit === 'pct') return `${v.toFixed(0)}%`;
  if (unit === 'years') return `${v.toFixed(1)} yrs`;
  return v.toLocaleString('en-US');
};
const tick = (max: number, unit: string) => {
  const raw = max / 3, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const s = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw)!;
  return {step: s, label: (v: number) => fmt(v, unit).replace(/\.0(?=[TBM%])/, '')};
};

export const EdBarRace: React.FC<EdBarRaceProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const N = p.years.length;
  const at = (tt: number) => {
    const u = clamp01((tt - p.hook) / p.race);
    const f = u * (N - 1), i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), fr = f - i0;
    return p.countries.map((c) => {
      const a = c.v[i0], b = c.v[i1];
      return a == null && b == null ? 0 : lerp(a ?? b ?? 0, b ?? a ?? 0, fr);
    });
  };
  const u = clamp01((t - p.hook) / p.race);
  const vals = at(t);
  const max = Math.max(...vals, 1e-9);
  // ranks averaged over the last 0.3 s, so bars glide into their new place instead of jumping (and never sit on top of each other)
  const rankOf = (v: number[]) => { const o = v.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]); const r = new Array(v.length); o.forEach(([, i], k) => { r[i] = k; }); return r as number[]; };
  const SAMPLES = 10;
  const soft = p.countries.map(() => 0);
  for (let k = 0; k < SAMPLES; k++) rankOf(at(t - k * 0.03)).forEach((r, i) => { soft[i] += r / SAMPLES; });
  const leader = vals.indexOf(max);
  const year = Math.round(lerp(p.years[0], p.years[N - 1], u));
  const {step, label} = tick(max, p.unit);
  const ticks = Array.from({length: Math.floor(max / step)}, (_, k) => (k + 1) * step);
  const titleK = outBack(clamp01(t / 0.35), 1.6);
  const fade = 1 - smooth(p.outroAt - 0.2, p.outroAt, t);
  const end = p.hook + p.race;
  const toast = [...p.toasts].reverse().find((x) => t >= x.t && t < x.t + 1.3);

  return (
    <AbsoluteFill style={{background: 'radial-gradient(120% 50% at 50% 108%, #ff5e7a 0%, #9b2a7e 30%, transparent 60%), linear-gradient(#14072a 0%, #22093e 50%, #3a0f52 100%)'}}>
      <div style={{position: 'absolute', left: -300, right: -300, bottom: 0, height: 300, opacity: 0.35, transform: 'perspective(500px) rotateX(60deg)', transformOrigin: 'bottom',
        background: 'linear-gradient(#ff4fa0 0, #ff4fa0 2px, transparent 3px) 0 0/100% 60px, linear-gradient(90deg, #ff4fa0 0, #ff4fa0 2px, transparent 2px) 0 0/110px 100%',
        backgroundPositionY: `${(t * 60) % 60}px`}} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.3} loop />}
      {p.toasts.map((x, k) => <Sequence key={k} from={Math.round(x.t * fps)} durationInFrames={20}><Audio src={staticFile('sfx/pop.wav')} volume={0.8} /></Sequence>)}
      <Sequence from={Math.round(end * fps)} durationInFrames={30}><Audio src={staticFile('sfx/impact.mp3')} volume={0.8} /></Sequence>

      <Masthead P={P} label="" top={160} />
      <div style={{position: 'absolute', left: 70, right: 70, top: 258, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: P.display, fontSize: (p.titleA + p.titleEm).length > 38 ? 74 : 82, lineHeight: 1.0, color: P.ink, opacity: clamp01(titleK), transform: `scale(${0.92 + 0.08 * titleK})`}}>
        <span>{p.titleA}<span style={{color: '#FFE07A', fontStyle: 'italic'}}>{p.titleEm}</span></span>
      </div>

      <AbsoluteFill style={{opacity: fade}}>
        <div style={{position: 'absolute', left: 44, right: 44, top: 450, height: 1170, borderRadius: 36, background: 'rgba(12,5,26,0.8)', border: '3px solid rgba(255,79,160,0.45)',
          boxShadow: '0 0 50px rgba(255,79,160,0.15)'}} />
        <div style={{position: 'absolute', left: 84, top: 486, fontFamily: SANS, fontWeight: 900, fontSize: 32, padding: '10px 22px', borderRadius: 999, color: '#fff',
          background: 'rgba(255,79,160,0.2)', border: '3px solid #FF4FA0', letterSpacing: '0.06em', whiteSpace: 'nowrap'}}>{p.theme}</div>
        <div style={{position: 'absolute', right: 80, top: 468, fontFamily: SANS, fontWeight: 900, fontSize: 120, lineHeight: 1, color: 'transparent',
          WebkitTextStroke: '4px #2FE0FF', textShadow: '0 0 30px rgba(47,224,255,0.6)'}}>{year}</div>
        <div style={{position: 'absolute', left: 84, top: 580, width: 500, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.13)'}} />
        <div style={{position: 'absolute', left: 84, top: 580, width: 500 * u, height: 6, borderRadius: 3, background: '#2FE0FF', boxShadow: '0 0 10px #2FE0FF'}} />
        {/* the scale */}
        {ticks.map((v) => {
          const x = X0 + PAD + (W * v) / max;
          return (
            <React.Fragment key={v}>
              <div style={{position: 'absolute', left: x, top: 650, width: 2, height: 944, background: 'rgba(255,255,255,0.07)'}} />
              <div style={{position: 'absolute', left: x, top: 616, transform: 'translateX(-50%)', fontFamily: SANS, fontWeight: 800, fontSize: 22, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap'}}>{label(v)}</div>
            </React.Fragment>
          );
        })}
        {/* the bars: the top 8 at any moment, newcomers slide up from below */}
        {p.countries.map((c, i) => {
          const r = soft[i];
          if (r > SHOW - 0.02 || vals[i] <= 0) return null;
          const y = ROW0 + r * STEP;
          const op = clamp01((SHOW - r) * 1.5);
          const w = PAD + (W * vals[i]) / max;
          const inside = w > 300;
          return (
            <div key={c.name} style={{position: 'absolute', left: X0 - 50, top: y, height: BH + 8, display: 'flex', alignItems: 'center', opacity: op}}>
              <div style={{width: 50, fontFamily: SANS, fontWeight: 900, fontSize: 34, color: 'rgba(255,255,255,0.45)'}}>{Math.round(r) + 1}</div>
              <div style={{width: w, height: BH, borderRadius: 20, position: 'relative', display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 12, boxSizing: 'border-box',
                background: `linear-gradient(90deg, ${c.color}cc, ${c.color})`, boxShadow: `0 0 26px ${c.color}66`}}>
                <div style={{position: 'absolute', left: 10, right: 10, top: 8, height: 28, borderRadius: 14, background: 'linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0))'}} />
                {i === leader && <div style={{position: 'absolute', top: -34, left: 36, fontSize: 44}}>👑</div>}
                <div style={{width: 72, height: 72, borderRadius: 36, background: '#fff', display: 'grid', placeItems: 'center', fontSize: 54, flexShrink: 0, boxShadow: '0 4px 10px rgba(0,0,0,0.3)'}}>{c.flag}</div>
                {inside && <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 34, color: '#fff', whiteSpace: 'nowrap', textShadow: '0 2px 6px rgba(0,0,0,0.4)'}}>{c.name}</div>}
              </div>
              <div style={{marginLeft: 18, fontFamily: SANS, fontWeight: 900, fontSize: 42, color: i === leader ? '#FFE07A' : '#fff', whiteSpace: 'nowrap'}}>
                {!inside && <span style={{fontSize: 32}}>{c.name} </span>}{fmt(vals[i], p.unit)}</div>
            </div>
          );
        })}
        {/* the bottom line: the question, then the overtakes, then the question again */}
        {t < p.hook + 0.6 && (
          <div style={{position: 'absolute', left: 0, right: 0, top: 1648, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 46, color: '#fff',
            opacity: smooth(0.4, 0.7, t) * (1 - smooth(p.hook + 0.3, p.hook + 0.6, t))}}>{p.ask}</div>
        )}
        {toast && t < end && (
          <div style={{position: 'absolute', left: 540, top: 1648, transform: `translateX(-50%) scale(${outBack(clamp01((t - toast.t) / 0.25), 2)})`, whiteSpace: 'nowrap',
            fontFamily: SANS, fontWeight: 900, fontSize: 38, padding: '14px 30px', borderRadius: 999, background: '#22C55E', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'}}>▲ {toast.text}</div>
        )}
        {t >= end && (
          <div style={{position: 'absolute', left: 0, right: 0, top: 1648, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 56, color: '#FFE07A',
            textShadow: '0 4px 14px rgba(0,0,0,0.5)', transform: `scale(${outBack(clamp01((t - end - 0.2) / 0.35), 1.8)})`}}>{p.endAsk}</div>
        )}
        <div style={{position: 'absolute', left: 84, right: 84, top: 1590, textAlign: 'right', fontFamily: SANS, fontWeight: 700, fontSize: 20, color: 'rgba(255,255,255,0.4)'}}>{p.source}</div>
      </AbsoluteFill>
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};
