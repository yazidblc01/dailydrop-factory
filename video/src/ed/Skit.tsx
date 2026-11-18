// ---------- GTA Math skits: voiced cartoon comedy for the GTA 6 wave, three looks that rotate ----------
//   couch:     you and someone (your girl, mom, boss, dad) on the couch, texts pop up, speech bubbles
//   phones:    two phones side by side, the same text to two people (your girl vs Lucia, your boss vs the group chat)
//   countdown: a narrator counts down #3 #2 #1 over cartoon scenes (bank, getaway car, couch, beach)
// Game characters are never drawn: they only exist as texts. All 2D, timed from the voice (one dialogue take).
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, Follow, FollowCard, Grain, MONO, Masthead, PAL, PalName, SANS, clamp01, outBack, smooth, useEdFonts} from './kit';

type Word = {w: string; start: number; end: number};
export type Line = {who: 'you' | 'other' | 'text' | 'narrator' | 'left' | 'right'; show: string; start: number; end: number; words: Word[];
  to?: 'left' | 'right' | 'both'; youMood?: string; herMood?: string; kick?: number; kickLine?: string; scene?: string; notif?: string; cap?: string};
export type Contact = {name: string; sub: string; dark?: boolean};
export type EdSkitProps = {pal: PalName; style: 'couch' | 'phones' | 'countdown'; duration: number; label: string; badge: string;
  other: {look: 'girl' | 'mom' | 'boss' | 'dad'; role: string}; sender: string; left: Contact; right: Contact;
  headA: string; headB: string; lines: Line[]; tag: string; tagAt: number; audio?: string | null; music?: string | null; follow?: Follow};

const GOLD = '#FFE07A', PINK = '#FF4FA0', CREAM = '#FFF3EA', INK = '#2A1046', SKIN = '#F1C29A', BLUE = '#3B4BC8';
const ser = (s: number): React.CSSProperties => ({fontFamily: 'Instrument Serif', fontSize: s, lineHeight: 1, letterSpacing: '-0.02em'});
const pill = (bg: string, fg: string, s = 24): React.CSSProperties => ({display: 'inline-block', fontFamily: MONO, fontWeight: 700, fontSize: s, letterSpacing: '0.1em',
  padding: '8px 16px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap'});

// what is said so far in a line (whole words, as they are spoken)
const said = (l: Line, t: number) => {
  if (!l.words.length) return l.show;
  const n = l.words.filter((w) => t >= w.start - 0.02).length;
  return l.words.slice(0, Math.max(1, n)).map((w) => w.w).join(' ');
};
const talking = (lines: Line[], who: string, t: number) => lines.some((l) => l.who === who && t >= l.start && t < l.end - 0.05);
const moodAt = (lines: Line[], key: 'youMood' | 'herMood', t: number, dflt: string) => {
  let m = dflt;
  for (const l of lines) if (l.start <= t + 0.05 && l[key]) m = l[key] as string;
  return m;
};

// ===== characters (original cartoons) =====
const Mouth: React.FC<{talk: boolean; t: number; base: React.ReactNode}> = ({talk, t, base}) =>
  talk ? <ellipse cx={0} cy={28} rx={13} ry={6 + 7 * Math.abs(Math.sin(t * 17))} fill={INK} /> : <>{base}</>;
const blink = (t: number, off = 0) => ((t + off) % 3.1) < 0.12;

