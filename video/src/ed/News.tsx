// ---------- Leonida Live: a GTA 6 stream clip as a breaking-news segment from inside the game's world ----------
// 1. cold open (3.2 s): a network BREAKING NEWS package: the slab, the frozen payoff on a studio monitor, the headline card
// 2. the clip plays as footage from the scene (1.15x band), the streamer is the eyewitness (small inset), chyron, ticker, info strip
// 3. just before the payoff the footage freezes: DEVELOPING STORY with 3 unconfirmed reports, then the payoff plays and one is CONFIRMED
// 4. the anchor's sign-off
import React from 'react';
import {AbsoluteFill, Freeze, Sequence, useCurrentFrame} from 'remotion';
import {Drop, SANS, MONO, clamp01, outBack, outCubic, useEdFonts} from './kit';
import {Seg, Win, zoomBand} from './Clip';

const FPS = 30;
const TOP = 330;                     // the footage band starts under the LIVE bug (the facecam is a small picture-in-picture, like TV)
const CREAM = '#FFF3EA', INK = '#1A0A2E', PINK = '#FF4FA0', RED = '#E8102E', SUN = '#FF8A3D', GOLD = '#FFE45C', DISPLAY = 'Bricolage Grotesque';

export type NewsCopy = {headline: string[]; kicker: string; chyron: string; sub: string; ticker: string[];
  question: string; options: string[]; answer: number; signoff: string; place: string; clock: string; weather: string; wanted: number; report?: number};
export type EdNewsProps = {seg: Seg; copy: NewsCopy; open: number; freezeAt: number; freezeFor: number; signoff: number; duration: number;
  look?: 'clean' | 'news' | 'field'; cc?: boolean; mode?: 'band' | 'crop'; quiz?: 'news' | 'show' | 'none'};
// the footage window: band = the whole game width at 1.15x; crop = zoomed in, a tall window cut from the middle of the game
const CROP_H = 1180;
const newsBand = (s: Seg, mode: string): {r: {x: number; y: number; w: number; h: number}; h: number} => {
  if (mode !== 'crop') return zoomBand(s);
  const gb = s.gamebox && s.gamebox.w > 0.2 && s.gamebox.h > 0.2 ? s.gamebox : {x: 0, y: 0, w: 1, h: 1};
  const gw = Math.min(gb.w, (gb.h * s.srcH * (1080 / CROP_H)) / s.srcW);
  return {r: {x: gb.x + (gb.w - gw) / 2, y: gb.y, w: gw, h: gb.h}, h: CROP_H};
};

type Word = {w: string; start: number; end: number};
const groups = (words: Word[]) => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const n = words[i + 1];
    if (cur.length >= 3 || !n || n.start - w.end > 0.35 || /[.!?,]$/.test(w.w)) { out.push(cur); cur = []; }
  });
  return out;
};

const Gta6: React.FC<{size?: number}> = ({size = 26}) => (
  <div style={{display: 'inline-flex', alignItems: 'center', background: `linear-gradient(135deg, ${PINK}, ${SUN})`, color: '#fff', fontFamily: DISPLAY, fontWeight: 800,
    fontSize: size, letterSpacing: '0.02em', padding: `${size * 0.22}px ${size * 0.45}px`, borderRadius: size * 0.3, lineHeight: 1}}>GTA 6</div>
);

