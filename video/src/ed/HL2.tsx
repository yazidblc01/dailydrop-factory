// ---------- Higher or lower v2: a ranked chart where every answer stays on screen ----------
// One item starts revealed. Each round, the next item sits in a spotlight card with a 3-2-1 timer and two buttons:
// "higher or lower than the last one?". Then the right button lights up, its bar grows to the real value and the item
// joins the chart above, so the gaps between all of them stay visible. Ends on the top one, then the logo outro.
// Layout (1080x1920): 0-150 free for the apps' buttons, header 160, title 258-428, panel 450-1660, bottom free.
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, SunsetSky, clamp01, lerp, outBack, outCubic, smooth, useEdFonts} from './kit';

type Item = {name: string; sub: string; value: number; short?: string; color?: string};
export type EdHL2Props = {hookA: string; hookB: string; endA: string; endB: string; unit: string; items: Item[]; start: number; round: number;
  outroAt: number; duration: number; fmt?: 'usd' | 'millions'; music?: string | null};

const P = PAL.vice;
const COLS = ['#FF4FA0', '#2FB6FF', '#FFB13B', '#7C5CFF', '#22C55E', '#FF5E5E', '#00C2A8'];
const PANEL = {x: 60, y: 456, w: 960, h: 1200};
const ROW0 = 600, ROWH = 112, BAR0 = 380, BARW = 460;          // chart rows: tile + name on the left, bars from x=BAR0
const SPOT = 1188;                                              // the spotlight card's top

