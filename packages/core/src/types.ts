import {z} from 'zod';

export const CANVAS = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationFrames: 900,
} as const;

export const SAFE_AREA = {
  left: 90,
  right: 180,
  top: 220,
  bottom: 420,
} as const;

export const AssetKindSchema = z.enum(['background', 'overlay', 'audio', 'output', 'thumbnail']);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetStatusSchema = z.enum(['processing', 'ready', 'failed']);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

export const VisibleBoundsSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const AssetRecordSchema = z.object({
  id: z.string().min(1),
  kind: AssetKindSchema,
  status: AssetStatusSchema,
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  storageKey: z.string().min(1),
  proxyStorageKey: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  visibleBounds: VisibleBoundsSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AssetRecord = z.infer<typeof AssetRecordSchema>;

export const LayerRoleSchema = z.enum(['primary', 'logo', 'decoration']);
export type LayerRole = z.infer<typeof LayerRoleSchema>;

export const TransformSchema = z.object({
  x: z.number().min(-0.5).max(1.5),
  y: z.number().min(-0.5).max(1.5),
  width: z.number().min(0.02).max(2),
  rotation: z.number().min(-360).max(360),
});
export type LayerTransform = z.infer<typeof TransformSchema>;

const LayerBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slotName: z.string().min(1),
  zIndex: z.number().int().min(0).max(999),
  startFrame: z.number().int().min(0).max(CANVAS.durationFrames - 1),
  endFrame: z.number().int().min(1).max(CANVAS.durationFrames),
  strength: z.number().min(0).max(2),
  transform: TransformSchema,
});

export const ImageLayerSchema = LayerBaseSchema.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  role: LayerRoleSchema,
});
export type ImageLayer = z.infer<typeof ImageLayerSchema>;

export const TextLayerSchema = LayerBaseSchema.extend({
  type: z.literal('text'),
  role: z.literal('text'),
  text: z.string().max(500),
  style: z.object({
    fontSize: z.number().int().min(20).max(240),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{8}$/),
    fontWeight: z.enum(['400', '600', '700', '800']),
    align: z.enum(['left', 'center', 'right']),
  }),
});
export type TextLayer = z.infer<typeof TextLayerSchema>;

export const ProjectLayerSchema = z.discriminatedUnion('type', [ImageLayerSchema, TextLayerSchema]);
export type ProjectLayer = z.infer<typeof ProjectLayerSchema>;

export const ProjectDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  canvas: z.object({
    width: z.literal(CANVAS.width),
    height: z.literal(CANVAS.height),
    fps: z.literal(CANVAS.fps),
    durationFrames: z.literal(CANVAS.durationFrames),
  }),
  background: z.object({
    assetId: z.string().nullable(),
    fit: z.literal('cover'),
    trimStartMs: z.number().int().nonnegative(),
    strength: z.number().min(0).max(2),
  }),
  layers: z.array(ProjectLayerSchema).max(40),
  motionTemplateId: z.string().min(1),
  globalStrength: z.number().min(0).max(2),
  bgm: z
    .object({
      trackId: z.string().min(1),
      trimStartMs: z.number().int().nonnegative(),
      volume: z.number().min(0).max(2),
    })
    .nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectDocumentV1 = z.infer<typeof ProjectDocumentSchema>;

export const MotionPrimitiveSchema = z.enum([
  'floatY',
  'swayX',
  'slowZoom',
  'rotate',
  'panX',
  'panY',
]);
export type MotionPrimitive = z.infer<typeof MotionPrimitiveSchema>;

export const BeatPrimitiveSchema = z.enum(['pulse', 'jump', 'rotate']);
export type BeatPrimitive = z.infer<typeof BeatPrimitiveSchema>;

export const TransitionSchema = z.object({
  primitive: z.enum(['none', 'fade', 'slide']),
  frames: z.number().int().min(0).max(120),
  amount: z.number().min(0).max(1),
  direction: z.enum(['left', 'right', 'up', 'down']),
});

export const IdleMotionSchema = z.object({
  primitive: MotionPrimitiveSchema,
  amount: z.number().min(-10).max(10),
  periodFrames: z.number().int().min(10).max(1800),
});

export const BeatMotionSchema = z.object({
  everyBeats: z.number().int().min(1).max(16),
  durationFrames: z.number().int().min(1).max(60),
  pattern: z
    .array(
      z.object({
        primitive: BeatPrimitiveSchema,
        amount: z.number().min(-10).max(10),
      }),
    )
    .min(1)
    .max(8),
});

export const MotionRecipeSchema = z.object({
  entry: TransitionSchema,
  idle: z.array(IdleMotionSchema).max(8),
  beat: BeatMotionSchema.nullable(),
  exit: TransitionSchema,
});
export type MotionRecipe = z.infer<typeof MotionRecipeSchema>;

