import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import manifest from '../apps/web/app/manifest';

const PUBLIC_DIR = resolve(import.meta.dirname, '../apps/web/public');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ICONS = [
  ['reel-piyo-icon-32.png', 32],
  ['reel-piyo-icon-180.png', 180],
  ['reel-piyo-icon-192.png', 192],
  ['reel-piyo-icon-512.png', 512],
] as const;

describe('reel maker icons', () => {
  it.each(ICONS)('%s is a square PNG with the expected size', (filename, size) => {
    const png = readFileSync(resolve(PUBLIC_DIR, filename));
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  });

  it('uses the PNG icons for the PWA manifest', () => {
    expect(manifest().icons).toEqual([
      {src: '/reel-piyo-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: '/reel-piyo-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: '/reel-piyo-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ]);
  });

  it('does not leave the former SVG icon referenced by app surfaces', () => {
    const appFiles = [
      resolve(import.meta.dirname, '../apps/web/app/layout.tsx'),
      resolve(import.meta.dirname, '../apps/web/app/manifest.ts'),
      resolve(import.meta.dirname, '../apps/web/src/components/cloud-reel-maker.tsx'),
    ];
    const source = appFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toContain('/icon.svg');
    expect(source).toContain('/reel-piyo-icon-180.png');
    expect(source).toContain('/reel-piyo-icon-192.png');
  });
});