// the footage: the game band at 1.15x, the streamer as a small inset; t = seconds into the clip
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;
const tc = (sec: number) => { const h = 18, m = 48 + Math.floor(sec / 60), s2 = Math.floor(sec % 60), fr = Math.floor((sec * 30) % 30); const p = (n: number) => String(n).padStart(2, '0'); return `${p(h)}:${p(m)}:${p(s2)}:${p(fr)}`; };
const Footage: React.FC<{s: Seg; t: number; startAt: number; muted?: boolean; dim?: number; look?: string; mode?: string}> = ({s, t, startAt, muted, dim = 0, look = 'clean', mode = 'band'}) => {
  const cam0 = s.face !== false && s.facecam && s.facecam.w > 0.05 ? s.facecam : null;
  const band = newsBand(s, mode);
  // the streamer's webcam already inside the game picture (a cam drawn over the game): no second copy as an inset,
  // just the EYEWITNESS tag pinned to the webcam where it already is
  const r = band.r;
  const ov = cam0 ? Math.max(0, Math.min(cam0.x + cam0.w, r.x + r.w) - Math.max(cam0.x, r.x)) * Math.max(0, Math.min(cam0.y + cam0.h, r.y + r.h) - Math.max(cam0.y, r.y)) : 0;
  const inside = !!cam0 && ov > 0.5 * cam0.w * cam0.h;
  const cam = inside ? null : cam0;
  const tagX = inside && cam0 ? Math.max(8, ((cam0.x - r.x) / r.w) * 1080) : 0;
  const tagY = inside && cam0 ? Math.min(band.h - 40, ((cam0.y + cam0.h - r.y) / r.h) * band.h - 34) : 0;
  const S = {...s, from: startAt};
  const PW = 288, PH = 162;
  const name = s.credit.replace(/ on (Twitch|YouTube)$/, '');
  return (
    <>
      {s.bg ? <Win s={{...S, src: s.bg, srcW: 360, srcH: 640, blurs: []}} r={{x: 0, y: 0, w: 1, h: 1}} W={1080} H={1920} top={0} muted />
        : <AbsoluteFill style={{background: '#14082a'}} />}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(26,10,46,0.7) 0%, rgba(60,12,60,0.55) 45%, rgba(26,10,46,0.92) 100%)'}} />
      <div style={{position: 'absolute', left: 0, top: TOP, width: 1080, height: band.h, overflow: 'hidden', boxShadow: '0 0 70px rgba(0,0,0,0.7)'}}>
        <div style={{position: 'absolute', inset: 0, filter: look === 'news' ? 'contrast(1.07) saturate(0.86) brightness(0.97)'
          : look === 'field' ? 'contrast(1.12) saturate(0.7) brightness(0.95) sepia(0.12) drop-shadow(2px 0 0 rgba(255,0,60,0.35)) drop-shadow(-2px 0 0 rgba(0,220,255,0.3))' : undefined}}>
          <Win s={S} r={band.r} W={1080} H={band.h} top={0} muted={muted} t={t} />
        </div>
        {look !== 'clean' && (
          <>
            <AbsoluteFill style={{backgroundImage: GRAIN, backgroundSize: '300px 300px', backgroundPosition: `${(t * 977) % 300}px ${(t * 613) % 300}px`,
              opacity: look === 'field' ? 0.22 : 0.12, mixBlendMode: 'overlay'}} />
            <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 50%, transparent ${look === 'field' ? 50 : 62}%, rgba(0,0,0,${look === 'field' ? 0.55 : 0.32}) 100%)`}} />
            {look === 'field' && <AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 3px)'}} />}
            {look === 'field' && [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => (
              <div key={i} style={{position: 'absolute', width: 54, height: 54, [x ? 'right' : 'left']: 26, [y ? 'bottom' : 'top']: 26,
                [x ? 'borderRight' : 'borderLeft']: '4px solid rgba(255,255,255,0.85)', [y ? 'borderBottom' : 'borderTop']: '4px solid rgba(255,255,255,0.85)'} as any} />
            ))}
            <div style={{position: 'absolute', ...(inside && tagX > 480 && tagY > band.h * 0.55 ? {top: 18} : {bottom: 18}), right: 22, display: 'flex', alignItems: 'center', gap: 12, fontFamily: MONO, fontWeight: 700, fontSize: 22,
              color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.8)', letterSpacing: '0.06em'}}>
              <span style={{color: RED, opacity: Math.floor(t * 2) % 2 ? 1 : 0.3}}>●</span> REC <span style={{opacity: 0.85}}>CAM 2</span> <span>{tc(t + 12)}</span>
            </div>
          </>
        )}
        <AbsoluteFill style={{background: `rgba(10,4,20,${dim})`}} />
        {look === 'clean' && <div style={{position: 'absolute', top: 16, right: 18, fontFamily: MONO, fontWeight: 700, fontSize: 20, color: CREAM, padding: '6px 12px',
          background: 'rgba(10,4,20,0.6)', borderRadius: 8, letterSpacing: '0.06em'}}><span style={{color: RED}}>●</span> FOOTAGE FROM THE SCENE</div>}
        {inside && (
          <div style={{position: 'absolute', left: tagX, top: tagY, display: 'flex', alignItems: 'stretch', fontFamily: SANS, fontWeight: 800,
            boxShadow: '0 6px 18px rgba(0,0,0,0.5)'}}>
            <div style={{background: PINK, color: '#fff', fontSize: 15, letterSpacing: '0.12em', padding: '6px 8px'}}>EYEWITNESS</div>
            <div style={{background: 'rgba(26,10,46,0.9)', color: CREAM, fontSize: 18, padding: '5px 10px'}}>{name}</div>
          </div>
        )}
        {cam && (
          <div style={{position: 'absolute', left: 16, top: 16, width: PW, height: PH, borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,0.65), 0 0 0 3px rgba(255,243,234,0.95)'}}>
            <Win s={S} r={cam} W={PW} H={PH} top={0} muted t={t} />
            <div style={{position: 'absolute', left: 0, bottom: 0, display: 'flex', alignItems: 'stretch', fontFamily: SANS, fontWeight: 800}}>
              <div style={{background: PINK, color: '#fff', fontSize: 13, letterSpacing: '0.12em', padding: '5px 7px'}}>EYEWITNESS</div>
              <div style={{background: 'rgba(26,10,46,0.9)', color: CREAM, fontSize: 16, padding: '4px 9px'}}>{name}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const ticking = (clock: string, sec: number) => {         // '6:48 PM' -> '6:48:07 PM', counting up with the reel
  const m = clock.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return clock;
  const total = Number(m[2]) * 60 + 7 + Math.floor(sec);
  const mm = Math.floor(total / 60) % 60, ss = total % 60;
  return `${m[1]}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} ${(m[3] || '').toUpperCase()}`.trim();
};
const LiveBug: React.FC<{copy: NewsCopy; f: number}> = ({copy, f}) => {
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(f / 9));
  return (
    <div style={{position: 'absolute', top: 190, left: 48, right: 48, height: 84, display: 'flex', alignItems: 'center', gap: 14}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 10, background: RED, color: '#fff', fontFamily: SANS, fontWeight: 800, fontSize: 26,
        letterSpacing: '0.12em', padding: '12px 16px', borderRadius: 10, boxShadow: '0 8px 24px rgba(232,16,46,0.45)'}}>
        <div style={{width: 14, height: 14, borderRadius: 7, background: '#fff', opacity: pulse}} />LIVE
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(26,10,46,0.85)', padding: '9px 16px 9px 12px', borderRadius: 10,
        border: '1.5px solid rgba(255,243,234,0.25)'}}>
        <Drop size={36} fill={PINK} bars={INK} />
        <div style={{fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 40, color: CREAM, lineHeight: 1}}>Leonida <span style={{color: PINK}}>Live</span></div>
        <Gta6 size={24} />
      </div>
      {copy.report ? <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 22, color: GOLD, background: 'rgba(26,10,46,0.85)', padding: '14px 12px', borderRadius: 10,
        letterSpacing: '0.08em'}}>REPORT #{copy.report}</div> : null}
      <div style={{flex: 1}} />
      <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 23, color: CREAM, background: 'rgba(26,10,46,0.85)', padding: '14px 14px', borderRadius: 10,
        letterSpacing: '0.03em'}}>{ticking(copy.clock, f / FPS)}</div>
    </div>
  );
};

// the lower third: BREAKING tab, cream headline bar, purple sub line; wipes in
const Chyron: React.FC<{copy: NewsCopy; top: number; t: number}> = ({copy, top, t}) => {
  const tab = outCubic(t / 0.3), bar = outCubic((t - 0.12) / 0.45), sub = outCubic((t - 0.35) / 0.4);
  return (
    <div style={{position: 'absolute', top, left: 48, width: 984}}>
      <div style={{display: 'flex', alignItems: 'stretch', transform: `translateX(${(1 - tab) * -400}px)`, opacity: tab}}>
        <div style={{background: RED, color: '#fff', fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: '0.18em', padding: '9px 18px'}}>BREAKING NEWS</div>
        <div style={{background: INK, color: GOLD, fontFamily: SANS, fontWeight: 800, fontSize: 24, letterSpacing: '0.12em', padding: '10px 16px'}}>{copy.place} · GTA 6</div>
      </div>
      <div style={{background: CREAM, color: INK, fontFamily: DISPLAY, fontWeight: 800, fontSize: 52, lineHeight: 1.02, letterSpacing: '-0.02em',
        padding: '16px 24px 14px', textTransform: 'uppercase', clipPath: `inset(0 ${(1 - bar) * 100}% 0 0)`, boxShadow: '0 14px 40px rgba(0,0,0,0.45)'}}>
        {copy.chyron}
      </div>
      <div style={{background: INK, color: CREAM, fontFamily: SANS, fontWeight: 600, fontSize: 30, padding: '12px 24px', clipPath: `inset(0 ${(1 - sub) * 100}% 0 0)`}}>
        {copy.sub}
      </div>
    </div>
  );
};

const Ticker: React.FC<{copy: NewsCopy; top: number; f: number}> = ({copy, top, f}) => {
  const text = copy.ticker.map((x) => x.toUpperCase()).join('   ◆   ') + '   ◆   ';
  const speed = 3.15;
  const w = text.length * 17.5;
  const x = -((f * speed) % w);
  return (
    <div style={{position: 'absolute', top, left: 0, width: 1080, height: 58, overflow: 'hidden', display: 'flex',
      background: `linear-gradient(90deg, ${PINK}, ${SUN})`}}>
      <div style={{position: 'relative', zIndex: 2, background: INK, color: GOLD, fontFamily: SANS, fontWeight: 800, fontSize: 24, letterSpacing: '0.14em',
        display: 'flex', alignItems: 'center', padding: '0 20px 0 48px'}}>LATEST</div>
      <div style={{position: 'relative', flex: 1, overflow: 'hidden'}}>
        <div style={{position: 'absolute', top: 12, left: x, whiteSpace: 'nowrap', fontFamily: SANS, fontWeight: 800, fontSize: 28, color: '#fff'}}>{text + text}</div>
      </div>
    </div>
  );
};

// the in-world info strip under the ticker: weather, wanted level, the place (TV news always shows these)
const InfoStrip: React.FC<{copy: NewsCopy; top: number}> = ({copy, top}) => {
  const stars = Math.max(1, Math.min(5, copy.wanted || 3));
  return (
    <div style={{position: 'absolute', top, left: 48, width: 984, height: 74, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'rgba(26,10,46,0.85)', border: '1.5px solid rgba(255,243,234,0.18)', borderRadius: 14, padding: '0 26px', fontFamily: SANS, fontWeight: 800, color: CREAM}}>
      <div style={{fontSize: 26}}>☀ {copy.weather}</div>
      <div style={{fontSize: 26, display: 'flex', alignItems: 'center', gap: 10}}>
        <span style={{fontSize: 20, letterSpacing: '0.12em', color: 'rgba(255,243,234,0.7)'}}>WANTED</span>
        <span style={{color: GOLD, letterSpacing: '0.08em'}}>{'★'.repeat(stars)}<span style={{color: 'rgba(255,243,234,0.25)'}}>{'★'.repeat(5 - stars)}</span></span>
      </div>
      <div style={{fontSize: 24, letterSpacing: '0.08em', color: GOLD}}>{copy.place}</div>
    </div>
  );
};

const Captions: React.FC<{s: Seg; t: number; top: number; cc?: boolean}> = ({s, t, top, cc}) => {
  const caps = groups((s.words ?? []) as Word[]);
  const cap = caps.find((g) => t >= g[0].start - 0.05 && t <= g[g.length - 1].end + 0.25);
  if (!cap) return null;
  const k = outBack(clamp01((t - cap[0].start + 0.05) / 0.16), 2.2);
  if (cc) return (
    <div style={{position: 'absolute', top: top + 6, left: 0, width: 1080, display: 'flex', justifyContent: 'center'}}>
      <div style={{background: 'rgba(0,0,0,0.88)', padding: '8px 18px', fontFamily: MONO, fontWeight: 700, fontSize: 44, color: '#fff', letterSpacing: '0.01em'}}>
        <span style={{color: GOLD, marginRight: 14}}>{'>>'}</span>{cap.map((w) => w.w).join(' ').toUpperCase()}
      </div>
    </div>
  );
  return (
    <div style={{position: 'absolute', top, left: 60, width: 960, textAlign: 'center', transform: `scale(${0.85 + 0.15 * k})`}}>
      {cap.map((w, i) => (
        <span key={i} style={{fontFamily: SANS, fontWeight: 800, fontSize: 58, marginRight: 14, color: t >= w.start ? GOLD : '#fff',
          textShadow: '0 4px 0 #000, 0 0 18px rgba(0,0,0,0.85)', WebkitTextStroke: '2px #000'}}>{w.w}</span>
      ))}
    </div>
  );
};

// the cold open: a network breaking-news package.
// 0.0  ident: a red light streak splits the black, the Leonida Live / GTA 6 ident flares in
// 0.5  the frozen payoff fills the screen (slow push-in, broadcast grade), BREAKING (red) and NEWS (white) slabs slide in from both sides
// 1.1  the headline builds line by line on a dark glass panel, the place/time kicker above, EXCLUSIVE FOOTAGE rolls in at the bottom
const IDENT_HOLD = 1.0;              // the GRAND THEFT AUTO 6 ident stays up this much longer before the slabs
const ColdOpen: React.FC<{s: Seg; copy: NewsCopy; t: number; peak: number; dur: number}> = ({s, copy, t: ti, peak, dur: D}) => {
  const band = zoomBand(s);
  const t = Math.max(0, ti - IDENT_HOLD), dur = D - IDENT_HOLD;      // everything after the ident runs on its own clock
  const ident = ti < 0.55 + IDENT_HOLD;
  const streak = outCubic(ti / 0.3), identK = outBack(clamp01((ti - 0.08) / 0.3), 1.6), wipe = outCubic((ti - 0.42 - IDENT_HOLD) / 0.18);
  const brk = outCubic((t - 0.55) / 0.32), nws = outCubic((t - 0.68) / 0.32), glint = clamp01((t - 0.95) / 0.45);
  const kick = outCubic((t - 1.0) / 0.3), panel = outCubic((t - 1.05) / 0.35);
  const roll = clamp01((t - 1.6) / (dur - 1.7));
  const push = 1.08 + 0.06 * clamp01((t - 0.5) / (dur - 0.5));
  const out = clamp01((t - (dur - 0.18)) / 0.18);
  const skew = (k: number, from: number) => ({transform: `translateX(${(1 - k) * from}px) skewX(-12deg)`});
  return (
    <AbsoluteFill style={{background: '#07020c', overflow: 'hidden'}}>
      {/* the scene, frozen on the payoff, graded like a news package */}
      <AbsoluteFill style={{transform: `scale(${push})`}}>
        <Freeze frame={Math.round(peak * FPS)}>
          <Win s={s} r={band.r} W={1080} H={1920} top={0} muted />
        </Freeze>
      </AbsoluteFill>
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(7,2,12,0.55) 0%, rgba(7,2,12,0.15) 28%, rgba(7,2,12,0.55) 52%, rgba(7,2,12,0.96) 78%)'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 0%, rgba(232,16,46,0.45), transparent 55%)', mixBlendMode: 'screen'}} />
      <AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.14) 0 2px, transparent 2px 4px)'}} />
      {/* network bug */}
      <div style={{position: 'absolute', top: 196, left: 48, right: 48, display: 'flex', alignItems: 'center', gap: 14, opacity: clamp01((t - 0.5) / 0.2)}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, background: RED, color: '#fff', fontFamily: SANS, fontWeight: 800, fontSize: 24, letterSpacing: '0.12em',
          padding: '10px 14px', borderRadius: 8}}><div style={{width: 12, height: 12, borderRadius: 6, background: '#fff', opacity: 0.55 + 0.45 * Math.abs(Math.sin(t * 3.3))}} />LIVE</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(7,2,12,0.7)', padding: '8px 14px 8px 10px', borderRadius: 8, border: '1.5px solid rgba(255,243,234,0.2)'}}>
          <Drop size={34} fill={PINK} bars={'#07020c'} />
          <div style={{fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 38, color: CREAM, lineHeight: 1}}>Leonida <span style={{color: PINK}}>Live</span></div>
          <Gta6 size={22} />
        </div>
      </div>
      {/* the game, big, from the first frame after the ident */}
      <div style={{position: 'absolute', top: 290, left: 48, width: 984, opacity: clamp01((t - 0.45) / 0.15)}}>
        <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 118, lineHeight: 0.92, letterSpacing: '-0.04em', color: CREAM,
          textShadow: '0 8px 30px rgba(0,0,0,0.6)'}}>GRAND THEFT</div>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 18}}>
          <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 118, lineHeight: 0.98, letterSpacing: '-0.04em',
            background: `linear-gradient(90deg, ${PINK}, ${SUN})`, WebkitBackgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.55))'}}>AUTO 6</div>
          <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 24, color: GOLD, letterSpacing: '0.12em'}}>· LEONIDA</div>
        </div>
      </div>
      {/* BREAKING / NEWS slabs */}
      <div style={{position: 'absolute', top: 580, left: 0, width: 1080}}>
        <div style={{marginLeft: 36, display: 'inline-block', ...skew(brk, -1200), background: `linear-gradient(180deg, #ff2f4a, ${RED} 60%, #a8061e)`,
          boxShadow: '0 22px 50px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,255,255,0.35)', padding: '6px 46px 2px', position: 'relative', overflow: 'hidden'}}>
          <div style={{transform: 'skewX(12deg)', fontFamily: DISPLAY, fontWeight: 800, fontStyle: 'italic', fontSize: 168, lineHeight: 1, color: '#fff', letterSpacing: '-0.02em'}}>BREAKING</div>
          <div style={{position: 'absolute', top: 0, bottom: 0, width: 160, left: -200 + glint * 1300, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)'}} />
        </div>
        <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 14, marginRight: 36}}>
          <div style={{display: 'flex', alignItems: 'stretch', ...skew(nws, 1200), boxShadow: '0 22px 50px rgba(0,0,0,0.55)'}}>
            <div style={{background: CREAM, padding: '2px 40px 0'}}>
              <div style={{transform: 'skewX(12deg)', fontFamily: DISPLAY, fontWeight: 800, fontStyle: 'italic', fontSize: 132, lineHeight: 1, color: INK, letterSpacing: '-0.02em'}}>NEWS</div>
            </div>
            <div style={{background: INK, display: 'flex', alignItems: 'center', padding: '0 26px'}}>
              <div style={{transform: 'skewX(12deg)', fontFamily: MONO, fontWeight: 700, fontSize: 28, color: GOLD, letterSpacing: '0.08em', lineHeight: 1.25, textAlign: 'center'}}>
                GTA 6<br />EDITION</div>
            </div>
          </div>
        </div>
      </div>
      {/* kicker + headline on dark glass */}
      <div style={{position: 'absolute', top: 1010, left: 48, width: 984}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 12, opacity: kick, transform: `translateY(${(1 - kick) * 16}px)`, marginBottom: 14}}>
          <div style={{width: 12, height: 12, borderRadius: 6, background: RED, opacity: 0.4 + 0.6 * Math.abs(Math.sin(t * 4))}} />
          <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 28, color: GOLD, letterSpacing: '0.12em'}}>{copy.kicker.toUpperCase()}</div>
          <div style={{flex: 1, height: 3, background: `linear-gradient(90deg, ${RED}, transparent)`, transformOrigin: 'left', transform: `scaleX(${kick})`}} />
        </div>
        <div style={{display: 'flex', opacity: panel, transform: `translateY(${(1 - panel) * 30}px)`, boxShadow: '0 30px 70px rgba(0,0,0,0.6)'}}>
          <div style={{width: 16, background: `linear-gradient(180deg, ${RED}, ${PINK})`}} />
          <div style={{flex: 1, background: 'rgba(12,5,22,0.86)', backdropFilter: 'blur(14px)', padding: '22px 30px 26px', borderTop: '1.5px solid rgba(255,255,255,0.12)'}}>
            {copy.headline.map((line, i) => {
              const k = outCubic(clamp01((t - 1.2 - i * 0.22) / 0.32));
              return (
                <div key={i} style={{overflow: 'hidden'}}>
                  <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 96, lineHeight: 1.0, letterSpacing: '-0.035em', textTransform: 'uppercase',
                    color: i === copy.headline.length - 1 ? GOLD : CREAM, transform: `translateY(${(1 - k) * 105}%)`}}>{line}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* roll tape */}
        <div style={{marginTop: 22, display: 'flex', alignItems: 'center', gap: 16, opacity: clamp01((t - 1.6) / 0.25)}}>
          <div style={{background: GOLD, color: INK, fontFamily: SANS, fontWeight: 800, fontSize: 24, letterSpacing: '0.14em', padding: '9px 14px', borderRadius: 6}}>EXCLUSIVE FOOTAGE</div>
          <div style={{flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,243,234,0.2)', overflow: 'hidden'}}>
            <div style={{width: `${roll * 100}%`, height: '100%', background: `linear-gradient(90deg, ${GOLD}, ${RED})`}} />
          </div>
          <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 24, color: CREAM, letterSpacing: '0.1em'}}>▶ ROLL TAPE</div>
        </div>
      </div>
      {/* the ident sting over everything for the first half second */}
      {ident && (
        <AbsoluteFill style={{background: '#07020c', clipPath: `inset(${wipe * 50}% 0 ${wipe * 50}% 0)`}}>
          <div style={{position: 'absolute', top: 975, left: 540 - 560 * streak, width: 1120 * streak, height: 4, background: '#fff',
            boxShadow: `0 0 30px 8px ${RED}, 0 0 90px 20px rgba(232,16,46,0.6)`}} />
          <div style={{position: 'absolute', top: 700, left: 0, width: 1080, textAlign: 'center', transform: `scale(${identK})`, opacity: clamp01(identK)}}>
            <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 150, lineHeight: 0.9, letterSpacing: '-0.045em', color: CREAM, textShadow: `0 0 50px ${RED}`}}>GRAND THEFT</div>
            <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 150, lineHeight: 0.95, letterSpacing: '-0.045em',
              background: `linear-gradient(90deg, ${PINK}, ${SUN})`, WebkitBackgroundClip: 'text', color: 'transparent'}}>AUTO 6</div>
          </div>
          <div style={{position: 'absolute', top: 1000, left: 0, width: 1080, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14,
            opacity: clamp01((ti - 0.2) / 0.15)}}>
            <Drop size={46} fill={PINK} bars={'#07020c'} />
            <div style={{fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 56, color: CREAM, lineHeight: 1}}>Leonida <span style={{color: PINK}}>Live</span></div>
          </div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{background: '#fff', opacity: out * 0.9}} />
    </AbsoluteFill>
  );
};

