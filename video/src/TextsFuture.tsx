import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoBadge, Progress} from './RankingReveal';

// ---------- Texts from the future v2: a phone on screen, a real-looking chat, text only ----------
// Light mode chat like a real screenshot. The viewer is the past you (blue, right side).
// The future you is the contact (grey, left side). Generic phone, no logos.

const INTER = 'Inter';
const ANTON = 'Anton';
const W = 1080;
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

export type Msg = {from: 'me' | 'them'; text: string; at: number};
export type TFProps = {
  duration: number;
  hookTop: string;          // big line above the phone during the first seconds
  hookBottom: string;
  contact: string;          // "Me (2026)"
  stamp: string;            // "Fri, Nov 15, 2013 at 10:24 PM"
  clock: string;            // status bar time "10:24"
  messages: Msg[];
  typing: number[];         // times the contact starts typing (shown 0.9 s)
  sourceLabel: string;
  music?: string | null;    // "music/headphonk.mp3", played under the chat
  musicStart?: number;      // seconds of intro to skip
};

const BLUE = '#0B84FE';
const GREY = '#E9E9EB';

// phone geometry (video pixels)
const PX = 220;
const PY = 262;
const PW = 640;
const PH = 1190;
const BEZEL = 18;
const SX = PX + BEZEL;
const SY = PY + BEZEL;
const SW = PW - 2 * BEZEL;
const SH = PH - 2 * BEZEL;

const StatusBar: React.FC<{clock: string}> = ({clock}) => (
  <div style={{position: 'absolute', top: 0, left: 0, width: SW, height: 58, display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '0 46px 0 54px', fontFamily: INTER, fontWeight: 700, fontSize: 25, color: '#000'}}>
    <span>{clock}</span>
    <div style={{display: 'flex', alignItems: 'center', gap: 9}}>
      <svg width="30" height="18" viewBox="0 0 30 18">{[0, 1, 2, 3].map((i) => <rect key={i} x={i * 8} y={12 - i * 4} width="6" height={6 + i * 4} rx="1.5" fill="#000" />)}</svg>
      <svg width="26" height="18" viewBox="0 0 26 18"><path d="M13 17 L9 12.5 A6 6 0 0 1 17 12.5 Z" fill="#000" />
        <path d="M5 8.5 A11.5 11.5 0 0 1 21 8.5" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M1.5 4.8 A16.5 16.5 0 0 1 24.5 4.8" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
      <svg width="40" height="20" viewBox="0 0 40 20"><rect x="1" y="1" width="33" height="18" rx="5" stroke="rgba(0,0,0,0.4)" strokeWidth="2" fill="none" />
        <rect x="4" y="4" width="22" height="12" rx="3" fill="#000" /><rect x="36" y="7" width="3" height="6" rx="1.5" fill="rgba(0,0,0,0.4)" /></svg>
    </div>
  </div>
);

