import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import sharp from 'sharp';
import {
  AssetRecordSchema,
  createId,
  nowIso,
  type AssetKind,
  type AssetRecord,
  type VisibleBoundsSchema,
} from '@usapon-reel/core';
import type {z} from 'zod';
import {LocalBlobStorage, sha256} from './storage';

export type ProbeResult = {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  codec: string | null;
};

function runProcess(command: string, args: string[], collectStdout = true): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', collectStdout ? 'pipe' : 'ignore', 'pipe']});
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout?.on('data', (chunk) => output.push(Buffer.from(chunk)));
    child.stderr?.on('data', (chunk) => errors.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(Buffer.concat(output));
      else reject(new Error(Buffer.concat(errors).toString('utf8').slice(-4000) || `media process exited ${code}`));
    });
  });
}

export async function probeMedia(path: string): Promise<ProbeResult> {
  const output = await runProcess(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]);
  const parsed = JSON.parse(output.toString('utf8')) as {
    streams?: Array<{codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string}>;
    format?: {duration?: string};
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const duration = Number(video?.duration ?? parsed.format?.duration ?? 0);
  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    durationMs: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : null,
    codec: video?.codec_name ?? null,
  };
}

export async function inspectImage(path: string): Promise<{
  width: number;
  height: number;
  visibleBounds: z.infer<typeof VisibleBoundsSchema> | null;
}> {
  const image = sharp(path, {animated: false});
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('画像サイズを取得できませんでした。');
  let visibleBounds: z.infer<typeof VisibleBoundsSchema> | null = null;
  if (metadata.hasAlpha) {
    const {info} = await sharp(path).trim({background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer({resolveWithObject: true});
    visibleBounds = {
      x: Math.max(0, -(info.trimOffsetLeft ?? 0)),
      y: Math.max(0, -(info.trimOffsetTop ?? 0)),
      width: info.width,
      height: info.height,
    };
  }
  return {width: metadata.width, height: metadata.height, visibleBounds};
}

export async function createManagedAsset(input: {
  storage: LocalBlobStorage;
  kind: AssetKind;
  originalName: string;
  mimeType: string;
  data: Uint8Array;
}): Promise<AssetRecord> {
  const stored = await input.storage.put(input.kind, input.originalName, input.data);
  const isImage = input.kind !== 'audio' && /^image\//.test(input.mimeType);
  const isVideo = input.kind === 'background' && /^video\//.test(input.mimeType);
  let width: number | null = null;
  let height: number | null = null;
  let durationMs: number | null = null;
  let visibleBounds: z.infer<typeof VisibleBoundsSchema> | null = null;
  let status: AssetRecord['status'] = isVideo || input.kind === 'audio' ? 'processing' : 'ready';
  try {
    if (isImage) ({width, height, visibleBounds} = await inspectImage(input.storage.resolvePath(stored.storageKey)));
  } catch {
    status = 'failed';
  }
  return AssetRecordSchema.parse({
    id: createId('asset'),
    kind: input.kind,
    status,
    originalName: basename(input.originalName),
    mimeType: input.mimeType,
    size: stored.size,
    checksum: sha256(input.data),
    storageKey: stored.storageKey,
    proxyStorageKey: null,
    width,
    height,
    durationMs,
    visibleBounds,
    error: status === 'failed' ? '素材の内容を読み取れませんでした。' : null,
    createdAt: nowIso(),
  });
}

export async function normalizeVideo(inputPath: string, outputPath: string): Promise<ProbeResult> {
  if (!ffmpegPath) throw new Error('FFmpegが利用できません。');
  await runProcess(
    ffmpegPath,
    [
      '-y',
      '-i',
      inputPath,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    false,
  );
  return probeMedia(outputPath);
}

export async function remuxFastStart(inputPath: string, outputPath: string): Promise<void> {
  if (!ffmpegPath) throw new Error('FFmpegが利用できません。');
  await runProcess(ffmpegPath, [
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-t',
    '30',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    outputPath,
  ], false);
}

export async function decodeAudioToFloat32(inputPath: string, maxSeconds = 300): Promise<Float32Array> {
  if (!ffmpegPath) throw new Error('FFmpegが利用できません。');
  const output = await runProcess(ffmpegPath, [
    '-v',
    'error',
    '-i',
    inputPath,
    '-t',
    String(maxSeconds),
    '-ac',
    '1',
    '-ar',
    '44100',
    '-f',
    'f32le',
    'pipe:1',
  ]);
  return new Float32Array(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength));
}

export function analyzeVolume(samples: Float32Array): {peakDb: number | null; rmsDb: number | null} {
  if (samples.length === 0) return {peakDb: null, rmsDb: null};
  let peak = 0;
  let squares = 0;
  for (const value of samples) {
    const absolute = Math.abs(value);
    peak = Math.max(peak, absolute);
    squares += value * value;
  }
  const rms = Math.sqrt(squares / samples.length);
  const toDb = (value: number) => (value > 0 ? 20 * Math.log10(value) : -Infinity);
  return {peakDb: Number.isFinite(toDb(peak)) ? toDb(peak) : null, rmsDb: Number.isFinite(toDb(rms)) ? toDb(rms) : null};
}

export async function copyAsManagedOutput(
  storage: LocalBlobStorage,
  kind: 'output' | 'thumbnail' | 'proxy',
  sourcePath: string,
  targetName: string,
): Promise<string> {
  const data = await readFile(sourcePath);
  return (await storage.put(kind, targetName, data)).storageKey;
}

export {ffmpegPath, ffprobe};