// the freeze: DEVELOPING STORY. The footage dims and holds; 3 unconfirmed reports come in like a newsroom update
const Developing: React.FC<{copy: NewsCopy; t: number; top: number}> = ({copy, t, top}) => {
  const head = outCubic(t / 0.3);
  const blink = Math.floor(t * 3) % 2 ? 1 : 0.35;
  return (
    <div style={{position: 'absolute', top, left: 48, width: 984}}>
      <div style={{display: 'flex', alignItems: 'stretch', transform: `translateX(${(1 - head) * -500}px)`}}>
        <div style={{background: GOLD, color: INK, fontFamily: SANS, fontWeight: 800, fontSize: 28, letterSpacing: '0.16em', padding: '11px 18px',
          display: 'flex', alignItems: 'center', gap: 10}}><span style={{opacity: blink}}>●</span> DEVELOPING STORY</div>
        <div style={{background: INK, color: CREAM, fontFamily: SANS, fontWeight: 600, fontSize: 26, padding: '12px 18px'}}>Footage paused · reports coming in</div>
      </div>
      <div style={{background: 'rgba(255,243,234,0.97)', padding: '16px 24px 10px', boxShadow: '0 18px 44px rgba(0,0,0,0.5)'}}>
        <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, color: INK, letterSpacing: '-0.02em', marginBottom: 8, textTransform: 'uppercase'}}>
          Unconfirmed reports say:
        </div>
        {copy.options.map((o, i) => {
          const k = outCubic(clamp01((t - 0.35 - i * 0.3) / 0.3));
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '2px solid rgba(26,10,46,0.12)',
              opacity: k, transform: `translateX(${(1 - k) * 60}px)`}}>
              <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 24, color: RED, width: 128}}>REPORT {i + 1}</div>
              <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 38, color: INK}}>{o}</div>
            </div>
          );
        })}
      </div>
      <div style={{background: INK, color: GOLD, fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: '0.06em', padding: '12px 24px',
        opacity: clamp01((t - 1.3) / 0.3)}}>Which report is true? Tell us in the comments ↓</div>
    </div>
  );
};

