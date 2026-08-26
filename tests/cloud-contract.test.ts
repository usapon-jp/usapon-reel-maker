import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {RemoteReelRequestSchema, assertRemoteRequestOwnership} from '@usapon-reel/core';

const userId = '11111111-1111-4111-8111-111111111111';
const request = {
  schemaVersion: 1 as const,
  title: 'スマホから作るリール',
  motionTemplateId: 'motion-soft',
  globalStrength: 1,
  background: {
    objectPath: `${userId}/inputs/background.jpg`,
    originalName: 'background.jpg',
    mimeType: 'image/jpeg',
    size: 1200,
  },
  overlays: [{
    objectPath: `${userId}/inputs/usapon.png`,
    originalName: 'usapon.png',
    mimeType: 'image/png',
    size: 800,
    role: 'primary' as const,
  }],
  texts: ['新作です'],
  bgm: null,
  useWorkerDefaultBgm: true,
};

describe('cloud reel contract', () => {
  it('validates a versioned remote request without local paths', () => {
    expect(RemoteReelRequestSchema.parse(request)).toEqual(request);
    expect(JSON.stringify(request)).not.toContain('/Users/');
  });

  it('allows the worker to read only assets owned by the job user', () => {
    expect(assertRemoteRequestOwnership(request, userId)).toEqual(request);
    expect(() => assertRemoteRequestOwnership({
      ...request,
      background: {...request.background, objectPath: '22222222-2222-4222-8222-222222222222/inputs/private.jpg'},
    }, userId)).toThrow('素材の保存場所');
    expect(() => assertRemoteRequestOwnership({
      ...request,
      background: {...request.background, objectPath: `${userId}/inputs/../outputs/private.mp4`},
    }, userId)).toThrow('素材の保存場所');
  });

  it('ships RLS, private storage and a service-role-only atomic claim function', () => {
    const sql = readFileSync('supabase/migrations/202608260001_remote_reel_jobs.sql', 'utf8');
    expect(sql).toContain('create schema if not exists reel');
    expect(sql).toContain('alter table reel.remote_reel_jobs enable row level security');
    expect(sql).toContain('grant select, insert, delete on reel.remote_reel_jobs to authenticated');
    expect(sql).toContain("'reel-private'");
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('grant execute on function reel.claim_remote_reel_job(text) to service_role');
    expect(sql).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
    expect(sql).toContain("(storage.foldername(name))[2] = 'inputs'");
    expect(sql).toContain('enforce_remote_reel_job_quota');
    expect(sql).toContain("status in ('queued', 'processing')");
  });
});
