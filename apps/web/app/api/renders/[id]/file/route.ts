import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    const {database, storage} = getRuntime();
    const job = database.getJob(id);
    const thumbnail = new URL(request.url).searchParams.get('kind') === 'thumbnail';
    const storageKey = thumbnail ? job?.thumbnailStorageKey : job?.outputStorageKey;
    if (!job || !storageKey) return errorResponse(new Error('完成ファイルが見つかりません。'), 404);
    const path = storage.resolvePath(storageKey);
    const info = await stat(path);
    const range = request.headers.get('range');
    const headers = new Headers({
      'Content-Type': thumbnail ? 'image/jpeg' : 'video/mp4',
      'Content-Length': String(info.size),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': thumbnail ? 'inline' : `inline; filename="usapon-reel-${id}.mp4"`,
      'Cache-Control': 'private, max-age=3600',
    });
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (!match) return new Response(null, {status: 416});
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(Readable.toWeb(createReadStream(path, {start, end})) as ReadableStream, {status: 206, headers});
    }
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {headers});
  } catch (error) {
    return errorResponse(error, 500);
  }
}