// back on the footage: the true report gets CONFIRMED
const Confirmed: React.FC<{copy: NewsCopy; t: number; top: number; show?: boolean}> = ({copy, t, top, show}) => {
  const k = outBack(clamp01(t / 0.25), 1.8), out = clamp01((t - 1.6) / 0.25);
  if (show) return (
    <div style={{position: 'absolute', top, left: 48, width: 984, display: 'flex', alignItems: 'stretch', transform: `scale(${k * (1 - out)})`, transformOrigin: 'left center',
      boxShadow: '0 14px 36px rgba(0,0,0,0.5)'}}>
      <div style={{background: '#2BD47D', color: INK, fontFamily: DISPLAY, fontWeight: 800, fontSize: 56, padding: '10px 26px', display: 'flex', alignItems: 'center'}}>{'ABC'[copy.answer]} ✓</div>
      <div style={{flex: 1, background: CREAM, color: INK, fontFamily: DISPLAY, fontWeight: 800, fontSize: 46, padding: '14px 22px', textTransform: 'uppercase',
        letterSpacing: '-0.02em', display: 'flex', alignItems: 'center'}}>{copy.options[copy.answer]}</div>
    </div>
  );
  return (
    <div style={{position: 'absolute', top, left: 48, width: 984, display: 'flex', alignItems: 'stretch', transform: `scaleY(${k * (1 - out)})`,
      boxShadow: '0 14px 36px rgba(0,0,0,0.5)'}}>
      <div style={{background: RED, color: '#fff', fontFamily: SANS, fontWeight: 800, fontSize: 30, letterSpacing: '0.16em', padding: '18px 20px',
        display: 'flex', alignItems: 'center'}}>CONFIRMED</div>
      <div style={{flex: 1, background: CREAM, color: INK, fontFamily: DISPLAY, fontWeight: 800, fontSize: 46, padding: '14px 22px', textTransform: 'uppercase',
        letterSpacing: '-0.02em', display: 'flex', alignItems: 'center'}}>Report {copy.answer + 1}: {copy.options[copy.answer]}</div>
    </div>
  );
};

