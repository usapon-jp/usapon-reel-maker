import {describe, expect, it} from 'vitest';
import {createSubmissionFingerprint} from '../apps/web/src/cloud/submission-fingerprint';

const background = {name: '背景.jpg', size: 1200, type: 'image/jpeg', lastModified: 100};
const overlay = {name: 'うさぽん.png', size: 800, type: 'image/png', lastModified: 200};

const input = {
  title: '新しいリール',
  motionTemplateId: 'motion-soft',
  globalStrength: 1,
  background,
  overlays: [overlay],
  texts: ['こんにちは', ''],
  bgm: null,
  useWorkerDefaultBgm: true,
};

describe('cloud submission fingerprint', () => {
  it('returns the same fingerprint for the same files and settings', async () => {
    expect(await createSubmissionFingerprint(input)).toBe(await createSubmissionFingerprint({...input}));
  });

  it('changes when a rendered setting changes', async () => {
    expect(await createSubmissionFingerprint(input)).not.toBe(await createSubmissionFingerprint({
      ...input,
      motionTemplateId: 'motion-pop',
    }));
  });

  it('normalizes text before comparison', async () => {
    expect(await createSubmissionFingerprint(input)).toBe(await createSubmissionFingerprint({
      ...input,
      title: '  新しいリール  ',
      texts: ['  こんにちは  ', '   '],
    }));
  });
});
