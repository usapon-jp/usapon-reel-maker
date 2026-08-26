import {nowIso, ProjectDocumentSchema} from '@usapon-reel/core';
import {createJob} from '@/src/server/jobs';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({jobs: getRuntime().database.listJobs('render')});
}

export async function POST(request: Request) {
  try {
    const {projectId, project: draft} = (await request.json()) as {projectId?: string; project?: unknown};
    if (!projectId) throw new Error('リールを選んでください。');
    const {database} = getRuntime();
    const stored = database.getProject(projectId);
    if (!stored) throw new Error('リールが見つかりません。');
    const project = draft
      ? database.updateProject(ProjectDocumentSchema.parse({...draft, id: projectId, updatedAt: nowIso()}))
      : stored;
    if (!project.background.assetId) throw new Error('背景を追加してください。');
    if (!project.layers.some((layer) => layer.type === 'image')) throw new Error('PNG素材を1枚以上追加してください。');
    const snapshot = ProjectDocumentSchema.parse(structuredClone(project));
    const job = createJob('render', {projectId, snapshot, payload: {title: project.title}});
    database.enqueue(job);
    return Response.json({job}, {status: 202});
  } catch (error) {
    return errorResponse(error);
  }
}