// the bottom plate: the network's logo, alive (slow 3D turn, a light sweep), under the info strip where the app's title sits
const Plate: React.FC<{top: number; f: number}> = ({top, f}) => {
  const t = f / FPS;
  const sweep = ((t * 0.45) % 1.4) - 0.2;
  return (
    <div style={{position: 'absolute', top, left: 0, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 18, perspective: 600}}>
        <div style={{transform: `rotateY(${Math.sin(t * 1.3) * 28}deg)`, filter: `drop-shadow(0 0 ${18 + 8 * Math.sin(t * 2)}px rgba(255,79,160,0.6))`}}>
          <Drop size={76} fill={PINK} bars={INK} />
        </div>
        <div style={{position: 'relative', overflow: 'hidden', padding: '0 6px'}}>
          <div style={{fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 78, color: CREAM, lineHeight: 1.05}}>The Daily <span style={{color: PINK}}>Drop</span></div>
          <div style={{position: 'absolute', top: 0, bottom: 0, left: `${sweep * 100}%`, width: 90, transform: 'skewX(-20deg)',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)'}} />
        </div>
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, fontFamily: MONO, fontWeight: 700, fontSize: 22, letterSpacing: '0.14em', color: 'rgba(255,243,234,0.75)'}}>
        <span style={{color: RED, opacity: 0.5 + 0.5 * Math.abs(Math.sin(t * 3))}}>●</span> LEONIDA LIVE <span style={{color: PINK}}>·</span> GTA 6 COVERAGE 24/7
      </div>
    </div>
  );
};

