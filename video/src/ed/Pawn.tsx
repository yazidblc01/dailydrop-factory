// ---------- Vice Pawn & Loan: then vs now, on shop shelves ----------
// A neon sign, a shelf wall with 6 items (2 per shelf). Each item gets its 2013 paper tag, then the yellow NOW tag slaps
// on top with a red % badge. An item can be a colored tile (chip) whose label flips from the old model to the new one when NOW lands.
// The finish: everything dims but the biggest jump, which gets a gold frame and a "BIGGEST JUMP" sticker (impact). Then the total card
// slams in, the NOW total counts up, the % stamps, then the question, and the logo outro.
// Layout (1080x1920): 0-150 free for the apps' buttons, header 160, title 258-428, sign 452, shelves 570-1500, total 1520-1690.
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, clamp01, outBack, outCubic, smooth, useEdFonts} from './kit';

type PawnItem = {ico: string; name: string; a: number; b: number; chip?: {bg: string; a: string; b: string}};
export type EdPawnProps = {pre: string; em: string; post: string; colA: string; items: PawnItem[]; start: number; step: number;
  outroAt: number; duration: number; music?: string | null; cart?: string; ask?: string};

// the finish timing, shared with engine/waited.py: biggest jump 0.8 s after the last NOW tag, the total 1.3 s after that
export const pawnTimes = (start: number, step: number, n: number) => {
  const lastNew = start + (n - 1) * step + step * 0.42;
  return {bigAt: lastNew + 0.8, totalAt: lastNew + 2.1};
};

