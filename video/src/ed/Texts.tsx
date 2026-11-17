// ---------- Texts from the future, editorial 3D: a phone standing in a paper studio. When the number lands,
// the phone lies back and the number rises from the floor as real 3D type, next to the tiny amount it started as. ----------
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Backdrop, Cam, Em, MONO, Grain, Head, Masthead, PAL, PalName, ProgressRule, Studio, Tag, Text3D, V3, lerp, outBack, outCubic, outElastic, projector, smooth, textWidth, useEdFonts, FollowCard, Follow} from './kit';
import {ChatProps, PH, Phone3D, SoftShadow, drawPhoneScreen, usePhoneScreen, useSoftShadow, BigNotes} from './phone';

export type EdTextsProps = ChatProps & {pal: PalName; duration: number; label: string; music?: string | null; follow?: Follow; caption?: {kicker: string; lead: string; em: string}; capStyle?: 'center' | 'left'; bigHook?: boolean;
  reveal: {small: string; big: string; smallTag: string; bigTag: string; line: string; em: string}};

export const EdTexts: React.FC<EdTextsProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL[p.pal];
  const {canvas, tex} = usePhoneScreen();
  const shadowTex = useSoftShadow();
  const wall: [string, string, string] = P.name === 'paper' ? ['#E3412A', '#F08A4B', '#F6C56B'] : P.name === 'vice' ? ['#3D1460', '#FF4FA0', '#FFC46B'] : P.name === 'green' ? ['#0E3B2E', '#1F7A5C', '#E8B84A'] : ['#16161c', '#3a3f1a', '#C9FF3B'];
  if (ready) { drawPhoneScreen(canvas, t, p, wall); tex.needsUpdate = true; }

  const big = p.messages.find((m) => m.big)!;
  const a = t - big.at;                         // seconds since the number landed
  const R0 = 0.9, R1 = 4.1;                      // the reveal: starts a beat after the bubble, ends before the next text
  const rev = smooth(R0, R0 + 0.7, a) * (1 - smooth(R1 - 0.6, R1, a));

  // phone: drops in, buzzes with each notification, stands; steps back for the reveal
  const drop = outBack(t / 0.5, 1.4);
  const buzz = p.notifications.reduce((s, n) => s + (t > n.at && t < n.at + 0.35 ? Math.sin((t - n.at) * 70) * 0.012 * (1 - (t - n.at) / 0.35) : 0), 0);
  const open = smooth(p.openAt - 0.1, p.openAt + 0.8, t);
  const phonePos: V3 = [buzz * 3, lerp(0.9, 0, drop) + rev * rev * 9, lerp(0, -3, rev)];
  const phoneRot: V3 = [-0.09, lerp(-0.26, 0.0, open) + Math.sin(t * 0.5) * 0.035 * (1 - rev) + buzz, lerp(0.02, 0, open)];

  // camera: straight on for the chat, then low and to the side for the reveal
  const FOV = 24;
  const mix3 = (u: V3, v: V3, k: number): V3 => [lerp(u[0], v[0], k), lerp(u[1], v[1], k), lerp(u[2], v[2], k)];
  const d0 = lerp(22.7, 21.5, smooth(0, 1.6, t)), y0 = lerp(0.2, 0.05, open) + Math.sin(t * 0.33) * 0.02;
  const chatPos: V3 = [Math.sin(y0) * d0, 2.6, Math.cos(y0) * d0], chatTarget: V3 = [0, 1.29, 0];
  const drift = (a - R0) * 0.05;
  const heroPos: V3 = [-2.6 + drift * 4, 1.6, 9.8], heroTarget: V3 = [0.36, 0.1, -0.2];
  const camPos = mix3(chatPos, heroPos, rev), camTarget = mix3(chatTarget, heroTarget, rev);
  const proj = projector(camPos, camTarget, FOV);

  // the two numbers, as type standing on the floor, receding from the camera
  const bigSize = 0.68, wBig = ready ? textWidth('serif', p.reveal.big, bigSize) : 3.2;
  const rise = outElastic((a - R0 - 0.15) / 1.1) * (1 - smooth(R1 - 0.55, R1 - 0.1, a));
  const riseS = outBack((a - R0 - 0.5) / 0.5) * (1 - smooth(R1 - 0.6, R1 - 0.15, a));
  const ROT = 0;
  const bigPos: V3 = [0.1, 0.01, 0];
  const end = (k: number): V3 => [bigPos[0] + Math.cos(ROT) * wBig * k, 0, bigPos[2] - Math.sin(ROT) * wBig * k];   // k = -0.5 near end, 0.5 far end
  const smallPos: V3 = [-0.55, 0.01, 2.1];
  const tb = proj([end(0.12)[0], bigSize * 0.8, 0.45]), ts = proj([smallPos[0], 0, smallPos[2]]);
  const tagK = smooth(R0 + 0.9, R0 + 1.3, a) * (1 - smooth(R1 - 0.7, R1 - 0.4, a));
  const headK = smooth(R0 + 0.35, R0 + 0.9, a) * (1 - smooth(R1 - 0.7, R1 - 0.35, a));

  return (
    <AbsoluteFill>
      <Backdrop P={P} horizon={0.4} />
      {p.music && <Audio src={staticFile(p.music)} volume={0.24} loop />}
      {p.notifications.map((n, i) => <Sequence key={`n${i}`} from={Math.round(n.at * fps)} durationInFrames={20}><Audio src={staticFile('sfx/received.wav')} volume={1} /></Sequence>)}
      {p.messages.filter((m) => m.at > 0).map((m, i) => (
        <Sequence key={`m${i}`} from={Math.round(m.at * fps)} durationInFrames={20}><Audio src={staticFile(m.from === 'me' ? 'sfx/sent.wav' : 'sfx/received.wav')} volume={1} /></Sequence>
      ))}
      <Sequence from={Math.round((big.at + R0 + 0.2) * fps)} durationInFrames={24}><Audio src={staticFile('sfx/thud.wav')} volume={0.9} /></Sequence>

      <ThreeCanvas width={1080} height={1920} shadows gl={{antialias: true}} camera={{fov: FOV, position: camPos}}>
        <Cam pos={camPos} target={camTarget} fov={FOV} near={2} />
        <Studio ready={ready} P={P} span={7} key3={[2.6, 11, 6]} soft={2.2} lights={6} />
        <Phone3D tex={tex} position={phonePos} rotation={phoneRot} body={P.dark ? '#c9ccd1' : '#2a2b2e'} />
        {(() => {
          const lift = Math.max(0, phonePos[1]), fade = Math.max(0, 1 - lift / 3);
          const o = (P.dark ? 0.55 : 0.32) * fade;
          return o > 0.01 && (
            <>
              <SoftShadow tex={shadowTex} position={[phonePos[0], 0.003, phonePos[2] + 0.02]} size={[2.9 + lift * 0.6, 0.62 + lift * 0.3]} opacity={o * 1.4} rotation={-phoneRot[1]} />
              <SoftShadow tex={shadowTex} position={[phonePos[0] - 0.5, 0.002, phonePos[2] - 0.9]} size={[4.6 + lift, 2.6 + lift]} opacity={o * 0.55} rotation={-phoneRot[1]} />
            </>
          );
        })()}
        {a > R0 - 0.05 && a < R1 && (
          <>
            <Text3D ready={ready} font="serif" text={p.reveal.big} size={bigSize} depth={0.3} color={P.accent} position={bigPos} rotation={[0, ROT, 0]} scale={[1, Math.max(0.001, rise), 1]} rough={0.5} />
            <Text3D ready={ready} font="serif" text={p.reveal.small} size={0.26} depth={0.1} color={P.ink} position={smallPos} rotation={[0, -0.5, 0]} scale={Math.max(0.001, riseS)} rough={0.6} />
          </>
        )}
      </ThreeCanvas>

      <Masthead P={P} label={p.label} />
      {p.caption && (() => {
        // the setup, under the phone. Hidden while the 3D number takes over
        const k0 = smooth(0.35, 0.9, t) * (1 - smooth(big.at + R0 - 0.4, big.at + R0 + 0.1, t)) + smooth(big.at + R1 - 0.2, big.at + R1 + 0.4, t);
        const k = Math.min(1, k0);
        if (k < 0.01) return null;
        const c = p.caption, st = p.capStyle ?? 'marker';
        const ser = {fontFamily: P.display, fontWeight: P.dWeight, letterSpacing: P.dTrack + 'em'} as const;
        const fsz = P.dItalic ? 54 : 46;
        const emSpan = (col: string) => <span style={{color: col, fontStyle: P.dItalic ? 'italic' : 'normal'}}>{c.em}</span>;
        const wrapStyle = {position: 'absolute' as const, top: 1246, left: 84, width: 912, opacity: k};
        if (st === 'card') return (
          // a paper card pinned under the phone, slightly tilted
          <div style={{...wrapStyle, display: 'flex', justifyContent: 'center'}}>
            <div style={{transform: 'rotate(-1.2deg)', background: P.card, color: P.cardInk, borderRadius: 8, padding: '16px 30px 20px', maxWidth: 820,
              boxShadow: '0 18px 40px rgba(0,0,0,0.16), 0 3px 8px rgba(0,0,0,0.1)'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontWeight: 700, fontSize: 19, letterSpacing: '0.12em', color: P.accent}}>
                <span>{c.kicker}</span><span style={{color: P.cardInk, opacity: 0.45}}>NO. 01</span>
              </div>
              <div style={{height: 2, background: P.cardInk, opacity: 0.85, margin: '10px 0 10px'}} />
              <div style={{...ser, fontSize: fsz, lineHeight: 1.02}}>{c.lead} {emSpan(P.accent)}</div>
            </div>
          </div>
        );
        if (st === 'band') return (
          // a solid ink strip across the frame, like a newspaper deck
          <div style={{...wrapStyle, transform: 'none', top: 1240, background: P.ink, padding: '18px 30px 22px', boxSizing: 'border-box', borderRadius: 10}}>
            <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 19, letterSpacing: '0.14em', color: P.accent}}>{c.kicker}</div>
            <div style={{...ser, fontSize: fsz, lineHeight: 1.02, color: P.bg, marginTop: 6}}>{c.lead} {emSpan(P.accent)}</div>
          </div>
        );
        if (st === 'marker') return (
          // highlighter stroke behind the key words
          <div style={{...wrapStyle, textAlign: 'center'}}>
            <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 20, letterSpacing: '0.14em', color: P.mute}}>{c.kicker}</div>
            <div style={{...ser, fontSize: fsz + 4, lineHeight: 1.12, color: P.ink, marginTop: 8}}>
              {c.lead}{' '}
              <span style={{fontStyle: P.dItalic ? 'italic' : 'normal', padding: '0 8px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
                background: `linear-gradient(176deg, transparent 18%, ${P.accent}55 20%, ${P.accent}55 82%, transparent 84%)`}}>{c.em}</span>
            </div>
          </div>
        );
        // ticket: a perforated stub with the date on its own side
        return (
          <div style={{...wrapStyle, display: 'flex', justifyContent: 'center'}}>
            <div style={{display: 'flex', alignItems: 'stretch', filter: 'drop-shadow(0 14px 22px rgba(0,0,0,0.15))'}}>
              <div style={{background: P.accent, color: P.onAccent, borderRadius: '10px 0 0 10px', padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                fontFamily: MONO, fontWeight: 700, fontSize: 18, letterSpacing: '0.1em', lineHeight: 1.35, textAlign: 'center', borderRight: `3px dashed ${P.card}`}}>
                {c.kicker.split(' · ').map((x, i) => <div key={i}>{x}</div>)}
              </div>
              <div style={{background: P.card, color: P.cardInk, borderRadius: '0 10px 10px 0', padding: '14px 26px 18px', maxWidth: 600, ...ser, fontSize: fsz - 4, lineHeight: 1.03}}>
                {c.lead} {emSpan(P.accent)}
              </div>
            </div>
          </div>
        );
      })()}
      {headK > 0.01 && (
        <Head P={P} top={372} size={P.dItalic ? 88 : 76} style={{opacity: headK, transform: `translateY(${(1 - headK) * 18}px)`}}>{p.reveal.line} <Em P={P}>{p.reveal.em}</Em></Head>
      )}
      {tagK > 0.01 && (
        <>
          <Tag P={P} x={Math.min(790, tb.x)} y={tb.y - 66} opacity={tagK} solid>{p.reveal.bigTag}</Tag>
          <Tag P={P} x={Math.min(790, Math.max(250, ts.x))} y={ts.y + 16} opacity={tagK}>{p.reveal.smallTag}</Tag>
        </>
      )}
      {p.bigHook && <BigNotes p={p} t={t} dark={P.dark} accent={P.accent} />}
      {p.follow && <FollowCard P={P} t={t} f={p.follow} />}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
