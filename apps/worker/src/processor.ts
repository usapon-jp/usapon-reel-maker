import {mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {
  ProjectDocumentSchema,
  nowIso,
  type RenderJob,
} from '@usapon-reel/core';
import {
  LocalBlobStorage,
  LocalDatabase,
  copyAsManagedOutput,
  normalizeVideo,
  remuxFastStart,
  resolveRenderableProject,
} from '@usapon-reel/local';
import {RemotionRenderEngine} from '@usapon-reel/renderer/server';
import {analyzeAudioFile} from './audio-analyzer';

export class JobProcessor {
  readonly database: LocalDatabase;
  readonly storage: LocalBlobStorage;
  readonly renderer: RemotionRenderEngine;

  constructor(input?: {database?: LocalDatabase; storage?: LocalBlobStorage; renderer?: RemotionRenderEngine}) {
    this.database = input?.database ?? new LocalDatabase();
    this.storage = input?.storage ?? new LocalBlobStorage();
    this.renderer = input?.renderer ?? new RemotionRenderEngine();
  }

  async initialize(): Promise<void> {
    await this.storage.initialize();
    this.database.resetInterruptedJobs();
  }

  async processNext(): Promise<boolean> {
    const job = this.database.claimNext();
    if (!job) return false;
    try {
      if (job.kind === 'normalize-video') await this.normalize(job);
      if (job.kind === 'analyze-audio') await this.analyze(job);
      if (job.kind === 'render') await this.render(job);
      return true;
    } catch (error) {
      const current = this.database.getJob(job.id) ?? job;
      this.database.updateJob({
        ...current,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: nowIso(),
      });
      const assetId = typeof job.payload.assetId === 'string' ? job.payload.assetId : null;
      if (assetId) {
        const asset = this.database.getAsset(assetId);
        if (asset) this.database.updateAsset({...asset, status: 'failed', error: error instanceof Error ? error.message : String(error)});
      }
      return true;
    }
  }

  private complete(job: RenderJob, updates: Partial<RenderJob> = {}): RenderJob {
    return this.database.updateJob({
      ...job,
      ...updates,
      status: 'completed',
      progress: 1,
      error: null,
      completedAt: nowIso(),
    });
  }

  private async normalize(job: RenderJob): Promise<void> {
    const assetId = String(job.payload.assetId ?? '');
    const asset = this.database.getAsset(assetId);
    if (!asset) throw new Error('変換対象の動画が見つかりません。');
    await mkdir(this.storage.paths.temp, {recursive: true});
    const tempPath = join(this.storage.paths.temp, `${job.id}.mp4`);
    try {
      const result = await normalizeVideo(this.storage.resolvePath(asset.storageKey), tempPath);
      const proxyStorageKey = await copyAsManagedOutput(this.storage, 'proxy', tempPath, `${asset.id}.mp4`);
      this.database.updateAsset({
        ...asset,
        status: 'ready',
        proxyStorageKey,
        width: result.width,
        height: result.height,
        durationMs: result.durationMs,
        error: null,
      });
      this.complete(job);
    } finally {
      await rm(tempPath, {force: true});
    }
  }

  private async analyze(job: RenderJob): Promise<void> {
    const assetId = String(job.payload.assetId ?? '');
    const trackId = String(job.payload.trackId ?? '');
    const asset = this.database.getAsset(assetId);
    const track = this.database.getBgm(trackId);
    if (!asset || !track) throw new Error('解析対象のBGMが見つかりません。');
    const result = await analyzeAudioFile(this.storage.resolvePath(asset.storageKey));
    this.database.updateAsset({...asset, status: 'ready', durationMs: result.durationMs, error: null});
    this.database.saveBgm({
      ...track,
      status: 'ready',
      durationMs: result.durationMs,
      bpm: result.bpm,
      beatPositionsMs: result.beatPositionsMs,
      confidence: result.confidence,
      peakDb: result.peakDb,
      rmsDb: result.rmsDb,
      firstBeatOffsetMs: result.beatPositionsMs[0] ?? 0,
      analysisWarning: result.warning,
    });
    this.complete(job);
  }

  private async render(job: RenderJob): Promise<void> {
    if (!job.snapshot) throw new Error('レンダー用スナップショットがありません。');
    const project = ProjectDocumentSchema.parse(job.snapshot);
    const input = resolveRenderableProject(this.database, project);
    const requiredAssets = [input.background, ...Object.values(input.imageAssets)].filter(Boolean);
    if (requiredAssets.some((asset) => asset!.status !== 'ready')) throw new Error('処理中または失敗した素材があります。');
    if (input.bgm && input.bgm.status !== 'ready') throw new Error('BGMの解析が完了していません。');
    await mkdir(this.storage.paths.temp, {recursive: true});
    const renderedPath = join(this.storage.paths.temp, `${job.id}-render.mp4`);
    const finalPath = join(this.storage.paths.temp, `${job.id}.mp4`);
    const thumbnailPath = join(this.storage.paths.temp, `${job.id}.jpg`);
    let lastProgress = 0;
    try {
      await this.renderer.render(input, renderedPath, (progress) => {
        if (progress - lastProgress >= 0.01 || progress === 1) {
          lastProgress = progress;
          const current = this.database.getJob(job.id) ?? job;
          this.database.updateJob({...current, progress: Math.min(0.94, progress * 0.94)});
        }
      });
      await remuxFastStart(renderedPath, finalPath);
      await this.renderer.thumbnail(input, thumbnailPath);
      const outputStorageKey = await copyAsManagedOutput(this.storage, 'output', finalPath, `${job.id}.mp4`);
      const thumbnailStorageKey = await copyAsManagedOutput(this.storage, 'thumbnail', thumbnailPath, `${job.id}.jpg`);
      const current = this.database.getJob(job.id) ?? job;
      this.complete(current, {outputStorageKey, thumbnailStorageKey});
    } finally {
      await Promise.all([
        rm(renderedPath, {force: true}),
        rm(finalPath, {force: true}),
        rm(thumbnailPath, {force: true}),
      ]);
    }
  }
}
