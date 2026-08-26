import {MotionTemplateSchema} from '@usapon-reel/core';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const {id} = await context.params;
    const {database} = getRuntime();
    const current = database.getMotionTemplate(id);
    if (!current) return errorResponse(new Error('テンプレートが見つかりません。'), 404);
    if (current.builtin) throw new Error('初期テンプレートは複製して編集してください。');
    const value = MotionTemplateSchema.parse({...current, ...(await request.json()), id, builtin: false});
    return Response.json({template: database.saveMotionTemplate(value)});
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params;
  getRuntime().database.deleteMotionTemplate(id);
  return new Response(null, {status: 204});
}
