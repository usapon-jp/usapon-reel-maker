declare module 'essentia.js' {
  export const EssentiaWASM: unknown;
  export class Essentia {
    constructor(module: unknown);
    arrayToVector(input: Float32Array): {delete(): void};
    vectorToArray(input: {delete(): void}): Float32Array;
    RhythmExtractor2013(
      input: {delete(): void},
      maxTempo?: number,
      method?: 'multifeature' | 'degara',
      minTempo?: number,
    ): {
      bpm: number;
      confidence: number;
      ticks: {delete(): void};
      estimates: {delete(): void};
      bpmIntervals: {delete(): void};
    };
  }
}
