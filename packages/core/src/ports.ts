import type {
  AssetRecord,
  BgmTrack,
  MotionTemplateV1,
  ProjectDocumentV1,
  ReelTemplateV1,
  RenderJob,
  RenderableProject,
} from './types';

export interface BlobStorage {
  put(kind: string, originalName: string, data: Uint8Array): Promise<{storageKey: string; size: number}>;
  read(storageKey: string): Promise<Uint8Array>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
  resolvePath(storageKey: string): string;
}

export interface AssetRepository {
  create(asset: AssetRecord): AssetRecord;
  get(id: string): AssetRecord | null;
  list(kind?: AssetRecord['kind']): AssetRecord[];
  update(asset: AssetRecord): AssetRecord;
}

export interface ProjectRepository {
  create(project: ProjectDocumentV1): ProjectDocumentV1;
  get(id: string): ProjectDocumentV1 | null;
  list(): ProjectDocumentV1[];
  update(project: ProjectDocumentV1): ProjectDocumentV1;
  delete(id: string): void;
}

export interface MotionTemplateRepository {
  get(id: string): MotionTemplateV1 | null;
  list(): MotionTemplateV1[];
  save(template: MotionTemplateV1): MotionTemplateV1;
  delete(id: string): void;
}

export interface ReelTemplateRepository {
  get(id: string): ReelTemplateV1 | null;
  list(): ReelTemplateV1[];
  save(template: ReelTemplateV1): ReelTemplateV1;
  delete(id: string): void;
}

export interface BGMProvider {
  get(id: string): BgmTrack | null;
  list(): BgmTrack[];
  save(track: BgmTrack): BgmTrack;
}

export interface AudioAnalyzer {
  analyze(path: string): Promise<{
    durationMs: number;
    bpm: number | null;
    beatPositionsMs: number[];
    confidence: number | null;
    peakDb: number | null;
    rmsDb: number | null;
    warning: string | null;
  }>;
}

export interface RenderQueue {
  enqueue(job: RenderJob): RenderJob;
  claimNext(): RenderJob | null;
  update(job: RenderJob): RenderJob;
  get(id: string): RenderJob | null;
  list(kind?: RenderJob['kind']): RenderJob[];
}

export interface RenderEngine {
  render(input: RenderableProject, outputPath: string, onProgress: (progress: number) => void): Promise<void>;
  thumbnail(input: RenderableProject, outputPath: string): Promise<void>;
}