export const You: React.FC<{x: number; y: number; s?: number; mood?: string; talk?: boolean; t: number; hold?: 'ctrl' | 'phone' | 'wheel' | 'none'; mask?: boolean; shades?: boolean}> =
  ({x, y, s = 1, mood = 'chill', talk = false, t, hold = 'ctrl', mask = false, shades = false}) => {
  const b = blink(t);
  const eyes = b ? <path d="M-32 -8 h18 M14 -8 h18" stroke={INK} strokeWidth={6} strokeLinecap="round" />
    : mood === 'shock' || mood === 'sweat' ? <><circle cx={-22} cy={-8} r={10} fill="#fff" stroke={INK} strokeWidth={4} /><circle cx={22} cy={-8} r={10} fill="#fff" stroke={INK} strokeWidth={4} /><circle cx={-22} cy={-8} r={4} fill={INK} /><circle cx={22} cy={-8} r={4} fill={INK} /></>
    : mood === 'smug' ? <path d="M-32 -6 h18 M14 -6 h18" stroke={INK} strokeWidth={7} strokeLinecap="round" />
    : mood === 'sad' ? <path d="M-32 -2 q8 -8 16 0 M14 -2 q8 -8 16 0" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" transform="scale(1,-1) translate(0,8)" />
    : <path d="M-30 -8 q8 -6 16 0 M14 -8 q8 -6 16 0" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />;
  const mouth = mood === 'shock' ? <ellipse cx={0} cy={28} rx={11} ry={14} fill={INK} />
    : mood === 'smug' ? <path d="M-14 24 q18 12 30 -4" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />
    : mood === 'sad' || mood === 'sweat' ? <path d="M-12 32 q12 -10 24 0" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />
    : <path d="M-12 24 q12 10 24 0" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />;
  const bob = Math.sin(t * 2.2) * 3 + (talk ? Math.sin(t * 9) * 3 : 0);
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      <g transform={`translate(${x},${y + bob}) scale(${s})`}>
        <path d="M-110 330 Q-120 120 -60 90 L60 90 Q120 120 110 330Z" fill={BLUE} />
        <path d="M-40 90 Q0 130 40 90" fill="#2c3aa8" />
        <rect x={-26} y={66} width={52} height={34} fill={SKIN} />
        <circle cx={0} cy={0} r={78} fill={SKIN} />
        <path d="M-80 -10 Q-86 -96 0 -92 Q84 -96 80 -14 Q60 -60 0 -58 Q-56 -60 -80 -10Z" fill="#2a1b12" />
        <circle cx={-78} cy={6} r={14} fill={SKIN} /><circle cx={78} cy={6} r={14} fill={SKIN} />
        {shades ? <g><rect x={-46} y={-22} width={40} height={26} rx={8} fill="#111" /><rect x={6} y={-22} width={40} height={26} rx={8} fill="#111" /><path d="M-6 -12 h12" stroke="#111" strokeWidth={5} /></g> : eyes}
        {!mask && <Mouth talk={talk} t={t} base={mouth} />}
        {mask && <g><path d="M-62 4 Q0 30 62 4 L58 52 Q0 74 -58 52Z" fill="#E0312B" /><circle cx={-20} cy={34} r={4} fill="#fff" /><circle cx={14} cy={44} r={4} fill="#fff" /></g>}
        {mood === 'sweat' && <path d={`M52 ${-40 + (t * 40) % 30} q10 18 0 26 q-10 -8 0 -26z`} fill="#7FD3FF" />}
        {hold === 'ctrl' && <g><rect x={-60} y={150} width={120} height={54} rx={27} fill="#2b2b33" /><circle cx={-30} cy={177} r={7} fill={PINK} /><circle cx={32} cy={172} r={6} fill="#7FD3FF" /><circle cx={44} cy={184} r={6} fill={GOLD} /></g>}
        {hold === 'phone' && <g><rect x={40} y={110} width={44} height={80} rx={9} fill="#111" stroke={GOLD} strokeWidth={4} /><rect x={46} y={118} width={32} height={60} rx={4} fill="#FF8A4C" /></g>}
      </g>
    </svg>
  );
};