const P = PAL.vice;
const usd = (v: number) => v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`;
const pct = (a: number, b: number) => { const k = Math.round((b / a - 1) * 100); return `${k >= 0 ? '+' : ''}${k}%`; };

export const EdPawn: React.FC<EdPawnProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const oldAt = (i: number) => p.start + i * p.step, newAt = (i: number) => oldAt(i) + p.step * 0.42;
  const {bigAt, totalAt} = pawnTimes(p.start, p.step, p.items.length);
  const ta = p.items.reduce((s, i) => s + i.a, 0), tb = p.items.reduce((s, i) => s + i.b, 0);
  const big = p.items.reduce((bi, it, i) => (it.b / it.a > p.items[bi].b / p.items[bi].a ? i : bi), 0);
  const bk = clamp01((t - bigAt) / 0.25);                       // 0 → 1 as the biggest jump lights up
  const cnt = outCubic(clamp01((t - totalAt - 0.3) / 0.8));     // the NOW total counts up
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
      <Sequence from={Math.round(bigAt * fps)} durationInFrames={30}><Audio src={staticFile('sfx/impact.mp3')} volume={0.8} /></Sequence>
      <Sequence from={Math.round(totalAt * fps)} durationInFrames={20}><Audio src={staticFile('sfx/whoosh.mp3')} volume={0.6} /></Sequence>
      <Sequence from={Math.round((totalAt + 1.15) * fps)} durationInFrames={24}><Audio src={staticFile('sfx/stamp.wav')} volume={0.85} /></Sequence>

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
          const isBig = i === big, dim = isBig ? 1 : 1 - 0.6 * bk;
          const flip = it.chip ? clamp01((t - newAt(i)) / 0.12) : 0;        // the tile's label flips old → new with the NOW slap
          const lab = it.chip ? (flip >= 1 ? it.chip.b : it.chip.a) : '';
          return (
            <div key={i} style={{position: 'absolute', left: x, top: y, width: 450, height: 250, opacity: dim}}>
              {isBig && bk > 0 && <div style={{position: 'absolute', left: -14, top: -10, width: 466, height: 262, borderRadius: 24,
                border: '5px solid #FFE07A', boxShadow: '0 0 40px rgba(255,224,122,0.55), inset 0 0 30px rgba(255,224,122,0.2)',
                transform: `scale(${1.06 - 0.06 * outBack(bk, 2)})`, opacity: bk}} />}
              {it.chip ? (
                <div style={{position: 'absolute', left: 25, top: 25, width: 140, height: 140, borderRadius: 30, background: it.chip.bg,
                  boxShadow: '0 8px 18px rgba(0,0,0,0.45), inset 0 -8px 0 rgba(0,0,0,0.18)', display: 'grid', placeItems: 'center',
                  transform: `scale(${icoK}) scaleX(${flip > 0 && flip < 1 ? Math.abs(1 - 2 * flip) : 1})`}}>
                  <div style={{fontFamily: SANS, fontWeight: 900, color: '#fff', textAlign: 'center', lineHeight: 1.0, whiteSpace: 'pre',
                    fontSize: Math.max(...lab.split('\n').map((l) => l.length)) > 6 ? 30 : Math.max(...lab.split('\n').map((l) => l.length)) > 4 ? 38 : 48}}>{lab}</div>
                </div>
              ) : <div style={{position: 'absolute', left: 20, top: 30, width: 150, textAlign: 'center', fontSize: 130, lineHeight: 1, transform: `scale(${icoK})`}}>{it.ico}</div>}
              <div style={{position: 'absolute', left: -5, top: 190, width: 200, textAlign: 'center', fontFamily: SANS, fontWeight: 900, whiteSpace: 'nowrap',
                fontSize: it.name.length > 14 ? 23 : it.name.length > 11 ? 26 : 28, color: '#ffe9f4', opacity: clamp01(icoK)}}>{it.name}</div>
              {ka > 0 && <div style={{position: 'absolute', left: 200, top: 24, padding: '10px 18px 12px', borderRadius: 10, background: '#f4ead8', color: '#1a0b2e',
                fontFamily: SANS, fontWeight: 900, fontSize: 44, boxShadow: '0 8px 16px rgba(0,0,0,0.45)', transform: `rotate(-5deg) scale(${ka})`, transformOrigin: 'top left'}}>
                <div style={{fontWeight: 800, fontSize: 20, letterSpacing: '0.1em', opacity: 0.7}}>{p.colA}</div>{usd(it.a)}</div>}
              {kb > 0 && <div style={{position: 'absolute', left: 236, top: 112, padding: '10px 18px 12px', borderRadius: 10, background: '#FFE07A', color: '#1a0b2e',
                fontFamily: SANS, fontWeight: 900, fontSize: 44, boxShadow: '0 10px 20px rgba(0,0,0,0.5)', transform: `rotate(4deg) scale(${slap})`, opacity: kb}}>
                <div style={{fontWeight: 800, fontSize: 20, letterSpacing: '0.1em', opacity: 0.7}}>NOW</div>{usd(it.b)}</div>}
              {kb >= 1 && <div style={{position: 'absolute', left: 350, top: 200, padding: '6px 12px', borderRadius: 999, background: it.b >= it.a ? '#FF3B5C' : '#22C55E',
                color: '#fff', fontFamily: SANS, fontWeight: 900, fontSize: 26, transform: `rotate(-3deg) scale(${outBack(clamp01((t - newAt(i) - 0.18) / 0.25), 2.4)})`}}>{pct(it.a, it.b)}</div>}
              {isBig && bk > 0 && <div style={{position: 'absolute', left: 150, top: -30, padding: '6px 18px', borderRadius: 999, background: '#FF2E4D', color: '#fff',
                fontFamily: SANS, fontWeight: 900, fontSize: 30, letterSpacing: '0.04em', whiteSpace: 'nowrap', boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
                transform: `rotate(-4deg) scale(${1.9 - 0.9 * outBack(bk, 1.6)})`}}>😭 BIGGEST JUMP</div>}
            </div>
          );
        })}
        {/* the total */}
        {t >= totalAt && (
          <div style={{position: 'absolute', left: 50, right: 50, top: 1520, height: 170, borderRadius: 26, background: '#0d0718', border: '4px solid #FFE07A',
            boxShadow: '0 0 40px rgba(255,224,122,0.3)', transform: `scale(${outBack(clamp01((t - totalAt) / 0.35), 1.6)})`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10}}>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 22, fontFamily: SANS, fontWeight: 900, fontSize: 54, color: '#fff'}}>
              {p.cart ?? 'The cart'}: <span style={{color: '#9be59b'}}>{usd(ta)}</span> → <span style={{color: '#FF6B81'}}>{usd(ta + (tb - ta) * cnt)}</span>
              {t >= totalAt + 1.15 && <span style={{fontSize: 40, color: '#1a0b2e', background: '#FFE07A', padding: '2px 14px', borderRadius: 12, display: 'inline-block',
                transform: `rotate(-4deg) scale(${1.8 - 0.8 * outBack(clamp01((t - totalAt - 1.15) / 0.2), 2)})`}}>{pct(ta, tb)}</span>}</div>
            <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 38, color: 'rgba(255,255,255,0.85)', opacity: smooth(totalAt + 1.6, totalAt + 1.9, t)}}>{p.ask ?? 'Which one hurts the most? 👇'}</div>
          </div>
        )}
      </AbsoluteFill>
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};
