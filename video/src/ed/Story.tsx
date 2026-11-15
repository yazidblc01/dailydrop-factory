// ---------- The data reel (story format), editorial: a line race on paper, the leader hidden as ??? until the reveal.
// Plays the same props as StoryReel (voice, captions, scenes), so the engine needs no change. ----------
import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {Backdrop, Em, Grain, Head, MONO, Masthead, PAL, PalName, ProgressRule, SANS, outBack, smooth, useEdFonts} from './kit';
import {Item, short} from '../RankingReveal';
import {StoryProps} from '../StoryReel';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const INKS = ['#151412', '#2C7A5B', '#1F5FD1', '#B8862B', '#7A6F64', '#6B4FA0', '#1C8C8C', '#9C4A2E'];
const src = (p: string) => (p.startsWith('http') ? p : staticFile(p));
const seriesValue = (pts: number[][], tq: number) => {
  if (tq <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (tq <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      const k = (tq - t0) / (t1 - t0 || 1);
      return v0 > 0 && v1 > 0 ? Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * k) : v0 + (v1 - v0) * k;
    }
  }
  return pts[pts.length - 1][1];
};
const niceSteps = (lo: number, hi: number) => {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= lo * 1.05 && v <= hi / 1.05) out.push(v); }
  return out.length > 4 ? out.filter((_, i) => i % 2 === 0) : out;
};

