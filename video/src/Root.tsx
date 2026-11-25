import React from 'react';
import {Composition} from 'remotion';
import {RankingReveal, RevealProps} from './RankingReveal';
import current from '../props/current.json';
import story from '../props/story.json';
import {StoryReel, StoryProps} from './StoryReel';
import {EdStory} from './ed/Story';
import {TextsFuture, TFProps} from './TextsFuture';
import {EdTexts} from './ed/Texts';
import {EdMath} from './ed/Math';
import {EdSkit} from './ed/Skit';
import {Cover} from './ed/Cover';
import {EdClip, EdVs} from './ed/Clip';
import {EdChat} from './ed/Chat';
import {EdRace} from './ed/Race';
import {EdHL2} from './ed/HL2';
import {EdPawn} from './ed/Pawn';
import {EdMap} from './ed/MapX';
import {EdMapV} from './ed/MapV';
import {EdExplain} from './ed/Explain';
import {EdFlip} from './ed/Flip';
import {EdBarRace} from './ed/BarRace';
import {EdNews} from './ed/News';
import edskit from '../props/edskit.json';
import edmath from '../props/edmath.json';
import {EdWaited} from './ed/Waited';
import edwaited from '../props/edwaited.json';
import {EdTextsFlat} from './ed/TextsFlat';
import edtexts from '../props/edtexts.json';
import {EdScale} from './ed/Scale';
import {EdScaleFlat} from './ed/ScaleFlat';
import edscale from '../props/edscale.json';
import {EdBars} from './ed/Bars';
import edbars from '../props/edbars.json';
import {EdReceipt} from './ed/Receipt';
import edreceipt from '../props/edreceipt.json';
import {EdFlap} from './ed/Flap';
import edflap from '../props/edflap.json';
import {EdHL} from './ed/HL';
import edhl from '../props/edhl.json';
import {EdCoins} from './ed/Coins';
import edcoins from '../props/edcoins.json';
import {MoneyScale, MSProps} from './MoneyScale';
import ms from '../props/ms.json';
import tf from '../props/tf.json';

