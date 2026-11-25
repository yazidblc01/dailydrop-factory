// ---------- Stocks race v2: "$1,000 in each, the day GTA V came out" ----------
// guess first (4 brand tiles, 3 2 1) -> the race (4 neon lines, log scale, tags with live $ on the tips, the year top left)
// -> the podium ("Who turned $1,000 into the most?", "Did you pick right?") -> the logo outro.
// Layout (1080x1920): 0-150 free for the apps' buttons, header 160, title 258-428, content 440-1680, bottom free.
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, clamp01, lerp, outBack, outCubic, smooth, useEdFonts} from './kit';

type Line = {name: string; color: string; fg: string; values: number[]; final: number; logo?: string | null};
export type EdRaceProps = {lines: Line[]; years: number[]; theme?: string; pre: string; em: string; post: string; guess: number; race: number; podium: number;
  outroAt: number; duration: number; source: string; music?: string | null; style?: 'lines' | 'bars'; months?: string[]; what?: string; since?: number; hold?: number};

const P = PAL.vice;
const money = (v: number) => v < 10000 ? `$${Math.round(v).toLocaleString('en-US')}` : v < 1e6 ? `$${(Math.round(v / 100) * 100).toLocaleString('en-US')}` : `$${(v / 1e6).toFixed(1)}M`;
const glow = (c: string) => (c.toUpperCase() === '#FFFFFF' || c === '#000000' || c === '#0A0A0A' || c === '#1A1A1A') ? '#E9E3FF' : c;
const lineCol = (l: Line) => glow(l.color.toUpperCase() === '#FFFFFF' ? l.fg : l.color);

const Night: React.FC = () => (
  <AbsoluteFill>
    <AbsoluteFill style={{background: 'linear-gradient(#1B0B33 0%, #2a1050 40%, #5a1a66 76%, #1a0b2e 100%)'}} />
    <AbsoluteFill style={{backgroundImage: ['radial-gradient(2px 2px at 10% 22%, #fff9 50%, transparent)', 'radial-gradient(2px 2px at 72% 14%, #fff8 50%, transparent)',
      'radial-gradient(3px 3px at 40% 32%, #fff6 50%, transparent)', 'radial-gradient(2px 2px at 88% 36%, #fff9 50%, transparent)',
      'radial-gradient(2px 2px at 22% 8%, #fff7 50%, transparent)'].join(',')}} />
    <div style={{position: 'absolute', left: -400, right: -400, bottom: 0, height: 420, opacity: 0.55, transform: 'perspective(500px) rotateX(58deg)', transformOrigin: 'bottom',
      background: 'linear-gradient(#ff4fa0 0, #ff4fa0 2px, transparent 3px) 0 0/100% 70px, linear-gradient(90deg, #ff4fa0 0, #ff4fa0 3px, transparent 3px) 0 0/120px 100%, #170a2a'}} />
  </AbsoluteFill>
);

// the title: serif, the moment highlighted; swaps (with a quick crossfade) when the phase changes
const Title: React.FC<{children: React.ReactNode; k: number; long: boolean}> = ({children, k, long}) => (
  <div style={{position: 'absolute', left: 70, right: 70, top: 258, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    fontFamily: P.display, fontSize: long ? 72 : 84, lineHeight: 1.0, color: P.ink, opacity: k, transform: `translateY(${(1 - k) * 14}px)`}}>
    <span>{children}</span>
  </div>
);
const Em: React.FC<{children: React.ReactNode}> = ({children}) => <span style={{color: '#FFE07A', fontStyle: 'italic'}}>{children}</span>;

