import {ProjectDocumentSchema, createId, nowIso} from '@usapon-reel/core';
import {createJob} from '@/src/server/jobs';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params;
  const job = getRuntime().database.getJob(id);
  return job ? Response.json({job}) : errorResponse(new Error('生成履歴が見つかりません。'), 404);
}

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    const {database} = getRuntime();
    const previous = database.getJob(id);
    if (!previous || previous.kind !== 'render' || !previous.snapshot) throw new Error('再試行できる生成履歴がありません。');
    const body = (await request.json().catch(() => ({}))) as {action?: 'retry' | 'reedit' | 'duplicate'};
    if (body.action === 'reedit' || body.action === 'duplicate') {
      const now = nowIso();
      const project = ProjectDocumentSchema.parse({
        ...structuredClone(previous.snapshot),
        id: createId('project'),
        title: `${previous.snapshot.title}${body.action === 'duplicate' ? ' のコピー' : '（再編集）'}`,
        createdAt: now,
        updatedAt: now,
      });
      database.createProject(project);
      return Response.json({project}, {status: 201});
    }
    const job = createJob('render', {
      projectId: previous.projectId,
      snapshot: previous.snapshot,
      payload: {...previous.payload, retriedFrom: previous.id},
    });
    database.enqueue(job);
    return Response.json({job}, {status: 202});
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    const {database, storage} = getRuntime();
    const job = database.deleteRenderJob(id);
    if (!job) return errorResponse(new Error('生成履歴が見つかりません。'), 404);
    await Promise.all(
      [job.outputStorageKey, job.thumbnailStorageKey].filter((value): value is string => Boolean(value)).map((key) => storage.delete(key)),
    );
    return new Response(null, {status: 204});
  } catch (error) {
    return errorResponse(error, 500);
  }
}