const FPS = 30;
const TAIL_FRAMES = 6;

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="RankingReveal"
      component={RankingReveal}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={Math.ceil((current as unknown as RevealProps).duration * FPS) + TAIL_FRAMES}
      defaultProps={current as unknown as RevealProps}
      calculateMetadata={({props}) => ({
        durationInFrames: Math.ceil(props.duration * FPS) + TAIL_FRAMES,
      })}
    />
    <Composition
      id="StoryReel"
      component={StoryReel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={Math.ceil((story as unknown as StoryProps).duration * FPS) + TAIL_FRAMES}
      defaultProps={story as unknown as StoryProps}
      calculateMetadata={({props}) => ({
        durationInFrames: Math.ceil(props.duration * FPS) + TAIL_FRAMES,
      })}
    />
    <Composition
      id="TextsFuture"
      component={TextsFuture}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={Math.ceil((tf as unknown as TFProps).duration * FPS)}
      defaultProps={tf as unknown as TFProps}
      calculateMetadata={({props}) => ({
        durationInFrames: Math.ceil(props.duration * FPS),
      })}
    />
    <Composition
      id="MoneyScale"
      component={MoneyScale}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={Math.ceil((ms as unknown as MSProps).duration * FPS)}
      defaultProps={ms as unknown as MSProps}
      calculateMetadata={({props}) => ({
        durationInFrames: Math.ceil(props.duration * FPS),
      })}
    />
    <Composition id="EdStory" component={EdStory as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((story as any).duration * FPS) + TAIL_FRAMES}
      defaultProps={story as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS) + TAIL_FRAMES})} />
    <Composition id="EdWaited" component={EdWaited as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edwaited as any).duration * FPS)}
      defaultProps={edwaited as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdChat" component={EdChat as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{msgs: [], hook: '', cast: [], introDur: 2.5, duration: 10, outroAt: 8.8} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdRace" component={EdRace as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{lines: [], years: [], pre: '', em: '', post: '', guess: 3.2, race: 9, podium: 3.6, outroAt: 15.8, duration: 17.4, source: ''} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdHL2" component={EdHL2 as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{hookA: '', hookB: '', endA: '', endB: '', unit: '', items: [], start: 2.2, round: 3.3, outroAt: 18, duration: 19.6} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdExplain" component={EdExplain as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{els: [], base: [], beats: [], theme: {bg: '#111', accent: '#FFD23F', fade: '#000'}, voice: null, music: null, outroAt: 30, duration: 31.6} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdMapV" component={EdMapV as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{layers: {sea: [], near: [], land: '', lakes: '', bands: {}, border: []}, cities: [], beats: [], accent: '#FFD23F', scale: {km: 500, px: 90}, voice: null, music: null, outroAt: 30, duration: 31.6} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdMap" component={EdMap as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{pre: '', em: '', hook: [], land: '', near: [], regions: [], fake: {gta: '', fact: '', at: [0, 0]}, end: [], ask: '', start: 2.6, step: 2.7, fakeAt: 16, endAt: 19, outroAt: 22, duration: 24} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdPawn" component={EdPawn as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{pre: '', em: '', post: '', colA: '', items: [], start: 1.4, step: 1.35, outroAt: 14, duration: 15.6} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdFlip" component={EdFlip as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{events: [], hook: 1, step: 0.9, endFor: 2.2, outroAt: 16, duration: 17.6, titleA: '', titleEm: ''} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdBarRace" component={EdBarRace as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{theme: '', titleA: '', titleEm: '', unit: 'usd_big', years: [2000, 2001], countries: [], toasts: [], hook: 1.8, race: 12.5, outroAt: 16.9, duration: 18.5, ask: '', endAsk: '', source: ''} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdVs" component={EdVs as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{pairs: [], hook: 'GTA 5 VS GTA 6', badge: 'GTA 6 · DAY 1', duration: 10} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdNews" component={EdNews as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{seg: {src: 'clips/sample.mp4', srcW: 1920, srcH: 1080, from: 0, dur: 8, credit: 'Streamer on Twitch', layout: 'zoom'},
        copy: {headline: ['BREAKING'], kicker: '', chyron: '', sub: '', ticker: [''], question: '', options: ['', '', ''], answer: 0, signoff: '', place: '', clock: '',
          weather: '', wanted: 1}, open: 3.6, freezeAt: 3, freezeFor: 5.5, signoff: 1.8, duration: 20} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdClip" component={EdClip as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil(10 * FPS)}
      defaultProps={{segs: [{src: 'clips/sample.mp4', srcW: 1920, srcH: 1080, from: 0, dur: 8.4, facecam: {x: 0.74, y: 0.04, w: 0.24, h: 0.3},
        gamebox: null, star: 'gameplay', peak: 3, words: [], credit: 'Streamer on Twitch'}], hook: 'HE DID IT', badge: 'GTA 6 · DAY 1', duration: 10} as any}
      calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="Cover" component={Cover as any} width={1080} height={1920} fps={FPS} durationInFrames={1}
      defaultProps={{kind: 'text', pal: 'vice', a: 'Everything that changed', b: 'while we waited', big: '13 YEARS'} as any} />
    <Composition id="EdSkit" component={EdSkit as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edskit as any).duration * FPS)}
      defaultProps={edskit as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdMath" component={EdMath as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edmath as any).duration * FPS)}
      defaultProps={edmath as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdTexts" component={EdTexts as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edtexts as any).duration * FPS)}
      defaultProps={edtexts as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdTextsFlat" component={EdTextsFlat as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edtexts as any).duration * FPS)}
      defaultProps={edtexts as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdScale" component={EdScale as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edscale as any).duration * FPS)}
      defaultProps={edscale as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdScaleFlat" component={EdScaleFlat as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edscale as any).duration * FPS)}
      defaultProps={edscale as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdBars" component={EdBars as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edbars as any).duration * FPS)}
      defaultProps={edbars as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdReceipt" component={EdReceipt as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edreceipt as any).duration * FPS)}
      defaultProps={edreceipt as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdFlap" component={EdFlap as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edflap as any).duration * FPS)}
      defaultProps={edflap as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdHL" component={EdHL as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edhl as any).duration * FPS)}
      defaultProps={edhl as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    <Composition id="EdCoins" component={EdCoins as any} width={1080} height={1920} fps={FPS} durationInFrames={Math.ceil((edcoins as any).duration * FPS)}
      defaultProps={edcoins as any} calculateMetadata={({props}: any) => ({durationInFrames: Math.ceil(props.duration * FPS)})} />
    </>
  );
};
