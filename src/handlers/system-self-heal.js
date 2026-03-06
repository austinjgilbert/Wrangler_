import { createErrorResponse, createSuccessResponse } from '../utils/response.js';

export async function handleSystemSelfHeal(_request, requestId, env) {
  try {
    const { runAutomaticSelfHeal } = await import('../services/self-heal.js');
    const result = await runAutomaticSelfHeal(env, { requestId });
    return createSuccessResponse(result, requestId);
  } catch (error) {
    return createErrorResponse('SELF_HEAL_ERROR', error.message, {}, 500, requestId);
  }
}