export const Girl: React.FC<{x: number; y: number; s?: number; mood?: string; talk?: boolean; t: number; point?: boolean; mom?: boolean}> =
  ({x, y, s = 1, mood = 'sus', talk = false, t, point, mom}) => {
  const angry = mood === 'mad' || mood === 'fury';
  const steam = mood === 'fury' ? 3 : mood === 'mad' ? 2 : 0;
  const pt = point ?? (mood === 'fury');
  const mouth = mood === 'fury' ? <path d="M-20 24 h40 v14 h-40z" fill="#fff" stroke={INK} strokeWidth={5} />
    : mood === 'happy' ? <path d="M-14 22 q14 14 28 0" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />
    : mood === 'sus' ? <path d="M-14 28 h26" stroke={INK} strokeWidth={6} strokeLinecap="round" />
    : <path d="M-14 30 q14 -10 28 0" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />;
  const b = blink(t, 1.3);
  const shake = mood === 'fury' ? Math.sin(t * 40) * 2.5 : 0;
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      <g transform={`translate(${x + shake},${y + Math.sin(t * 2.4 + 1) * 3}) scale(${s})`}>
        {mom ? <circle cx={0} cy={-96} r={34} fill="#6b4a3a" /> : <path d="M70 -60 Q150 -40 130 90 Q110 40 80 30Z" fill="#5a2a14" />}
        <path d="M-100 330 Q-110 130 -60 92 L60 92 Q110 130 100 330Z" fill={mom ? '#2E9C8F' : PINK} />
        <rect x={-24} y={66} width={48} height={34} fill={SKIN} />
        <circle cx={0} cy={0} r={76} fill={SKIN} />
        <path d="M-82 10 Q-90 -96 0 -90 Q90 -96 82 10 Q70 -50 0 -54 Q-70 -50 -82 10Z" fill={mom ? '#6b4a3a' : '#5a2a14'} />
        <circle cx={-40} cy={22} r={11} fill="#FF8AAE" opacity={0.6} /><circle cx={40} cy={22} r={11} fill="#FF8AAE" opacity={0.6} />
        {angry && <path d="M-38 -30 l26 10 M38 -30 l-26 10" stroke="#3a1a10" strokeWidth={7} strokeLinecap="round" />}
        {mood === 'sus' && <path d="M-36 -26 h24 M14 -22 h24" stroke="#3a1a10" strokeWidth={7} strokeLinecap="round" />}
        {b ? <path d="M-30 -4 h16 M14 -4 h16" stroke={INK} strokeWidth={6} strokeLinecap="round" /> : <><circle cx={-22} cy={-4} r={7} fill={INK} /><circle cx={22} cy={-4} r={7} fill={INK} /></>}
        {mom && <g fill="none" stroke={INK} strokeWidth={5}><circle cx={-22} cy={-4} r={20} /><circle cx={22} cy={-4} r={20} /><path d="M-2 -4 h4" /></g>}
        <Mouth talk={talk} t={t} base={mouth} />
        {Array.from({length: steam}, (_, i) => {
          const ph = ((t * 1.4 + i * 0.33) % 1);
          return <path key={i} d={`M${[-50, 0, 50][i]} ${-110 - ph * 40} q-14 -20 0 -40 q14 -20 0 -40`} stroke="rgba(255,255,255,0.85)" strokeWidth={10} fill="none" strokeLinecap="round" opacity={1 - ph} />;
        })}
        {pt ? <><path d="M70 120 L190 70" stroke={SKIN} strokeWidth={30} strokeLinecap="round" /><circle cx={196} cy={66} r={18} fill={SKIN} /></>
          : <path d="M-80 170 Q0 200 80 170" stroke={SKIN} strokeWidth={30} fill="none" strokeLinecap="round" />}
      </g>
    </svg>
  );
};

export const Man: React.FC<{x: number; y: number; s?: number; mood?: string; talk?: boolean; t: number; dad?: boolean}> = ({x, y, s = 1, mood = 'sus', talk = false, t, dad}) => {
  const angry = mood === 'mad' || mood === 'fury';
  const b = blink(t, 0.7);
  const mouth = mood === 'happy' ? <path d="M-14 22 q14 14 28 0" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />
    : <path d="M-14 30 q14 -10 28 0" stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />;
  const steam = mood === 'fury' ? 3 : mood === 'mad' ? 2 : 0;
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      <g transform={`translate(${x + (mood === 'fury' ? Math.sin(t * 40) * 2.5 : 0)},${y + Math.sin(t * 2.1 + 2) * 3}) scale(${s})`}>
        <path d="M-118 330 Q-126 120 -64 90 L64 90 Q126 120 118 330Z" fill={dad ? '#8a5a2b' : '#4a4f5c'} />
        {!dad && <><path d="M-30 90 L0 150 L30 90Z" fill="#fff" /><path d="M-10 100 L10 100 L16 200 L0 220 L-16 200Z" fill="#C8346E" /></>}
        <rect x={-26} y={66} width={52} height={34} fill="#E3B08A" />
        <circle cx={0} cy={0} r={80} fill="#E3B08A" />
        {dad ? <path d="M-84 -6 Q-86 -100 0 -96 Q86 -100 84 -6 Q60 -40 0 -44 Q-60 -40 -84 -6Z M60 -40 L150 -30 L150 -14 L70 -18Z" fill="#C0392B" />
          : <path d="M-80 -10 Q-84 -60 -60 -70 L-56 -30 Z M80 -10 Q84 -60 60 -70 L56 -30 Z" fill="#555" />}
        {angry && <path d="M-40 -30 l26 10 M40 -30 l-26 10" stroke="#333" strokeWidth={8} strokeLinecap="round" />}
        {b ? <path d="M-32 -4 h18 M14 -4 h18" stroke={INK} strokeWidth={6} strokeLinecap="round" /> : <><circle cx={-22} cy={-4} r={7} fill={INK} /><circle cx={22} cy={-4} r={7} fill={INK} /></>}
        <path d="M-30 14 q30 -10 60 0 q-10 10 -30 6 q-20 4 -30 -6z" fill="#4a3426" />
        <Mouth talk={talk} t={t} base={mouth} />
        {Array.from({length: steam}, (_, i) => {
          const ph = ((t * 1.4 + i * 0.33) % 1);
          return <path key={i} d={`M${[-50, 0, 50][i]} ${-110 - ph * 40} q-14 -20 0 -40 q14 -20 0 -40`} stroke="rgba(255,255,255,0.85)" strokeWidth={10} fill="none" strokeLinecap="round" opacity={1 - ph} />;
        })}
      </g>
    </svg>
  );
};
const Other: React.FC<{look: string; x: number; y: number; s?: number; mood: string; talk: boolean; t: number}> = ({look, ...r}) =>
  look === 'boss' ? <Man {...r} /> : look === 'dad' ? <Man {...r} dad /> : <Girl {...r} mom={look === 'mom'} />;

