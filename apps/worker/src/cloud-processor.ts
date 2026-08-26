import {createServer, type Server} from 'node:http';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, readFile, rm, stat} from 'node:fs/promises';
import {basename, extname, join} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {
  BUILTIN_MOTION_TEMPLATES,
  RemoteReelJobSchema,
  assertRemoteRequestOwnership,
  autoLayoutProject,
  createDefaultProject,
  createId,
  createImageLayer,
  createTextLayer,
  nowIso,
  type AssetRecord,
  type BgmTrack,
  type RemoteAssetRef,
  type RemoteReelJob,
  type RenderableProject,
} from '@usapon-reel/core';
import {
  LocalBlobStorage,
  LocalDatabase,
  getDataPaths,
  inspectImage,
  normalizeVideo,
  probeMedia,
  remuxFastStart,
  sha256,
} from '@usapon-reel/local';
import {RemotionRenderEngine} from '@usapon-reel/renderer/server';
import {analyzeAudioFile} from './audio-analyzer';

const BUCKET = 'reel-private';

type RemoteJobRow = {
  id: string;
  user_id: string;
  status: string;
  request: unknown;
  progress: number;
  worker_id: string | null;
  output_object_path: string | null;
  thumbnail_object_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function fromRow(row: RemoteJobRow): RemoteReelJob {
  return RemoteReelJobSchema.parse({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    request: row.request,
    progress: row.progress,
    workerId: row.worker_id,
    outputObjectPath: row.output_object_path,
    thumbnailObjectPath: row.thumbnail_object_path,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  });
}

function safeExtension(name: string): string {
  return extname(basename(name)).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
}

async function writeResponseToFile(response: Response, target: string): Promise<void> {
  if (!response.ok || !response.body) throw new Error(`素材を取得できませんでした (${response.status})`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(target));
}

type ServedFile = {path: string; mimeType: string};

async function startFileServer(files: Map<string, ServedFile>): Promise<{baseUrl: string; close: () => Promise<void>}> {
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const file = files.get(pathname);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    void stat(file.path).then((info) => {
      const range = request.headers.range;
      response.setHeader('Content-Type', file.mimeType);
      response.setHeader('Accept-Ranges', 'bytes');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match) {
          const start = match[1] ? Number(match[1]) : 0;
          const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
          if (start <= end && end < info.size) {
            response.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${info.size}`,
              'Content-Length': end - start + 1,
            });
            createReadStream(file.path, {start, end}).pipe(response);
            return;
          }
        }
      }
      response.setHeader('Content-Length', info.size);
      createReadStream(file.path).pipe(response);
    }).catch(() => response.writeHead(500).end());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('素材サーバーを起動できませんでした。');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function assetRecord(input: {
  id: string;
  ref: RemoteAssetRef;
  checksum: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  visibleBounds?: AssetRecord['visibleBounds'];
  kind: AssetRecord['kind'];
}): AssetRecord {
  return {
    id: input.id,
    kind: input.kind,
    status: 'ready',
    originalName: input.ref.originalName,
    mimeType: input.ref.mimeType,
    size: input.ref.size,
    checksum: input.checksum,
    storageKey: input.ref.objectPath,
    proxyStorageKey: null,
    width: input.width,
    height: input.height,
    durationMs: input.durationMs,
    visibleBounds: input.visibleBounds ?? null,
    error: null,
    createdAt: nowIso(),
  };
}

export class CloudJobProcessor {
  private readonly client: SupabaseClient;
  private readonly workerId: string;
  private readonly renderer: RemotionRenderEngine;

  static fromEnvironment(input: {database: LocalDatabase; storage: LocalBlobStorage; renderer: RemotionRenderEngine}): CloudJobProcessor | null {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) return null;
    return new CloudJobProcessor({
      client: createClient(url, serviceRoleKey, {auth: {persistSession: false, autoRefreshToken: false}}),
      workerId: process.env.USAPON_REEL_WORKER_ID ?? `mac-${process.pid}`,
      ...input,
    });
  }

  constructor(input: {
    client: SupabaseClient;
    workerId: string;
    database: LocalDatabase;
    storage: LocalBlobStorage;
    renderer: RemotionRenderEngine;
  }) {
    this.client = input.client;
    this.workerId = input.workerId;
    this.renderer = input.renderer;
    this.localDatabase = input.database;
    this.localStorage = input.storage;
  }

  private readonly localDatabase: LocalDatabase;
  private readonly localStorage: LocalBlobStorage;

  async processNext(): Promise<boolean> {
    const {data, error} = await this.client.rpc('claim_remote_reel_job', {p_worker_id: this.workerId});
    if (error) throw new Error(`クラウドジョブを取得できません: ${error.message}`);
    const row = (data as RemoteJobRow[] | null)?.[0];
    if (!row) return false;
    const job = fromRow(row);
    try {
      await this.render(job);
    } catch (error) {
      await this.update(job.id, {
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
        completed_at: nowIso(),
      });
    }
    return true;
  }

  private async update(id: string, values: Record<string, unknown>): Promise<void> {
    const {error} = await this.client
      .from('remote_reel_jobs')
      .update({...values, updated_at: nowIso(), worker_heartbeat_at: nowIso()})
      .eq('id', id)
      .eq('worker_id', this.workerId)
      .eq('status', 'processing');
    if (error) throw new Error(`生成状態を保存できません: ${error.message}`);
  }

  private async download(ref: RemoteAssetRef, target: string): Promise<void> {
    const {data, error} = await this.client.storage.from(BUCKET).createSignedUrl(ref.objectPath, 3600);
    if (error || !data?.signedUrl) throw new Error(`素材を読み出せません: ${error?.message ?? ref.originalName}`);
    await writeResponseToFile(await fetch(data.signedUrl), target);
  }

  private async render(job: RemoteReelJob): Promise<void> {
    const request = assertRemoteRequestOwnership(job.request, job.userId);
    const tempRoot = join(getDataPaths().temp, `remote-${job.id}`);
    await mkdir(tempRoot, {recursive: true});
    const serverFiles = new Map<string, ServedFile>();
    let fileServer: Awaited<ReturnType<typeof startFileServer>> | null = null;
    try {
      const backgroundOriginal = join(tempRoot, `background${safeExtension(request.background.originalName)}`);
      await this.download(request.background, backgroundOriginal);
      await this.update(job.id, {progress: 0.08});

      let backgroundPath = backgroundOriginal;
      let backgroundMime = request.background.mimeType;
      let backgroundProbe: {width: number | null; height: number | null; durationMs: number | null};
      let backgroundVisible: AssetRecord['visibleBounds'] = null;
      if (request.background.mimeType.startsWith('video/')) {
        backgroundPath = join(tempRoot, 'background-proxy.mp4');
        backgroundProbe = await normalizeVideo(backgroundOriginal, backgroundPath);
        backgroundMime = 'video/mp4';
      } else {
        const inspected = await inspectImage(backgroundOriginal);
        backgroundProbe = {...inspected, durationMs: null};
        backgroundVisible = inspected.visibleBounds;
      }

      const overlayInputs = await Promise.all(request.overlays.map(async (overlay, index) => {
        const path = join(tempRoot, `overlay-${index}.png`);
        await this.download(overlay, path);
        const inspected = await inspectImage(path);
        return {overlay, path, inspected};
      }));
      await this.update(job.id, {progress: 0.16});

      let audioPath: string | null = null;
      let audioRef = request.bgm;
      if (audioRef) {
        audioPath = join(tempRoot, `bgm${safeExtension(audioRef.originalName)}`);
        await this.download(audioRef, audioPath);
      } else if (request.useWorkerDefaultBgm) {
        const configured = process.env.USAPON_REEL_DEFAULT_BGM_PATH;
        const defaultTrack = this.localDatabase.listBgm().find((track) => track.status === 'ready');
        const defaultAsset = defaultTrack ? this.localDatabase.getAsset(defaultTrack.assetId) : null;
        if (configured) {
          audioPath = configured;
          const data = await readFile(configured);
          audioRef = {objectPath: 'worker/default-bgm', originalName: basename(configured), mimeType: 'audio/mpeg', size: data.byteLength};
        } else if (defaultAsset && defaultTrack) {
          audioPath = this.localStorage.resolvePath(defaultAsset.storageKey);
          audioRef = {objectPath: 'worker/default-bgm', originalName: defaultTrack.title, mimeType: defaultAsset.mimeType, size: defaultAsset.size};
        }
      }

      const backgroundId = createId('remote-bg');
      const backgroundAsset = assetRecord({
        id: backgroundId,
        ref: {...request.background, mimeType: backgroundMime},
        checksum: sha256(await readFile(backgroundPath)),
        width: backgroundProbe.width,
        height: backgroundProbe.height,
        durationMs: backgroundProbe.durationMs,
        visibleBounds: backgroundVisible,
        kind: 'background',
      });
      const overlayAssets = await Promise.all(overlayInputs.map(async ({overlay, path, inspected}) => assetRecord({
        id: createId('remote-overlay'),
        ref: overlay,
        checksum: sha256(await readFile(path)),
        width: inspected.width,
        height: inspected.height,
        durationMs: null,
        visibleBounds: inspected.visibleBounds,
        kind: 'overlay',
      })));

      const project = createDefaultProject(request.motionTemplateId);
      project.title = request.title;
      project.globalStrength = request.globalStrength;
      project.background.assetId = backgroundId;
      project.layers = overlayAssets.map((asset, index) => ({
        ...createImageLayer(asset.id, index),
        role: request.overlays[index].role,
      }));
      project.layers.push(...request.texts.filter(Boolean).map((text, index) => ({...createTextLayer(index), text})));
      const laidOut = autoLayoutProject(project, Object.fromEntries(overlayAssets.map((asset) => [asset.id, {
        width: asset.width ?? 1,
        height: asset.height ?? 1,
        visibleBounds: asset.visibleBounds,
      }])));

      let bgm: RenderableProject['bgm'] = null;
      if (audioPath && audioRef) {
        const analysis = await analyzeAudioFile(audioPath);
        const audioId = createId('remote-audio');
        const track: BgmTrack = {
          id: createId('remote-track'),
          assetId: audioId,
          title: audioRef.originalName,
          status: 'ready',
          durationMs: analysis.durationMs,
          bpm: analysis.bpm,
          beatPositionsMs: analysis.beatPositionsMs,
          confidence: analysis.confidence,
          peakDb: analysis.peakDb,
          rmsDb: analysis.rmsDb,
          firstBeatOffsetMs: analysis.beatPositionsMs[0] ?? 0,
          analysisWarning: analysis.warning,
          tags: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        laidOut.bgm = {trackId: track.id, trimStartMs: 0, volume: 1};
        bgm = {...track, src: ''};
      }

      serverFiles.set('/background', {path: backgroundPath, mimeType: backgroundMime});
      overlayInputs.forEach(({path}, index) => serverFiles.set(`/overlay-${index}`, {path, mimeType: 'image/png'}));
      if (audioPath) serverFiles.set('/bgm', {path: audioPath, mimeType: audioRef?.mimeType ?? 'audio/mpeg'});
      fileServer = await startFileServer(serverFiles);

      const template = BUILTIN_MOTION_TEMPLATES.find((item) => item.id === request.motionTemplateId);
      if (!template) throw new Error('選択した雰囲気テンプレートが見つかりません。');
      const renderable: RenderableProject = {
        project: laidOut,
        template,
        background: {...backgroundAsset, src: `${fileServer.baseUrl}/background`},
        imageAssets: Object.fromEntries(overlayAssets.map((asset, index) => [asset.id, {...asset, src: `${fileServer!.baseUrl}/overlay-${index}`}])) ,
        bgm: bgm ? {...bgm, src: `${fileServer.baseUrl}/bgm`} : null,
      };

      const renderedPath = join(tempRoot, 'rendered.mp4');
      const finalPath = join(tempRoot, 'reel.mp4');
      const thumbnailPath = join(tempRoot, 'thumbnail.jpg');
      let lastProgress = 0.18;
      await this.renderer.render(renderable, renderedPath, (progress) => {
        const next = 0.18 + progress * 0.7;
        if (next - lastProgress >= 0.03 || progress === 1) {
          lastProgress = next;
          void this.update(job.id, {progress: Math.min(0.88, next)}).catch(() => undefined);
        }
      });
      await remuxFastStart(renderedPath, finalPath);
      await this.renderer.thumbnail(renderable, thumbnailPath);
      await this.update(job.id, {progress: 0.92});

      const outputObjectPath = `${job.userId}/outputs/${job.id}.mp4`;
      const thumbnailObjectPath = `${job.userId}/outputs/${job.id}.jpg`;
      const [outputUpload, thumbnailUpload] = await Promise.all([
        this.client.storage.from(BUCKET).upload(outputObjectPath, await readFile(finalPath), {contentType: 'video/mp4', upsert: false}),
        this.client.storage.from(BUCKET).upload(thumbnailObjectPath, await readFile(thumbnailPath), {contentType: 'image/jpeg', upsert: false}),
      ]);
      if (outputUpload.error) throw new Error(`完成動画を保存できません: ${outputUpload.error.message}`);
      if (thumbnailUpload.error) throw new Error(`サムネイルを保存できません: ${thumbnailUpload.error.message}`);
      await this.update(job.id, {
        status: 'completed',
        progress: 1,
        output_object_path: outputObjectPath,
        thumbnail_object_path: thumbnailObjectPath,
        completed_at: nowIso(),
        error: null,
      });
    } finally {
      await fileServer?.close().catch(() => undefined);
      await rm(tempRoot, {recursive: true, force: true});
    }
  }
}
