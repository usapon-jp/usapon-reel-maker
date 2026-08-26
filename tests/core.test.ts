import {describe, expect, it} from 'vitest';
import {
  BUILTIN_MOTION_TEMPLATES,
  MotionTemplateSchema,
  SAFE_AREA,
  CANVAS,
  autoLayoutProject,
  beatPositionsToFrames,
  calculateMotionState,
  createDefaultProject,
  createImageLayer,
  createReelTemplate,
  createTextLayer,
  duplicateMotionTemplate,
  importMotionTemplate,
  importReelTemplate,
  type BgmTrack,
  type MotionPrimitive,
  type MotionRecipe,
} from '@usapon-reel/core';

const noTransition = {primitive: 'none' as const, frames: 0, amount: 0, direction: 'up' as const};
const recipeWith = (primitive: MotionPrimitive, amount = 0.1): MotionRecipe => ({
  entry: noTransition,
  idle: [{primitive, amount, periodFrames: 100}],
  beat: null,
  exit: noTransition,
});

describe('motion templates', () => {
  it('ships four validated data-driven templates', () => {
    expect(BUILTIN_MOTION_TEMPLATES.map((template) => template.name)).toEqual(['ふんわり', 'ポップ', 'にぎやか', 'エモい']);
    for (const template of BUILTIN_MOTION_TEMPLATES) expect(MotionTemplateSchema.parse(template)).toEqual(template);
  });

  it('duplicates built-ins as editable records and imports with a new id', () => {
    const source = BUILTIN_MOTION_TEMPLATES[0];
    const duplicate = duplicateMotionTemplate(source);
    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.builtin).toBe(false);
    const imported = importMotionTemplate(JSON.stringify(duplicate));
    expect(imported.id).not.toBe(duplicate.id);
    expect(imported.config).toEqual(duplicate.config);
  });

  it('rejects unknown animation primitives', () => {
    const value = structuredClone(BUILTIN_MOTION_TEMPLATES[0]) as unknown as {config: {image: {idle: Array<{primitive: string}>}}};
    value.config.image.idle[0].primitive = 'walk-legs';
    expect(() => MotionTemplateSchema.parse(value)).toThrow();
  });

  it('rejects unsupported versions and values outside the editable ranges', () => {
    expect(() => MotionTemplateSchema.parse({...BUILTIN_MOTION_TEMPLATES[0], schemaVersion: 2})).toThrow();
    const value = structuredClone(BUILTIN_MOTION_TEMPLATES[0]);
    value.config.image.idle[0].amount = 11;
    expect(() => MotionTemplateSchema.parse(value)).toThrow();
  });
});

describe('animation calculation', () => {
  it('only reacts at the configured beat frequency', () => {
    const recipe = BUILTIN_MOTION_TEMPLATES[0].config.image;
    const idleOnly = calculateMotionState({frame: 18, startFrame: 0, endFrame: 900, recipe, beatFrames: [0, 15, 30, 45, 60], strength: 1});
    const onFourthBeat = calculateMotionState({frame: 63, startFrame: 0, endFrame: 900, recipe, beatFrames: [0, 15, 30, 45, 60], strength: 1});
    expect(idleOnly.scale).toBeCloseTo(1, 4);
    expect(onFourthBeat.scale).toBeGreaterThan(1);
  });

  it('hides layers outside their display range', () => {
    const recipe = BUILTIN_MOTION_TEMPLATES[1].config.image;
    expect(calculateMotionState({frame: 5, startFrame: 10, endFrame: 100, recipe, beatFrames: [], strength: 1}).opacity).toBe(0);
    expect(calculateMotionState({frame: 100, startFrame: 10, endFrame: 100, recipe, beatFrames: [], strength: 1}).opacity).toBe(0);
  });

  it('supports every reusable idle primitive and scales it down to zero strength', () => {
    const primitives: MotionPrimitive[] = ['floatY', 'swayX', 'slowZoom', 'rotate', 'panX', 'panY'];
    for (const primitive of primitives) {
      const recipe = recipeWith(primitive);
      const active = calculateMotionState({frame: 25, startFrame: 0, endFrame: 200, recipe, beatFrames: [], strength: 1});
      const disabled = calculateMotionState({frame: 25, startFrame: 0, endFrame: 200, recipe, beatFrames: [], strength: 0});
      expect(active).not.toEqual({x: 0, y: 0, scale: 1, rotation: 0, opacity: 1});
      expect(disabled).toEqual({x: 0, y: 0, scale: 1, rotation: 0, opacity: 1});
    }
  });

  it('cycles pulse, jump and rotate patterns on eligible beats', () => {
    const recipe: MotionRecipe = {
      entry: noTransition,
      idle: [],
      beat: {
        everyBeats: 1,
        durationFrames: 10,
        pattern: [
          {primitive: 'pulse', amount: 0.1},
          {primitive: 'jump', amount: 0.1},
          {primitive: 'rotate', amount: 5},
        ],
      },
      exit: noTransition,
    };
    const beats = [0, 20, 40];
    expect(calculateMotionState({frame: 5, startFrame: 0, endFrame: 100, recipe, beatFrames: beats, strength: 1}).scale).toBeGreaterThan(1);
    expect(calculateMotionState({frame: 25, startFrame: 0, endFrame: 100, recipe, beatFrames: beats, strength: 1}).y).toBeLessThan(0);
    expect(calculateMotionState({frame: 45, startFrame: 0, endFrame: 100, recipe, beatFrames: beats, strength: 1}).rotation).toBeGreaterThan(0);
    expect(beatPositionsToFrames([0, 500, 1000], 30)).toEqual([0, 15, 30]);
  });
});

