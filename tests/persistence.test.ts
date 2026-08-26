import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {createDefaultProject, createId, nowIso, type RenderJob} from '@usapon-reel/core';
import {LocalBlobStorage, LocalDatabase, getDataPaths} from '@usapon-reel/local';

const tempRoots: string[] = [];
function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'usapon-reel-test-'));
  tempRoots.push(root);
  return root;
}
afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('local persistence adapters', () => {
  it('persists projects and seeds templates across restarts', () => {
    const paths = getDataPaths(tempRoot());
    const first = new LocalDatabase(paths.database);
    const project = createDefaultProject();
    first.createProject(project);
    expect(first.listMotionTemplates()).toHaveLength(4);
    first.close();
    const reopened = new LocalDatabase(paths.database);
    expect(reopened.getProject(project.id)).toEqual(project);
    expect(reopened.listMotionTemplates().every((template) => template.builtin)).toBe(true);
    reopened.close();
  });

  it('claims one job at a time and recovers interrupted work', () => {
    const database = new LocalDatabase(getDataPaths(tempRoot()).database);
    const now = nowIso();
    const job: RenderJob = {
      id: createId('job'), kind: 'render', status: 'queued', projectId: null, payload: {}, snapshot: null,
      progress: 0, outputStorageKey: null, thumbnailStorageKey: null, error: null, createdAt: now, updatedAt: now, completedAt: null,
    };
    database.enqueue(job);
    expect(database.claimNext()?.id).toBe(job.id);
    expect(database.claimNext()).toBeNull();
    database.resetInterruptedJobs();
    expect(database.getJob(job.id)?.status).toBe('failed');
    database.close();
  });

  it('keeps all blob operations inside the managed root', async () => {
    const storage = new LocalBlobStorage(getDataPaths(tempRoot()));
    const saved = await storage.put('overlay', 'うさぽん.png', new Uint8Array([1, 2, 3]));
    expect(await storage.exists(saved.storageKey)).toBe(true);
    expect(() => storage.resolvePath('../outside')).toThrow();
    await storage.delete(saved.storageKey);
    expect(await storage.exists(saved.storageKey)).toBe(false);
  });
});