// the freeze as a game show: everything behind greys out, one card with the question, 3 answers and a 5-second countdown ring
const Quiz: React.FC<{copy: NewsCopy; t: number; secs: number}> = ({copy, t, secs}) => {
  const k = outBack(clamp01(t / 0.3), 1.7);
  const left = Math.max(0, secs - Math.max(0, t - 0.3));
  const R = 46, C = 2 * Math.PI * R;
  return (
    <div style={{position: 'absolute', top: 560, left: 60, width: 960, transform: `scale(${k})`, transformOrigin: '50% 30%'}}>
      <div style={{background: CREAM, borderRadius: 30, padding: '30px 34px 34px', boxShadow: '0 40px 90px rgba(0,0,0,0.7), 0 0 0 6px rgba(255,79,160,0.9)'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <div>
            <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 22, color: RED, letterSpacing: '0.14em'}}>● FOOTAGE PAUSED</div>
            <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, color: INK, letterSpacing: '-0.03em', lineHeight: 1.0, marginTop: 6}}>WHAT HAPPENS<br />NEXT?</div>
          </div>
          <div style={{position: 'relative', width: 120, height: 120}}>
            <svg width={120} height={120} style={{transform: 'rotate(-90deg)'}}>
              <circle cx={60} cy={60} r={R} stroke="rgba(26,10,46,0.12)" strokeWidth={12} fill="none" />
              <circle cx={60} cy={60} r={R} stroke={left < 1.5 ? RED : PINK} strokeWidth={12} fill="none" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - left / secs)} />
            </svg>
            <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontWeight: 800,
              fontSize: 56, color: left < 1.5 ? RED : INK}}>{Math.ceil(left)}</div>
          </div>
        </div>
        <div style={{marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14}}>
          {copy.options.map((o, i) => {
            const kk = outBack(clamp01((t - 0.3 - i * 0.12) / 0.25), 1.6);
            return (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 18, background: '#fff', border: '3px solid rgba(26,10,46,0.12)', borderRadius: 18,
                padding: '14px 18px', transform: `translateX(${(1 - kk) * 700}px)`}}>
                <div style={{width: 60, height: 60, borderRadius: 14, background: [PINK, SUN, '#7B5CFF'][i], color: '#fff', fontFamily: DISPLAY, fontWeight: 800, fontSize: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{'ABC'[i]}</div>
                <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 40, color: INK}}>{o}</div>
              </div>
            );
          })}
        </div>
        <div style={{marginTop: 20, textAlign: 'center', fontFamily: SANS, fontWeight: 800, fontSize: 28, color: 'rgba(26,10,46,0.6)'}}>Lock in your answer in the comments ↓</div>
      </div>
    </div>
  );
};