export const MotionTemplateSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  description: z.string().max(200),
  builtin: z.boolean(),
  config: z.object({
    background: MotionRecipeSchema,
    image: MotionRecipeSchema,
    text: MotionRecipeSchema,
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MotionTemplateV1 = z.infer<typeof MotionTemplateSchema>;

export const ReelTemplateSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  motionTemplateId: z.string().min(1),
  globalStrength: z.number().min(0).max(2),
  background: z.object({
    slotName: z.string().min(1),
    trimStartMs: z.number().int().nonnegative(),
  }),
  layers: z.array(
    z.discriminatedUnion('type', [
      ImageLayerSchema.omit({assetId: true}).extend({assetChecksum: z.string().nullable()}),
      TextLayerSchema,
    ]),
  ),
  bgmHint: z
    .object({title: z.string(), checksum: z.string()})
    .nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReelTemplateV1 = z.infer<typeof ReelTemplateSchema>;

export const BgmTrackSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  title: z.string().min(1).max(120),
  status: AssetStatusSchema,
  durationMs: z.number().int().nonnegative().nullable(),
  bpm: z.number().min(0).max(400).nullable(),
  beatPositionsMs: z.array(z.number().int().nonnegative()),
  confidence: z.number().min(0).nullable(),
  peakDb: z.number().nullable(),
  rmsDb: z.number().nullable(),
  firstBeatOffsetMs: z.number().int().nonnegative(),
  analysisWarning: z.string().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BgmTrack = z.infer<typeof BgmTrackSchema>;

export const JobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed']);
export const JobKindSchema = z.enum(['normalize-video', 'analyze-audio', 'render']);
export const RenderJobSchema = z.object({
  id: z.string().min(1),
  kind: JobKindSchema,
  status: JobStatusSchema,
  projectId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  snapshot: ProjectDocumentSchema.nullable(),
  progress: z.number().min(0).max(1),
  outputStorageKey: z.string().nullable(),
  thumbnailStorageKey: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime({offset: true}),
  updatedAt: z.string().datetime({offset: true}),
  completedAt: z.string().datetime({offset: true}).nullable(),
});
export type RenderJob = z.infer<typeof RenderJobSchema>;

export const RemoteAssetRefSchema = z.object({
  objectPath: z.string().min(1).max(500),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().nonnegative().max(1024 * 1024 * 1024),
});
export type RemoteAssetRef = z.infer<typeof RemoteAssetRefSchema>;

export const RemoteOverlayRefSchema = RemoteAssetRefSchema.extend({
  role: LayerRoleSchema,
});
export type RemoteOverlayRef = z.infer<typeof RemoteOverlayRefSchema>;

export const RemoteReelRequestSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(100),
  motionTemplateId: z.string().min(1).max(100),
  globalStrength: z.number().min(0).max(2),
  background: RemoteAssetRefSchema,
  overlays: z.array(RemoteOverlayRefSchema).min(1).max(12),
  texts: z.array(z.string().trim().max(160)).max(3),
  bgm: RemoteAssetRefSchema.nullable(),
  useWorkerDefaultBgm: z.boolean(),
});
export type RemoteReelRequestV1 = z.infer<typeof RemoteReelRequestSchema>;

export function assertRemoteRequestOwnership(requestValue: unknown, userId: string): RemoteReelRequestV1 {
  const request = RemoteReelRequestSchema.parse(requestValue);
  const prefix = `${userId}/inputs/`;
  const refs = [request.background, ...request.overlays, ...(request.bgm ? [request.bgm] : [])];
  if (refs.some((ref) => !ref.objectPath.startsWith(prefix) || ref.objectPath.includes('..'))) {
    throw new Error('素材の保存場所を確認できませんでした。');
  }
  return request;
}

export const RemoteReelJobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed']);
export type RemoteReelJobStatus = z.infer<typeof RemoteReelJobStatusSchema>;

export const RemoteReelJobSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  status: RemoteReelJobStatusSchema,
  request: RemoteReelRequestSchema,
  progress: z.number().min(0).max(1),
  workerId: z.string().nullable(),
  outputObjectPath: z.string().nullable(),
  thumbnailObjectPath: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime({offset: true}),
  updatedAt: z.string().datetime({offset: true}),
  completedAt: z.string().datetime({offset: true}).nullable(),
});
export type RemoteReelJob = z.infer<typeof RemoteReelJobSchema>;

export type ResolvedAsset = AssetRecord & {src: string};
export type RenderableProject = {
  project: ProjectDocumentV1;
  template: MotionTemplateV1;
  background: ResolvedAsset | null;
  imageAssets: Record<string, ResolvedAsset>;
  bgm: (BgmTrack & {src: string}) | null;
};

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createDefaultProject(motionTemplateId = 'motion-soft'): ProjectDocumentV1 {
  const now = nowIso();
  return {
    schemaVersion: 1,
    id: createId('project'),
    title: '新しいリール',
    canvas: {...CANVAS},
    background: {assetId: null, fit: 'cover', trimStartMs: 0, strength: 1},
    layers: [],
    motionTemplateId,
    globalStrength: 1,
    bgm: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createImageLayer(assetId: string, index: number): ImageLayer {
  return {
    id: createId('layer'),
    type: 'image',
    assetId,
    name: `素材 ${index + 1}`,
    slotName: `main-${index + 1}`,
    role: index === 0 ? 'primary' : 'decoration',
    zIndex: 10 + index,
    startFrame: 0,
    endFrame: CANVAS.durationFrames,
    strength: 1,
    transform: {x: 0.5, y: 0.57, width: index === 0 ? 0.56 : 0.28, rotation: 0},
  };
}

export function createTextLayer(index: number): TextLayer {
  return {
    id: createId('text'),
    type: 'text',
    role: 'text',
    name: `テキスト ${index + 1}`,
    slotName: `text-${index + 1}`,
    text: '',
    zIndex: 100 + index,
    startFrame: 0,
    endFrame: CANVAS.durationFrames,
    strength: 1,
    transform: {x: 0.5, y: 0.2 + index * 0.1, width: 0.78, rotation: 0},
    style: {
      fontSize: 72,
      color: '#4c3d34',
      backgroundColor: '#ffffff00',
      fontWeight: '700',
      align: 'center',
    },
  };
}
