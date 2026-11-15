import React from 'react';
import {Composition} from 'remotion';
import {RankingReveal, RevealProps} from './RankingReveal';
import current from '../props/current.json';
import story from '../props/story.json';
import {StoryReel, StoryProps} from './StoryReel';
import {TextsFuture, TFProps} from './TextsFuture';
import {EdTexts} from './ed/Texts';
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
