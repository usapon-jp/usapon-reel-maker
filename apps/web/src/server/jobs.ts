import {createId, nowIso, type RenderJob} from '@usapon-reel/core';

export function createJob(
  kind: RenderJob['kind'],
  input: {projectId?: string | null; payload?: Record<string, unknown>; snapshot?: RenderJob['snapshot']},
): RenderJob {
  const now = nowIso();
  return {
    id: createId('job'),
    kind,
    status: 'queued',
    projectId: input.projectId ?? null,
    payload: input.payload ?? {},
    snapshot: input.snapshot ?? null,
    progress: 0,
    outputStorageKey: null,
    thumbnailStorageKey: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}
