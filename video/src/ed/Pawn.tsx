// ---------- Vice Pawn & Loan: then vs now, on shop shelves ----------
// A neon sign, a shelf wall with 6 items (2 per shelf). Each item gets its 2013 paper tag, then the yellow NOW tag slaps
// on top with a red % badge. Then the whole cart then vs now, "Which one hurts the most?", and the logo outro.
// Layout (1080x1920): 0-150 free for the apps' buttons, header 160, title 258-428, sign 452, shelves 570-1500, total 1520-1690.
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, clamp01, outBack, smooth, useEdFonts} from './kit';

type PawnItem = {ico: string; name: string; a: number; b: number};
export type EdPawnProps = {pre: string; em: string; post: string; colA: string; items: PawnItem[]; start: number; step: number;
  outroAt: number; duration: number; music?: string | null};

const P = PAL.vice;
const usd = (v: number) => v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`;
const pct = (a: number, b: number) => { const k = Math.round((b / a - 1) * 100); return `${k >= 0 ? '+' : ''}${k}%`; };

export const EdPawn: React.FC<EdPawnProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const oldAt = (i: number) => p.start + i * p.step, newAt = (i: number) => oldAt(i) + p.step * 0.42;
  const totalAt = newAt(p.items.length - 1) + 0.7;
  const ta = p.items.reduce((s, i) => s + i.a, 0), tb = p.items.reduce((s, i) => s + i.b, 0);
  const titleK = outBack(clamp01(t / 0.35), 1.6);
  const flick = t < 0.25 ? 0 : t < 0.32 ? 1 : t < 0.38 ? 0.2 : t < 0.5 ? 1 : t < 0.55 ? 0.4 : 1;   // the sign flickers on
  const fade = 1 - smooth(p.outroAt - 0.2, p.outroAt, t);

  return (
    <AbsoluteFill style={{background: 'linear-gradient(#1B0B33, #2b1146 45%, #1a0b2e)'}}>
      {p.music && <Audio src={staticFile(p.music)} volume={0.28} loop />}
      <Sequence from={Math.round(0.25 * fps)} durationInFrames={20}><Audio src={staticFile('sfx/tick.mp3')} volume={0.5} /></Sequence>
      {p.items.map((_, i) => (
        <React.Fragment key={i}>
          <Sequence from={Math.round(oldAt(i) * fps)} durationInFrames={15}><Audio src={staticFile('sfx/pop.wav')} volume={0.55} /></Sequence>
          <Sequence from={Math.round(newAt(i) * fps)} durationInFrames={24}><Audio src={staticFile('sfx/stamp.wav')} volume={0.85} /></Sequence>
        </React.Fragment>
      ))}
      <Sequence from={Math.round(totalAt * fps)} durationInFrames={30}><Audio src={staticFile('sfx/impact.mp3')} volume={0.8} /></Sequence>

      <Masthead P={P} label="" top={160} />
      <div style={{position: 'absolute', left: 70, right: 70, top: 258, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: P.display, fontSize: (p.pre + p.em + p.post).length > 32 ? 74 : 84, lineHeight: 1.0, color: P.ink, opacity: clamp01(titleK), transform: `scale(${0.92 + 0.08 * titleK})`}}>
        <span>{p.pre}<span style={{color: '#FFE07A', fontStyle: 'italic'}}>{p.em}</span>{p.post}</span>
      </div>

      <AbsoluteFill style={{opacity: fade}}>
        {/* the neon sign */}
        <div style={{position: 'absolute', left: 0, right: 0, top: 452, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 76, letterSpacing: '0.04em', color: '#fff',
          opacity: 0.25 + 0.75 * flick, textShadow: flick > 0.5 ? '0 0 8px #FF4FA0, 0 0 24px #FF4FA0, 0 0 60px #FF4FA0' : 'none'}}>
          VICE <span style={{textShadow: flick > 0.5 ? '0 0 8px #2FE0FF, 0 0 24px #2FE0FF, 0 0 60px #2FE0FF' : 'none'}}>PAWN</span> &amp; LOAN
        </div>
        {/* the wall and its shelves */}
        <div style={{position: 'absolute', left: 50, right: 50, top: 570, height: 930, borderRadius: 30, border: '4px solid #4a2266', boxShadow: 'inset 0 0 80px rgba(0,0,0,0.6)',
          background: 'repeating-linear-gradient(90deg, #3a1a52 0 60px, #341749 60px 120px)'}}>
          {[0, 1, 2].map((r) => <div key={r} style={{position: 'absolute', left: 30, right: 30, top: 270 + r * 300, height: 22, borderRadius: 6,
            background: 'linear-gradient(#b07a4a, #7a4e2a)', boxShadow: '0 10px 18px rgba(0,0,0,0.5)'}} />)}
        </div>
        {/* the items */}
        {p.items.map((it, i) => {
          const x = i % 2 ? 560 : 80, y = 600 + Math.floor(i / 2) * 300;
          const ka = outBack(clamp01((t - oldAt(i)) / 0.3), 1.8), kb = clamp01((t - newAt(i)) / 0.18);
          const slap = kb < 1 ? 1.6 - 0.6 * kb : 1 + 0.06 * Math.max(0, 1 - (t - newAt(i) - 0.18) / 0.2);
          const icoK = outBack(clamp01((t - oldAt(i) + 0.15) / 0.35), 2);
          return (
            <div key={i} style={{position: 'absolute', left: x, top: y, width: 450, height: 250}}>
              <div style={{position: 'absolute', left: 20, top: 30, width: 150, textAlign: 'center', fontSize: 130, lineHeight: 1, transform: `scale(${icoK})`}}>{it.ico}</div>
              <div style={{position: 'absolute', left: 0, top: 190, width: 190, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 28, color: '#ffe9f4', opacity: clamp01(icoK)}}>{it.name}</div>
              {ka > 0 && <div style={{position: 'absolute', left: 200, top: 24, padding: '10px 18px 12px', borderRadius: 10, background: '#f4ead8', color: '#1a0b2e',
                fontFamily: SANS, fontWeight: 900, fontSize: 44, boxShadow: '0 8px 16px rgba(0,0,0,0.45)', transform: `rotate(-5deg) scale(${ka})`, transformOrigin: 'top left'}}>
                <div style={{fontWeight: 800, fontSize: 20, letterSpacing: '0.1em', opacity: 0.7}}>{p.colA}</div>{usd(it.a)}</div>}
              {kb > 0 && <div style={{position: 'absolute', left: 236, top: 112, padding: '10px 18px 12px', borderRadius: 10, background: '#FFE07A', color: '#1a0b2e',
                fontFamily: SANS, fontWeight: 900, fontSize: 44, boxShadow: '0 10px 20px rgba(0,0,0,0.5)', transform: `rotate(4deg) scale(${slap})`, opacity: kb}}>
                <div style={{fontWeight: 800, fontSize: 20, letterSpacing: '0.1em', opacity: 0.7}}>NOW</div>{usd(it.b)}</div>}
              {kb >= 1 && <div style={{position: 'absolute', left: 350, top: 200, padding: '6px 12px', borderRadius: 999, background: it.b >= it.a ? '#FF3B5C' : '#22C55E',
                color: '#fff', fontFamily: SANS, fontWeight: 900, fontSize: 26, transform: `rotate(-3deg) scale(${outBack(clamp01((t - newAt(i) - 0.18) / 0.25), 2.4)})`}}>{pct(it.a, it.b)}</div>}
            </div>
          );
        })}
        {/* the total */}
        {t >= totalAt && (
          <div style={{position: 'absolute', left: 50, right: 50, top: 1520, height: 170, borderRadius: 26, background: '#0d0718', border: '4px solid #FFE07A',
            boxShadow: '0 0 40px rgba(255,224,122,0.3)', transform: `scale(${outBack(clamp01((t - totalAt) / 0.35), 1.6)})`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10}}>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 22, fontFamily: SANS, fontWeight: 900, fontSize: 54, color: '#fff'}}>
              The cart: <span style={{color: '#9be59b'}}>{usd(ta)}</span> → <span style={{color: '#FF6B81'}}>{usd(tb)}</span>
              <span style={{fontSize: 40, color: '#FFE07A'}}>{pct(ta, tb)}</span></div>
            <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 38, color: 'rgba(255,255,255,0.85)', opacity: smooth(totalAt + 0.6, totalAt + 0.9, t)}}>Which one hurts the most? 👇</div>
          </div>
        )}
      </AbsoluteFill>
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};
