import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {BUILTIN_MOTION_TEMPLATES, CANVAS, createDefaultProject, type RenderableProject} from '@usapon-reel/core';
import {ReelComposition} from './composition';

const emptyProject = createDefaultProject();
const defaultInput: RenderableProject = {
  project: emptyProject,
  template: BUILTIN_MOTION_TEMPLATES[0],
  background: null,
  imageAssets: {},
  bgm: null,
};

const RemotionRoot = () => (
  <Composition
    id="UsaponReel"
    component={ReelComposition}
    durationInFrames={CANVAS.durationFrames}
    fps={CANVAS.fps}
    width={CANVAS.width}
    height={CANVAS.height}
    defaultProps={{input: defaultInput}}
  />
);

registerRoot(RemotionRoot);
