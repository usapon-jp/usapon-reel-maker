import type {ProjectDocumentV1, RenderableProject} from '@usapon-reel/core';
import {LocalDatabase} from './database';

export function resolveRenderableProject(
  database: LocalDatabase,
  project: ProjectDocumentV1,
  baseUrl = process.env.USAPON_REEL_BASE_URL ?? 'http://127.0.0.1:3000',
): RenderableProject {
  const template = database.getMotionTemplate(project.motionTemplateId);
  if (!template) throw new Error('雰囲気テンプレートが見つかりません。');
  const backgroundAsset = project.background.assetId ? database.getAsset(project.background.assetId) : null;
  const background = backgroundAsset
    ? {...backgroundAsset, src: `${baseUrl}/api/assets/${backgroundAsset.id}`}
    : null;
  const imageAssets = Object.fromEntries(
    project.layers
      .filter((layer) => layer.type === 'image')
      .map((layer) => {
        const asset = database.getAsset(layer.assetId);
        if (!asset) throw new Error(`素材 ${layer.name} が見つかりません。`);
        return [asset.id, {...asset, src: `${baseUrl}/api/assets/${asset.id}`}];
      }),
  );
  const track = project.bgm ? database.getBgm(project.bgm.trackId) : null;
  const bgm = track ? {...track, src: `${baseUrl}/api/assets/${track.assetId}?source=original`} : null;
  return {project, template, background, imageAssets, bgm};
}
