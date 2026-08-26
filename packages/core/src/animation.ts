import type {MotionRecipe} from './types';

export type MotionState = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

function transitionOffset(
  direction: 'left' | 'right' | 'up' | 'down',
  amount: number,
  progress: number,
): Pick<MotionState, 'x' | 'y'> {
  const remaining = 1 - progress;
  if (direction === 'left') return {x: -amount * remaining, y: 0};
  if (direction === 'right') return {x: amount * remaining, y: 0};
  if (direction === 'down') return {x: 0, y: amount * remaining};
  return {x: 0, y: -amount * remaining};
}

export function calculateMotionState(input: {
  frame: number;
  startFrame: number;
  endFrame: number;
  recipe: MotionRecipe;
  beatFrames: number[];
  strength: number;
  phaseOffset?: number;
}): MotionState {
  const {frame, startFrame, endFrame, recipe, beatFrames, strength} = input;
  const phaseOffset = input.phaseOffset ?? 0;
  const localFrame = frame - startFrame;
  const duration = Math.max(1, endFrame - startFrame);
  const state: MotionState = {x: 0, y: 0, scale: 1, rotation: 0, opacity: 1};

  if (frame < startFrame || frame >= endFrame) return {...state, opacity: 0};

  for (const idle of recipe.idle) {
    const phase = ((localFrame + phaseOffset) / idle.periodFrames) * Math.PI * 2;
    if (idle.primitive === 'floatY') state.y += Math.sin(phase) * idle.amount * strength;
    if (idle.primitive === 'swayX') state.x += Math.sin(phase) * idle.amount * strength;
    if (idle.primitive === 'rotate') state.rotation += Math.sin(phase) * idle.amount * strength;
    if (idle.primitive === 'panX') state.x += Math.sin(phase / 2) * idle.amount * strength;
    if (idle.primitive === 'panY') state.y += Math.sin(phase / 2) * idle.amount * strength;
    if (idle.primitive === 'slowZoom') state.scale += (localFrame / duration) * idle.amount * strength;
  }

  const entry = recipe.entry;
  if (entry.frames > 0 && localFrame < entry.frames) {
    const progress = clamp(localFrame / entry.frames);
    const eased = entry.primitive === 'slide' ? easeOutBack(progress) : progress;
    if (entry.primitive === 'fade') state.opacity *= progress;
    if (entry.primitive === 'slide') {
      const offset = transitionOffset(entry.direction, entry.amount * strength, eased);
      state.x += offset.x;
      state.y += offset.y;
      state.opacity *= clamp(progress * 2);
    }
  }

  const exit = recipe.exit;
  const remaining = endFrame - frame;
  if (exit.frames > 0 && remaining <= exit.frames) {
    const progress = clamp(remaining / exit.frames);
    if (exit.primitive === 'fade') state.opacity *= progress;
    if (exit.primitive === 'slide') {
      const offset = transitionOffset(exit.direction, exit.amount * strength, 1 - progress);
      state.x += offset.x;
      state.y += offset.y;
      state.opacity *= progress;
    }
  }

  if (recipe.beat && beatFrames.length > 0) {
    const eligible = beatFrames
      .map((beatFrame, index) => ({beatFrame, index}))
      .filter(({beatFrame, index}) => beatFrame <= frame && index % recipe.beat!.everyBeats === 0)
      .at(-1);
    if (eligible) {
      const beatAge = frame - eligible.beatFrame;
      if (beatAge >= 0 && beatAge <= recipe.beat.durationFrames) {
        const amountProgress = 1 - beatAge / recipe.beat.durationFrames;
        const pulse = Math.sin(amountProgress * Math.PI) * strength;
        const motion = recipe.beat.pattern[
          Math.floor(eligible.index / recipe.beat.everyBeats) % recipe.beat.pattern.length
        ];
        if (motion.primitive === 'pulse') state.scale += motion.amount * pulse;
        if (motion.primitive === 'jump') state.y -= motion.amount * pulse;
        if (motion.primitive === 'rotate') state.rotation += motion.amount * pulse;
      }
    }
  }

  return state;
}

export function beatPositionsToFrames(beatPositionsMs: number[], fps: number): number[] {
  return beatPositionsMs.map((value) => Math.round((value / 1000) * fps));
}
