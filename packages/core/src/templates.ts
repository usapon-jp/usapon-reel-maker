import {
  MotionTemplateSchema,
  ReelTemplateSchema,
  createId,
  nowIso,
  type BgmTrack,
  type MotionRecipe,
  type MotionTemplateV1,
  type ProjectDocumentV1,
  type ReelTemplateV1,
} from './types';

const transition = (
  primitive: 'none' | 'fade' | 'slide',
  frames: number,
  amount = 0,
  direction: 'left' | 'right' | 'up' | 'down' = 'up',
) => ({primitive, frames, amount, direction});

const recipe = (value: MotionRecipe): MotionRecipe => value;
const seedDate = '2026-08-26T00:00:00.000Z';

export const BUILTIN_MOTION_TEMPLATES: MotionTemplateV1[] = [
  {
    schemaVersion: 1,
    id: 'motion-soft',
    name: 'ふんわり',
    description: 'やさしい上下移動と控えめなビート同期',
    builtin: true,
    config: {
      background: recipe({
        entry: transition('fade', 18),
        idle: [{primitive: 'slowZoom', amount: 0.06, periodFrames: 900}],
        beat: null,
        exit: transition('fade', 18),
      }),
      image: recipe({
        entry: transition('fade', 12),
        idle: [
          {primitive: 'floatY', amount: 0.02, periodFrames: 150},
          {primitive: 'swayX', amount: 0.01, periodFrames: 210},
        ],
        beat: {everyBeats: 4, durationFrames: 8, pattern: [{primitive: 'pulse', amount: 0.025}]},
        exit: transition('fade', 12),
      }),
      text: recipe({
        entry: transition('fade', 14),
        idle: [],
        beat: {everyBeats: 8, durationFrames: 8, pattern: [{primitive: 'pulse', amount: 0.015}]},
        exit: transition('fade', 14),
      }),
    },
    createdAt: seedDate,
    updatedAt: seedDate,
  },
  {
    schemaVersion: 1,
    id: 'motion-pop',
    name: 'ポップ',
    description: '横から登場し、2拍ごとに弾む',
    builtin: true,
    config: {
      background: recipe({
        entry: transition('fade', 10),
        idle: [{primitive: 'slowZoom', amount: 0.08, periodFrames: 900}],
        beat: {everyBeats: 4, durationFrames: 6, pattern: [{primitive: 'pulse', amount: 0.018}]},
        exit: transition('fade', 10),
      }),
      image: recipe({
        entry: transition('slide', 16, 0.12, 'right'),
        idle: [{primitive: 'floatY', amount: 0.03, periodFrames: 90}],
        beat: {everyBeats: 2, durationFrames: 7, pattern: [{primitive: 'pulse', amount: 0.05}]},
        exit: transition('slide', 12, 0.1, 'left'),
      }),
      text: recipe({
        entry: transition('fade', 7),
        idle: [],
        beat: {everyBeats: 2, durationFrames: 7, pattern: [{primitive: 'pulse', amount: 0.05}]},
        exit: transition('fade', 8),
      }),
    },
    createdAt: seedDate,
    updatedAt: seedDate,
  },
  {
    schemaVersion: 1,
    id: 'motion-lively',
    name: 'にぎやか',
    description: '拍ごとにジャンプ・拡大・回転を切り替える',
    builtin: true,
    config: {
      background: recipe({
        entry: transition('fade', 8),
        idle: [
          {primitive: 'panX', amount: 0.03, periodFrames: 180},
          {primitive: 'slowZoom', amount: 0.1, periodFrames: 900},
        ],
        beat: {everyBeats: 2, durationFrames: 6, pattern: [{primitive: 'pulse', amount: 0.025}]},
        exit: transition('fade', 8),
      }),
      image: recipe({
        entry: transition('slide', 14, 0.18, 'left'),
        idle: [{primitive: 'swayX', amount: 0.018, periodFrames: 80}],
        beat: {
          everyBeats: 1,
          durationFrames: 7,
          pattern: [
            {primitive: 'pulse', amount: 0.07},
            {primitive: 'jump', amount: 0.04},
            {primitive: 'rotate', amount: 3},
          ],
        },
        exit: transition('slide', 10, 0.15, 'right'),
      }),
      text: recipe({
        entry: transition('slide', 10, 0.1, 'up'),
        idle: [],
        beat: {everyBeats: 2, durationFrames: 6, pattern: [{primitive: 'pulse', amount: 0.055}]},
        exit: transition('fade', 8),
      }),
    },
    createdAt: seedDate,
    updatedAt: seedDate,
  },
  {
    schemaVersion: 1,
    id: 'motion-emotional',
    name: 'エモい',
    description: 'ゆっくりパンと長いフェードを中心にした静かな動き',
    builtin: true,
    config: {
      background: recipe({
        entry: transition('fade', 30),
        idle: [
          {primitive: 'slowZoom', amount: 0.05, periodFrames: 900},
          {primitive: 'panX', amount: 0.02, periodFrames: 900},
        ],
        beat: null,
        exit: transition('fade', 30),
      }),
      image: recipe({
        entry: transition('fade', 24),
        idle: [{primitive: 'floatY', amount: 0.01, periodFrames: 260}],
        beat: {everyBeats: 8, durationFrames: 12, pattern: [{primitive: 'pulse', amount: 0.015}]},
        exit: transition('fade', 24),
      }),
      text: recipe({
        entry: transition('fade', 28),
        idle: [],
        beat: null,
        exit: transition('fade', 28),
      }),
    },
    createdAt: seedDate,
    updatedAt: seedDate,
  },
].map((template) => MotionTemplateSchema.parse(template));

export function duplicateMotionTemplate(template: MotionTemplateV1, name = `${template.name} のコピー`): MotionTemplateV1 {
  const now = nowIso();
  return MotionTemplateSchema.parse({
    ...structuredClone(template),
    id: createId('motion'),
    name,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  });
}

export function exportMotionTemplate(template: MotionTemplateV1): string {
  return JSON.stringify(template, null, 2);
}

export function importMotionTemplate(json: string): MotionTemplateV1 {
  const parsed = MotionTemplateSchema.parse(JSON.parse(json));
  return duplicateMotionTemplate(parsed, parsed.name);
}

export function createReelTemplate(
  project: ProjectDocumentV1,
  name: string,
  assetsById: Record<string, {checksum: string}>,
  bgm: BgmTrack | null,
): ReelTemplateV1 {
  const now = nowIso();
  return ReelTemplateSchema.parse({
    schemaVersion: 1,
    id: createId('reel-template'),
    name,
    motionTemplateId: project.motionTemplateId,
    globalStrength: project.globalStrength,
    background: {slotName: 'background', trimStartMs: project.background.trimStartMs},
    layers: project.layers.map((layer) =>
      layer.type === 'image'
        ? {
            ...layer,
            assetChecksum: assetsById[layer.assetId]?.checksum ?? null,
            assetId: undefined,
          }
        : layer,
    ),
    bgmHint: bgm ? {title: bgm.title, checksum: assetsById[bgm.assetId]?.checksum ?? ''} : null,
    createdAt: now,
    updatedAt: now,
  });
}

export function importReelTemplate(json: string): ReelTemplateV1 {
  const parsed = ReelTemplateSchema.parse(JSON.parse(json));
  const now = nowIso();
  return {...parsed, id: createId('reel-template'), createdAt: now, updatedAt: now};
}
