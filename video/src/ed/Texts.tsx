// ---------- Texts from the future, editorial 3D: a phone standing in a paper studio. When the number lands,
// the phone lies back and the number rises from the floor as real 3D type, next to the tiny amount it started as. ----------
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Backdrop, Cam, Em, Grain, Head, Masthead, PAL, PalName, ProgressRule, Studio, Tag, Text3D, V3, lerp, outBack, outCubic, outElastic, projector, smooth, textWidth, useEdFonts} from './kit';
import {ChatProps, PH, Phone3D, drawPhoneScreen, usePhoneScreen} from './phone';

export type EdTextsProps = ChatProps & {pal: PalName; duration: number; label: string; music?: string | null;
  reveal: {small: string; big: string; smallTag: string; bigTag: string; line: string; em: string}};

export const EdTexts: React.FC<EdTextsProps> = (p) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const ready = useEdFonts();
  const P = PAL[p.pal];
  const {canvas, tex} = usePhoneScreen();
  const wall: [string, string, string] = P.name === 'paper' ? ['#E3412A', '#F08A4B', '#F6C56B'] : P.name === 'green' ? ['#0E3B2E', '#1F7A5C', '#E8B84A'] : ['#16161c', '#3a3f1a', '#C9FF3B'];
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
  const d0 = lerp(17.6, 16.4, smooth(0, 1.6, t)), y0 = lerp(0.2, 0.05, open) + Math.sin(t * 0.33) * 0.02;
  const chatPos: V3 = [Math.sin(y0) * d0, 2.6, Math.cos(y0) * d0], chatTarget: V3 = [0, 1.74, 0];
  const drift = (a - R0) * 0.05;
  const heroPos: V3 = [-5.4 + drift * 6, 1.7, 9.0], heroTarget: V3 = [0.36, 0.1, -0.2];
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
  const tb = proj([end(0.12)[0], bigSize * 0.8, 0.45]), ts = proj([smallPos[0], 0.27, smallPos[2]]);
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
        {a > R0 - 0.05 && a < R1 && (
          <>
            <Text3D ready={ready} font="serif" text={p.reveal.big} size={bigSize} depth={0.95} color={P.accent} position={bigPos} rotation={[0, ROT, 0]} scale={[1, Math.max(0.001, rise), 1]} rough={0.5} />
            <Text3D ready={ready} font="serif" text={p.reveal.small} size={0.26} depth={0.1} color={P.ink} position={smallPos} rotation={[0, -0.5, 0]} scale={Math.max(0.001, riseS)} rough={0.6} />
          </>
        )}
      </ThreeCanvas>

      <Masthead P={P} label={p.label} />
      {headK > 0.01 && (
        <Head P={P} top={372} size={P.dItalic ? 88 : 76} style={{opacity: headK, transform: `translateY(${(1 - headK) * 18}px)`}}>{p.reveal.line} <Em P={P}>{p.reveal.em}</Em></Head>
      )}
      {tagK > 0.01 && (
        <>
          <Tag P={P} x={Math.min(790, tb.x)} y={tb.y - 66} opacity={tagK} solid>{p.reveal.bigTag}</Tag>
          <Tag P={P} x={Math.min(790, Math.max(250, ts.x))} y={ts.y + 78} opacity={tagK}>{p.reveal.smallTag}</Tag>
        </>
      )}
      <Grain P={P} />
      <ProgressRule P={P} k={t / p.duration} />
    </AbsoluteFill>
  );
};