describe('automatic layout', () => {
  it('keeps important content inside the configured safe area', () => {
    const project = createDefaultProject();
    const primary = createImageLayer('primary', 0);
    const logo = {...createImageLayer('logo', 1), role: 'logo' as const};
    const text = createTextLayer(0);
    project.layers = [primary, logo, text];
    const result = autoLayoutProject(project, {
      primary: {width: 600, height: 900, visibleBounds: {x: 20, y: 30, width: 560, height: 820}},
      logo: {width: 800, height: 300, visibleBounds: null},
    });
    const safeLeft = SAFE_AREA.left / CANVAS.width;
    const safeRight = 1 - SAFE_AREA.right / CANVAS.width;
    const safeTop = SAFE_AREA.top / CANVAS.height;
    for (const layer of result.layers.filter((layer) => layer.type === 'text' || layer.role !== 'decoration')) {
      expect(layer.transform.x).toBeGreaterThanOrEqual(safeLeft);
      expect(layer.transform.x).toBeLessThanOrEqual(safeRight);
      expect(layer.transform.y).toBeGreaterThanOrEqual(safeTop);
    }
    expect(result.layers.map((layer) => layer.id)).toEqual(project.layers.map((layer) => layer.id));
  });
});

describe('reel templates', () => {
  it('stores named slots and checksum hints without local asset paths, then imports with a new id', () => {
    const project = createDefaultProject('motion-pop');
    project.background.assetId = 'background-asset';
    project.layers = [createImageLayer('image-asset', 0), {...createTextLayer(0), text: '新作です'}];
    project.bgm = {trackId: 'track-1', trimStartMs: 0, volume: 1};
    const now = new Date().toISOString();
    const bgm: BgmTrack = {
      id: 'track-1', assetId: 'audio-asset', title: 'テストBGM', status: 'ready', durationMs: 30_000,
      bpm: 120, beatPositionsMs: [0, 500], confidence: 1, peakDb: -1, rmsDb: -12,
      firstBeatOffsetMs: 0, analysisWarning: null, tags: ['ポップ'], createdAt: now, updatedAt: now,
    };
    const template = createReelTemplate(project, '新作紹介', {
      'image-asset': {checksum: 'image-checksum'},
      'audio-asset': {checksum: 'audio-checksum'},
    }, bgm);
    expect(template.layers[0]).not.toHaveProperty('assetId');
    expect(template.layers[0]).toMatchObject({slotName: 'main-1', assetChecksum: 'image-checksum'});
    expect(template.bgmHint).toEqual({title: 'テストBGM', checksum: 'audio-checksum'});
    expect(JSON.stringify(template)).not.toContain('/Users/');
    const imported = importReelTemplate(JSON.stringify(template));
    expect(imported.id).not.toBe(template.id);
    expect(imported.layers).toEqual(template.layers);
  });
});
