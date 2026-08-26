import {BgmTrackSchema} from '@usapon-reel/core';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

function beatGrid(bpm: number, durationMs: number, firstBeatOffsetMs: number): number[] {
  const values: number[] = [];
  const interval = 60_000 / bpm;
  for (let value = firstBeatOffsetMs; value < durationMs; value += interval) values.push(Math.round(value));
  return values;
}

export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    const {database} = getRuntime();
    const current = database.getBgm(id);
    if (!current) return errorResponse(new Error('BGMが見つかりません。'), 404);
    const body = (await request.json()) as Partial<{title: string; bpm: number; firstBeatOffsetMs: number; tags: string[]}>;
    const bpm = body.bpm ?? current.bpm;
    const firstBeatOffsetMs = body.firstBeatOffsetMs ?? current.firstBeatOffsetMs;
    const next = BgmTrackSchema.parse({
      ...current,
      ...(body.title !== undefined ? {title: body.title} : {}),
      ...(body.tags !== undefined ? {tags: body.tags} : {}),
      bpm,
      firstBeatOffsetMs,
      beatPositionsMs:
        bpm && current.durationMs
          ? beatGrid(bpm, current.durationMs, firstBeatOffsetMs)
          : current.beatPositionsMs,
    });
    return Response.json({track: database.saveBgm(next)});
  } catch (error) {
    return errorResponse(error);
  }
}
