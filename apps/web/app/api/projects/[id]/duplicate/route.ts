import {ProjectDocumentSchema, createId, nowIso} from '@usapon-reel/core';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    const {database} = getRuntime();
    const current = database.getProject(id);
    if (!current) return errorResponse(new Error('リールが見つかりません。'), 404);
    const now = nowIso();
    const project = ProjectDocumentSchema.parse({
      ...structuredClone(current),
      id: createId('project'),
      title: `${current.title} のコピー`,
      createdAt: now,
      updatedAt: now,
    });
    database.createProject(project);
    return Response.json({project}, {status: 201});
  } catch (error) {
    return errorResponse(error);
  }
}
