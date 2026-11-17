// ---------- GTA Math: a voiced comedy countdown (#3, #2, #1) over stick-figure scenes, in the sunset look.
// 2D only (no WebGL), so it renders fast on GitHub. Timings come from the voice (sections + word captions). ----------
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, Em, Follow, FollowCard, Grain, Head, MONO, Masthead, PAL, PalName, ProgressRule, SANS, clamp01, outBack, smooth, useEdFonts} from './kit';

type Scene = {type: 'receipt' | 'stats' | 'versus' | 'big' | 'cast'; cast?: 'gamer' | 'duo'; her?: string; title?: string;
  rows?: (string | number)[][]; total?: string[]; left?: {label: string; value: string}; right?: {label: string; value: string};
  value?: string; label?: string; tags?: string[]};
type Sec = {name: string; start: number; end: number; text?: string};
type Word = {w: string; start: number; end: number};
export type EdMathProps = {pal: PalName; duration: number; label: string; badge: string; hookA: string; hookB: string;
  reasons: {punch: string; scene: Scene}[]; closerBig: string; closerSmall: string; sections: Sec[];
  captions: {words: Word[]; start: number; end: number}[]; audio?: string | null; music?: string | null; follow?: Follow};

const GOLD = '#FFE07A', PINK = '#FF4FA0', CREAM = '#FFF3EA', INK = '#2A1046';
const ser = (s: number): React.CSSProperties => ({fontFamily: 'Instrument Serif', fontSize: s, lineHeight: 1, letterSpacing: '-0.02em'});
const pill = (bg: string, fg: string, s = 24): React.CSSProperties => ({display: 'inline-block', fontFamily: MONO, fontWeight: 700, fontSize: s, letterSpacing: '0.1em',
  padding: '8px 16px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap'});

// ----- stick figures -----
const Gamer: React.FC<{x: number; y: number; s?: number; bob?: number}> = ({x, y, s = 1, bob = 0}) => (
  <svg width={140 * s} height={260 * s} viewBox="0 0 140 260" style={{position: 'absolute', left: x - 70 * s, top: y - 260 * s + bob}}>
    <circle cx={70} cy={38} r={32} fill={CREAM} />
    <rect x={56} y={74} width={28} height={92} rx={14} fill={CREAM} />
    <rect x={56} y={160} width={11} height={92} rx={5.5} fill={CREAM} /><rect x={73} y={160} width={11} height={92} rx={5.5} fill={CREAM} />
    {/* controller held in front */}
    <rect x={30} y={104} width={80} height={38} rx={19} fill={CREAM} stroke={INK} strokeWidth={4} />
    <rect x={46} y={119} width={14} height={4} fill={INK} /><rect x={51} y={114} width={4} height={14} fill={INK} />
    <circle cx={88} cy={117} r={3.5} fill={INK} /><circle cx={96} cy={124} r={3.5} fill={INK} />
  </svg>
);
const Her: React.FC<{x: number; y: number; s?: number; mad?: number}> = ({x, y, s = 1, mad = 0}) => (
  <svg width={140 * s} height={260 * s} viewBox="0 0 140 260" style={{position: 'absolute', left: x - 70 * s, top: y - 260 * s}} overflow="visible">
    <path d="M44 30 Q40 64 30 86 Q50 80 58 64 Z" fill={PINK} />
    <circle cx={70} cy={38} r={32} fill={PINK} />
    <path d="M52 74 L88 74 L104 170 L36 170 Z" fill={PINK} />
    <rect x={56} y={166} width={11} height={86} rx={5.5} fill={PINK} /><rect x={73} y={166} width={11} height={86} rx={5.5} fill={PINK} />
    {mad > 0 && [[-30, -10], [0, -30], [30, -10]].map(([dx, dy], i) => (
      <path key={i} d={`M${70 + dx} ${dy - 6 * mad} l${dx / 6} ${-14 * mad}`} stroke="#FF3B3B" strokeWidth={6} strokeLinecap="round" />
    ))}
  </svg>
);
const Spot: React.FC<{x: number; y: number; w: number}> = ({x, y, w}) => (
  <div style={{position: 'absolute', left: x - w / 2, top: y - 24, width: w, height: 48, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,243,234,0.28), transparent)'}} />
);
const Cast: React.FC<{sc: Scene; k: number; t: number; big?: boolean}> = ({sc, k, t, big}) => {
  const y = big ? 1190 : 1215, s = big ? 1.35 : 0.82, duo = sc.cast === 'duo';
  const gx = duo ? 620 : 540, hx = 440;
  return (
    <div style={{opacity: Math.min(1, k * 2)}}>
      <Spot x={540} y={y} w={duo ? 620 : 380} />
      <Gamer x={gx} y={y} s={s} bob={Math.sin(t * 7) * 3} />
      {duo && <Her x={hx} y={y} s={s} mad={smooth(0.2, 0.6, k)} />}
      {duo && sc.her && <div style={{position: 'absolute', left: hx - 200, width: 400, top: y + 10, textAlign: 'center'}}><span style={pill(PINK, '#fff', 20)}>{sc.her.toUpperCase()}</span></div>}
      <div style={{position: 'absolute', left: gx - 200, width: 400, top: y + 10, textAlign: 'center'}}><span style={pill(CREAM, INK, 20)}>YOU</span></div>
    </div>
  );
};

