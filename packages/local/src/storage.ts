import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {basename, extname, join, normalize, resolve} from 'node:path';
import type {BlobStorage} from '@usapon-reel/core';
import {getDataPaths, type DataPaths} from './paths';

const FOLDERS: Record<string, keyof Pick<DataPaths, 'assets' | 'outputs' | 'thumbnails' | 'temp'>> = {
  background: 'assets',
  overlay: 'assets',
  audio: 'assets',
  proxy: 'assets',
  output: 'outputs',
  thumbnail: 'thumbnails',
  temp: 'temp',
};

function safeExtension(name: string): string {
  const extension = extname(basename(name)).toLowerCase().replace(/[^.a-z0-9]/g, '');
  return extension.slice(0, 10);
}

export class LocalBlobStorage implements BlobStorage {
  readonly paths: DataPaths;

  constructor(paths = getDataPaths()) {
    this.paths = paths;
  }

  async initialize(): Promise<void> {
    await Promise.all(Object.values(this.paths).filter((value) => value !== this.paths.database).map((folder) => mkdir(folder, {recursive: true})));
    await mkdir(resolve(this.paths.database, '..'), {recursive: true});
  }

  async put(kind: string, originalName: string, data: Uint8Array): Promise<{storageKey: string; size: number}> {
    await this.initialize();
    const folderKey = FOLDERS[kind] ?? 'assets';
    const fileName = `${randomUUID()}${safeExtension(originalName)}`;
    const storageKey = `${folderKey}/${fileName}`;
    await writeFile(this.resolvePath(storageKey), data);
    return {storageKey, size: data.byteLength};
  }

  async read(storageKey: string): Promise<Uint8Array> {
    return readFile(this.resolvePath(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolvePath(storageKey), {force: true});
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await readFile(this.resolvePath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  resolvePath(storageKey: string): string {
    const [folderKey, ...rest] = normalize(storageKey).split('/');
    if (!folderKey || rest.length !== 1 || rest[0].includes('..')) throw new Error('不正な保存キーです。');
    const base = this.paths[folderKey as keyof DataPaths];
    if (!base || folderKey === 'root' || folderKey === 'database') throw new Error('不正な保存領域です。');
    const target = resolve(base, rest[0]);
    if (!target.startsWith(`${resolve(base)}/`)) throw new Error('保存領域の外は参照できません。');
    return target;
  }
}

export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
