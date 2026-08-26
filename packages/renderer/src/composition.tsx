import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Video,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  beatPositionsToFrames,
  calculateMotionState,
  type MotionRecipe,
  type ProjectLayer,
  type RenderableProject,
} from '@usapon-reel/core';

function AnimatedLayer({
  layer,
  recipe,
  input,
  index,
}: {
  layer: ProjectLayer;
  recipe: MotionRecipe;
  input: RenderableProject;
  index: number;
}) {
  const frame = useCurrentFrame();
  const {fps, width: canvasWidth} = useVideoConfig();
  const beatFrames = input.bgm ? beatPositionsToFrames(input.bgm.beatPositionsMs, fps) : [];
  const motion = calculateMotionState({
    frame,
    startFrame: layer.startFrame,
    endFrame: layer.endFrame,
    recipe,
    beatFrames,
    strength: input.project.globalStrength * layer.strength,
    phaseOffset: index * 17,
  });
  const transform = [
    'translate(-50%, -50%)',
    `translate(${motion.x * canvasWidth}px, ${motion.y * canvasWidth}px)`,
    `scale(${motion.scale})`,
    `rotate(${layer.transform.rotation + motion.rotation}deg)`,
  ].join(' ');

  const sharedStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${layer.transform.x * 100}%`,
    top: `${layer.transform.y * 100}%`,
    width: `${layer.transform.width * 100}%`,
    transform,
    transformOrigin: 'center',
    opacity: motion.opacity,
    zIndex: layer.zIndex,
  };

  if (layer.type === 'image') {
    const asset = input.imageAssets[layer.assetId];
    if (!asset) return null;
    return <Img src={asset.src} style={{...sharedStyle, height: 'auto', objectFit: 'contain'}} />;
  }

  return (
    <div
      style={{
        ...sharedStyle,
        color: layer.style.color,
        backgroundColor: layer.style.backgroundColor,
        fontFamily: 'Hiragino Sans, Yu Gothic, sans-serif',
        fontSize: layer.style.fontSize,
        fontWeight: layer.style.fontWeight,
        lineHeight: 1.25,
        padding: '0.12em 0.18em',
        textAlign: layer.style.align,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }}
    >
      {layer.text}
    </div>
  );
}

function Background({input}: {input: RenderableProject}) {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const asset = input.background;
  if (!asset) {
    return <AbsoluteFill style={{background: 'linear-gradient(145deg, #fff7ec, #f7e5d4)'}} />;
  }
  const beatFrames = input.bgm ? beatPositionsToFrames(input.bgm.beatPositionsMs, fps) : [];
  const motion = calculateMotionState({
    frame,
    startFrame: 0,
    endFrame: input.project.canvas.durationFrames,
    recipe: input.template.config.background,
    beatFrames,
    strength: input.project.globalStrength * input.project.background.strength,
  });
  const style: React.CSSProperties = {
    position: 'absolute',
    inset: '-6%',
    width: '112%',
    height: '112%',
    objectFit: 'cover',
    opacity: motion.opacity,
    transform: `translate(${motion.x * width}px, ${motion.y * width}px) scale(${motion.scale}) rotate(${motion.rotation}deg)`,
    transformOrigin: 'center',
  };
  if (asset.mimeType.startsWith('video/')) {
    return (
      <Video
        src={asset.src}
        muted
        loop
        trimBefore={Math.round((input.project.background.trimStartMs / 1000) * fps)}
        style={style}
        pauseWhenBuffering
      />
    );
  }
  return <Img src={asset.src} style={style} />;
}

function ReelAudio({input}: {input: RenderableProject}) {
  const {fps, durationInFrames} = useVideoConfig();
  if (!input.bgm || !input.project.bgm) return null;
  const trimFrames = Math.round((input.project.bgm.trimStartMs / 1000) * fps);
  const availableFrames = Math.max(1, Math.round(((input.bgm.durationMs ?? 30_000) / 1000) * fps) - trimFrames);
  const baseVolume = input.project.bgm.volume;
  if (availableFrames >= durationInFrames) {
    return <Audio src={input.bgm.src} trimBefore={trimFrames} volume={baseVolume} />;
  }
  const crossfade = Math.min(6, Math.max(1, Math.floor(availableFrames / 6)));
  const stride = Math.max(1, availableFrames - crossfade);
  const instances = Math.ceil(durationInFrames / stride) + 1;
  return (
    <>
      {Array.from({length: instances}, (_, index) => {
        const from = index * stride;
        if (from >= durationInFrames) return null;
        return (
          <Sequence key={from} from={from} durationInFrames={Math.min(availableFrames, durationInFrames - from)}>
            <Audio
              src={input.bgm!.src}
              trimBefore={trimFrames}
              volume={(localFrame) => {
                const fadeIn = index === 0 ? 1 : Math.min(1, localFrame / crossfade);
                const fadeOut = Math.min(1, (availableFrames - localFrame) / crossfade);
                return baseVolume * Math.max(0, Math.min(fadeIn, fadeOut));
              }}
            />
          </Sequence>
        );
      })}
    </>
  );
}

export function ReelComposition({input}: {input: RenderableProject}) {
  const sortedLayers = [...input.project.layers].sort((a, b) => a.zIndex - b.zIndex);
  return (
    <AbsoluteFill style={{backgroundColor: '#f6eee5', overflow: 'hidden'}}>
      <Background input={input} />
      {sortedLayers.map((layer, index) => (
        <AnimatedLayer
          key={layer.id}
          layer={layer}
          recipe={layer.type === 'text' ? input.template.config.text : input.template.config.image}
          input={input}
          index={index}
        />
      ))}
      <ReelAudio input={input} />
    </AbsoluteFill>
  );
}
