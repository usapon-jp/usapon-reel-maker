import {createDefaultProject} from '@usapon-reel/core';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({projects: getRuntime().database.listProjects()});
}

export async function POST() {
  try {
    const {database} = getRuntime();
    const project = database.createProject(createDefaultProject());
    return Response.json({project}, {status: 201});
  } catch (error) {
    return errorResponse(error);
  }
}