const Header: React.FC<{name: string}> = ({name}) => (
  <div style={{position: 'absolute', top: 58, left: 0, width: SW, height: 150, background: 'rgba(247,247,247,0.96)',
    borderBottom: '1px solid rgba(0,0,0,0.12)', zIndex: 2}}>
    <div style={{position: 'absolute', left: 18, top: 30, display: 'flex', alignItems: 'center', color: BLUE, fontFamily: INTER, fontSize: 30}}>
      <svg width="18" height="30" viewBox="0 0 18 30"><path d="M15 3 L4 15 L15 27" stroke={BLUE} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span style={{marginLeft: 6, background: BLUE, color: '#fff', borderRadius: 16, fontSize: 21, fontWeight: 700, padding: '1px 10px'}}>3</span>
    </div>
    <div style={{position: 'absolute', left: 0, width: SW, top: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
      <div style={{width: 84, height: 84, borderRadius: 42, background: 'linear-gradient(180deg,#A5A9B3,#868A93)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: INTER, fontWeight: 600, fontSize: 34}}>ME</div>
      <div style={{fontFamily: INTER, fontWeight: 500, fontSize: 22, color: '#000'}}>{name} <span style={{color: 'rgba(0,0,0,0.35)'}}>›</span></div>
    </div>
  </div>
);

// one bubble, with the classic tail on the last bubble of a run
const Bubble: React.FC<{m: Msg; k: number; tail: boolean}> = ({m, k, tail}) => {
  const me = m.from === 'me';
  const bg = me ? BLUE : GREY;
  const onlyEmoji = /^[\p{Extended_Pictographic}‍️\s]+$/u.test(m.text);
  return (
    <div style={{display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start', width: '100%', padding: '0 22px',
      transform: `scale(${0.7 + 0.3 * k})`, transformOrigin: me ? 'bottom right' : 'bottom left', opacity: Math.min(1, k * 2)}}>
      {onlyEmoji ? (
        <div style={{fontSize: 84, lineHeight: 1.1}}>{m.text}</div>
      ) : (
        <div style={{position: 'relative', maxWidth: 420, background: bg, color: me ? '#fff' : '#000', borderRadius: 34,
          padding: '14px 24px 15px', fontFamily: INTER, fontWeight: 400, fontSize: 32, lineHeight: 1.28, letterSpacing: -0.2}}>
          {m.text}
          {tail && (
            <svg width="22" height="28" viewBox="0 0 22 28" style={{position: 'absolute', bottom: 0, [me ? 'right' : 'left']: -8,
              transform: me ? 'none' : 'scaleX(-1)'}}>
              <path d="M0 0 C2 14 6 22 22 28 C10 28 3 26 0 22 Z" fill={bg} />
            </svg>
          )}
        </div>
      )}
    </div>
  );
};

const Typing: React.FC<{t: number}> = ({t}) => (
  <div style={{display: 'flex', width: '100%', padding: '0 22px'}}>
    <div style={{position: 'relative', background: GREY, borderRadius: 34, padding: '20px 24px', display: 'flex', gap: 8}}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{width: 15, height: 15, borderRadius: 8, background: '#8E8E93',
          opacity: 0.35 + 0.65 * Math.max(0, Math.sin(t * 7 - i * 1.1))}} />
      ))}
      <div style={{position: 'absolute', left: -5, bottom: -3, width: 16, height: 16, borderRadius: 8, background: GREY}} />
      <div style={{position: 'absolute', left: -12, bottom: -10, width: 8, height: 8, borderRadius: 4, background: GREY}} />
    </div>
  </div>
);