// ----- scene cards -----
const Receipt: React.FC<{sc: Scene; k: number}> = ({sc, k}) => {
  const rows = sc.rows ?? [];
  return (
    <div style={{position: 'absolute', left: 540 - 300, top: 540, width: 600, transform: `rotate(-2deg) translateY(${(1 - k) * 60}px)`, opacity: k}}>
      <div style={{background: '#FFFEFA', color: '#1a1917', padding: '28px 34px 44px', boxShadow: '0 30px 60px rgba(20,0,40,0.45)',
        clipPath: 'polygon(0 0,100% 0,100% 94%,95% 100%,90% 94%,85% 100%,80% 94%,75% 100%,70% 94%,65% 100%,60% 94%,55% 100%,50% 94%,45% 100%,40% 94%,35% 100%,30% 94%,25% 100%,20% 94%,15% 100%,10% 94%,5% 100%,0 94%)'}}>
        <div style={{textAlign: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: '0.2em'}}>{(sc.title ?? 'RECEIPT').toUpperCase()}</div>
        <div style={{borderTop: '3px dashed #1a1917', margin: '16px 0 10px'}} />
        {rows.map((r, i) => (
          <div key={i} style={{display: 'flex', fontFamily: MONO, fontSize: 28, marginTop: 12, opacity: smooth(0.15 + i * 0.12, 0.3 + i * 0.12, k)}}>
            <span style={{flex: 1}}>{String(r[0]).toUpperCase()}</span><span style={{fontWeight: 700}}>{String(r[1] ?? '').toUpperCase()}</span>
          </div>
        ))}
        {sc.total && (
          <>
            <div style={{borderTop: '3px dashed #1a1917', margin: '16px 0 10px'}} />
            <div style={{display: 'flex', fontFamily: MONO, fontWeight: 700, fontSize: 34, color: PINK}}><span style={{flex: 1}}>{String(sc.total[0]).toUpperCase()}</span><span>{String(sc.total[1]).toUpperCase()}</span></div>
          </>
        )}
      </div>
    </div>
  );
};
const Stats: React.FC<{sc: Scene; k: number}> = ({sc, k}) => (
  <div style={{position: 'absolute', left: 540 - 330, top: 560, width: 660, padding: '28px 34px', borderRadius: 24, background: 'rgba(27,11,51,0.82)',
    border: '2px solid rgba(255,243,234,0.25)', boxShadow: '0 30px 60px rgba(20,0,40,0.45)', opacity: k, transform: `scale(${0.9 + 0.1 * k})`}}>
    <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontWeight: 700, fontSize: 22, letterSpacing: '0.2em', color: 'rgba(255,243,234,0.7)'}}>
      <span>{(sc.title ?? 'PLAYER STATS').toUpperCase()}</span><span style={{color: GOLD}}>GTA 6</span>
    </div>
    {(sc.rows ?? []).map((r, i) => {
      const fill = Math.max(0.04, Math.min(1, Number(r[2] ?? 0.5))) * smooth(0.2 + i * 0.15, 0.55 + i * 0.15, k);
      return (
        <div key={i} style={{marginTop: 26}}>
          <div style={{display: 'flex', fontFamily: SANS, fontWeight: 800, fontSize: 28, color: i === 1 ? PINK : CREAM}}><span style={{flex: 1}}>{String(r[0]).toUpperCase()}</span><span>{String(r[1] ?? '')}</span></div>
          <div style={{height: 16, borderRadius: 8, background: 'rgba(255,243,234,0.15)', marginTop: 10}}><div style={{height: '100%', width: `${fill * 100}%`, borderRadius: 8, background: i === 1 ? PINK : CREAM}} /></div>
        </div>
      );
    })}
  </div>
);
const Versus: React.FC<{sc: Scene; k: number}> = ({sc, k}) => {
  const side = (s: {label: string; value: string} | undefined, x: number, hot: boolean, d: number) => (
    <div style={{position: 'absolute', left: x, top: 640, width: 400, height: 380, borderRadius: 22, padding: 30, boxSizing: 'border-box', background: hot ? `linear-gradient(160deg, ${PINK}, #FF8A3D)` : CREAM,
      color: hot ? '#fff' : INK, boxShadow: '0 30px 60px rgba(20,0,40,0.45)', opacity: smooth(d, d + 0.25, k), transform: `rotate(${hot ? 3 : -3}deg) translateY(${(1 - smooth(d, d + 0.3, k)) * 50}px)`,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
      <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: '0.1em', opacity: 0.8}}>{(s?.label ?? '').toUpperCase()}</div>
      <div style={{...ser(String(s?.value ?? '').length > 7 ? 74 : 110)}}>{s?.value}</div>
    </div>
  );
  return (
    <>
      {side(sc.left, 90, false, 0)}
      {side(sc.right, 590, true, 0.25)}
      <div style={{position: 'absolute', left: 540 - 56, top: 776, width: 112, height: 112, borderRadius: '50%', background: INK, color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: SANS, fontWeight: 800, fontSize: 44, boxShadow: '0 10px 30px rgba(0,0,0,0.4)', transform: `scale(${outBack(clamp01((k - 0.4) / 0.4), 2)})`}}>VS</div>
    </>
  );
};
const Big: React.FC<{sc: Scene; k: number}> = ({sc, k}) => (
  <div style={{position: 'absolute', left: 0, right: 0, top: 580, textAlign: 'center'}}>
    <div style={{...ser(String(sc.value ?? '').length > 8 ? 150 : 240), color: GOLD, transform: `scale(${2 - outBack(k, 1.4)})`, opacity: Math.min(1, k * 3), textShadow: '0 10px 40px rgba(255,224,122,0.4)'}}>{sc.value}</div>
    {sc.label && <div style={{marginTop: 18, opacity: smooth(0.4, 0.7, k)}}><span style={pill(CREAM, INK, 24)}>{sc.label.toUpperCase()}</span></div>}
  </div>
);
const Tags: React.FC<{sc: Scene; k: number}> = ({sc, k}) => (
  <>
    {(sc.tags ?? []).slice(0, 3).map((tg, i) => {
      const pos = [[320, 600], [740, 660], [500, 760]][i];
      return <div key={i} style={{position: 'absolute', left: pos[0] - 200, width: 400, top: pos[1], textAlign: 'center', opacity: smooth(0.15 + i * 0.2, 0.3 + i * 0.2, k),
        transform: `scale(${outBack(clamp01((k - 0.15 - i * 0.2) / 0.3), 2)}) rotate(${[-4, 3, -2][i]}deg)`}}><span style={pill(i === 1 ? PINK : CREAM, i === 1 ? '#fff' : INK, 30)}>{tg.toUpperCase()}</span></div>;
    })}
  </>
);

