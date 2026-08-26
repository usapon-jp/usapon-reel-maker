import {createReelTemplate, importReelTemplate, nowIso, ProjectDocumentSchema} from '@usapon-reel/core';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({templates: getRuntime().database.listReelTemplates()});
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {action?: string; projectId?: string; name?: string; json?: string; project?: unknown};
    const {database} = getRuntime();
    if (body.action === 'import') {
      const template = database.saveReelTemplate(importReelTemplate(String(body.json ?? '')));
      return Response.json({template}, {status: 201});
    }
    const projectId = String(body.projectId ?? '');
    const stored = database.getProject(projectId);
    if (!stored) throw new Error('保存するリールが見つかりません。');
    const project = body.project
      ? database.updateProject(ProjectDocumentSchema.parse({...body.project, id: projectId, updatedAt: nowIso()}))
      : stored;
    const assets = Object.fromEntries(database.listAssets().map((asset) => [asset.id, asset]));
    const bgm = project.bgm ? database.getBgm(project.bgm.trackId) : null;
    const template = createReelTemplate(project, String(body.name ?? project.title), assets, bgm);
    database.saveReelTemplate(template);
    return Response.json({template}, {status: 201});
  } catch (error) {
    return errorResponse(error);
  }
}
