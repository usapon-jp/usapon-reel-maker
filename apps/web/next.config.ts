import type {NextConfig} from 'next';
import {loadEnvConfig} from '@next/env';
import {resolve} from 'node:path';

const monorepoRoot = resolve(process.cwd(), '../..');
loadEnvConfig(monorepoRoot);

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  outputFileTracingExcludes: {
    '/api/**': [
      '.next/node_modules/@remotion*',
      '.next/node_modules/better-sqlite3-*',
      '.next/node_modules/ffmpeg-static-*',
      '.next/node_modules/ffprobe-static-*',
      '.next/node_modules/sharp-*',
      '../../node_modules/@remotion/bundler/**/*',
      '../../node_modules/@remotion/renderer/**/*',
      '../../node_modules/better-sqlite3/**/*',
      '../../node_modules/ffmpeg-static/**/*',
      '../../node_modules/ffprobe-static/**/*',
      '../../node_modules/sharp/**/*',
    ],
  },
  transpilePackages: ['@usapon-reel/core', '@usapon-reel/local', '@usapon-reel/renderer'],
  serverExternalPackages: [
    '@remotion/bundler',
    '@remotion/renderer',
    'ffmpeg-static',
    'ffprobe-static',
    'sharp',
  ],
};

export default nextConfig;
