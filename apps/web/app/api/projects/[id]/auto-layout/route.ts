import {autoLayoutProject, nowIso, ProjectDocumentSchema} from '@usapon-reel/core';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    const {database} = getRuntime();
    const stored = database.getProject(id);
    if (!stored) return errorResponse(new Error('リールが見つかりません。'), 404);
    const raw = await request.text();
    const body = raw ? JSON.parse(raw) as {project?: unknown} : {};
    const project = body.project
      ? ProjectDocumentSchema.parse({...body.project, id, updatedAt: nowIso()})
      : stored;
    const assets = Object.fromEntries(database.listAssets().map((asset) => [asset.id, asset]));
    const next = autoLayoutProject(project, assets);
    return Response.json({project: database.updateProject(next)});
  } catch (error) {
    return errorResponse(error);
  }
}