// a brand: its real logo on a white app-icon square, or a colored tile with its name when there's no logo
const Tile: React.FC<{l: Line; size: number; fs?: number}> = ({l, size, fs}) => {
  const shadow = '0 18px 40px rgba(0,0,0,0.6), inset 0 0 0 4px rgba(255,255,255,0.14)';
  if (l.logo) return (
    <div style={{width: size, height: size, borderRadius: size * 0.22, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: shadow, overflow: 'hidden'}}>
      <Img src={staticFile(l.logo)} style={{width: size * 0.74, height: size * 0.74, objectFit: 'contain'}} />
    </div>
  );
  const f = fs ?? Math.min(size * 0.2, (size * 0.86) / (l.name.length * 0.6));
  return (
    <div style={{width: size, height: size, borderRadius: size * 0.22, background: l.color, color: l.fg, display: 'grid', placeItems: 'center', textAlign: 'center',
      fontFamily: SANS, fontWeight: 900, fontSize: f, lineHeight: 1, boxShadow: shadow}}>{l.name}</div>
  );
};

// the theme, as a chip
const Chip: React.FC<{text: string; style: React.CSSProperties}> = ({text, style}) => (
  <div style={{position: 'absolute', fontFamily: SANS, fontWeight: 900, fontSize: 40, letterSpacing: '0.06em', padding: '10px 26px', borderRadius: 999,
    background: 'rgba(255,79,160,0.22)', border: '3px solid #FF4FA0', color: '#fff', whiteSpace: 'nowrap', ...style}}>{text}</div>
);

// chart area
const X0 = 110, X1 = 640, YT = 650, YB = 1590;

// the ending for the bars: one big winner card ($1,000 -> its final, and the multiple), then the rest ranked, the worst in red
const Results: React.FC<{p: EdRaceProps; order: Line[]; t: number; E: number; k: number}> = ({p, order, t, E, k}) => {
  const a = t - E;
  const card = outBack(clamp01((a - 0.25) / 0.45), 1.5);
  const num = outCubic(clamp01((a - 0.5) / 0.9));
  const w = order[0], mult = w.final / 1000;
  return (
    <AbsoluteFill style={{opacity: k}}>
      <div style={{position: 'absolute', left: 84, right: 84, top: 470, height: 520, borderRadius: 36, transform: `scale(${card})`,
        background: 'linear-gradient(160deg, rgba(255,224,122,0.22), rgba(255,79,160,0.18))', border: '4px solid #FFE07A',
        boxShadow: '0 0 70px rgba(255,224,122,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{position: 'absolute', top: -34, background: '#FFE07A', color: '#1a0b2e', fontFamily: SANS, fontWeight: 900, fontSize: 40, padding: '6px 26px',
          borderRadius: 999, letterSpacing: '0.06em'}}>🏆 WINNER</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 26}}>
          <Tile l={w} size={170} />
          <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 64, color: '#fff'}}>{w.name}</div>
        </div>
        <div style={{marginTop: 26, fontFamily: SANS, fontWeight: 900, fontSize: 52, color: 'rgba(255,255,255,0.7)'}}>$1,000 became</div>
        <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 130, color: '#FFE07A', lineHeight: 1.05, textShadow: '0 0 40px rgba(255,224,122,0.5)'}}>
          {money(1000 + (w.final - 1000) * num)}</div>
        {mult >= 2 && <div style={{marginTop: 6, fontFamily: SANS, fontWeight: 900, fontSize: 44, color: '#7FE0B0', opacity: clamp01((a - 1.3) / 0.25)}}>
          {mult >= 10 ? Math.round(mult) : mult.toFixed(1)}x your money</div>}
      </div>
      {order.slice(1).map((l, i) => {
        const kk = outCubic(clamp01((a - 0.9 - i * 0.25) / 0.35)), last = i === order.length - 2;
        const pct = Math.round((l.final / 1000 - 1) * 100);
        return (
          <div key={l.name} style={{position: 'absolute', left: 84, right: 84, top: 1040 + i * 130, height: 110, display: 'flex', alignItems: 'center', gap: 22,
            padding: '0 26px', borderRadius: 22, background: last ? 'rgba(255,46,77,0.16)' : 'rgba(255,255,255,0.07)', border: last ? '3px solid rgba(255,46,77,0.6)' : '3px solid transparent',
            opacity: kk, transform: `translateX(${(1 - kk) * 120}px)`}}>
            <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 44, color: 'rgba(255,255,255,0.5)', width: 40}}>{i + 2}</div>
            <Tile l={l} size={76} />
            <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 40, color: '#fff', flex: 1}}>{l.name}{last ? ' 📉' : ''}</div>
            <div style={{textAlign: 'right'}}>
              <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 44, color: '#fff', lineHeight: 1}}>{money(l.final)}</div>
              <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 26, color: pct >= 0 ? '#7FE0B0' : '#FF8A8A'}}>{pct >= 0 ? '+' : ''}{pct}%</div>
            </div>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 0, right: 0, top: 1450, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 62, color: '#FFE07A',
        transform: `scale(${outBack(clamp01((a - 1.8) / 0.35), 1.8)})`}}>Did you pick right? 👇</div>
      {Array.from({length: 50}, (_, i) => {
        const b = a - 0.6;
        if (b < 0) return null;
        const r1 = Math.sin(i * 91.7) * 0.5 + 0.5, r2 = Math.sin(i * 37.3) * 0.5 + 0.5, r3 = Math.sin(i * 13.1) * 0.5 + 0.5;
        const x = 540 + (r1 - 0.5) * 1000 * outCubic(b / 0.6), y = 500 - 220 * outCubic(b / 0.5) + 900 * b * b * (0.6 + r2);
        const cols = ['#FFE07A', '#FF4FA0', '#7FE0B0', '#8FB8FF', '#fff'];
        return <div key={i} style={{position: 'absolute', left: x, top: y, width: 16, height: 26, background: cols[i % 5], borderRadius: 3,
          transform: `rotate(${(r3 * 720 + b * 400) % 360}deg)`, opacity: 1 - clamp01((b - 1.6) / 0.6)}} />;
      })}
    </AbsoluteFill>
  );
};

