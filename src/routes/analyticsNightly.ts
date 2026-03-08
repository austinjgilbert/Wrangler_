import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { runNightlyIntelligencePipeline } from '../lib/nightlyIntelligence.ts';

export async function handleNightlyIntelligence(request: Request, requestId: string, env: any) {
  try {
    const body = request.method === 'POST'
      ? ((await request.json()) as Record<string, unknown>)
      : {};

    const now = typeof body.date === 'string' ? body.date : undefined;
    const dailyLimit = typeof body.dailyLimit === 'number' ? body.dailyLimit : undefined;
    const maxPerAccount = typeof body.maxPerAccount === 'number' ? body.maxPerAccount : undefined;

    const result = await runNightlyIntelligencePipeline(env, {
      now,
      dailyLimit,
      maxPerAccount,
    });

    return createSuccessResponse(result, requestId);
  } catch (error: any) {
    return createErrorResponse('NIGHTLY_INTELLIGENCE_ERROR', error.message, {}, 500, requestId);
  }
}
