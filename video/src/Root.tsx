import React from 'react';
import {Composition} from 'remotion';
import {RankingReveal, RevealProps} from './RankingReveal';
import current from '../props/current.json';

const FPS = 30;
const TAIL_FRAMES = 6;

export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