const InputBar: React.FC = () => (
  <div style={{position: 'absolute', bottom: 0, left: 0, width: SW, height: 120, background: '#fff', display: 'flex',
    alignItems: 'flex-start', padding: '14px 18px 0', gap: 14, zIndex: 2}}>
    <div style={{width: 54, height: 54, borderRadius: 27, background: '#E9E9EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: INTER, fontSize: 40, color: '#8E8E93', fontWeight: 300}}>+</div>
    <div style={{flex: 1, height: 54, borderRadius: 27, border: '1.5px solid #D1D1D6', display: 'flex', alignItems: 'center',
      padding: '0 22px', fontFamily: INTER, fontSize: 27, color: '#B0B0B5'}}>Text Message</div>
    <div style={{position: 'absolute', bottom: 12, left: SW / 2 - 70, width: 140, height: 8, borderRadius: 4, background: '#000'}} />
  </div>
);

export const TextsFuture: React.FC<TFProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const shown = p.messages.filter((m) => m.at <= t);
  const typing = p.typing.some((a) => t >= a && t < a + 0.9);
  const lastMine = [...shown].reverse().find((m) => m.from === 'me');
  const theyAnsweredAfter = lastMine ? shown.some((m) => m.from === 'them' && m.at > lastMine.at) : false;
  const read = lastMine && (theyAnsweredAfter || typing);

  const intro = interpolate(t, [0, 0.6], [0, 1], {...clamp});
  const phoneIn = spring({frame, fps, config: {damping: 16, stiffness: 120}});
  const hookOut = interpolate(t, [2.2, 2.7], [1, 0], clamp);

  return (
    <AbsoluteFill style={{background: 'radial-gradient(120% 80% at 50% 30%, #1d2440 0%, #0b0d14 60%)', fontFamily: INTER}}>
      <Progress duration={p.duration} T={{accent: BLUE} as any} />
      {/* message sounds: a swoosh when you send, a soft ding when they answer (made from scratch, no app sounds) */}
      {p.messages.map((m, i) => (
        <Sequence key={`s${i}`} from={Math.round(m.at * fps)} durationInFrames={Math.round(0.5 * fps)}>
          <Audio src={staticFile(m.from === 'me' ? 'sfx/sent.wav' : 'sfx/received.wav')} volume={p.music ? 1 : 0.55} />
        </Sequence>
      ))}
      {p.music && <Audio src={staticFile(p.music)} volume={0.22} startFrom={Math.round((p.musicStart || 0) * fps)} loop />}

      {/* the phone */}
      <div style={{position: 'absolute', left: PX, top: PY, width: PW, height: PH, borderRadius: 108, background: '#111215',
        boxShadow: '0 0 0 3px #3a3b40, 0 50px 120px rgba(0,0,0,0.7), 0 0 120px rgba(11,132,254,0.18)',
        transform: `translateY(${(1 - phoneIn) * 200}px) scale(${0.94 + 0.06 * phoneIn})`, opacity: intro}}>
        <div style={{position: 'absolute', left: BEZEL, top: BEZEL, width: SW, height: SH, borderRadius: 92, overflow: 'hidden', background: '#fff'}}>
          <StatusBar clock={p.clock} />
          {/* camera pill */}
          <div style={{position: 'absolute', top: 16, left: SW / 2 - 66, width: 132, height: 38, borderRadius: 19, background: '#000', zIndex: 3}} />
          <Header name={p.contact} />
          {/* messages, bottom anchored above the input bar */}
          <div style={{position: 'absolute', left: 0, width: SW, top: 210, bottom: 122, overflow: 'hidden', display: 'flex',
            flexDirection: 'column', justifyContent: 'flex-end', gap: 6, paddingBottom: 10}}>
            <div style={{textAlign: 'center', fontFamily: INTER, fontSize: 20, color: '#8E8E93', margin: '6px 0 10px'}}>
              <b style={{fontWeight: 600}}>{p.stamp.split(' at ')[0]}</b> at {p.stamp.split(' at ')[1]}
            </div>
            {shown.map((m, i) => {
              const nxt = shown[i + 1];
              const tail = !nxt || nxt.from !== m.from;
              const k = spring({frame: Math.max(0, (t - m.at) * fps), fps, config: {damping: 15, stiffness: 260}});
              const gapAfter = nxt && nxt.from !== m.from ? 10 : 0;
              return (
                <React.Fragment key={i}>
                  <div style={{marginBottom: gapAfter}}><Bubble m={m} k={k} tail={tail} /></div>
                  {m === lastMine && (
                    <div style={{textAlign: 'right', padding: '0 30px', marginTop: -2, fontFamily: INTER, fontSize: 19, color: '#8E8E93'}}>
                      {read ? <span><b style={{fontWeight: 600}}>Read</b> {p.clock}</span> : 'Delivered'}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {typing && <Typing t={t} />}
          </div>
          <InputBar />
        </div>
      </div>

      {/* hook text over the top of the phone at the start */}
      {hookOut > 0 && (
        <div style={{position: 'absolute', top: 640, left: 90, width: 900, textAlign: 'center', opacity: hookOut,
          transform: `scale(${0.9 + 0.1 * phoneIn}) rotate(-2deg)`}}>
          <div style={{display: 'inline-block', background: '#0B0D14', borderRadius: 30, padding: '20px 40px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)'}}>
            <div style={{fontFamily: ANTON, fontSize: 76, lineHeight: 1.08, color: '#fff'}}>{p.hookTop}</div>
            <div style={{fontFamily: ANTON, fontSize: 76, lineHeight: 1.08, color: '#FACC15'}}>{p.hookBottom}</div>
          </div>
        </div>
      )}

      <div style={{position: 'absolute', top: 1478, left: 110, width: 860, textAlign: 'center', fontFamily: INTER, fontWeight: 600,
        fontSize: 22, color: 'rgba(255,255,255,0.5)'}}>{p.sourceLabel}</div>
      <LogoBadge T={{accent: '#FACC15', onAccent: '#07090D'} as any} />
    </AbsoluteFill>
  );
};