export const EdMath: React.FC<EdMathProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const P = PAL[p.pal];
  const sec = (n: string) => p.sections.find((s) => s.name === n) ?? {name: n, start: 0, end: 0};
  const order = ['beat1', 'beat2', 'reveal'];
  const cur = p.sections.find((s) => t >= s.start && t < s.end) ?? p.sections[p.sections.length - 1];
  const ri = order.indexOf(cur.name);
  const hook = cur.name === 'hook', tension = cur.name === 'tension', twist = cur.name === 'twist' || t >= (p.sections[p.sections.length - 1]?.end ?? 0);
  const twistAt = sec('twist').start;

  // captions: one group at a time, the spoken word marked
  const g = p.captions.find((c) => t >= c.start - 0.03 && t <= c.end + 0.12);

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.5} />
      <AbsoluteFill style={{background: 'radial-gradient(70% 45% at 50% 48%, rgba(20,6,40,0.55), rgba(20,6,40,0) 75%)'}} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.12} loop />}
      {p.audio && <Audio src={staticFile(p.audio)} />}
      {['beat1', 'beat2', 'reveal', 'twist'].map((n) => <Sequence key={n} from={Math.max(0, Math.round(sec(n).start * fps))} durationInFrames={14}><Audio src={staticFile(n === 'reveal' || n === 'twist' ? 'sfx/thud.wav' : 'sfx/pop.wav')} volume={0.8} /></Sequence>)}

      {/* hook: the question, the gamer under the spotlight */}
      {hook && (
        <>
          <Head P={P} top={372} size={P.dItalic ? 100 : 84} style={{opacity: smooth(0, 0.2, t)}}>{p.hookA} <Em P={P}>{p.hookB}</Em></Head>
          <div style={{position: 'absolute', left: 0, right: 0, top: 700, textAlign: 'center', transform: `scale(${outBack(clamp01(t / 0.4), 1.6)})`}}><span style={pill(PINK, '#fff', 34)}>3 REASONS</span></div>
          <Cast sc={{type: 'cast', cast: 'gamer'}} k={1} t={t} big />
        </>
      )}

      {/* reasons #3, #2, #1 */}
      {ri >= 0 && (() => {
        const r = p.reasons[ri], s = sec(order[ri]), a = t - s.start, k = smooth(0, 0.45, a), num = 3 - ri;
        return (
          <>
            <div style={{position: 'absolute', left: 84, top: 352, display: 'flex', alignItems: 'baseline', gap: 26, width: 912}}>
              <div style={{...ser(200), color: num === 1 ? GOLD : PINK, transform: `scale(${1.6 - 0.6 * outBack(clamp01(a / 0.35), 1.4)})`, transformOrigin: 'left bottom'}}>#{num}</div>
              <div style={{...ser(P.dItalic ? 74 : 62), color: CREAM, opacity: smooth(0.15, 0.4, a), flex: 1}}>{r.punch}</div>
            </div>
            {r.scene.type === 'receipt' && <Receipt sc={r.scene} k={k} />}
            {r.scene.type === 'stats' && <Stats sc={r.scene} k={k} />}
            {r.scene.type === 'versus' && <Versus sc={r.scene} k={k} />}
            {r.scene.type === 'big' && <Big sc={r.scene} k={k} />}
            {r.scene.type === 'cast' && <Tags sc={r.scene} k={k} />}
            {(r.scene.type === 'cast' || r.scene.type === 'big' || r.scene.type === 'stats' || r.scene.type === 'receipt') && <Cast sc={r.scene} k={k} t={t} big={r.scene.type === 'cast'} />}
          </>
        );
      })()}

      {/* the bridge: a drumroll beat before #1 */}
      {tension && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 640, textAlign: 'center'}}>
          <div style={{...ser(420), color: GOLD, transform: `scale(${1 + Math.sin(t * 18) * 0.03})`, textShadow: '0 10px 60px rgba(255,224,122,0.5)'}}>#1</div>
          <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: '0.2em', color: CREAM, marginTop: 20}}>DRUMROLL</div>
        </div>
      )}

      {/* the closer */}
      {twist && (() => {
        const a = t - twistAt, k = outBack(clamp01(a / 0.4), 1.6);
        return (
          <div style={{position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center'}}>
            <svg width={300} height={160} viewBox="0 0 300 160" style={{opacity: Math.min(1, a * 4)}}>
              {Array.from({length: 12}, (_, i) => { const an = -Math.PI + (i / 11) * Math.PI; return <line key={i} x1={150 + Math.cos(an) * 70} y1={130 + Math.sin(an) * 70} x2={150 + Math.cos(an) * (100 + 10 * Math.sin(t * 6 + i))} y2={130 + Math.sin(an) * (100 + 10 * Math.sin(t * 6 + i))} stroke={GOLD} strokeWidth={5} strokeLinecap="round" />; })}
            </svg>
            <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 32, letterSpacing: '0.22em', color: 'rgba(255,243,234,0.8)', marginTop: -10}}>{p.closerSmall.toUpperCase()}</div>
            <div style={{...ser(p.closerBig.length > 9 ? 150 : 210), color: CREAM, marginTop: 10, transform: `scale(${0.6 + 0.4 * k})`, padding: '0 40px'}}>{p.closerBig}</div>
          </div>
        );
      })()}

      {g && (
        <div style={{position: 'absolute', top: 1270, left: 70, width: 940, textAlign: 'center'}}>
          <div style={{display: 'inline-block', padding: '10px 18px', borderRadius: 18, background: 'rgba(27,11,51,0.62)', ...ser(P.dItalic ? 58 : 50), lineHeight: 1.18, color: CREAM}}>
            {g.words.map((w, i) => {
              const on = t >= w.start && t <= w.end + 0.06;
              return <span key={i} style={{display: 'inline-block', margin: '0 4px', padding: '0 4px', fontStyle: on ? 'italic' : 'normal',
                background: on ? `linear-gradient(176deg, transparent 18%, ${PINK}88 20%, ${PINK}88 82%, transparent 84%)` : 'none'}}>{w.w}</span>;
            })}
          </div>
        </div>
      )}

      <Masthead P={P} label={p.label} />
      <div style={{position: 'absolute', top: 236, right: 84}}><span style={pill(P.accent, '#fff', 20)}>{p.badge}</span></div>
      {p.follow && <FollowCard P={P} t={t} f={p.follow} />}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