// ===== shared pieces =====
const Bubble: React.FC<{x: number; y: number; w: number; text: string; k: number; color: string; ink: string; tail: 'left' | 'right'; big?: boolean}> =
  ({x, y, w, text, k, color, ink, tail, big}) => (
  <div style={{position: 'absolute', bottom: 1920 - y, ...(tail === 'left' ? {left: x} : {right: 1080 - x - w}), maxWidth: w, textAlign: tail,
    transform: `scale(${outBack(clamp01(k), 1.8)})`, transformOrigin: tail === 'left' ? '15% 100%' : '85% 100%'}}>
    <div style={{display: 'inline-block', textAlign: 'left', background: color, color: ink, fontFamily: SANS, fontWeight: 800, fontSize: big ? 50 : 44, lineHeight: 1.15,
      padding: '24px 30px', borderRadius: 38, boxShadow: '0 16px 34px rgba(0,0,0,0.35)', position: 'relative', minWidth: 160}}>
      {text}
      <div style={{position: 'absolute', bottom: -28, [tail]: 50, width: 0, height: 0, borderLeft: '22px solid transparent', borderRight: '22px solid transparent', borderTop: `30px solid ${color}`} as any} />
    </div>
  </div>
);

const Notif: React.FC<{top: number; from: string; text: string; k: number; glow?: boolean}> = ({top, from, text, k, glow}) => (
  <div style={{position: 'absolute', left: 80, right: 80, top, transform: `translateY(${(1 - outBack(clamp01(k), 1.3)) * -260}px)`, opacity: clamp01(k * 3),
    background: 'rgba(255,243,234,0.97)', borderRadius: 36, padding: '24px 28px', display: 'flex', gap: 22, alignItems: 'center',
    boxShadow: '0 22px 50px rgba(0,0,0,0.45)', outline: glow ? `6px solid ${GOLD}` : 'none'}}>
    <div style={{width: 80, height: 80, borderRadius: 20, background: '#34C759', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <svg width={46} height={46} viewBox="0 0 46 46"><path d="M23 6 C11 6 3 13 3 22 c0 5 3 9 7 12 l-2 7 8 -4 c2 1 5 1 7 1 c12 0 20 -7 20 -16 S35 6 23 6z" fill="#fff" /></svg>
    </div>
    <div style={{minWidth: 0}}>
      <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 32, color: '#111'}}>{from} <span style={{fontWeight: 600, color: '#888', fontSize: 24}}>now</span></div>
      <div style={{fontFamily: SANS, fontWeight: 600, fontSize: 36, color: '#222', lineHeight: 1.2}}>{text}</div>
    </div>
  </div>
);

const RoleTag: React.FC<{x: number; role: string; t: number}> = ({x, role, t}) => role ? (
  <div style={{position: 'absolute', left: x - 200, width: 400, top: 1475, textAlign: 'center', opacity: smooth(0.2, 0.5, t)}}><span style={pill(PINK, '#fff', 24)}>{role.toUpperCase()}</span></div>
) : null;

// narrator / hook caption: the whole line, each word lights up as it is spoken
const Caption: React.FC<{l: Line; t: number; top: number}> = ({l, t, top}) => (
  <div style={{position: 'absolute', top, left: 60, width: 960, textAlign: 'center', opacity: smooth(l.start - 0.1, l.start + 0.05, t)}}>
    <div style={{display: 'inline-block', padding: '14px 24px', borderRadius: 24, background: 'rgba(20,6,40,0.86)', fontFamily: SANS, fontWeight: 900, fontSize: 54, lineHeight: 1.2, color: '#fff'}}>
      {(l.words.length ? l.words : l.show.split(' ').map((w) => ({w, start: l.start, end: l.end}))).map((w, i) => {
        const on = t >= w.start - 0.02;
        const now = on && t <= w.end + 0.08;
        return <span key={i} style={{display: 'inline-block', margin: '0 6px', padding: '0 6px', borderRadius: 8, opacity: on ? 1 : 0.38,
          background: now ? GOLD : 'transparent', color: now ? INK : '#fff'}}>{w.w}</span>;
      })}
    </div>
  </div>
);

