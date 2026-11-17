// ---------- The cover of a reel (Instagram and Facebook use it as the thumbnail, the grids crop it to 3:4) ----------
//   still: the title over a frame of the reel (the scene sells it: skits, texts)
//   text:  the title and one big number on the palette's backdrop (data and money reels)
// Everything that matters sits inside y 240..1680, the part a 3:4 grid keeps.
import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {Backdrop, PAL, PalName, SANS, useEdFonts} from './kit';

export type CoverProps = {kind: 'still' | 'text'; pal: PalName; a: string; b?: string; big?: string; bg?: string; cropTop?: number};

const size = (n: number, base: number) => (n > 46 ? base * 0.72 : n > 32 ? base * 0.86 : base);

export const Cover: React.FC<CoverProps> = ({kind, pal, a, b = '', big, bg, cropTop = 560}) => {
  useEdFonts();
  const P = PAL[pal] ?? PAL.paper;
  const len = a.length + b.length;
  if (kind === 'still' && bg) {
    return (
      <AbsoluteFill style={{background: '#170828'}}>
        {/* the frame from cropTop down (below its own title), so only the scene shows */}
        <div style={{position: 'absolute', left: 0, top: 640, width: 1080, height: 1280, overflow: 'hidden'}}>
          <Img src={staticFile(bg)} style={{position: 'absolute', left: 0, top: -cropTop, width: 1080, height: 1920}} />
        </div>
        <AbsoluteFill style={{background: 'linear-gradient(180deg, #170828 0%, #170828 34%, rgba(23,8,40,0) 50%)'}} />
        <div style={{position: 'absolute', top: 300, left: 60, right: 60, textAlign: 'center', fontFamily: 'Instrument Serif', fontSize: size(len, 124),
          lineHeight: 1, letterSpacing: '-0.02em', color: '#FFF3EA', textShadow: '0 6px 30px rgba(10,0,20,0.6)'}}>
          {a}{b && <><br /><i style={{color: '#FF4FA0'}}>{b}</i></>}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{background: P.bg}}>
      <Backdrop P={P} horizon={0.5} />
      {pal === 'vice' && <AbsoluteFill style={{background: 'rgba(20,6,40,0.25)'}} />}
      <div style={{position: 'absolute', top: big ? 500 : 640, left: 60, right: 60, textAlign: 'center', fontFamily: P.display, fontWeight: P.dWeight,
        fontSize: size(len, big ? 128 : 156), lineHeight: 1.02, letterSpacing: '-0.02em', color: P.ink}}>
        {a}{b && <><br /><i style={{color: P.accent}}>{b}</i></>}
      </div>
      {big && <div style={{position: 'absolute', top: 1080, left: 0, right: 0, textAlign: 'center', fontFamily: SANS, fontWeight: 900,
        fontSize: big.length > 8 ? 130 : 180, color: P.ink}}>{big}</div>}
    </AbsoluteFill>
  );
};
