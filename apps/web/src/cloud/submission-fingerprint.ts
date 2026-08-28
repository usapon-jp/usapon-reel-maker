'use client';

type FileIdentity = Pick<File, 'name' | 'size' | 'type' | 'lastModified'>;

function fileIdentity(file: FileIdentity | null) {
  return file ? {
    name: file.name.normalize('NFC'),
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  } : null;
}

export async function createSubmissionFingerprint(input: {
  title: string;
  motionTemplateId: string;
  globalStrength: number;
  background: FileIdentity;
  overlays: FileIdentity[];
  texts: string[];
  bgm: FileIdentity | null;
  useWorkerDefaultBgm: boolean;
}): Promise<string> {
  const serialized = JSON.stringify({
    title: input.title.trim(),
    motionTemplateId: input.motionTemplateId,
    globalStrength: input.globalStrength,
    background: fileIdentity(input.background),
    overlays: input.overlays.map(fileIdentity),
    texts: input.texts.map((text) => text.trim()).filter(Boolean),
    bgm: fileIdentity(input.bgm),
    useWorkerDefaultBgm: input.useWorkerDefaultBgm,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