const Head: React.FC<{a: string; b: string; t: number; top?: number}> = ({a, b, t, top = 380}) => (
  <div style={{position: 'absolute', top, left: 60, right: 60, textAlign: 'center', ...ser(a.length + b.length > 34 ? 78 : 92), color: CREAM,
    textShadow: '0 6px 30px rgba(20,6,40,0.6)'}}>
    {a} <i style={{color: PINK}}>{b}</i>
  </div>
);

const Room: React.FC<{t: number}> = ({t}) => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
    <defs>
      <linearGradient id="tvg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A1046" /><stop offset=".6" stopColor="#C8346E" /><stop offset="1" stopColor="#FF8A4C" /></linearGradient>
      <radialGradient id="rglow" cx=".5" cy=".42" r=".65"><stop offset="0" stopColor="#7a2468" /><stop offset="1" stopColor="#170828" /></radialGradient>
    </defs>
    <rect width={1080} height={1920} fill="url(#rglow)" />
    <circle cx={540} cy={740} r={330 + Math.sin(t * 3) * 12} fill="#FF5E8A" opacity={0.12} />
    <rect y={1540} width={1080} height={380} fill="#120620" />
    <rect x={290} y={610} width={500} height={310} rx={20} fill="#0d0718" stroke="#3a2a55" strokeWidth={12} />
    <rect x={306} y={626} width={468} height={278} rx={10} fill="url(#tvg)" />
    <circle cx={540} cy={820} r={70} fill={GOLD} opacity={0.85} />
    <rect x={306} y={850} width={468} height={54} fill={INK} opacity={0.7} />
    <text x={540} y={690} textAnchor="middle" fontFamily="JetBrains Mono" fontWeight={700} fontSize={30} fill="#fff" letterSpacing={6}>GTA 6</text>
    <rect x={520} y={920} width={40} height={40} fill="#0d0718" />
    <rect x={80} y={1340} width={920} height={200} rx={60} fill="#5b2f8a" />
    <rect x={60} y={1260} width={120} height={280} rx={50} fill="#6a39a0" /><rect x={900} y={1260} width={120} height={280} rx={50} fill="#6a39a0" />
  </svg>
);
// the couch goes in front of the characters' legs
const CouchFront: React.FC = () => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
    <rect x={150} y={1400} width={780} height={140} rx={40} fill="#6a39a0" />
    <rect x={60} y={1260} width={120} height={280} rx={50} fill="#6a39a0" /><rect x={900} y={1260} width={120} height={280} rx={50} fill="#6a39a0" />
  </svg>
);

