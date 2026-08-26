import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

const output = resolve(process.argv[2] ?? '/private/tmp/usapon-reel-fixtures');
mkdirSync(output, {recursive: true});

const width = 720;
const height = 1280;
const pixels = Buffer.alloc(width * height * 3);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 3;
    const mix = y / height;
    pixels[offset] = Math.round(249 - mix * 20);
    pixels[offset + 1] = Math.round(232 - mix * 8);
    pixels[offset + 2] = Math.round(215 + mix * 18);
  }
}
await sharp(pixels, {raw: {width, height, channels: 3}}).jpeg({quality: 90}).toFile(`${output}/background.jpg`);

const rabbitSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 700">
  <ellipse cx="350" cy="640" rx="180" ry="32" fill="#8a6652" opacity=".22"/>
  <ellipse cx="245" cy="150" rx="65" ry="155" fill="#fffaf4" stroke="#624d42" stroke-width="18" transform="rotate(-8 245 150)"/>
  <ellipse cx="455" cy="150" rx="65" ry="155" fill="#fffaf4" stroke="#624d42" stroke-width="18" transform="rotate(8 455 150)"/>
  <ellipse cx="350" cy="430" rx="225" ry="210" fill="#fffaf4" stroke="#624d42" stroke-width="18"/>
  <circle cx="275" cy="405" r="18" fill="#523f36"/><circle cx="425" cy="405" r="18" fill="#523f36"/>
  <path d="M320 475 Q350 510 380 475" fill="none" stroke="#e17870" stroke-width="16" stroke-linecap="round"/>
  <circle cx="222" cy="475" r="34" fill="#f2aaa1" opacity=".65"/><circle cx="478" cy="475" r="34" fill="#f2aaa1" opacity=".65"/>
</svg>`);
await sharp(rabbitSvg).png().toFile(`${output}/usapon.png`);

const logoSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 280">
  <rect x="15" y="15" width="870" height="250" rx="125" fill="#fffaf4" stroke="#ec785f" stroke-width="22"/>
  <text x="450" y="185" text-anchor="middle" font-family="sans-serif" font-size="120" font-weight="800" fill="#c95843">うさぽん</text>
</svg>`);
await sharp(logoSvg).png().toFile(`${output}/logo.png`);

function writeClickTrack(path: string, seconds = 30, sampleRate = 44_100): void {
  const samples = new Int16Array(seconds * sampleRate);
  for (let start = 0; start < samples.length; start += sampleRate / 2) {
    for (let index = 0; index < 800 && start + index < samples.length; index++) {
      const envelope = 1 - index / 800;
      samples[start + index] = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 880) * envelope * 24_000);
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
writeClickTrack(`${output}/test-bgm.wav`);

if (ffmpegPath) {
  const result = spawnSync(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=#ead6c7:s=720x1280:d=3:r=30',
    '-vf', 'drawbox=x=mod(t*90\\,720):y=160:w=180:h=180:color=#ec785f@0.8:t=fill',
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', `${output}/background.mov`,
  ], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr);
}

console.log(output);