export const EdHL2: React.FC<EdHL2Props> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const fmt = (v: number) => p.fmt === 'millions' ? `${+v.toFixed(1)}M` : '$' + (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(2));
  const max = Math.max(...p.items.map((i) => i.value));
  const step = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].map((s) => s * Math.pow(10, Math.floor(Math.log10(max)) - 1)).find((s) => max / s <= 4.2)!;
  const top = Math.ceil((max * 1.04) / step) * step;
  const W = (v: number) => (v / top) * BARW;
  const n = p.items.length;
  const QUESTION = p.round * 0.66;                              // the timer part of a round; the rest is the reveal
  // round r (1..n-1) asks about item r: starts at start + (r-1)*round, reveals at + QUESTION
  const rStart = (r: number) => p.start + (r - 1) * p.round, rReveal = (r: number) => rStart(r) + QUESTION;
  const endAt = rStart(n);                                       // after the last round: the ending
  const cur = t < p.start ? 0 : Math.min(n, Math.floor((t - p.start) / p.round) + 1);   // the round we're in (n = done)
  const revealedUpTo = (i: number) => i === 0 ? t >= 0.4 : t >= rReveal(i);
  const answer = (i: number) => p.items[i].value >= p.items[i - 1].value ? 'HIGHER' : 'LOWER';
  const titleK = outBack(clamp01(t / 0.35), 1.6);

  const Tile: React.FC<{it: Item; i: number; size: number}> = ({it, i, size}) => (
    <div style={{width: size, height: size, borderRadius: size * 0.24, background: it.color ?? COLS[i % COLS.length], display: 'grid', placeItems: 'center', flexShrink: 0,
      fontFamily: SANS, fontWeight: 900, fontSize: Math.min(size * 0.36, (size * 0.86) / (Math.max(2, (it.short ?? it.name).length) * 0.62)), color: '#fff',
      boxShadow: '0 8px 20px rgba(0,0,0,0.45), inset 0 0 0 3px rgba(255,255,255,0.18)'}}>{it.short ?? it.name.slice(0, 3)}</div>
  );

  // the item in the spotlight this round
  const si = Math.min(cur, n - 1);
  const inRound = cur >= 1 && cur < n;
  const q = inRound ? t - rStart(cur) : 0;
  const revealing = inRound && t >= rReveal(cur);
  const timer = inRound && !revealing ? 1 - q / QUESTION : 0;
  const countdown = inRound && !revealing ? Math.max(1, 3 - Math.floor((q / QUESTION) * 3)) : null;
  const spotIn = inRound ? outBack(clamp01(q / 0.3), 1.5) : 0;
  const spotOut = revealing ? 1 - smooth(rStart(cur) + p.round - 0.35, rStart(cur) + p.round - 0.05, t) : 1;
  const ans = inRound ? answer(cur) : null;
  const grow = revealing ? outCubic(clamp01((t - rReveal(cur)) / 0.5)) : 0;
  const endK = smooth(endAt, endAt + 0.4, t);
  const topItem = p.items.reduce((a, b) => (b.value > a.value ? b : a));

  return (
    <AbsoluteFill>
      <SunsetSky />
      <AbsoluteFill style={{background: 'linear-gradient(rgba(16,6,32,0.55), rgba(16,6,32,0.1) 60%, rgba(16,6,32,0))'}} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.28} loop />}
      {Array.from({length: n - 1}, (_, k) => k + 1).map((r) => (
        <React.Fragment key={r}>
          {[0, 1, 2].map((j) => <Sequence key={j} from={Math.round((rStart(r) + (QUESTION / 3) * j) * fps)} durationInFrames={12}><Audio src={staticFile('sfx/tick.mp3')} volume={0.6} /></Sequence>)}
          <Sequence from={Math.round(rReveal(r) * fps)} durationInFrames={24}><Audio src={staticFile('sfx/stamp.wav')} volume={0.9} /></Sequence>
        </React.Fragment>
      ))}

      <Masthead P={P} label="" top={160} />
      <div style={{position: 'absolute', left: 70, right: 70, top: 258, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: P.display, fontSize: (p.hookA + p.hookB).length > 34 ? 72 : 84, lineHeight: 1.0, color: P.ink, opacity: clamp01(titleK), transform: `scale(${0.92 + 0.08 * titleK})`}}>
        <span>{p.hookA} <span style={{color: '#FFE07A', fontStyle: 'italic'}}>{p.hookB}</span></span>
      </div>

      {/* the panel */}
      <div style={{position: 'absolute', left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h, borderRadius: 40, background: 'rgba(16,7,32,0.86)',
        border: '3px solid rgba(255,79,160,0.55)', boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 40px rgba(255,79,160,0.18)'}} />
      {/* the scale */}
      <div style={{position: 'absolute', left: BAR0, top: 488, width: BARW, height: 40, fontFamily: SANS, fontWeight: 800, fontSize: 22, color: 'rgba(255,255,255,0.5)'}}>
        {Array.from({length: Math.round(top / step) + 1}, (_, k) => k * step).map((v) => (
          <div key={v} style={{position: 'absolute', left: W(v), transform: 'translateX(-50%)', whiteSpace: 'nowrap'}}>{v === 0 ? '0' : fmt(v)}</div>
        ))}
      </div>
      {Array.from({length: Math.round(top / step) + 1}, (_, k) => k * step).map((v) => (
        <div key={v} style={{position: 'absolute', left: BAR0 + W(v) - 1, top: 530, width: 2, height: ROWH * n + 20, background: 'rgba(255,255,255,0.08)'}} />
      ))}
      <div style={{position: 'absolute', right: PANEL.x + 34, top: 488, fontFamily: SANS, fontWeight: 800, fontSize: 20, letterSpacing: '0.1em', color: 'rgba(255,224,122,0.7)'}} />

      {/* the chart: every answered item stays */}
      {p.items.map((it, i) => {
        if (!revealedUpTo(i)) return null;
        const a = i === 0 ? outBack(clamp01((t - 0.4) / 0.4), 1.4) : outBack(clamp01((t - rReveal(i) - 0.35) / 0.4), 1.4);
        const g = i === 0 ? outCubic(clamp01((t - 0.6) / 0.6)) : outCubic(clamp01((t - rReveal(i) - 0.45) / 0.55));
        const y = ROW0 + i * ROWH;
        const best = endK > 0 && it === topItem;
        return (
          <div key={i} style={{position: 'absolute', left: 92, top: y, width: 900, height: ROWH - 14, opacity: clamp01(a * 1.5), transform: `translateX(${(1 - a) * -40}px)`}}>
            <div style={{position: 'absolute', left: 0, top: 0, display: 'flex', alignItems: 'center', gap: 16, width: 274}}>
              <div style={{position: 'relative'}}><Tile it={it} i={i} size={78} />
                {i > 0 && <div style={{position: 'absolute', right: -10, top: -10, width: 36, height: 36, borderRadius: 18, display: 'grid', placeItems: 'center', fontSize: 18, color: '#fff',
                  background: answer(i) === 'HIGHER' ? '#22C55E' : '#FF4F5E', border: '3px solid #10071f', opacity: clamp01(g * 2)}}>{answer(i) === 'HIGHER' ? '▲' : '▼'}</div>}</div>
              <div style={{fontFamily: SANS, fontWeight: 900, fontSize: it.name.length > 16 ? 22 : 26, color: '#fff', lineHeight: 1.1}}>{it.name}
                <div style={{fontWeight: 700, fontSize: 20, color: 'rgba(255,255,255,0.5)'}}>{it.sub}</div></div>
            </div>
            <div style={{position: 'absolute', left: BAR0 - 92, top: 18, height: 46, width: Math.max(8, W(it.value) * g), borderRadius: 12,
              background: best ? 'linear-gradient(90deg, #FFB13B, #FFE07A)' : 'linear-gradient(90deg, #FF4FA0, #FF9A5A)', boxShadow: best ? '0 0 30px rgba(255,224,122,0.8)' : '0 0 18px rgba(255,79,160,0.45)'}} />
            <div style={{position: 'absolute', left: BAR0 - 92 + Math.max(8, W(it.value) * g) + 12, top: 20, fontFamily: SANS, fontWeight: 900, fontSize: 36, color: best ? '#FFE07A' : '#fff',
              opacity: clamp01(g * 2), whiteSpace: 'nowrap'}}>{fmt(it.value * (0.6 + 0.4 * g))}</div>
          </div>
        );
      })}

      {/* the spotlight: this round's item, the timer, the two buttons */}
      {inRound && (
        <div style={{position: 'absolute', left: 92, top: SPOT, width: 896, opacity: spotOut, transform: `scale(${0.85 + 0.15 * spotIn})`, transformOrigin: 'center'}}>
          <div style={{height: 250, borderRadius: 30, background: 'linear-gradient(135deg, rgba(255,79,160,0.2), rgba(124,92,255,0.2))', border: '4px solid #FFE07A',
            boxShadow: '0 0 40px rgba(255,224,122,0.35)', position: 'relative'}}>
            <div style={{position: 'absolute', left: 30, top: 30}}><Tile it={p.items[si]} i={si} size={130} /></div>
            <div style={{position: 'absolute', left: 186, top: 34, right: 150, fontFamily: SANS, fontWeight: 900, fontSize: p.items[si].name.length > 18 ? 40 : 50, color: '#fff', lineHeight: 1.05}}>
              {p.items[si].name}<div style={{fontWeight: 700, fontSize: 26, color: 'rgba(255,255,255,0.6)', marginTop: 6}}>{p.items[si].sub} · vs {p.items[si - 1]?.name}</div></div>
            <div style={{position: 'absolute', left: 186, right: 160, top: 166, height: 56, borderRadius: 14, border: '3px dashed rgba(255,255,255,0.45)', display: 'grid', placeItems: 'center',
              fontFamily: SANS, fontWeight: 900, fontSize: 38, color: revealing ? '#FFE07A' : 'rgba(255,255,255,0.7)', letterSpacing: revealing ? 0 : '0.3em',
              transform: `scale(${revealing ? 1 + 0.15 * (1 - grow) : 1})`}}>{revealing ? fmt(p.items[si].value) : '???'}</div>
            {countdown && (
              <div style={{position: 'absolute', right: 30, top: 70, width: 110, height: 110}}>
                <svg width={110} height={110} style={{position: 'absolute'}}>
                  <circle cx={55} cy={55} r={48} stroke="rgba(255,255,255,0.15)" strokeWidth={9} fill="none" />
                  <circle cx={55} cy={55} r={48} stroke="#FFE07A" strokeWidth={9} fill="none" strokeLinecap="round" strokeDasharray={2 * Math.PI * 48}
                    strokeDashoffset={2 * Math.PI * 48 * (1 - timer)} transform="rotate(-90 55 55)" />
                </svg>
                <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 56, color: '#fff'}}>{countdown}</div>
              </div>
            )}
          </div>
          <div style={{display: 'flex', gap: 24, marginTop: 26}}>
            {(['HIGHER', 'LOWER'] as const).map((b) => {
              const right = revealing && ans === b, wrong = revealing && ans !== b;
              const base = b === 'HIGHER' ? '#22C55E' : '#FF4F5E';
              return (
                <div key={b} style={{flex: 1, height: 120, borderRadius: 26, background: base, display: 'grid', placeItems: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 52,
                  color: '#fff', opacity: wrong ? 0.25 : 1, transform: `scale(${right ? 1 + 0.08 * Math.sin(Math.min(1, (t - rReveal(cur)) / 0.3) * Math.PI) : 1})`,
                  boxShadow: right ? `0 0 50px ${base}` : '0 10px 24px rgba(0,0,0,0.35)', border: right ? '5px solid #fff' : '5px solid transparent'}}>
                  {b === 'HIGHER' ? '▲ HIGHER' : '▼ LOWER'}</div>
              );
            })}
          </div>
        </div>
      )}

      {/* the ending: the top one */}
      {endK > 0 && (
        <div style={{position: 'absolute', left: 92, top: SPOT + 20, width: 896, textAlign: 'center', opacity: endK * (1 - smooth(p.outroAt - 0.2, p.outroAt, t)),
          transform: `scale(${outBack(clamp01((t - endAt) / 0.4), 1.6)})`}}>
          <div style={{fontFamily: P.display, fontSize: 64, color: '#fff', lineHeight: 1.05}}>{p.endA}</div>
          <div style={{fontFamily: P.display, fontStyle: 'italic', fontSize: 76, color: '#FFE07A', lineHeight: 1.05, marginTop: 8}}>{p.endB}</div>
          <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 44, color: '#fff', marginTop: 40}}>How many did you get? 👇</div>
        </div>
      )}
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};
