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
    const asset = database.getAsset(id);
    if (!asset) return errorResponse(new Error('素材が見つかりません。'), 404);
    const original = new URL(request.url).searchParams.get('source') === 'original';
    const storageKey = original ? asset.storageKey : asset.proxyStorageKey ?? asset.storageKey;
    const path = storage.resolvePath(storageKey);
    const info = await stat(path);
    const range = request.headers.get('range');
    const mimeType = !original && asset.proxyStorageKey ? 'video/mp4' : asset.mimeType;
    const headers = new Headers({
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    });
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (!match) return new Response(null, {status: 416});
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      if (start >= info.size || end < start) return new Response(null, {status: 416});
      headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
      headers.set('Content-Length', String(end - start + 1));
      const body = Readable.toWeb(createReadStream(path, {start, end})) as ReadableStream;
      return new Response(body, {status: 206, headers});
    }
    headers.set('Content-Length', String(info.size));
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream;
    return new Response(body, {headers});
  } catch (error) {
    return errorResponse(error, 500);
  }
}