const SignOff: React.FC<{copy: NewsCopy; t: number}> = ({copy, t}) => {
  const k = outCubic(t / 0.35);
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 38%, #6A1E6E 0%, ${INK} 62%)`, alignItems: 'center', justifyContent: 'center', opacity: k}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40, transform: `translateY(${(1 - k) * 30}px)`}}>
        <Drop size={74} fill={PINK} bars={INK} />
        <div style={{fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 84, color: CREAM}}>Leonida <span style={{color: PINK}}>Live</span></div>
        <Gta6 size={40} />
      </div>
      <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 70, color: CREAM, textAlign: 'center', width: 900, lineHeight: 1.05, letterSpacing: '-0.03em',
        transform: `translateY(${(1 - k) * 50}px)`}}>“{copy.signoff}”</div>
      <div style={{marginTop: 36, fontFamily: MONO, fontWeight: 700, fontSize: 26, color: GOLD, letterSpacing: '0.12em'}}>THE DAILY DROP · NEWS FROM LEONIDA</div>
    </AbsoluteFill>
  );
};

export const EdNews: React.FC<EdNewsProps> = ({seg, copy, open, freezeAt, freezeFor, look = 'clean', cc = false, mode = 'band', quiz = 'news'}) => {
  useEdFonts();
  const f = useCurrentFrame();
  const T = f / FPS;
  const band = newsBand(seg, mode);
  const under = TOP + band.h;                                   // captions, then the lower third, the ticker and the info strip
  const p1 = open, p2 = open + freezeAt, p3 = p2 + freezeFor, end = open + seg.dur + freezeFor;
  const clipT = T < p2 ? T - p1 : T < p3 ? freezeAt : T - freezeFor - p1;     // seconds into the clip
  const peak = seg.peak ?? freezeAt + 0.5;
  const crop = mode === 'crop';
  const lower = crop ? under - 340 : under + 96, tick = crop ? under - 78 : under + 356, info = crop ? under + 10 : under + 432;
  const capTop = crop ? lower - 100 : under + 8, plate = info + 110;
  const frozen = T >= p2 && T < p3;
  const grey = quiz === 'show' && frozen ? clamp01((T - p2) / 0.25) : 0;
  return (
    <AbsoluteFill style={{background: INK}}>
      {T < p1 && <ColdOpen s={seg} copy={copy} t={T} peak={peak} dur={open} />}
      {T >= p1 && T < end && (
        <>
          <AbsoluteFill style={{filter: grey ? `grayscale(${grey}) brightness(${1 - 0.55 * grey})` : undefined}}>
          {freezeAt > 0 && <Sequence from={Math.round(p1 * FPS)} durationInFrames={Math.round(freezeAt * FPS)}>
            <Footage s={seg} t={clipT} startAt={seg.from} look={look} mode={mode} />
          </Sequence>}
          {freezeFor > 0 && <Sequence from={Math.round(p2 * FPS)} durationInFrames={Math.round(freezeFor * FPS)}>
            <Freeze frame={0}>
              <Footage s={seg} t={clipT} startAt={seg.from + freezeAt} muted dim={quiz === 'show' ? 0 : 0.35} look={look} mode={mode} />
            </Freeze>
          </Sequence>}
          {seg.dur - freezeAt > 0.05 && <Sequence from={Math.round(p3 * FPS)} durationInFrames={Math.round((seg.dur - freezeAt) * FPS)}>
            <Footage s={seg} t={clipT} startAt={seg.from + freezeAt} look={look} mode={mode} />
          </Sequence>}
          <LiveBug copy={copy} f={f} />
          {(T < p2 || T >= p3) && <Captions s={seg} t={clipT} top={capTop} cc={cc} />}
          {T < p2 && <Chyron copy={copy} top={lower} t={T - p1} />}
          {frozen && quiz !== 'show' && <Developing copy={copy} t={T - p2} top={under - 260} />}
          {quiz !== 'none' && T >= p3 && T < p3 + 1.9 && <Confirmed copy={copy} t={T - p3} top={lower} show={quiz === 'show'} />}
          {quiz !== 'none' && T >= p3 + 1.85 && <Chyron copy={copy} top={lower} t={T - p3 - 1.85} />}
          <Ticker copy={copy} top={tick} f={f} />
          <InfoStrip copy={copy} top={info} />
          <Plate top={plate} f={f} />
          </AbsoluteFill>
          {frozen && quiz === 'show' && <Quiz copy={copy} t={T - p2} secs={freezeFor - 0.5} />}
        </>
      )}
      {T >= end && <SignOff copy={copy} t={T - end} />}
    </AbsoluteFill>
  );
};