// ===== countdown scenes =====
const Bank: React.FC = () => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
    <polygon points="180,760 540,600 900,760" fill={CREAM} /><rect x={200} y={760} width={680} height={60} fill={CREAM} />
    <text x={540} y={805} textAnchor="middle" fontFamily="JetBrains Mono" fontWeight={700} fontSize={44} fill={INK} letterSpacing={14}>BANK</text>
    <text x={540} y={732} textAnchor="middle" fontFamily="Inter" fontWeight={900} fontSize={70} fill="#E8B84A">$</text>
    {[230, 370, 654, 794].map((x) => <rect key={x} x={x} y={820} width={56} height={440} fill={CREAM} />)}
    <rect x={460} y={960} width={160} height={300} fill={INK} /><rect x={180} y={1260} width={720} height={40} fill={CREAM} />
  </svg>
);
const Bags: React.FC<{t: number; at: number}> = ({t, at}) => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
    {[[640, 1390, 0.2], [770, 1410, 0.4], [705, 1320, 0.6]].map(([x, y, d], i) => {
      const k = outBack(clamp01((t - at - (d as number)) / 0.35), 2);
      return (
        <g key={i} transform={`translate(${x},${(y as number) - (1 - k) * 120}) scale(${k})`}>
          <path d="M-50 0 Q-60 90 0 90 Q60 90 50 0 Q30 -20 0 -20 Q-30 -20 -50 0Z" fill="#E9E2D0" /><path d="M-20 -24 h40 l-8 -20 h-24z" fill="#E9E2D0" />
          <text x={0} y={62} textAnchor="middle" fontFamily="Inter" fontWeight={900} fontSize={54} fill="#2C7A5B">$</text>
        </g>
      );
    })}
  </svg>
);
const Car: React.FC<{t: number; at: number}> = ({t, at}) => {
  const a = t - at, x = 540 + Math.sin(a * 1.5) * 20;
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
      <rect y={1420} width={1080} height={500} fill="#1b0b33" />
      {Array.from({length: 6}, (_, i) => <rect key={i} x={((i * 260 - a * 1400) % 1560 + 1560) % 1560 - 240} y={1560} width={140} height={14} rx={7} fill={GOLD} opacity={0.7} />)}
      {Array.from({length: 5}, (_, i) => <rect key={i} x={((i * 300 - a * 2000) % 1500 + 1500) % 1500 - 200} y={1180 + i * 46} width={160} height={6} rx={3} fill="#fff" opacity={0.5} />)}
      <g transform={`translate(${x},${1400 + Math.sin(a * 24) * 3})`}>
        <path d="M-300 -40 L-280 -110 Q-260 -130 -220 -130 L-150 -130 L-90 -220 Q-70 -240 -30 -240 L130 -240 Q170 -240 190 -210 L250 -130 L290 -125 Q320 -120 320 -90 L320 -40Z" fill={CREAM} />
        <path d="M-70 -210 L-130 -135 L60 -135 L60 -210Z M90 -210 L90 -135 L220 -135 L170 -210Z" fill="#7FD3FF" opacity={0.9} />
        <circle cx={-170} cy={-40} r={56} fill="#111" /><circle cx={-170} cy={-40} r={22} fill="#ccc" />
        <circle cx={190} cy={-40} r={56} fill="#111" /><circle cx={190} cy={-40} r={22} fill="#ccc" />
        <circle cx={-20} cy={-175} r={34} fill={SKIN} /><path d="M-54 -180 Q-56 -214 -20 -212 Q14 -214 14 -184 Q0 -200 -20 -199 Q-40 -200 -54 -180Z" fill="#2a1b12" />
        <path d="M-50 -170 Q-20 -158 12 -170 L10 -150 Q-20 -138 -48 -150Z" fill="#E0312B" />
        <rect x={300} y={-110} width={20} height={20} rx={4} fill={GOLD} />
      </g>
    </svg>
  );
};
const Beach: React.FC<{t: number}> = ({t}) => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
    <rect y={1420} width={1080} height={500} fill="#E9B97A" />
    <path d={`M0 1420 Q270 ${1400 + Math.sin(t * 2) * 10} 540 1420 T1080 1420 V1440 H0Z`} fill="#3BB6C9" opacity={0.8} />
    {[[150, 1430, 1], [930, 1450, -1]].map(([x, y, d], i) => (
      <g key={i} transform={`translate(${x},${y}) scale(${d},1)`}>
        <path d="M0 0 Q30 -260 -10 -520" stroke="#5a3a1a" strokeWidth={26} fill="none" />
        {[-60, -20, 20, 60, 100].map((r, j) => <path key={j} d="M-10 -520 q90 -30 170 40 q-90 -10 -170 -40z" fill="#1E8A5A" transform={`rotate(${r + Math.sin(t * 1.5 + j) * 4} -10 -520)`} />)}
      </g>
    ))}
  </svg>
);

