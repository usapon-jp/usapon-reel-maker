import {ProjectDocumentSchema, nowIso, type ImageLayer, type ProjectLayer} from '@usapon-reel/core';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    const {projectId, project: draft} = (await request.json()) as {projectId?: string; project?: unknown};
    const {database} = getRuntime();
    const template = database.getReelTemplate(id);
    const resolvedProjectId = String(projectId ?? '');
    const stored = database.getProject(resolvedProjectId);
    if (!template || !stored) throw new Error('テンプレートまたはリールが見つかりません。');
    const project = draft
      ? database.updateProject(ProjectDocumentSchema.parse({...draft, id: resolvedProjectId, updatedAt: nowIso()}))
      : stored;
    const currentImages = project.layers.filter((layer): layer is ImageLayer => layer.type === 'image');
    let imageIndex = 0;
    const layers: ProjectLayer[] = [];
    for (const layer of template.layers) {
      if (layer.type === 'text') {
        layers.push(layer);
        continue;
      }
      const current = currentImages[imageIndex++];
      if (current) {
        const {assetChecksum: _assetChecksum, ...imageLayer} = layer;
        layers.push({...imageLayer, assetId: current.assetId});
      }
    }
    let bgm = project.bgm;
    let unresolvedBgm = false;
    if (template.bgmHint) {
      const assets = Object.fromEntries(database.listAssets().map((asset) => [asset.id, asset]));
      const matched = database.listBgm().find(
        (track) => track.title === template.bgmHint!.title || assets[track.assetId]?.checksum === template.bgmHint!.checksum,
      );
      if (matched) bgm = {trackId: matched.id, trimStartMs: 0, volume: 1};
      else {
        bgm = null;
        unresolvedBgm = true;
      }
    }
    const next = ProjectDocumentSchema.parse({
      ...project,
      motionTemplateId: template.motionTemplateId,
      globalStrength: template.globalStrength,
      background: {...project.background, trimStartMs: template.background.trimStartMs},
      layers,
      bgm,
      updatedAt: nowIso(),
    });
    return Response.json({project: database.updateProject(next), unresolvedBgm});
  } catch (error) {
    return errorResponse(error);
  }
}
