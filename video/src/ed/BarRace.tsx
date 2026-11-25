// ---------- Bars v2: a bar chart race of countries (World Bank data), many themes ----------
// A dark glass panel over the sunset, a theme badge, a neon year and a timeline rail. Fat glossy bars (flag + name inside,
// value at the tip) slide and swap smoothly; the crown follows #1; each overtake pops a green banner.
// At the finish the bars hold still (hold): a red FINAL stamp, gold frame on #1 (and on #2 when the question is about #2), the rest dimmed.
// Then a results card: the country the question was about, big, then the rest of the top 5, then the question, confetti, the outro.
// Layout (1080x1920): 0-150 free, header 160, title 258-428, panel 450-1620, banner/question 1648, bottom free.
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, clamp01, lerp, outBack, outCubic, smooth, useEdFonts} from './kit';

type Country = {name: string; flag: string; color: string; v: (number | null)[]};
type Toast = {t: number; text: string};
export type EdBarRaceProps = {theme: string; titleA: string; titleEm: string; unit: string; years: number[]; countries: Country[]; toasts: Toast[];
  hook: number; race: number; outroAt: number; duration: number; ask: string; endAsk: string; source: string; music?: string | null;
  hold?: number; focus?: number};   // hold: seconds the bars stand still at the finish before the results card (none = old ending); focus: the rank the question is about

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

