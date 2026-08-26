import {ProjectDocumentSchema, nowIso} from '@usapon-reel/core';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params;
  const project = getRuntime().database.getProject(id);
  return project ? Response.json({project}) : errorResponse(new Error('リールが見つかりません。'), 404);
}

export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    const {database} = getRuntime();
    if (!database.getProject(id)) return errorResponse(new Error('リールが見つかりません。'), 404);
    const body = await request.json();
    const project = ProjectDocumentSchema.parse({...body, id, updatedAt: nowIso()});
    return Response.json({project: database.updateProject(project)});
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params;
  getRuntime().database.deleteProject(id);
  return new Response(null, {status: 204});
}
