import React from 'react';
import {Composition} from 'remotion';
import {RankingReveal, RevealProps} from './RankingReveal';
import current from '../props/current.json';
import story from '../props/story.json';
import {StoryReel, StoryProps} from './StoryReel';
import {TextsFuture, TFProps} from './TextsFuture';
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
    </>
  );
};
