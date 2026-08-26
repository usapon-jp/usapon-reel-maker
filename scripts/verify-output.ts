import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import ffprobe from 'ffprobe-static';

type Stream = {
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  color_range?: string;
  color_space?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  nb_read_frames?: string;
  sample_rate?: string;
};

type Probe = {
  streams: Stream[];
  format: {duration?: string};
};

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const inputPath = process.argv[2];
requireValue(inputPath, '使い方: npm run verify:output -- /path/to/reel.mp4');

const result = spawnSync(ffprobe.path, [
  '-v',
  'error',
  '-count_frames',
  '-show_entries',
  'format=duration:stream=codec_name,profile,width,height,pix_fmt,color_range,color_space,r_frame_rate,avg_frame_rate,nb_read_frames,sample_rate',
  '-of',
  'json',
  inputPath,
], {encoding: 'utf8'});

requireValue(result.status === 0, result.stderr || 'ffprobeに失敗しました。');
const probe = JSON.parse(result.stdout) as Probe;
const video = probe.streams.find((stream) => stream.codec_name === 'h264');
const audio = probe.streams.find((stream) => stream.codec_name === 'aac');
const duration = Number(probe.format.duration);

requireValue(video, 'H.264映像がありません。');
requireValue(video.profile === 'High', `H.264 Highではありません: ${video.profile ?? '不明'}`);
requireValue(video.width === 1080 && video.height === 1920, `解像度が1080×1920ではありません: ${video.width}×${video.height}`);
requireValue(video.r_frame_rate === '30/1' && video.avg_frame_rate === '30/1', 'フレームレートが30fpsではありません。');
requireValue(video.nb_read_frames === '900', `映像が900フレームではありません: ${video.nb_read_frames ?? '不明'}`);
requireValue(video.pix_fmt === 'yuv420p', `pixel formatがyuv420pではありません: ${video.pix_fmt ?? '不明'}`);
requireValue(video.color_range === 'tv' && video.color_space === 'bt709', 'BT.709 limited-rangeではありません。');
requireValue(audio, 'AAC音声がありません。');
requireValue(audio.profile === 'LC', `AAC-LCではありません: ${audio.profile ?? '不明'}`);
requireValue(audio.sample_rate === '48000', `音声が48kHzではありません: ${audio.sample_rate ?? '不明'}`);
requireValue(Math.abs(duration - 30) <= 0.001, `長さが30.000秒ではありません: ${duration}`);

const bytes = readFileSync(inputPath);
const moov = bytes.indexOf(Buffer.from('moov'));
const mdat = bytes.indexOf(Buffer.from('mdat'));
requireValue(moov > 0 && mdat > 0 && moov < mdat, 'faststart用のmoov atomが先頭側にありません。');

console.log(JSON.stringify({
  ok: true,
  video: 'H.264 High / 1080x1920 / 30fps / 900 frames / yuv420p / BT.709',
  audio: 'AAC-LC / 48kHz',
  duration: `${duration.toFixed(3)}s`,
  faststart: true,
}, null, 2));
