// ---------- Map explainer, Vox style (engine/mapx.py builds the props) ----------
// A real map (Natural Earth): ocean depth bands, raised paper land with a shadow, lakes, borders, cities sized by population.
// The story runs in beats: each beat moves the camera (with an optional 3D tilt), swaps the headline (one word on a highlighter
// swipe), shows its caption, and adds to the map (land pulse, cities pop, a hatched band draws on, a stat card slams in).
// Layout (1080x1920): 0-150 free for the apps' buttons, masthead 160, headline 250-520 (on a dark fade), map behind everything,
// tag/scale on the map, stat card 1470-1690, caption 1700-1800.
import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {LogoOutro, Masthead, PAL, SANS, clamp01, lerp, outBack, outCubic, smooth, useEdFonts} from './kit';

type City = {name: string; at: [number, number]; r: number; label?: [number, number] | null};
type Beat = {say: string; head: [string, string, string]; cam: [number, number, number]; show: string[]; tilt?: number;
  tag?: {at: [number, number]; text: string}; card?: {big: string; line: string; myth: string}; ask?: boolean; start: number; end: number};
export type EdMapVProps = {layers: {sea: {d: string; fill: string}[]; near: string[]; land: string; lakes: string; bands: Record<string, string>; border: string[]};
  cities: City[]; beats: Beat[]; accent: string; scale: {km: number; px: number}; voice: string | null; music: string | null;
  outroAt: number; duration: number};

const CX = 540, CY = 1020, INK = '#111', LAND = '#F3ECDD';
const ANTON = 'Anton';

const useExtraFonts = () => {
  const [handle] = useState(() => delayRender('map fonts'));
  useEffect(() => {
    const faces = [new FontFace(ANTON, `url(${staticFile('fonts/anton-latin-400-normal.woff2')})`, {weight: '400'}),
      new FontFace('Inter', `url(${staticFile('fonts/inter-latin-900-normal.woff2')})`, {weight: '900'})];
    Promise.all(faces.map((f) => f.load())).then((l) => { l.forEach((f) => (document.fonts as any).add(f)); continueRender(handle); });
  }, [handle]);
};

