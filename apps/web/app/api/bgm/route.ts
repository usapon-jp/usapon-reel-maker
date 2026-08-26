import {BgmTrackSchema, createId, nowIso} from '@usapon-reel/core';
import {createManagedAsset} from '@usapon-reel/local';
import {createJob} from '@/src/server/jobs';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav'];

export async function GET() {
  return Response.json({tracks: getRuntime().database.listBgm()});
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('音声ファイルを選んでください。');
    if (!AUDIO_TYPES.includes(file.type)) throw new Error('BGMはMP3、M4A、AAC、WAVを選んでください。');
    if (file.size > 200 * 1024 * 1024) throw new Error('BGMは200MB以下にしてください。');
    const {database, storage} = getRuntime();
    const asset = await createManagedAsset({
      storage,
      kind: 'audio',
      originalName: file.name,
      mimeType: file.type,
      data: new Uint8Array(await file.arrayBuffer()),
    });
    database.createAsset(asset);
    const now = nowIso();
    const track = BgmTrackSchema.parse({
      id: createId('bgm'),
      assetId: asset.id,
      title: file.name.replace(/\.[^.]+$/, ''),
      status: 'processing',
      durationMs: null,
      bpm: null,
      beatPositionsMs: [],
      confidence: null,
      peakDb: null,
      rmsDb: null,
      firstBeatOffsetMs: 0,
      analysisWarning: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    database.saveBgm(track);
    const job = createJob('analyze-audio', {payload: {assetId: asset.id, trackId: track.id}});
    database.enqueue(job);
    return Response.json({track, job}, {status: 201});
  } catch (error) {
    return errorResponse(error);
  }
}