export const EdStory: React.FC<StoryProps & {pal?: PalName; label?: string}> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  useEdFonts();
  const P = PAL[p.pal ?? 'paper'];
  const sc = p.scenes.find((s) => s.type === 'linerace') ?? {start: 0, end: p.duration, keys: undefined, callouts: [], mystery: undefined, mysteryMode: 'top' as const, revealAt: undefined};
  const qs = p.scenes.filter((s) => s.type === 'question');

  // the race: same clock as StoryReel, so callouts land when the voice says them
  const items = p.items.filter((i) => i.series && i.series.length > 1);
  const t0 = Math.min(...items.map((i) => i.series![0][0]));
  const t1 = Math.max(...items.map((i) => i.series![i.series!.length - 1][0]));
  const keys = sc.keys && sc.keys.length > 1 ? sc.keys : [[sc.start + 0.3, 0], [sc.end - 0.4, 1]];
  const u = interpolate(t, keys.map((k) => k[0]), keys.map((k) => k[1]), {...clamp, easing: Easing.inOut(Easing.sin)});
  const now = t0 + (t1 - t0) * Math.max(u, 0.002);
  const cur = items.map((it) => seriesValue(it.series!, now));
  const rv = sc.revealAt ?? 1e9;
  const revealed = t >= rv + 0.25;
  const slam = outBack((t - rv - 0.3) / 0.35, 2.2);

  // the question: on top for the hook, back at the end for the loop
  const qK = Math.max(0, ...qs.map((q) => (q.start > 0 ? smooth(q.start, q.start + 0.35, t) : 1 - smooth(q.end - 0.15, q.end + 0.25, t))));

  // chart box (between the headline zone and the captions), labels in a column on the right
  const X0 = 170, X1 = 640, Y1 = 600, Y0 = 1180, LABEL_TOP = 570, LABEL_BOTTOM = 1205;
  const drawn = items.map((it) => {
    const s = it.series!.filter((q) => q[0] <= now);
    return s.map((q, k) => {
      const a = s[Math.max(0, k - 1)][1], b = q[1], c = s[Math.min(s.length - 1, k + 1)][1];
      return [q[0], k === 0 ? b : Math.exp((Math.log(a) + Math.log(b) + Math.log(c)) / 3)];
    });
  });
  const seen = drawn.flatMap((d) => d.map((q) => q[1])).concat(cur);
  const lo = Math.log(Math.min(...seen) * 0.9), hi = Math.log(Math.max(...seen) * 1.08);
  const x = (tt: number) => X0 + ((tt - t0) / (now - t0 || 1e-6)) * (X1 - X0);
  const y = (v: number) => Y0 - ((Math.log(v) - lo) / (hi - lo || 1)) * (Y0 - Y1);

  const active = !revealed ? (sc.callouts || []).find((c) => t >= c.at && t < c.at + 1.8) : undefined;
  const ck = active ? t - active.at : 9;
  const isMystery = (it: Item) => it.short === sc.mystery;
  const hidden = (it: Item) => isMystery(it) && !revealed;
  const nameOf = (it: Item) => (hidden(it) ? '???' : it.short);
  const color = (i: number) => (isMystery(items[i]) ? P.accent : INKS[i % INKS.length]);

  const LABEL_H = Math.min(96, (LABEL_BOTTOM - LABEL_TOP) / items.length);
  const order = items.map((_, i) => i).sort((a, b) => cur[b] - cur[a]);
  const ly: number[] = [];
  order.forEach((i, k) => { const want = y(cur[i]) - LABEL_H / 2; ly[i] = k === 0 ? Math.max(want, LABEL_TOP) : Math.max(want, ly[order[k - 1]] + LABEL_H); });
  for (let k = order.length - 1; k >= 0; k--) {
    const limit = k === order.length - 1 ? LABEL_BOTTOM - LABEL_H : ly[order[k + 1]] - LABEL_H;
    ly[order[k]] = Math.min(ly[order[k]], limit);
  }
  const wi = items.findIndex(isMystery);
  const same = items.every((i) => Math.abs(i.start - items[0].start) < 1e-6);
  const mult = wi >= 0 && items[wi].start > 0 ? Math.round(items[wi].end / items[wi].start) : 0;
  const growth = wi >= 0 ? items[wi].end / items[wi].start : 1;
  const resultText = sc.mysteryMode === 'growth'
    ? (growth >= 2 ? `×${growth.toFixed(1)}` : `+${Math.round((growth - 1) * 100)}%`)
    : same ? `×${mult.toLocaleString('en-US')}` : wi >= 0 ? short(items[wi].end, p.unit) : '';
  const ser = (s: number): React.CSSProperties => ({fontFamily: P.display, fontWeight: P.dWeight, fontSize: s, letterSpacing: P.dTrack + 'em', lineHeight: 1});

  // captions: one line group at a time, the spoken word marked
  const showCaps = qK < 0.05;
  const g = showCaps ? p.captions.find((c) => t >= c.start - 0.03 && t <= c.end + 0.12) : undefined;
  const hookWords = p.hook.split(' ');
  const emFrom = Math.max(1, hookWords.length - 3);
  const sfx = p.sfx || {};

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.5} />
      {/* year, behind the chart */}
      <div style={{position: 'absolute', left: X0 + 24, top: Y1 - 10, ...ser(190), color: P.dark ? '#2a5a4a' : '#d3cab8', fontVariantNumeric: 'tabular-nums', opacity: 1 - qK * 0.7}}>{Math.floor(now)}</div>

      <svg width={1080} height={1920} style={{position: 'absolute', top: 0, left: 0}}>
        {niceSteps(Math.exp(lo), Math.exp(hi)).map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1 + 20} y1={y(v)} y2={y(v)} stroke={P.ink} strokeOpacity={0.16} strokeWidth={2} />
            <text x={X0 - 14} y={y(v) + 8} textAnchor="end" fill={P.mute} fontFamily={MONO} fontWeight={500} fontSize={22}>{short(v, p.unit)}</text>
          </g>
        ))}
        <line x1={X0} x2={X0} y1={Y1 - 20} y2={Y0 + 4} stroke={P.ink} strokeWidth={4} strokeLinecap="round" />
        {items.map((it, i) => {
          const pts = drawn[i].map((q) => `${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`);
          pts.push(`${x(now).toFixed(1)},${y(cur[i]).toFixed(1)}`);
          const hl = active && active.item === nameOf(it);
          const dim = active ? (hl ? 1 : 0.28) : isMystery(it) ? 1 : 0.75;
          return (
            <g key={it.short} opacity={dim}>
              {/* a soft printed shadow under each line */}
              <polyline points={pts.join(' ')} transform="translate(0,6)" fill="none" stroke="#000" strokeOpacity={0.07} strokeWidth={isMystery(it) ? 14 : 9} strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={pts.join(' ')} fill="none" stroke={color(i)} strokeWidth={isMystery(it) || hl ? 10 : 6} strokeLinejoin="round" strokeLinecap="round" />
              <line x1={x(now)} y1={y(cur[i])} x2={X1 + 46} y2={ly[i] + LABEL_H / 2} stroke={color(i)} strokeWidth={2} strokeOpacity={0.6} />
              <circle cx={x(now)} cy={y(cur[i])} r={isMystery(it) ? 12 : 8} fill={color(i)} stroke={P.bg} strokeWidth={3} />
            </g>
          );
        })}
      </svg>

      {/* labels: name and value, the mystery as a red ??? block */}
      {items.map((it, i) => {
        const hl = active && active.item === nameOf(it);
        const box = Math.min(60, LABEL_H - 22);
        const showMystery = hidden(it) || (isMystery(it) && t < rv + 0.25);
        const flip = isMystery(it) ? interpolate(t, [rv, rv + 0.25, rv + 0.5], [0, 90, 0], clamp) : 0;
        return (
          <div key={it.short} style={{position: 'absolute', left: X1 + 46, top: ly[i], height: LABEL_H, display: 'flex', alignItems: 'center', gap: 12,
            transform: `scale(${hl ? 1.08 : isMystery(it) && revealed ? 1 + 0.08 * Math.min(1, slam) : 1})`, transformOrigin: 'left center'}}>
            <div style={{transform: flip ? `perspective(600px) rotateY(${flip}deg)` : undefined}}>
              {showMystery ? (
                <div style={{width: box, height: box, borderRadius: 8, background: P.accent, color: P.onAccent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...ser(box * 0.8), fontStyle: 'italic', boxShadow: '0 6px 12px rgba(0,0,0,0.15)'}}>?</div>
              ) : it.image ? (
                <Img src={src(it.image)} style={{width: box, height: box, borderRadius: 8, objectFit: 'cover', background: P.card, boxShadow: `0 0 0 3px ${color(i)}, 0 6px 12px rgba(0,0,0,0.15)`}} />
              ) : (
                <div style={{width: 10, height: box, borderRadius: 5, background: color(i)}} />
              )}
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
              <div style={{fontFamily: SANS, fontWeight: 800, fontSize: 25, letterSpacing: '-0.02em', color: isMystery(it) ? P.accent : P.ink, whiteSpace: 'nowrap', lineHeight: 1}}>{nameOf(it)}</div>
              <div style={{fontFamily: MONO, fontWeight: isMystery(it) ? 700 : 500, fontSize: 24, color: isMystery(it) ? P.accent : P.mute, fontVariantNumeric: 'tabular-nums', lineHeight: 1}}>{short(cur[i], p.unit)}</div>
            </div>
          </div>
        );
      })}


      {/* headline zone: the question, then the callouts, then the result */}
      {qK > 0.01 && (
        <>
          <AbsoluteFill style={{background: `linear-gradient(180deg, ${P.bg}00 0%, ${P.bg}F0 18%, ${P.bg}E8 44%, ${P.bg}00 70%)`, opacity: qK}} />
          <Head P={P} top={372} size={P.dItalic ? (p.hook.length > 52 ? 92 : 104) : 84} style={{opacity: qK}}>
            {hookWords.slice(0, emFrom).join(' ')} <Em P={P}>{hookWords.slice(emFrom).join(' ')}</Em>
          </Head>
        </>
      )}
      <Masthead P={P} label={p.label ?? `${p.startLabel} → ${p.endLabel}`.toUpperCase()} />
      {active && qK < 0.05 && (
        // the race moment as a small printed label (the captions carry the words, so it is never read twice)
        <div style={{position: 'absolute', top: 400, left: 84, opacity: smooth(0, 0.2, ck) * (1 - smooth(1.5, 1.8, ck)), transform: `translateY(${(1 - smooth(0, 0.3, ck)) * 10}px)`,
          background: P.accent, color: P.onAccent, fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: '0.08em', padding: '10px 18px', borderRadius: 6,
          boxShadow: '0 8px 16px rgba(0,0,0,0.12)'}}>{active.text.replace(/^(\d{4}):\s*/, '$1 · ').toUpperCase()}</div>
      )}
      {revealed && qK < 0.95 && wi >= 0 && (
        <div style={{position: 'absolute', top: 360, left: 84, width: 912, opacity: Math.min(1, slam * 2) * (1 - qK)}}>
          <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: '0.14em', color: P.mute}}>{items[wi].short.toUpperCase()} · {p.endLabel.toUpperCase()}</div>
          <div style={{...ser(P.dItalic ? 170 : 140), color: P.accent, transform: `scale(${2 - Math.min(1, slam)})`, transformOrigin: 'left center', marginTop: 4}}>{resultText}</div>
        </div>
      )}

      {/* captions, marker style */}
      {g && (
        <div style={{position: 'absolute', top: 1250, left: 84, width: 912, textAlign: 'center', ...ser(P.dItalic ? 60 : 50), lineHeight: 1.15, color: P.ink}}>
          {g.words.map((w, i) => {
            const on = t >= w.start && t <= w.end + 0.06;
            return (
              <span key={i} style={{display: 'inline-block', margin: '0 3px', padding: '0 5px', fontStyle: on && P.dItalic ? 'italic' : 'normal',
                background: on ? `linear-gradient(176deg, transparent 18%, ${P.accent}55 20%, ${P.accent}55 82%, transparent 84%)` : 'none',
                color: /\d/.test(w.w) ? P.accent : P.ink}}>{w.w}</span>
            );
          })}
        </div>
      )}

      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.13} loop />}
      {sc.callouts?.map((c, i) => <Sequence key={`c${i}`} from={Math.round(c.at * fps)} durationInFrames={14}><Audio src={staticFile('sfx/pop.wav')} volume={0.7} /></Sequence>)}
      {sc.revealAt && <Sequence from={Math.round((rv + 0.3) * fps)} durationInFrames={24}><Audio src={staticFile('sfx/thud.wav')} volume={0.9} /></Sequence>}
      {sfx.impact && sc.revealAt && <Sequence from={Math.round((rv + 0.33) * fps)} durationInFrames={fps * 2}><Audio src={staticFile(sfx.impact)} volume={0.5} /></Sequence>}
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
    </AbsoluteFill>
  );
};