// the ending: the country the question was about (#1 or #2), big, its value counting up, then the rest of the top 5, then the question
const Results: React.FC<{p: EdBarRaceProps; order: number[]; fin: number[]; a: number}> = ({p, order, fin, a}) => {
  const focus = p.focus ?? 1;
  const fi = order[focus - 1], c = p.countries[fi];
  const card = outBack(clamp01((a - 0.15) / 0.45), 1.5);
  const num = outCubic(clamp01((a - 0.4) / 0.9));
  const rest = order.slice(0, 5).filter((i) => i !== fi);
  const gold = focus === 1;
  return (
    <AbsoluteFill style={{opacity: clamp01(a / 0.25)}}>
      <div style={{position: 'absolute', left: 84, right: 84, top: 480, height: 490, borderRadius: 36, transform: `scale(${card})`,
        background: gold ? 'linear-gradient(160deg, rgba(255,224,122,0.22), rgba(255,79,160,0.18))' : 'linear-gradient(160deg, rgba(201,214,255,0.22), rgba(47,224,255,0.14))',
        border: `4px solid ${gold ? '#FFE07A' : '#C9D6FF'}`, boxShadow: `0 0 70px ${gold ? 'rgba(255,224,122,0.35)' : 'rgba(201,214,255,0.3)'}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{position: 'absolute', top: -34, background: gold ? '#FFE07A' : '#C9D6FF', color: '#1a0b2e', fontFamily: SANS, fontWeight: 900, fontSize: 40, padding: '6px 26px',
          borderRadius: 999, letterSpacing: '0.06em', whiteSpace: 'nowrap'}}>{gold ? '🏆 #1' : '🥈 #2'} IN {p.years[p.years.length - 1]}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 26}}>
          <div style={{width: 150, height: 150, borderRadius: 75, background: '#fff', display: 'grid', placeItems: 'center', fontSize: 112, boxShadow: `0 0 0 6px ${c.color}, 0 8px 20px rgba(0,0,0,0.4)`}}>{c.flag}</div>
          <div style={{fontFamily: SANS, fontWeight: 900, fontSize: c.name.length > 11 ? 56 : 68, color: '#fff', whiteSpace: 'nowrap'}}>{c.name}</div>
        </div>
        <div style={{marginTop: 30, fontFamily: SANS, fontWeight: 900, fontSize: 130, color: gold ? '#FFE07A' : '#fff', lineHeight: 1.05,
          textShadow: `0 0 40px ${gold ? 'rgba(255,224,122,0.5)' : 'rgba(201,214,255,0.45)'}`}}>{fmt(fin[fi] * num, p.unit)}</div>
      </div>
      {rest.map((i, k) => {
        const kk = outCubic(clamp01((a - 0.8 - k * 0.25) / 0.35));
        const r = order.indexOf(i) + 1, cc = p.countries[i], top1 = r === 1;
        return (
          <div key={cc.name} style={{position: 'absolute', left: 84, right: 84, top: 1012 + k * 118, height: 100, display: 'flex', alignItems: 'center', gap: 22,
            padding: '0 26px', borderRadius: 22, background: top1 ? 'rgba(255,224,122,0.14)' : 'rgba(255,255,255,0.07)', border: top1 ? '3px solid rgba(255,224,122,0.7)' : '3px solid transparent',
            opacity: kk, transform: `translateX(${(1 - kk) * 120}px)`}}>
            <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 44, color: top1 ? '#FFE07A' : 'rgba(255,255,255,0.5)', width: 40}}>{r}</div>
            <div style={{width: 70, height: 70, borderRadius: 35, background: '#fff', display: 'grid', placeItems: 'center', fontSize: 50, flexShrink: 0}}>{cc.flag}</div>
            <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 40, color: '#fff', flex: 1, whiteSpace: 'nowrap'}}>{cc.name}{top1 ? ' 🏆' : ''}</div>
            <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 44, color: top1 ? '#FFE07A' : '#fff'}}>{fmt(fin[i], p.unit)}</div>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 0, right: 0, top: 1500, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 62, color: '#FFE07A',
        textShadow: '0 4px 14px rgba(0,0,0,0.5)', transform: `scale(${outBack(clamp01((a - 1.8) / 0.35), 1.8)})`}}>{p.endAsk}</div>
      {Array.from({length: 50}, (_, i) => {
        const b = a - 0.5;
        if (b < 0) return null;
        const r1 = Math.sin(i * 91.7) * 0.5 + 0.5, r2 = Math.sin(i * 37.3) * 0.5 + 0.5, r3 = Math.sin(i * 13.1) * 0.5 + 0.5;
        const x = 540 + (r1 - 0.5) * 1000 * outCubic(b / 0.6), y = 520 - 220 * outCubic(b / 0.5) + 900 * b * b * (0.6 + r2);
        const cols = ['#FFE07A', '#FF4FA0', '#7FE0B0', '#8FB8FF', '#fff'];
        return <div key={i} style={{position: 'absolute', left: x, top: y, width: 16, height: 26, background: cols[i % 5], borderRadius: 3,
          transform: `rotate(${(r3 * 720 + b * 400) % 360}deg)`, opacity: 1 - clamp01((b - 1.6) / 0.6)}} />;
      })}
    </AbsoluteFill>
  );
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
  // the finish: the bars hold still, then the results card (only when hold is set; old props keep the old ending)
  const newEnd = p.hold != null, RS = end + (p.hold ?? 0), focus = p.focus ?? 1;
  const fin = at(end), order = fin.map((_, i) => i).sort((a, b) => fin[b] - fin[a]);
  const done = newEnd && t >= end, fk = outBack(clamp01((t - end) / 0.3), 2);
  const panelK = newEnd ? 1 - smooth(RS - 0.05, RS + 0.3, t) : 1;

  return (
    <AbsoluteFill style={{background: 'radial-gradient(120% 50% at 50% 108%, #ff5e7a 0%, #9b2a7e 30%, transparent 60%), linear-gradient(#14072a 0%, #22093e 50%, #3a0f52 100%)'}}>
      <div style={{position: 'absolute', left: -300, right: -300, bottom: 0, height: 300, opacity: 0.35, transform: 'perspective(500px) rotateX(60deg)', transformOrigin: 'bottom',
        background: 'linear-gradient(#ff4fa0 0, #ff4fa0 2px, transparent 3px) 0 0/100% 60px, linear-gradient(90deg, #ff4fa0 0, #ff4fa0 2px, transparent 2px) 0 0/110px 100%',
        backgroundPositionY: `${(t * 60) % 60}px`}} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.3} loop />}
      {p.toasts.map((x, k) => <Sequence key={k} from={Math.round(x.t * fps)} durationInFrames={20}><Audio src={staticFile('sfx/pop.wav')} volume={0.8} /></Sequence>)}
      <Sequence from={Math.round(end * fps)} durationInFrames={30}><Audio src={staticFile('sfx/impact.mp3')} volume={0.8} /></Sequence>
      {newEnd && <Sequence from={Math.round(RS * fps)} durationInFrames={30}><Audio src={staticFile('sfx/whoosh.mp3')} volume={0.6} /></Sequence>}
      {newEnd && <Sequence from={Math.round((RS + 0.2) * fps)} durationInFrames={30}><Audio src={staticFile('sfx/impact.mp3')} volume={0.8} /></Sequence>}
      {newEnd && [0, 1, 2, 3].map((k) => <Sequence key={k} from={Math.round((RS + 0.8 + k * 0.25) * fps)} durationInFrames={15}><Audio src={staticFile('sfx/thud.wav')} volume={0.6} /></Sequence>)}

      <Masthead P={P} label="" top={160} />
      <div style={{position: 'absolute', left: 70, right: 70, top: 258, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: P.display, fontSize: (p.titleA + p.titleEm).length > 38 ? 74 : 82, lineHeight: 1.0, color: P.ink, opacity: clamp01(titleK), transform: `scale(${0.92 + 0.08 * titleK})`}}>
        <span>{p.titleA}<span style={{color: '#FFE07A', fontStyle: 'italic'}}>{p.titleEm}</span></span>
      </div>

      <AbsoluteFill style={{opacity: fade * panelK}}>
        <div style={{position: 'absolute', left: 44, right: 44, top: 450, height: 1170, borderRadius: 36, background: 'rgba(12,5,26,0.8)', border: '3px solid rgba(255,79,160,0.45)',
          boxShadow: '0 0 50px rgba(255,79,160,0.15)'}} />
        <div style={{position: 'absolute', left: 84, top: 486, fontFamily: SANS, fontWeight: 900, fontSize: 32, padding: '10px 22px', borderRadius: 999, color: '#fff',
          background: 'rgba(255,79,160,0.2)', border: '3px solid #FF4FA0', letterSpacing: '0.06em', whiteSpace: 'nowrap'}}>{p.theme}</div>
        <div style={{position: 'absolute', right: 80, top: 468, fontFamily: SANS, fontWeight: 900, fontSize: 120, lineHeight: 1, color: 'transparent',
          WebkitTextStroke: done ? '4px #FFE07A' : '4px #2FE0FF', textShadow: done ? '0 0 30px rgba(255,224,122,0.7)' : '0 0 30px rgba(47,224,255,0.6)'}}>{year}</div>
        <div style={{position: 'absolute', left: 84, top: 580, width: 500, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.13)', opacity: done ? 0 : 1}} />
        <div style={{position: 'absolute', left: 84, top: 580, width: 500 * u, height: 6, opacity: done ? 0 : 1, borderRadius: 3, background: '#2FE0FF', boxShadow: '0 0 10px #2FE0FF'}} />
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
          const fr = order.indexOf(i), hot = done && (fr === 0 || fr === focus - 1), ring = fr === 0 ? '#FFE07A' : '#C9D6FF';
          const dim = done && !hot ? 1 - 0.6 * clamp01((t - end) / 0.3) : 1;
          return (
            <div key={c.name} style={{position: 'absolute', left: X0 - 50, top: y, height: BH + 8, display: 'flex', alignItems: 'center', opacity: op * dim}}>
              <div style={{width: 50, fontFamily: SANS, fontWeight: 900, fontSize: 34, color: 'rgba(255,255,255,0.45)'}}>{Math.round(r) + 1}</div>
              <div style={{width: w, height: BH, borderRadius: 20, position: 'relative', display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 12, boxSizing: 'border-box',
                background: `linear-gradient(90deg, ${c.color}cc, ${c.color})`, boxShadow: hot ? `0 0 0 ${5 * fk}px ${ring}, 0 0 40px ${ring}aa` : `0 0 26px ${c.color}66`}}>
                <div style={{position: 'absolute', left: 10, right: 10, top: 8, height: 28, borderRadius: 14, background: 'linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0))'}} />
                {i === leader && <div style={{position: 'absolute', top: -34, left: 36, fontSize: 44}}>👑</div>}
                {hot && <div style={{position: 'absolute', top: -26, right: 8, transform: `scale(${fk})`, transformOrigin: 'right bottom', background: ring, color: '#1a0b2e',
                  fontFamily: SANS, fontWeight: 900, fontSize: 26, padding: '3px 14px', borderRadius: 999, whiteSpace: 'nowrap'}}>{fr === 0 ? '🏆 #1' : '🥈 #2'}</div>}
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
        {done && (
          <div style={{position: 'absolute', left: 540, top: 1640, transform: `translateX(-50%) rotate(-3deg) scale(${lerp(2.2, 1, outBack(clamp01((t - end) / 0.28), 1.4))})`,
            opacity: clamp01((t - end) / 0.1), whiteSpace: 'nowrap', fontFamily: SANS, fontWeight: 900, fontSize: 52, letterSpacing: '0.08em', padding: '10px 36px',
            borderRadius: 16, background: '#FF2E4D', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 40px rgba(255,46,77,0.5)'}}>🏁 FINAL</div>
        )}
        {!newEnd && t >= end && (
          <div style={{position: 'absolute', left: 0, right: 0, top: 1648, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 56, color: '#FFE07A',
            textShadow: '0 4px 14px rgba(0,0,0,0.5)', transform: `scale(${outBack(clamp01((t - end - 0.2) / 0.35), 1.8)})`}}>{p.endAsk}</div>
        )}
        <div style={{position: 'absolute', left: 84, right: 84, top: 1590, textAlign: 'right', fontFamily: SANS, fontWeight: 700, fontSize: 20, color: 'rgba(255,255,255,0.4)'}}>{p.source}</div>
      </AbsoluteFill>
      {newEnd && t >= RS && <AbsoluteFill style={{opacity: fade}}><Results p={p} order={order} fin={fin} a={t - RS} /></AbsoluteFill>}
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};