// ===== the reel =====
export const EdSkit: React.FC<EdSkitProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const P = PAL[p.pal];
  const L = p.lines;
  const cur = L.filter((l) => t >= l.start - 0.05).pop();
  const ending = t >= p.tagAt;

  const sfx = L.map((l, i) => {
    const s = l.who === 'text' || l.who === 'left' || l.who === 'right' ? 'sfx/received.wav' : p.style === 'phones' && l.who === 'you' ? 'sfx/sent.wav' : l.kick ? (l.kick === 1 ? 'sfx/impact.mp3' : 'sfx/whoosh.mp3') : null;
    return s ? <Sequence key={i} from={Math.max(0, Math.round((l.start - 0.12) * fps))} durationInFrames={30}><Audio src={staticFile(s)} volume={0.55} /></Sequence> : null;
  });

  let body: React.ReactNode = null;

  if (p.style === 'couch') {
    const youMood = moodAt(L, 'youMood', t, 'chill'), herMood = moodAt(L, 'herMood', t, 'sus');
    const luc = L.filter((l) => l.who === 'text' && t >= l.start - 0.1).pop();
    const bub = cur && (cur.who === 'you' || cur.who === 'other') && t < cur.end + 0.6 ? cur : null;
    const phoneOut = L.some((l) => l.who === 'text' && t >= l.start - 0.1);
    body = (
      <>
        <Room t={t} />
        <Other look={p.other.look} x={330} y={1180} t={t} mood={herMood} talk={talking(L, 'other', t)} />
        <You x={720} y={1180} t={t} mood={youMood} talk={talking(L, 'you', t)} hold={phoneOut ? 'phone' : 'ctrl'} />
        <CouchFront />
        <RoleTag x={330} role={p.other.role} t={t} />
        {luc && <Notif top={600} from={p.sender} text={luc.show} k={(t - luc.start + 0.1) / 0.45} glow={cur === luc} />}
        {bub && bub.who === 'other' && <Bubble x={70} y={1010} w={640} text={said(bub, t)} k={(t - bub.start + 0.05) / 0.3} color={PINK} ink="#fff" tail="left" big />}
        {bub && bub.who === 'you' && <Bubble x={400} y={1010} w={620} text={said(bub, t)} k={(t - bub.start + 0.05) / 0.3} color="#fff" ink="#111" tail="right" big />}
      </>
    );
  }

  if (p.style === 'phones') {
    const finalText = L.filter((l) => l.who === 'left' || l.who === 'right').pop();
    const msgs = (side: 'left' | 'right') => L.filter((l) => l.who === side || (l.who === 'you' && (l.to === side || l.to === 'both')));
    const Phone: React.FC<{x: number; side: 'left' | 'right'}> = ({x, side}) => {
      const c = side === 'left' ? p.left : p.right, dark = !!c.dark;
      const shown = msgs(side).filter((l) => t >= l.start - 0.05);
      const next = msgs(side).find((l) => l.who !== 'you' && t < l.start - 0.05 && t >= l.start - 0.9);
      const visible = shown.slice(-6);
      return (
        <div style={{position: 'absolute', left: x, top: 590, width: 480, height: 940, borderRadius: 64, background: '#1b1b1f', padding: 14, boxShadow: '0 40px 80px rgba(10,0,30,0.55)'}}>
          <div style={{width: '100%', height: '100%', borderRadius: 52, overflow: 'hidden', position: 'relative', background: dark ? 'linear-gradient(180deg,#2A1046,#7a2468 55%,#FF8A4C)' : '#fff'}}>
            <div style={{position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', width: 130, height: 36, borderRadius: 20, background: '#000'}} />
            <div style={{padding: '66px 0 16px', textAlign: 'center', background: dark ? 'rgba(30,10,50,0.55)' : 'rgba(245,245,247,0.95)', borderBottom: '1px solid rgba(0,0,0,0.1)'}}>
              <div style={{width: 80, height: 80, borderRadius: '50%', margin: '0 auto 8px', background: dark ? 'linear-gradient(135deg,#FF4FA0,#FF8A4C)' : 'linear-gradient(135deg,#b9b9c0,#8e8e96)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 800, fontSize: 40, color: '#fff'}}>{c.name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || '?'}</div>
              <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 28, color: dark ? '#fff' : '#111'}}>{c.name}</div>
              <div style={{fontFamily: SANS, fontWeight: 600, fontSize: 20, color: dark ? '#e9c' : '#888'}}>{c.sub}</div>
            </div>
            <div style={{position: 'absolute', left: 16, right: 16, bottom: 22, display: 'flex', flexDirection: 'column', gap: 14}}>
              {visible.map((l, i) => {
                const me = l.who === 'you', k = outBack(clamp01((t - l.start + 0.05) / 0.3), 1.6);
                const hot = l === finalText && ending && !me;
                return (
                  <div key={i} style={{alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '82%', background: me ? '#0A84FF' : dark ? '#3a2a55' : '#E9E9EB', color: me || dark ? '#fff' : '#111',
                    fontFamily: SANS, fontWeight: 600, fontSize: 33, lineHeight: 1.22, padding: '14px 20px', borderRadius: 26, transform: `scale(${k})`, transformOrigin: me ? '100% 100%' : '0% 100%',
                    boxShadow: hot ? `0 0 0 5px ${GOLD}, 0 0 40px rgba(255,224,122,0.8)` : 'none'}}>{l.show}</div>
                );
              })}
              {next && (
                <div style={{alignSelf: 'flex-start', background: dark ? '#3a2a55' : '#E9E9EB', padding: '16px 22px', borderRadius: 26, display: 'flex', gap: 8}}>
                  {[0, 1, 2].map((j) => <i key={j} style={{width: 14, height: 14, borderRadius: '50%', background: dark ? '#cbb' : '#999', display: 'block', opacity: 0.4 + 0.6 * Math.abs(Math.sin(t * 6 - j * 0.6))}} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };
    body = (
      <>
        <Backdrop P={P} horizon={0.5} />
        <AbsoluteFill style={{background: 'rgba(20,6,40,0.35)'}} />
        <Phone x={45} side="left" />
        <Phone x={555} side="right" />
      </>
    );
  }

  if (p.style === 'countdown') {
    const kicks = L.filter((l) => l.kick);
    const k = kicks.filter((l) => t >= l.start - 0.05).pop();
    const scene = k?.scene ?? 'couch';
    const at = k?.start ?? 0;
    const herLine = L.filter((l) => l.who === 'other' && t >= l.start - 0.05 && (!k || l.start >= k.start)).pop();
    const youMood = moodAt(L, 'youMood', t, 'smug'), herMood = moodAt(L, 'herMood', t, 'sus');
    const a = t - at;
    const notif = k?.notif && t >= at + 0.6 ? k.notif : null;
    const showGirl = !k || scene === 'couch' || !!herLine;
    body = (
      <>
        {scene === 'couch' && k ? <Room t={t} /> : <Backdrop P={P} horizon={0.5} />}
        {!k && <AbsoluteFill style={{background: 'rgba(20,6,40,0.2)'}} />}
        {scene === 'bank' && k && <><Bank /><You x={380} y={1270} s={0.95} t={t} mood="smug" mask hold="none" talk={false} /><Bags t={t} at={at} /></>}
        {scene === 'car' && k && <Car t={t} at={at} />}
        {scene === 'beach' && k && <><Beach t={t} /><You x={620} y={1250} s={1.05} t={t} mood="chill" shades hold="phone" talk={false} /></>}
        {(!k || scene === 'couch') && <>
          {showGirl && <Other look={p.other.look} x={330} y={1180} t={t} mood={herMood} talk={talking(L, 'other', t)} />}
          {showGirl && <RoleTag x={330} role={p.other.role} t={t} />}
          <You x={720} y={1180} t={t} mood={youMood} talk={talking(L, 'you', t)} hold={!k ? 'phone' : 'ctrl'} />
          {k && <CouchFront />}
        </>}
        {k && scene !== 'couch' && herLine && <Other look={p.other.look} x={200} y={1240} s={0.8} t={t} mood={herMood} talk={talking(L, 'other', t)} />}
        {k && (
          <div style={{position: 'absolute', left: 70, top: 380, display: 'flex', alignItems: 'baseline', gap: 26, width: 940, opacity: smooth(0, 0.15, a)}}>
            <div style={{...ser(200), color: k.kick === 1 ? GOLD : PINK, transform: `scale(${1.6 - 0.6 * outBack(clamp01(a / 0.35), 1.4)})`, transformOrigin: 'left bottom'}}>#{k.kick}</div>
            <div style={{...ser(72), color: CREAM, flex: 1, opacity: smooth(0.15, 0.4, a), lineHeight: 1.02}}>{k.kickLine}</div>
          </div>
        )}
        {notif && <Notif top={640} from={p.sender} text={notif} k={(t - at - 0.6) / 0.45} />}
        {herLine && t < herLine.end + 0.5 && <Bubble x={70} y={scene === 'couch' ? 1010 : 1040} w={620} text={said(herLine, t)} k={(t - herLine.start + 0.05) / 0.3} color={PINK} ink="#fff" tail="left" big />}
      </>
    );
  }

  // narrator lines (the hook in every look, all of the countdown) get the word-lit caption
  const narr = cur && cur.who === 'narrator' && t < cur.end + 0.4 ? cur : null;
  const hookOn = !L.find((l) => l.who !== 'narrator' || l.kick) || t < (L.find((l) => l.who !== 'narrator' || l.kick)?.start ?? 0) - 0.05;

  return (
    <AbsoluteFill style={{background: '#170828'}}>
      {body}
      {p.music && <Audio src={staticFile(p.music)} volume={(p as {musicVolume?: number}).musicVolume ?? 0.1} loop />}
      {p.audio && <Audio src={staticFile(p.audio)} />}
      {sfx}
      {(p.style !== 'countdown' || hookOn) && <Head a={p.headA} b={p.headB} t={t} />}
      {narr && <Caption l={narr} t={t} top={p.style === 'phones' ? 1560 : 1590} />}
      {ending && (
        <div style={{position: 'absolute', top: p.style === 'phones' ? 1555 : 1590, left: 0, right: 0, textAlign: 'center', transform: `scale(${outBack(clamp01((t - p.tagAt) / 0.4), 2)}) rotate(-2deg)`}}>
          <span style={{display: 'inline-block', background: GOLD, color: INK, fontFamily: SANS, fontWeight: 900, fontSize: 64, padding: '16px 30px', borderRadius: 24, boxShadow: '0 16px 40px rgba(0,0,0,0.45)'}}>{p.tag}</span>
        </div>
      )}
      <Masthead P={P} label={p.label} />
      <div style={{position: 'absolute', top: 236, right: 84}}><span style={pill(P.accent, '#fff', 20)}>{p.badge}</span></div>
      {p.follow && <FollowCard P={P} t={t} f={p.follow} />}
      <Grain P={P} />
    </AbsoluteFill>
  );
};
