import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
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
