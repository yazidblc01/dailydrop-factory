// ---------- Texts from the future, flat: the exact editorial look of EdTexts, drawn in 2D (no WebGL).
// The automatic backup when the 3D render fails. Same props as EdTexts. ----------
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, Em, Grain, Head, MONO, Masthead, PAL, ProgressRule, Tag, lerp, outBack, outCubic, smooth, useEdFonts} from './kit';
import {SH, SW, drawPhoneScreen} from './phone';
import {EdTextsProps} from './Texts';

const Shadow: React.FC<{x: number; y: number; w: number; h: number; o: number}> = ({x, y, w, h, o}) => (
  <div style={{position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: '50%',
    background: `radial-gradient(closest-side, rgba(0,0,0,${o}), rgba(0,0,0,${o * 0.45}) 45%, transparent 100%)`}} />
);

export const EdTextsFlat: React.FC<EdTextsProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL[p.pal];
  const wall: [string, string, string] = P.name === 'paper' ? ['#E3412A', '#F08A4B', '#F6C56B'] : P.name === 'green' ? ['#0E3B2E', '#1F7A5C', '#E8B84A'] : ['#16161c', '#3a3f1a', '#C9FF3B'];
  const canvas = useMemo(() => { const c = document.createElement('canvas'); c.width = SW; c.height = SH; return c; }, []);
  const screen = useMemo(() => { if (!ready) return undefined; drawPhoneScreen(canvas, t, p, wall); return canvas.toDataURL('image/png'); }, [ready, t]);

  const big = p.messages.find((m) => m.big)!;
  const a = t - big.at;
  const R0 = 0.9, R1 = 4.1;
  const rev = smooth(R0, R0 + 0.7, a) * (1 - smooth(R1 - 0.6, R1, a));

  // phone: drops in, buzzes, turns slightly to face you as the chat opens, slides up and away for the reveal
  const drop = outBack(t / 0.5, 1.4);
  const buzz = p.notifications.reduce((s, n) => s + (t > n.at && t < n.at + 0.35 ? Math.sin((t - n.at) * 70) * 6 * (1 - (t - n.at) / 0.35) : 0), 0);
  const open = smooth(p.openAt - 0.1, p.openAt + 0.8, t);
  const W = 438, H = W * (3.99 / 2.17), X = 540 - W / 2, Y = 380;
  const lift = lerp(-260, 0, drop) - rev * 320, fadeP = Math.max(0, 1 - rev * 2.4);
  const skew = lerp(-7, 0, open) + Math.sin(t * 0.5) * 1.2 * (1 - rev);
  const shadowO = 0.34 * fadeP * Math.max(0, 1 - Math.abs(Math.min(0, lift)) / 500);

  // reveal: big number rises from the floor line, small "before" number pops in under it
  const rise = outBack((a - R0 - 0.45) / 0.7, 1.3) * (1 - smooth(R1 - 0.55, R1 - 0.1, a));
  const riseS = outBack((a - R0 - 0.8) / 0.5) * (1 - smooth(R1 - 0.6, R1 - 0.15, a));
  const tagK = smooth(R0 + 0.9, R0 + 1.3, a) * (1 - smooth(R1 - 0.7, R1 - 0.4, a));
  const headK = smooth(R0 + 0.35, R0 + 0.9, a) * (1 - smooth(R1 - 0.7, R1 - 0.35, a));
  const bigLen = p.reveal.big.length, bigSz = Math.min(250, 1500 / Math.max(4, bigLen * 0.62));
  const ser = (s: number): React.CSSProperties => ({fontFamily: P.display, fontWeight: P.dWeight, fontSize: s, letterSpacing: P.dTrack + 'em', lineHeight: 1});
  const floorY = 1010;

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.4} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.24} loop />}
      {p.notifications.map((n, i) => <Sequence key={`n${i}`} from={Math.round(n.at * fps)} durationInFrames={20}><Audio src={staticFile('sfx/received.wav')} volume={1} /></Sequence>)}
      {p.messages.filter((m) => m.at > 0).map((m, i) => (
        <Sequence key={`m${i}`} from={Math.round(m.at * fps)} durationInFrames={20}><Audio src={staticFile(m.from === 'me' ? 'sfx/sent.wav' : 'sfx/received.wav')} volume={1} /></Sequence>
      ))}
      <Sequence from={Math.round((big.at + R0 + 0.2) * fps)} durationInFrames={24}><Audio src={staticFile('sfx/thud.wav')} volume={0.9} /></Sequence>

      {shadowO > 0.01 && <Shadow x={540 + buzz} y={Y + H - 6} w={W * 1.25} h={64} o={shadowO} />}
      {fadeP > 0.01 && (
        <div style={{position: 'absolute', left: X + buzz, top: Y + lift, width: W, height: H, perspective: 1600, opacity: fadeP}}>
          <div style={{width: '100%', height: '100%', borderRadius: 64, background: P.dark ? '#c9ccd1' : '#1d1d1f', padding: 12, boxSizing: 'border-box',
            transform: `rotateY(${skew}deg) rotateX(4deg)`, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.18), 0 2px 0 rgba(0,0,0,0.25)'}}>
            {screen && <img src={screen} style={{width: '100%', height: '100%', borderRadius: 53, display: 'block'}} />}
          </div>
        </div>
      )}

      {a > R0 - 0.05 && a < R1 && (
        <>
          <div style={{position: 'absolute', left: 84, width: 912, top: floorY, height: 2, background: P.ink, opacity: 0.18 * rise}} />
          <Shadow x={540} y={floorY} w={760} h={44} o={0.2 * Math.max(0, rise)} />
          <div style={{position: 'absolute', left: 0, width: 1080, top: floorY - bigSz * 1.02, display: 'flex', justifyContent: 'center',
            transform: `scaleY(${Math.max(0.001, rise)})`, transformOrigin: '50% 100%'}}>
            <div style={{position: 'relative', ...ser(bigSz)}}>
              <div style={{position: 'absolute', left: bigSz * 0.035, top: bigSz * 0.035, color: 'transparent', WebkitTextStroke: `2px ${P.ink}`, opacity: 0.35}}>{p.reveal.big}</div>
              <div style={{position: 'relative', color: P.accent}}>{p.reveal.big}</div>
            </div>
          </div>
          <div style={{position: 'absolute', left: 0, width: 1080, top: floorY + 50, display: 'flex', justifyContent: 'center', transform: `scale(${Math.max(0.001, riseS)})`}}>
            <div style={{...ser(110), color: P.ink}}>{p.reveal.small}</div>
          </div>
        </>
      )}

      <Masthead P={P} label={p.label} />
      {p.caption && (() => {
        const k = Math.min(1, smooth(0.35, 0.9, t) * (1 - smooth(big.at + R0 - 0.4, big.at + R0 + 0.1, t)) + smooth(big.at + R1 - 0.2, big.at + R1 + 0.4, t));
        if (k < 0.01) return null;
        const c = p.caption;
        return (
          <div style={{position: 'absolute', top: 1246, left: 84, width: 912, opacity: k, textAlign: 'center'}}>
            <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 20, letterSpacing: '0.14em', color: P.mute}}>{c.kicker}</div>
            <div style={{...ser(P.dItalic ? 58 : 50), lineHeight: 1.12, color: P.ink, marginTop: 8}}>
              {c.lead}{' '}
              <span style={{fontStyle: P.dItalic ? 'italic' : 'normal', padding: '0 8px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
                background: `linear-gradient(176deg, transparent 18%, ${P.accent}55 20%, ${P.accent}55 82%, transparent 84%)`}}>{c.em}</span>
            </div>
          </div>
        );
      })()}
      {headK > 0.01 && (
        <Head P={P} top={372} size={P.dItalic ? 88 : 76} style={{opacity: headK, transform: `translateY(${(1 - headK) * 18}px)`}}>{p.reveal.line} <Em P={P}>{p.reveal.em}</Em></Head>
      )}
      {tagK > 0.01 && (
        <>
          <Tag P={P} x={540} y={floorY - bigSz * 1.02 - 60} opacity={tagK} solid>{p.reveal.bigTag}</Tag>
          <Tag P={P} x={540} y={floorY + 50 + 124} opacity={tagK}>{p.reveal.smallTag}</Tag>
        </>
      )}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
