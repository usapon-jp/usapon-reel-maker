import {createRequire} from 'node:module';
import {analyzeVolume, decodeAudioToFloat32, probeMedia} from '@usapon-reel/local';

type EssentiaResult = {
  bpm: number;
  confidence: number;
  ticks: {delete(): void};
  estimates: {delete(): void};
  bpmIntervals: {delete(): void};
};

let essentiaInstance:
  | {
      arrayToVector(input: Float32Array): {delete(): void};
      vectorToArray(input: {delete(): void}): Float32Array;
      RhythmExtractor2013(input: {delete(): void}, maxTempo: number, method: string, minTempo: number): EssentiaResult;
    }
  | null = null;

function getEssentia() {
  if (!essentiaInstance) {
    const require = createRequire(import.meta.url);
    const module = require('essentia.js') as {
      Essentia: new (wasm: unknown) => typeof essentiaInstance;
      EssentiaWASM: unknown;
    };
    essentiaInstance = new module.Essentia(module.EssentiaWASM);
  }
  return essentiaInstance!;
}

function regularBeatGrid(bpm: number, durationMs: number, firstBeatMs: number): number[] {
  if (!Number.isFinite(bpm) || bpm <= 0) return [];
  const interval = 60_000 / bpm;
  const beats: number[] = [];
  for (let value = Math.max(0, firstBeatMs); value < durationMs; value += interval) beats.push(Math.round(value));
  return beats;
}

export async function analyzeAudioFile(path: string) {
  const media = await probeMedia(path);
  const samples = await decodeAudioToFloat32(path);
  const volume = analyzeVolume(samples);
  const essentia = getEssentia();
  const vector = essentia.arrayToVector(samples);
  let result: EssentiaResult | null = null;
  try {
    result = essentia.RhythmExtractor2013(vector, 208, 'multifeature', 40);
    const rawTicks = Array.from(essentia.vectorToArray(result.ticks)).map((seconds) => Math.max(0, Math.round(seconds * 1000)));
    const durationMs = media.durationMs ?? Math.round((samples.length / 44_100) * 1000);
    const bpm = Number.isFinite(result.bpm) && result.bpm > 0 ? Math.round(result.bpm * 10) / 10 : null;
    const confidence = Number.isFinite(result.confidence) ? result.confidence : null;
    const lowConfidence = confidence === null || confidence < 0.2 || rawTicks.length < 2;
    const beatPositionsMs = lowConfidence && bpm
      ? regularBeatGrid(bpm, durationMs, rawTicks[0] ?? 0)
      : rawTicks;
    return {
      durationMs,
      bpm,
      beatPositionsMs,
      confidence,
      peakDb: volume.peakDb,
      rmsDb: volume.rmsDb,
      warning: lowConfidence ? 'ビート検出の信頼度が低いため、等間隔の拍を使用しています。BPMと先頭拍を確認してください。' : null,
    };
  } finally {
    vector.delete();
    result?.ticks.delete();
    result?.estimates.delete();
    result?.bpmIntervals.delete();
  }
}
