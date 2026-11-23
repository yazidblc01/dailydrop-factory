// ---------- While we waited B: the flip clock. A giant flip clock ticks 2013 -> 2026, a timeline rail lights up, ----------
// and each year drops a "Vice News" headline card on top of the last one. Ends on GTA 6, "Worth the wait?", and the outro.
// Layout (1080x1920): 0-150 free, header 160, title 258-428, clock 460-720, rail 770-830, cards 880-1260, ending 1320-1560, bottom free.
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, SunsetSky, clamp01, outBack, outCubic, smooth, useEdFonts} from './kit';

type Ev = {year: number; head: string; sub: string};
export type EdFlipProps = {events: Ev[]; hook: number; step: number; endFor: number; outroAt: number; duration: number; titleA: string; titleEm: string; music?: string | null};

const P = PAL.vice;
const CW = 190, CH = 260, CG = 20, CX = 540 - (4 * CW + 3 * CG) / 2, CY = 460;

const Half: React.FC<{d: string; top: boolean; style?: React.CSSProperties}> = ({d, top, style}) => (
  <div style={{position: 'absolute', left: 0, top: top ? 0 : CH / 2, width: CW, height: CH / 2, overflow: 'hidden', background: top ? '#2a1446' : '#24103d',
    borderRadius: top ? '20px 20px 0 0' : '0 0 20px 20px', backfaceVisibility: 'hidden', ...style}}>
    <div style={{position: 'absolute', left: 0, top: top ? 0 : -CH / 2, width: CW, height: CH, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: SANS, fontWeight: 900, fontSize: 210, lineHeight: 1, color: '#fff'}}>{d}</div>
  </div>
);

// one flip card: k goes 0 -> 1 while it flips from prev to cur
const Card: React.FC<{cur: string; prev: string; k: number; x: number; hot: boolean}> = ({cur, prev, k, x, hot}) => {
  const flipping = k > 0 && k < 1;
  return (
    <div style={{position: 'absolute', left: x, top: CY, width: CW, height: CH, perspective: 900, borderRadius: 20,
      boxShadow: hot ? '0 0 40px rgba(255,224,122,0.7), 0 20px 40px rgba(0,0,0,0.5)' : '0 20px 40px rgba(0,0,0,0.5)'}}>
      <Half d={cur} top />
      <Half d={flipping ? prev : cur} top={false} />
      {flipping && k < 0.5 && <Half d={prev} top style={{transformOrigin: 'bottom', transform: `rotateX(${-180 * k}deg)`}} />}
      {flipping && k >= 0.5 && <Half d={cur} top={false} style={{transformOrigin: 'top', transform: `rotateX(${180 * (1 - k)}deg)`}} />}
      <div style={{position: 'absolute', left: 0, right: 0, top: CH / 2 - 2, height: 4, background: '#0d0718'}} />
      {hot && <div style={{position: 'absolute', inset: 0, borderRadius: 20, border: '5px solid #FFE07A'}} />}
    </div>
  );
};

