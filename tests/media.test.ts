import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import {afterAll, describe, expect, it} from 'vitest';
import {LocalBlobStorage, createManagedAsset, getDataPaths, normalizeVideo} from '@usapon-reel/local';
import {analyzeAudioFile} from '../apps/worker/src/audio-analyzer';

const root = mkdtempSync(join(tmpdir(), 'usapon-reel-media-'));
afterAll(() => rmSync(root, {recursive: true, force: true}));

function writeClickTrack(path: string, seconds = 8, sampleRate = 44_100): void {
  const sampleCount = seconds * sampleRate;
  const samples = new Int16Array(sampleCount);
  for (let start = 0; start < sampleCount; start += sampleRate / 2) {
    for (let index = 0; index < 600 && start + index < sampleCount; index++) {
      const envelope = 1 - index / 600;
      samples[start + index] = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 1000) * envelope * 28_000);
    }
  }
  const buffer = Buffer.alloc(44 + samples.byteLength);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples.byteLength, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.byteLength, 40);
  for (let index = 0; index < samples.length; index++) buffer.writeInt16LE(samples[index], 44 + index * 2);
  writeFileSync(path, buffer);
}

describe('media import and analysis', () => {
  it('reads PNG dimensions and visible alpha bounds without changing the source', async () => {
    const image = await sharp({create: {width: 100, height: 100, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
      .composite([{input: {create: {width: 40, height: 30, channels: 4, background: {r: 220, g: 90, b: 80, alpha: 1}}}, left: 20, top: 25}])
      .png()
      .toBuffer();
    const storage = new LocalBlobStorage(getDataPaths(root));
    const asset = await createManagedAsset({storage, kind: 'overlay', originalName: 'rabbit.png', mimeType: 'image/png', data: image});
    expect(asset.status).toBe('ready');
    expect(asset.width).toBe(100);
    expect(asset.height).toBe(100);
    expect(asset.visibleBounds).toMatchObject({width: 40, height: 30});
  });

  it('extracts duration, loudness and a reusable beat grid', async () => {
    const path = join(root, 'click-track.wav');
    writeClickTrack(path);
    const result = await analyzeAudioFile(path);
    expect(result.durationMs).toBeGreaterThanOrEqual(7_900);
    expect(result.bpm).not.toBeNull();
    expect(result.beatPositionsMs.length).toBeGreaterThan(6);
    expect(result.peakDb).not.toBeNull();
    expect(result.rmsDb).not.toBeNull();
  }, 30_000);

  it('converts a MOV background to a muted browser-compatible H.264 proxy', async () => {
    expect(ffmpegPath).toBeTruthy();
    const source = join(root, 'background.mov');
    const proxy = join(root, 'background-proxy.mp4');
    const generated = spawnSync(ffmpegPath!, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=lightskyblue:size=180x320:duration=1',
      '-an',
      '-c:v',
      'libx264',
      source,
    ]);
    expect(generated.status).toBe(0);
    const result = await normalizeVideo(source, proxy);
    expect(result).toMatchObject({width: 180, height: 320, codec: 'h264'});
    expect(result.durationMs).toBeGreaterThanOrEqual(900);
  }, 30_000);
});