export const EdMapV: React.FC<EdMapVProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  useExtraFonts();
  const B = p.beats;
  const bi = Math.max(0, B.findIndex((b) => t < b.end) === -1 ? B.length - 1 : B.findIndex((b) => t < b.end));
  const cur = B[bi], prev = B[Math.max(0, bi - 1)];
  const since = t - cur.start;
  // the camera: eased from the last beat's spot, then a slow push-in
  const mv = bi === 0 ? 1 : smooth(0, 1.1, since);
  const drift = 1 + 0.012 * Math.max(0, since);
  const z = lerp(prev.cam[2], cur.cam[2], mv) * drift;
  const cx = lerp(prev.cam[0], cur.cam[0], mv), cy = lerp(prev.cam[1], cur.cam[1], mv);
  const tilt = lerp(prev.tilt ?? 0, cur.tilt ?? 0, mv);
  const fade = 1 - smooth(p.outroAt - 0.2, p.outroAt, t);
  const intro = smooth(0, 0.9, t);
  // when a thing first appears, and whether it's on now
  const firstAt = (k: string) => { const b = B.find((x) => x.show.includes(k)); return b ? b.start : Infinity; };
  const on = (k: string) => cur.show.includes(k);
  const lastOff = (k: string) => { let e = -Infinity; B.forEach((b, i) => { if (b.show.includes(k) && B[i + 1] && !B[i + 1].show.includes(k)) e = B[i + 1].start; }); return e; };
  const vis = (k: string) => on(k) ? smooth(firstAt(k), firstAt(k) + 0.4, t) : 1 - smooth(lastOff(k), lastOff(k) + 0.5, t);
  const citiesAt = firstAt('cities') + 0.3;
  const sw = (w: number) => w / z;   // a constant on-screen width inside the zoomed map

  // sounds
  const sfx: [number, string, number][] = [[0.15, 'sfx/news_whoosh.mp3', 0.5]];
  B.forEach((b, i) => {
    if (i && (b.cam[0] !== B[i - 1].cam[0] || b.cam[2] !== B[i - 1].cam[2])) sfx.push([b.start, 'sfx/whoosh.mp3', 0.4]);
    if (b.card) sfx.push([b.start + 0.45, 'sfx/news_impact.mp3', 0.8]);
    if (b.ask) sfx.push([b.start + 0.2, 'sfx/news_ding.mp3', 0.6]);
  });
  p.cities.slice(0, 6).forEach((_, i) => sfx.push([citiesAt + i * 0.06, 'sfx/pop.wav', 0.35]));
  ['band160', 'band100'].forEach((k) => isFinite(firstAt(k)) && sfx.push([firstAt(k) + 0.1, 'sfx/news_tick.mp3', 0.5]));

  const band = (k: string, km: string) => {
    const a = firstAt(k);
    if (!isFinite(a)) return null;
    const draw = smooth(a, a + 1.3, t), v = vis(k);
    if (v <= 0) return null;
    return (
      <g opacity={v}>
        <clipPath id={`clip${km}`}><rect x={-2000} y={-2000} width={2000 + 1080 * draw + 400 * draw} height={6000} /></clipPath>
        <path d={p.layers.bands[km]} fill="url(#hatch)" stroke={p.accent} strokeWidth={sw(3)} clipPath={`url(#clip${km})`} filter="url(#glow)" />
      </g>
    );
  };

  const hs = bi === 0 ? t - 0.15 : since;   // the hook headline is up right away
  const head = cur.head, hk = clamp01((hs - 0.05) / 0.3), swipe = smooth(0.25, 0.6, hs);
  const card = cur.card;
  const ck = card ? outBack(clamp01((since - 0.45) / 0.3), 1.6) : 0;
  const bigNum = card ? parseInt(card.big, 10) : 0;
  const counted = card ? Math.round(bigNum * outCubic(clamp01((since - 0.5) / 0.7))) : 0;

  return (
    <AbsoluteFill style={{background: '#2E6283', overflow: 'hidden'}}>
      {p.voice && <Audio src={staticFile(p.voice)} startFrom={0} volume={1} />}
      {p.music && <Audio src={staticFile(p.music)} volume={p.voice ? 0.1 : 0.26} loop />}
      {sfx.map(([at, f, v], i) => <Sequence key={i} from={Math.max(0, Math.round(at * fps))} durationInFrames={30}><Audio src={staticFile(f)} volume={v} /></Sequence>)}

      {/* the map, under a camera with an optional 3D tilt */}
      <AbsoluteFill style={{opacity: fade, perspective: 1800, perspectiveOrigin: '50% 40%'}}>
        <AbsoluteFill style={{transform: `rotateX(${tilt}deg)`, transformOrigin: '50% 60%'}}>
          <svg width={1080} height={1920} viewBox="0 0 1080 1920">
            <defs>
              <filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
                <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.28  0 0 0 0.10 0" /><feComposite in2="SourceGraphic" operator="in" /></filter>
              <filter id="relief"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="8" />
                <feDiffuseLighting lightingColor="#fff" surfaceScale="2.2"><feDistantLight azimuth="315" elevation="45" /></feDiffuseLighting>
                <feComposite in2="SourceGraphic" operator="in" /></filter>
              <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="9" /></filter>
              <filter id="glow"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              <pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="16" height="16" fill={p.accent} fillOpacity={0.28} /><rect width="6" height="16" fill={p.accent} fillOpacity={0.85} /></pattern>
            </defs>
            <g transform={`translate(${CX},${CY}) scale(${z}) translate(${-cx},${-cy})`}>
              {p.layers.sea.map((s, i) => <path key={i} d={s.d} fill={s.fill} />)}
              <g opacity={intro}>
                {p.layers.near.map((d, i) => <g key={i}><path d={d} fill="#000" opacity={0.5} transform="translate(5,12)" filter="url(#shadow)" />
                  <path d={d} fill="#2E3A44" transform="translate(0,6)" /><path d={d} fill="#4A5A66" stroke="#2E3A44" strokeWidth={sw(1)} /></g>)}
              </g>
              <g opacity={intro} transform={`translate(0,${(1 - intro) * 30})`}>
                <path d={p.layers.land} fill="#000" opacity={0.55} transform="translate(6,14)" filter="url(#shadow)" />
                <path d={p.layers.land} fill="#A99A7E" transform="translate(0,7)" />
                <path d={p.layers.land} fill={LAND} stroke="#5f5340" strokeWidth={sw(1.4)} />
                <path d={p.layers.land} fill="#000" opacity={0.1} filter="url(#relief)" style={{mixBlendMode: 'multiply'}} />
                <path d={p.layers.land} fill="#fff" filter="url(#paper)" />
                {on('pulse') && <path d={p.layers.land} fill="none" stroke={p.accent} strokeWidth={sw(4 + 3 * Math.sin(since * 6))} opacity={0.9 * smooth(0, 0.3, since)} filter="url(#glow)" />}
              </g>
              <path d={p.layers.lakes} fill="#3C7395" opacity={intro} />
              {band('band160', '160')}
              {band('band100', '100')}
              {p.layers.border.map((d, i) => <path key={i} d={d} fill="none" stroke="#fff" strokeWidth={sw(3)} strokeDasharray={`${sw(10)} ${sw(7)}`} opacity={smooth(0.6, 1.2, t)} />)}
              {p.cities.map((c, i) => {
                const k = clamp01((t - citiesAt - i * 0.05) / 0.25);
                if (k <= 0) return null;
                return <circle key={c.name + i} cx={c.at[0]} cy={c.at[1]} r={sw(c.r) * outBack(k, 2.4)} fill="#FF4F5E" stroke="#fff" strokeWidth={sw(3)} opacity={0.95} />;
              })}
              {p.cities.map((c, i) => c.label && t > citiesAt + 0.6 && (
                <text key={'l' + i} x={c.at[0] + sw(c.label[0])} y={c.at[1] + sw(c.label[1] + 24)} fontFamily={SANS} fontWeight={800} fontSize={sw(24)}
                  letterSpacing={sw(3)} fill="#fff" stroke="rgba(0,0,0,0.65)" strokeWidth={sw(5)} paintOrder="stroke" opacity={smooth(citiesAt + 0.6, citiesAt + 1, t)}>
                  {c.name.toUpperCase()}</text>
              ))}
              {cur.tag && (
                <g transform={`translate(${cur.tag.at[0]},${cur.tag.at[1]}) scale(${1 / z})`} opacity={smooth(0.6, 1.0, since)}>
                  <rect x={-8} y={-30} width={cur.tag.text.length * 17 + 46} height={42} fill="rgba(11,28,43,0.82)" />
                  <text x={10} y={0} fontFamily={SANS} fontWeight={800} fontSize={26} letterSpacing={3} fill={p.accent}>▼ {cur.tag.text}</text>
                </g>
              )}
            </g>
          </svg>
        </AbsoluteFill>
        {/* scale bar */}
        <div style={{position: 'absolute', left: 90, top: 1410, opacity: intro}}>
          <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 22, letterSpacing: 2, color: '#fff', marginBottom: 6}}>{p.scale.km} KM</div>
          <div style={{width: p.scale.px * z, height: 10, background: `linear-gradient(90deg, ${INK} 50%, #fff 50%)`, border: '2px solid #fff'}} />
        </div>
        {/* vignette + grain */}
        <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(0,0,0,0.5) 100%)'}} />
      </AbsoluteFill>

      {/* headline on a dark fade */}
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 560, background: 'linear-gradient(#0B1C2B 68%, rgba(11,28,43,0))', opacity: fade}} />
      <Masthead P={PAL.night} label="" top={160} />
      <div style={{position: 'absolute', left: 60, right: 60, top: 248, height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: ANTON, fontSize: (head.join('').length > 34 ? 84 : 96), lineHeight: 1.08, color: '#fff', opacity: hk * fade, transform: `translateY(${(1 - outCubic(hk)) * 24}px)`}}>
        <span>{head[0]}<span style={{display: 'inline-block', padding: '0 14px', margin: '0 -2px', color: INK, transform: 'rotate(-1.5deg)',
          background: `linear-gradient(transparent 12%, ${p.accent} 12%, ${p.accent} 88%, transparent 88%) no-repeat left / ${swipe * 100}% 100%`}}>{head[1]}</span>{head[2]}</span>
      </div>

      {/* stat card */}
      {card && ck > 0 && (
        <div style={{position: 'absolute', left: 70, right: 70, top: 1460, background: '#fff', borderRadius: 6, padding: '26px 34px', opacity: fade,
          boxShadow: '0 18px 40px rgba(0,0,0,0.5)', transform: `scale(${ck})`, transformOrigin: '50% 100%'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 28}}>
            <div style={{fontFamily: ANTON, fontSize: 150, lineHeight: 0.9, color: INK}}>{counted}%</div>
            <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 38, lineHeight: 1.25, color: '#222'}}>{card.line}</div>
          </div>
          {card.myth && <div style={{marginTop: 12, display: 'flex', alignItems: 'center', gap: 18, fontFamily: SANS, fontWeight: 800, fontSize: 28, color: '#666'}}>
            <span style={{position: 'relative', fontFamily: ANTON, fontSize: 56, color: '#E0263C'}}>{card.myth}
              <span style={{position: 'absolute', left: -6, top: '52%', height: 7, background: '#E0263C', width: `${smooth(1.2, 1.5, since) * 112}%`}} /></span>
            the number everyone repeats · Statistics Canada, 2021</div>}
        </div>
      )}

      {/* caption */}
      <div style={{position: 'absolute', left: 80, right: 80, top: card ? 1745 : 1640, textAlign: 'center', opacity: smooth(0, 0.2, since) * fade}}>
        <span style={{background: cur.ask ? p.accent : '#fff', color: INK, fontFamily: SANS, fontWeight: 800, fontSize: card ? 38 : 44, lineHeight: 1.5, padding: '6px 16px',
          boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone'}}>{cur.say}</span>
      </div>
      <LogoOutro t={t} at={p.outroAt} />
    </AbsoluteFill>
  );
};
