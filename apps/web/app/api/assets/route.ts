import {AssetKindSchema} from '@usapon-reel/core';
import {createManagedAsset} from '@usapon-reel/local';
import {createJob} from '@/src/server/jobs';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BACKGROUND_BYTES = 1024 * 1024 * 1024;
const MAX_OVERLAY_BYTES = 100 * 1024 * 1024;

function validateFile(kind: 'background' | 'overlay', file: File): void {
  const allowed = kind === 'background'
    ? ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
    : ['image/png'];
  if (!allowed.includes(file.type)) throw new Error(kind === 'background' ? '背景はJPG、PNG、MOV、MP4を選んでください。' : 'メイン素材は透過PNGを選んでください。');
  const max = kind === 'background' ? MAX_BACKGROUND_BYTES : MAX_OVERLAY_BYTES;
  if (file.size > max) throw new Error(`ファイルサイズが上限 ${Math.round(max / 1024 / 1024)}MB を超えています。`);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const kind = AssetKindSchema.extract(['background', 'overlay']).parse(form.get('kind'));
    if (!(file instanceof File)) throw new Error('素材ファイルを選んでください。');
    validateFile(kind, file);
    const {database, storage} = getRuntime();
    const asset = await createManagedAsset({
      storage,
      kind,
      originalName: file.name,
      mimeType: file.type,
      data: new Uint8Array(await file.arrayBuffer()),
    });
    database.createAsset(asset);
    let job = null;
    if (asset.status === 'processing') {
      job = createJob('normalize-video', {payload: {assetId: asset.id}});
      database.enqueue(job);
    }
    return Response.json({asset, job}, {status: 201});
  } catch (error) {
    return errorResponse(error);
  }
}
