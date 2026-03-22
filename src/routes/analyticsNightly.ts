import { createErrorResponse, createSuccessResponse, safeParseJson, sanitizeErrorMessage } from '../utils/response.js';
import { runNightlyIntelligencePipeline } from '../lib/nightlyIntelligence.ts';

export async function handleNightlyIntelligence(request: Request, requestId: string, env: any) {
  try {
    let body: Record<string, unknown> = {};
    if (request.method === 'POST') {
      const { data, error: parseError } = await safeParseJson(request, requestId);
      if (parseError) return parseError;
      body = data;
    }

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
    return createErrorResponse('NIGHTLY_INTELLIGENCE_ERROR', sanitizeErrorMessage(error, 'analytics/nightly'), {}, 500, requestId);
  }
}