export const EdRace: React.FC<EdRaceProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const bars = p.style === 'bars';
  const G = p.guess, R = p.race, H = bars ? (p.hold ?? 2.4) : 0, E = G + R + H;     // H: the bars hold still at the finish
  const N = p.years.length;
  const ease = (x: number) => { const k = clamp01(x); return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; };
  const kAt = (tt: number) => 0.15 * clamp01((tt - G) / R) + 0.85 * ease((tt - G) / R);   // never stalls at the start (and stays at 1 through the hold)
  const at = (l: Line, f: number) => { const i = Math.floor(f), j = Math.min(N - 1, i + 1); return lerp(l.values[i], l.values[j], f - i); };

  // who leads at each frame of the race: a pop and a sound when the lead changes
  const leadChanges = useMemo(() => {
    const out: number[] = [];
    let prev = -1;
    for (let fr = Math.round(G * fps); fr <= Math.round(E * fps); fr++) {
      const f = kAt(fr / fps) * (N - 1);
      const vals = p.lines.map((l) => at(l, f));
      const lead = vals.indexOf(Math.max(...vals));
      if (prev >= 0 && lead !== prev && (!out.length || fr - out[out.length - 1] > fps * 0.7) && fr > (G + 0.6) * fps) out.push(fr);
      prev = lead;
    }
    return out;
  }, []);

  const order = [...p.lines].sort((a, b) => b.final - a.final);
  const long = (p.pre + p.em + p.post).length > 30;

  // ----- phase A: guess first -----
  const guessOut = 1 - smooth(G - 0.25, G + 0.05, t);
  const count = t < 0.8 ? null : t < 1.6 ? 3 : t < 2.4 ? 2 : t < G ? 1 : null;
  const cPop = outBack(clamp01(((t - 0.8) % 0.8) / 0.25), 2.2);

  // ----- phase B: the race -----
  const f = kAt(t) * (N - 1);
  const raceIn = smooth(G - 0.1, G + 0.3, t), raceOut = 1 - smooth(E + 0.1, E + 0.45, t);
  const fi = Math.floor(f);
  let lo = 1000, hi = 1000;
  for (const l of p.lines) for (let i = 0; i <= fi; i++) { lo = Math.min(lo, l.values[i]); hi = Math.max(hi, l.values[i]); }
  for (const l of p.lines) { const v = at(l, f); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const L0 = Math.log(lo * 0.8), L1 = Math.log(Math.max(hi * 1.12, lo * 2.5));
  const yOf = (v: number) => YB - ((Math.log(v) - L0) / (L1 - L0)) * (YB - YT);
  const xOf = (i: number) => X0 + (i / (N - 1)) * (X1 - X0);
  const year = Math.floor(lerp(p.years[0], p.years[N - 1], clamp01(f / (N - 1))));
  const lastChange = leadChanges.filter((c) => c <= frame).pop();
  const popK = lastChange !== undefined ? Math.max(0, 1 - (frame - lastChange) / (fps * 0.4)) : 0;
  const vals = p.lines.map((l) => at(l, f));
  const leader = vals.indexOf(Math.max(...vals));
  // tags at the tips, pushed apart so they never overlap
  const tags = p.lines.map((l, i) => ({i, y: yOf(vals[i])})).sort((a, b) => a.y - b.y);
  for (let k = 1; k < tags.length; k++) tags[k].y = Math.max(tags[k].y, tags[k - 1].y + 96);
  const over = tags[tags.length - 1].y - (YB + 20);
  if (over > 0) tags.forEach((g) => { g.y -= over; });
  for (let k = tags.length - 2; k >= 0; k--) tags[k].y = Math.min(tags[k].y, tags[k + 1].y - 96);
  // grid lines at round dollar amounts
  const ticks = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1e6, 2.5e6, 1e7].filter((v) => {
    const y = yOf(v); return y > YT - 10 && y < YB + 10;
  });

  // ----- phase C: the podium -----
  const pod = (rank: number) => outBack(clamp01((t - E - 0.25 - (3 - rank) * 0.35) / 0.45), 1.3);
  const PODS: Record<number, {left: number; h: number; bg: string}> = {
    1: {left: 395, h: 860, bg: 'linear-gradient(#FFE07A, #e0a92a)'}, 2: {left: 110, h: 660, bg: 'linear-gradient(#d9dbe6, #9fa3b8)'}, 3: {left: 680, h: 520, bg: 'linear-gradient(#f0a46b, #b8683a)'}};
  const podIn = smooth(E + 0.15, E + 0.4, t);
  const land1 = E + 0.25 + 0.45;
  const title = t < G ? 0 : t < E + 0.2 ? 1 : 2;
  const titleK = title === 0 ? smooth(0, 0.3, t) * (1 - smooth(G - 0.2, G, t)) : title === 1 ? smooth(G, G + 0.25, t) * (1 - smooth(E, E + 0.2, t)) : smooth(E + 0.2, E + 0.45, t);

  return (
    <AbsoluteFill>
      <Night />
      {p.music && <Audio src={staticFile(p.music)} volume={0.3} loop />}
      {[0.8, 1.6, 2.4].map((s) => <Sequence key={s} from={Math.round(s * fps)} durationInFrames={15}><Audio src={staticFile('sfx/tick.mp3')} volume={0.8} /></Sequence>)}
      <Sequence from={Math.round(G * fps)} durationInFrames={30}><Audio src={staticFile('sfx/whoosh.mp3')} volume={0.6} /></Sequence>
      {bars && <Sequence from={Math.round((G + R) * fps)} durationInFrames={30}><Audio src={staticFile('sfx/impact.mp3')} volume={0.8} /></Sequence>}
      {leadChanges.map((c) => <Sequence key={c} from={c} durationInFrames={15}><Audio src={staticFile('sfx/pop.wav')} volume={0.7} /></Sequence>)}
      {[3, 2, 1].map((r) => <Sequence key={r} from={Math.round((E + 0.25 + (bars ? (r - 1) * 0.3 : (3 - r) * 0.35)) * fps)} durationInFrames={24}><Audio src={staticFile(r === 1 ? 'sfx/impact.mp3' : 'sfx/thud.wav')} volume={0.8} /></Sequence>)}

      <Masthead P={P} label="" top={160} />
      {title === 0 && (p.since ? <Title k={titleK} long={false}>$1,000 in each, back in <Em>{p.since}</Em></Title>
        : <Title k={titleK} long={long}>$1,000 in each, {p.pre}<Em>{p.em}</Em>{p.post}</Title>)}
      {title === 1 && <Title k={titleK} long={long}>$1,000 {p.pre}<Em>{p.em}</Em>{p.post}</Title>}
      {title === 2 && <Title k={titleK} long={false}>Who turned <Em>$1,000</Em> into the most?</Title>}

      {/* A: the guess */}
      {guessOut > 0.01 && (
        <AbsoluteFill style={{opacity: guessOut}}>
          {p.theme && <div style={{position: 'absolute', left: 0, right: 0, top: 452, display: 'flex', justifyContent: 'center'}}>
            <Chip text={p.theme} style={{position: 'relative', transform: `scale(${outBack(clamp01(t / 0.35), 1.8)})`}} /></div>}
          {p.lines.map((l, i) => {
            const k = outBack(clamp01((t - 0.1 - i * 0.12) / 0.4), 1.8);
            const cx = i % 2 ? 750 : 330, top = i < 2 ? 570 : 920;
            return (
              <div key={i} style={{position: 'absolute', left: cx - 120, top, width: 240, textAlign: 'center', transform: `scale(${k})`, opacity: clamp01(k * 2)}}>
                <Tile l={l} size={240} />
                <div style={{marginTop: 16, fontFamily: SANS, fontWeight: 900, fontSize: 40, color: '#fff', whiteSpace: 'nowrap'}}>{l.name}</div>
              </div>
            );
          })}
          <div style={{position: 'absolute', left: 0, right: 0, top: 1300, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 66, color: '#FFE07A',
            opacity: smooth(0.4, 0.7, t)}}>Pick one before it starts 👇</div>
          {count && <div style={{position: 'absolute', left: 0, right: 0, top: 1390, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 180, color: '#fff',
            transform: `scale(${0.6 + 0.4 * cPop})`, textShadow: '0 0 40px rgba(255,79,160,0.8)'}}>{count}</div>}
        </AbsoluteFill>
      )}

      {/* B2: the race as running bars (style 'bars'): the leader's bar fills the width, the others scale to it, overtakes slide */}
      {p.style === 'bars' && raceIn > 0.01 && raceOut > 0.01 && (() => {
        const rankAt = (ff: number) => { const v = p.lines.map((l) => at(l, Math.max(0, Math.min(N - 1, ff)))); const o = [...v.keys()].sort((a, b) => v[b] - v[a]); return p.lines.map((_, i) => o.indexOf(i)); };
        const span = (N - 1) * 0.02;
        const rk = p.lines.map((_, i) => { let s2 = 0; for (let k = -4; k <= 4; k++) s2 += rankAt(f + (k / 4) * span)[i]; return s2 / 9; });
        const max = Math.max(...vals);
        const BX = 236, BW = 700, RY = 720, RH = 190;
        const label = p.months ? p.months[Math.min(p.months.length - 1, Math.round(f))] : String(year);
        const startX = BX + (1000 / max) * BW;
        return (
          <AbsoluteFill style={{opacity: raceIn * raceOut}}>
            {p.theme && <Chip text={p.theme} style={{left: 84, top: 470}} />}
            <div style={{position: 'absolute', right: 84, top: 452, fontFamily: SANS, fontWeight: 900, fontSize: 96, color: '#FFE07A', lineHeight: 1,
              textShadow: '0 0 30px rgba(255,224,122,0.45)'}}>{label}</div>
            {/* where everyone started */}
            {startX < BX + BW + 10 && <div style={{position: 'absolute', left: startX, top: RY - 40, height: RH * 4 + 40, borderLeft: '3px dashed rgba(255,224,122,0.55)'}}>
              <div style={{position: 'absolute', left: 8, top: -6, fontFamily: SANS, fontWeight: 800, fontSize: 22, color: 'rgba(255,224,122,0.8)', whiteSpace: 'nowrap', opacity: t >= G + R ? 0 : 1}}>START $1,000</div></div>}
            {p.lines.map((l, i) => {
              const y = RY + rk[i] * RH, w = Math.max(34, (vals[i] / max) * BW), c = lineCol(l);
              const lead = i === leader, pct = Math.round((vals[i] / 1000 - 1) * 100);
              return (
                <div key={i} style={{position: 'absolute', left: 84, top: y, width: 912, height: RH - 30, display: 'flex', alignItems: 'center'}}>
                  <div style={{position: 'relative', transform: `scale(${lead ? 1 + 0.12 * popK : 1})`}}>
                    <Tile l={l} size={130} />
                    {lead && <div style={{position: 'absolute', top: -46, left: 36, fontSize: 50}}>👑</div>}
                  </div>
                  <div style={{position: 'absolute', left: BX - 84, height: 110, width: w, borderRadius: '0 20px 20px 0',
                    background: `linear-gradient(90deg, ${c}55, ${c})`, boxShadow: `0 0 ${lead ? 40 : 18}px ${c}${lead ? 'cc' : '77'}`}} />
                  <div style={{position: 'absolute', left: BX - 84 + Math.min(w, BW - 250) + 16, top: (RH - 30) / 2 - 48, whiteSpace: 'nowrap'}}>
                    <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 52, color: lead ? '#FFE07A' : '#fff', lineHeight: 1, textShadow: '0 3px 12px rgba(0,0,0,0.7)'}}>{money(vals[i])}</div>
                    <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 28, color: pct >= 0 ? '#7FE0B0' : '#FF8A8A', marginTop: 4}}>{pct >= 0 ? '+' : ''}{pct}%</div>
                  </div>
                </div>
              );
            })}
            {/* the finish: the bars stop, FINAL slams in, the winner gets a gold frame and its multiple, the loser goes grey */}
            {t >= G + R && (() => {
              const hk = outBack(clamp01((t - G - R) / 0.3), 2.2);
              const w = vals.indexOf(Math.max(...vals)), lz = vals.indexOf(Math.min(...vals));
              return (
                <>
                  <div style={{position: 'absolute', left: 0, right: 0, top: 590, display: 'flex', justifyContent: 'center'}}>
                    <div style={{transform: `scale(${hk}) rotate(-4deg)`, background: '#FF2E4D', color: '#fff', fontFamily: SANS, fontWeight: 900, fontSize: 64, letterSpacing: '0.12em',
                      padding: '6px 34px', borderRadius: 14, boxShadow: '0 16px 40px rgba(255,46,77,0.5)'}}>🏁 FINAL</div>
                  </div>
                  {p.lines.map((l, i) => {
                    if (i !== w && i !== lz) return null;
                    const y = RY + rk[i] * RH, ww = Math.max(34, (vals[i] / max) * BW);
                    const win = i === w, mult = vals[i] / 1000;
                    return (
                      <div key={i} style={{position: 'absolute', left: BX, top: y + (RH - 30) / 2 - 55, width: ww, height: 110}}>
                        {win && <div style={{position: 'absolute', inset: -6, borderRadius: '0 26px 26px 0', border: `5px solid #FFE07A`, opacity: hk,
                          boxShadow: `0 0 ${30 + 20 * Math.abs(Math.sin(t * 5))}px rgba(255,224,122,0.8)`}} />}
                        {!win && <div style={{position: 'absolute', inset: 0, borderRadius: '0 20px 20px 0', background: 'rgba(20,10,30,0.55)', opacity: hk}} />}
                        <div style={{position: 'absolute', right: win ? -4 : undefined, left: win ? undefined : Math.min(ww, BW - 250) + 210, top: win ? -64 : 30,
                          transform: `scale(${hk})`, transformOrigin: 'right bottom', whiteSpace: 'nowrap', fontFamily: SANS, fontWeight: 900,
                          fontSize: win ? 40 : 30, color: win ? '#1a0b2e' : '#FF8A8A', background: win ? '#FFE07A' : 'transparent', padding: win ? '4px 16px' : 0, borderRadius: 12}}>
                          {win ? `🏆 ${mult >= 2 ? `${mult >= 10 ? Math.round(mult) : mult.toFixed(1)}x your money` : 'WINNER'}` : '📉 WORST'}</div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
            <div style={{position: 'absolute', left: 84, right: 84, top: 1560, textAlign: 'center', fontFamily: SANS, fontWeight: 700, fontSize: 22, color: 'rgba(255,255,255,0.55)'}}>
              Source: {p.source}</div>
          </AbsoluteFill>
        );
      })()}

      {/* B: the race */}
      {p.style !== 'bars' && raceIn > 0.01 && raceOut > 0.01 && (
        <AbsoluteFill style={{opacity: raceIn * raceOut}}>
          {p.theme && <Chip text={p.theme} style={{right: 84, top: 470}} />}
          <div style={{position: 'absolute', left: 84, top: 440, fontFamily: SANS, fontWeight: 900, fontSize: 140, color: 'rgba(255,255,255,0.16)', lineHeight: 1}}>{year}</div>
          <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0}}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={X0} x2={1000} y1={yOf(v)} y2={yOf(v)} stroke={v === 1000 ? 'rgba(255,224,122,0.45)' : 'rgba(255,255,255,0.1)'} strokeWidth={v === 1000 ? 3 : 2} strokeDasharray={v === 1000 ? '10 10' : undefined} />
                <text x={X0 - 14} y={yOf(v) + 9} textAnchor="end" fill="rgba(255,255,255,0.45)" fontFamily={SANS} fontWeight={800} fontSize={24}>{money(v).replace(',000,000', 'M').replace(',000', 'K').replace(',500', '.5K')}</text>
              </g>
            ))}
            {p.lines.map((l, i) => {
              const pts: string[] = [];
              for (let j = 0; j <= fi; j++) pts.push(`${xOf(j).toFixed(1)},${yOf(l.values[j]).toFixed(1)}`);
              pts.push(`${(X0 + (f / (N - 1)) * (X1 - X0)).toFixed(1)},${yOf(vals[i]).toFixed(1)}`);
              const c = lineCol(l);
              return <polyline key={i} points={pts.join(' ')} fill="none" stroke={c} strokeWidth={i === leader ? 12 : 9} strokeLinecap="round" strokeLinejoin="round"
                style={{filter: `drop-shadow(0 0 12px ${c})`}} />;
            })}
            <text x={X0} y={YB + 50} fill="rgba(255,255,255,0.6)" fontFamily={SANS} fontWeight={900} fontSize={30}>{Math.floor(p.years[0])}</text>
          </svg>
          {tags.map(({i, y}) => {
            const l = p.lines[i], x = X0 + (f / (N - 1)) * (X1 - X0);
            const s = 1 + (i === leader ? 0.22 * popK : 0);
            return (
              <div key={i} style={{position: 'absolute', left: x + 18, top: y - 42, display: 'flex', alignItems: 'center', gap: 12, transform: `scale(${s})`, transformOrigin: 'left center'}}>
                {l.logo && <Tile l={l} size={72} />}
                <div style={{padding: '6px 16px 8px 14px', borderRadius: 14, background: 'rgba(13,7,24,0.85)', borderLeft: `10px solid ${lineCol(l)}`, whiteSpace: 'nowrap'}}>
                  <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 24, color: lineCol(l), lineHeight: 1.1}}>{l.name}</div>
                  <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 42, color: i === leader ? '#FFE07A' : '#fff', lineHeight: 1.05}}>{money(vals[i])}</div>
                </div>
              </div>
            );
          })}
          <div style={{position: 'absolute', left: 84, right: 84, top: 1660, textAlign: 'center', fontFamily: SANS, fontWeight: 700, fontSize: 22, color: 'rgba(255,255,255,0.55)'}}>
            Source: {p.source}</div>
        </AbsoluteFill>
      )}

      {/* C: the podium */}
      {bars && podIn > 0.01 && <Results p={p} order={order} t={t} E={E} k={podIn * (1 - smooth(p.outroAt - 0.2, p.outroAt, t))} />}
      {!bars && podIn > 0.01 && (
        <AbsoluteFill style={{opacity: podIn * (1 - smooth(p.outroAt - 0.2, p.outroAt, t))}}>
          {[1, 2, 3].map((r) => {
            const l = order[r - 1], c = PODS[r], k = pod(r);
            return (
              <div key={r} style={{position: 'absolute', left: c.left, top: 1500 - c.h * k, width: 290, height: c.h * k, overflow: 'hidden', borderRadius: '24px 24px 0 0',
                background: c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 26, boxSizing: 'border-box',
                boxShadow: r === 1 ? '0 0 60px rgba(255,224,122,0.5)' : undefined}}>
                <Tile l={l} size={150} />
                <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 54, color: '#1a0b2e', marginTop: 18}}>{money(l.final)}</div>
                <div style={{fontFamily: SANS, fontWeight: 900, fontSize: 150, color: 'rgba(0,0,0,0.18)', marginTop: 'auto', marginBottom: 20}}>{r}</div>
              </div>
            );
          })}
          <div style={{position: 'absolute', left: 0, right: 0, top: 1530, textAlign: 'center', fontFamily: SANS, fontWeight: 800, fontSize: 36, color: 'rgba(255,255,255,0.75)',
            opacity: smooth(land1, land1 + 0.3, t)}}>Last: {order[3].name} {money(order[3].final)}</div>
          <div style={{position: 'absolute', left: 0, right: 0, top: 1595, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 62, color: '#FFE07A',
            transform: `scale(${outBack(clamp01((t - land1 - 0.3) / 0.35), 1.8)})`}}>Did you pick right? 👇</div>
          {/* confetti on #1 */}
          {Array.from({length: 60}, (_, i) => {
            const a = t - land1;
            if (a < 0) return null;
            const r1 = Math.sin(i * 91.7) * 0.5 + 0.5, r2 = Math.sin(i * 37.3) * 0.5 + 0.5, r3 = Math.sin(i * 13.1) * 0.5 + 0.5;
            const x = 540 + (r1 - 0.5) * 900 * outCubic(a / 0.6), y = 560 - 260 * outCubic(a / 0.5) + 900 * a * a * (0.6 + r2);
            const cols = ['#FFE07A', '#FF4FA0', '#7FE0B0', '#8FB8FF', '#fff'];
            return <div key={i} style={{position: 'absolute', left: x, top: y, width: 16, height: 26, background: cols[i % 5], borderRadius: 3,
              transform: `rotate(${(r3 * 720 + a * 400) % 360}deg)`, opacity: 1 - clamp01((a - 1.6) / 0.6)}} />;
          })}
        </AbsoluteFill>
      )}
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};
