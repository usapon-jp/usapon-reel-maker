'use client';

import * as tus from 'tus-js-client';
import type {RemoteAssetRef} from '@usapon-reel/core';
import {getCloudConfig, getSupabaseBrowserClient} from './supabase';

const BUCKET = 'reel-private';
const TUS_THRESHOLD = 6 * 1024 * 1024;

function extension(name: string): string {
  const match = /\.[a-z0-9]{1,8}$/i.exec(name);
  return match?.[0].toLowerCase() ?? '';
}

function normalizedMimeType(file: File): string {
  if (file.type) return file.type;
  const suffix = extension(file.name);
  return ({
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  } as Record<string, string>)[suffix] ?? 'application/octet-stream';
}

export function validateCloudFile(kind: 'background' | 'overlay' | 'audio', file: File): void {
  const mime = normalizedMimeType(file);
  const allowed = kind === 'background'
    ? ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
    : kind === 'overlay'
      ? ['image/png']
      : ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'];
  if (!allowed.includes(mime)) {
    throw new Error(kind === 'background'
      ? '背景はJPG、PNG、MOV、MP4を選んでください。'
      : kind === 'overlay'
        ? 'メイン素材は透過PNGを選んでください。'
        : 'BGMはMP3、M4A、AAC、WAVを選んでください。');
  }
  const limit = kind === 'overlay' ? 100 * 1024 * 1024 : 1024 * 1024 * 1024;
  if (file.size > limit) throw new Error(`ファイルサイズが上限 ${Math.round(limit / 1024 / 1024)}MB を超えています。`);
}

export async function uploadCloudFile(input: {
  userId: string;
  kind: 'background' | 'overlay' | 'audio';
  file: File;
  onProgress: (value: number) => void;
}): Promise<RemoteAssetRef> {
  validateCloudFile(input.kind, input.file);
  const client = getSupabaseBrowserClient();
  const config = getCloudConfig();
  if (!config) throw new Error('クラウド接続がまだ設定されていません。');
  const objectPath = `${input.userId}/inputs/${crypto.randomUUID()}${extension(input.file.name)}`;
  const mimeType = normalizedMimeType(input.file);

  if (input.file.size <= TUS_THRESHOLD) {
    const {error} = await client.storage.from(BUCKET).upload(objectPath, input.file, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw new Error(`素材を送信できません: ${error.message}`);
    input.onProgress(1);
  } else {
    const {data: {session}} = await client.auth.getSession();
    if (!session) throw new Error('ログインし直してください。');
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(input.file, {
        endpoint: `${config.url}/storage/v1/upload/resumable`,
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: config.publishableKey,
          'x-upsert': 'false',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: TUS_THRESHOLD,
        metadata: {
          bucketName: BUCKET,
          objectName: objectPath,
          contentType: mimeType,
          cacheControl: '3600',
        },
        onError: (error) => reject(new Error(`素材を送信できません: ${error.message}`)),
        onProgress: (uploaded, total) => input.onProgress(total > 0 ? uploaded / total : 0),
        onSuccess: () => resolve(),
      });
      upload.findPreviousUploads()
        .then((previous) => {
          if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        })
        .catch(reject);
    });
  }

  return {
    objectPath,
    originalName: input.file.name,
    mimeType,
    size: input.file.size,
  };
}
