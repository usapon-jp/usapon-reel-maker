import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

export async function DELETE(_request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    getRuntime().database.deleteReelTemplate(id);
    return new Response(null, {status: 204});
  } catch (error) {
    return errorResponse(error);
  }
}
