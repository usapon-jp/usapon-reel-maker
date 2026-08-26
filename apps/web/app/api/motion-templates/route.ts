import {MotionTemplateSchema, duplicateMotionTemplate, importMotionTemplate} from '@usapon-reel/core';
import {errorResponse, getRuntime} from '@/src/server/runtime';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({templates: getRuntime().database.listMotionTemplates()});
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {action?: string; templateId?: string; json?: string; template?: unknown};
    const {database} = getRuntime();
    if (body.action === 'duplicate') {
      const source = database.getMotionTemplate(String(body.templateId ?? ''));
      if (!source) throw new Error('複製元のテンプレートが見つかりません。');
      return Response.json({template: database.saveMotionTemplate(duplicateMotionTemplate(source))}, {status: 201});
    }
    if (body.action === 'import') {
      return Response.json({template: database.saveMotionTemplate(importMotionTemplate(String(body.json ?? '')))}, {status: 201});
    }
    const template = MotionTemplateSchema.parse(body.template);
    return Response.json({template: database.saveMotionTemplate(template)}, {status: 201});
  } catch (error) {
    return errorResponse(error);
  }
}