export const EdFlip: React.FC<EdFlipProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const n = p.events.length;
  const at = (i: number) => p.hook + i * p.step;
  const idx = Math.max(0, Math.min(n - 1, Math.floor((t - p.hook) / p.step)));
  const started = t >= p.hook;
  const ev = p.events[idx], prevEv = p.events[Math.max(0, idx - 1)];
  const y = String(started ? ev.year : p.events[0].year), py = String(started && idx > 0 ? prevEv.year : y);
  const flipK = started && idx > 0 ? clamp01((t - at(idx)) / 0.28) : 1;
  const endAt = at(n - 1) + p.step + 0.3;
  const last = idx === n - 1 && started;
  const titleK = outBack(clamp01(t / 0.35), 1.6);
  const fade = 1 - smooth(p.outroAt - 0.2, p.outroAt, t);
  const y0 = p.events[0].year, y1 = p.events[n - 1].year;
  const RX0 = 130, RX1 = 950, RY = 790;
  const railX = (yr: number) => RX0 + ((yr - y0) / (y1 - y0)) * (RX1 - RX0);
  const drop = (i: number) => outBack(clamp01((t - at(i)) / 0.35), 1.4);

  return (
    <AbsoluteFill>
      <SunsetSky />
      <AbsoluteFill style={{background: 'linear-gradient(rgba(16,6,32,0.75), rgba(16,6,32,0.35) 55%, rgba(16,6,32,0.05))'}} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.3} loop />}
      {p.events.map((_, i) => i > 0 && (
        <Sequence key={i} from={Math.round(at(i) * fps)} durationInFrames={12}><Audio src={staticFile('sfx/flap.wav')} volume={0.8} /></Sequence>
      ))}
      <Sequence from={Math.round(at(n - 1) * fps)} durationInFrames={30}><Audio src={staticFile('sfx/impact.mp3')} volume={0.85} /></Sequence>

      <Masthead P={P} label="" top={160} />
      <div style={{position: 'absolute', left: 70, right: 70, top: 258, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: P.display, fontSize: 84, lineHeight: 1.0, color: P.ink, opacity: clamp01(titleK), transform: `scale(${0.92 + 0.08 * titleK})`}}>
        <span>{p.titleA}<span style={{color: '#FFE07A', fontStyle: 'italic'}}>{p.titleEm}</span></span>
      </div>

      <AbsoluteFill style={{opacity: fade}}>
        {/* the clock: only the digits that change flip */}
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} cur={y[i]} prev={py[i]} k={y[i] === py[i] ? 1 : flipK} x={CX + i * (CW + CG)} hot={last && i >= 2} />
        ))}
        {/* the rail */}
        <div style={{position: 'absolute', left: RX0, top: RY - 3, width: RX1 - RX0, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.18)'}} />
        <div style={{position: 'absolute', left: RX0, top: RY - 3, width: railX(started ? ev.year : y0) - RX0, height: 6, borderRadius: 3, background: '#FFE07A',
          boxShadow: '0 0 14px rgba(255,224,122,0.8)'}} />
        {p.events.map((e, i) => {
          const on = started && i <= idx;
          return <div key={i} style={{position: 'absolute', left: railX(e.year) - 11, top: RY - 11, width: 22, height: 22, borderRadius: 11,
            background: on ? '#FFE07A' : '#3a1d5a', border: '3px solid #0d0718', transform: `scale(${i === idx && started ? 1.4 : 1})`}} />;
        })}
        <div style={{position: 'absolute', left: RX0 - 40, top: RY + 24, fontFamily: SANS, fontWeight: 900, fontSize: 24, color: 'rgba(255,255,255,0.8)'}}>GTA V · {y0}</div>
        <div style={{position: 'absolute', right: 1080 - RX1 - 40, top: RY + 24, fontFamily: SANS, fontWeight: 900, fontSize: 24, color: 'rgba(255,255,255,0.8)'}}>GTA 6 · {y1}</div>

        {/* the headline cards: the one before peeks out behind the new one */}
        {started && [idx - 1, idx].filter((i) => i >= 0).map((i) => {
          const e = p.events[i], cur = i === idx, k = drop(i);
          const gold = i === n - 1;
          return (
            <div key={i} style={{position: 'absolute', left: 90, width: 900, top: cur ? 960 - (1 - k) * 120 : 900, opacity: cur ? clamp01(k * 2) : 0.55,
              transform: `scale(${cur ? 1 : 0.92}) rotate(${cur ? (i % 2 ? 1.2 : -1.2) : 0}deg)`, transformOrigin: 'top center', zIndex: cur ? 2 : 1}}>
              <div style={{borderRadius: 22, overflow: 'hidden', background: gold ? 'linear-gradient(#FFF6D6, #FFE07A)' : '#FFF4EC', boxShadow: '0 24px 50px rgba(0,0,0,0.5)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', padding: '14px 28px', background: gold ? '#1a0b2e' : '#FF4FA0', color: '#fff',
                  fontFamily: SANS, fontWeight: 900, fontSize: 26, letterSpacing: '0.1em'}}>
                  <span>VICE NEWS{gold ? ' · BREAKING' : ''}</span><span>{e.year}</span></div>
                <div style={{padding: '28px 32px 34px'}}>
                  <div style={{fontFamily: SANS, fontWeight: 900, fontSize: e.head.length > 34 ? 56 : 66, color: '#1a0b2e', lineHeight: 1.06}}>{e.head}</div>
                  <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 36, color: '#c8246e', marginTop: 12}}>{e.sub}</div>
                </div>
              </div>
            </div>
          );
        })}
        {t >= endAt && (
          <div style={{position: 'absolute', left: 90, right: 90, top: 1400, textAlign: 'center', transform: `scale(${outBack(clamp01((t - endAt) / 0.4), 1.6)})`}}>
            <div style={{fontFamily: P.display, fontStyle: 'italic', fontSize: 96, color: '#FFE07A', lineHeight: 1, textShadow: '0 6px 24px rgba(0,0,0,0.6)'}}>Worth the wait?</div>
            <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 44, color: '#fff', marginTop: 22, textShadow: '0 4px 14px rgba(0,0,0,0.7)'}}>What do you remember? 👇</div>
          </div>
        )}
      </AbsoluteFill>
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};
