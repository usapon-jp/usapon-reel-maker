import {createDefaultProject} from '@usapon-reel/core';
import {getRuntime, errorResponse} from '@/src/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const {database, storage} = getRuntime();
    await storage.initialize();
    let projects = database.listProjects();
    if (projects.length === 0) {
      database.createProject(createDefaultProject());
      projects = database.listProjects();
    }
    return Response.json({
      project: projects[0],
      projects,
      assets: database.listAssets(),
      motionTemplates: database.listMotionTemplates(),
      reelTemplates: database.listReelTemplates(),
      bgmTracks: database.listBgm(),
      renderJobs: database.listJobs('render'),
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
