import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import type {RenderEngine, RenderableProject} from '@usapon-reel/core';

let bundlePromise: Promise<string> | null = null;

async function getBundle(): Promise<string> {
  if (!bundlePromise) {
    const entryPoint = fileURLToPath(new URL('./remotion-entry.tsx', import.meta.url));
    bundlePromise = bundle({
      entryPoint,
      enableCaching: true,
      onProgress: () => undefined,
    });
  }
  return bundlePromise;
}

export class RemotionRenderEngine implements RenderEngine {
  async render(input: RenderableProject, outputPath: string, onProgress: (progress: number) => void): Promise<void> {
    const serveUrl = await getBundle();
    const inputProps = {input};
    const composition = await selectComposition({
      serveUrl,
      id: 'UsaponReel',
      inputProps,
      logLevel: 'warn',
    });
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: 'h264',
      audioCodec: 'aac',
      audioBitrate: '192K',
      pixelFormat: 'yuv420p',
      colorSpace: 'bt709',
      imageFormat: 'png',
      crf: 18,
      x264Preset: 'medium',
      concurrency: 4,
      outputLocation: outputPath,
      overwrite: true,
      logLevel: 'warn',
      sampleRate: 48_000,
      onProgress: ({progress}) => onProgress(progress),
    });
  }

  async thumbnail(input: RenderableProject, outputPath: string): Promise<void> {
    const serveUrl = await getBundle();
    const inputProps = {input};
    const composition = await selectComposition({serveUrl, id: 'UsaponReel', inputProps, logLevel: 'warn'});
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      frame: 30,
      imageFormat: 'jpeg',
      jpegQuality: 85,
      output: outputPath,
      overwrite: true,
      logLevel: 'warn',
    });
  }
}

export function resetRendererBundleCache(): void {
  bundlePromise = null;
}
