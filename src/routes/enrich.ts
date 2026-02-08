/**
 * Unified Enrichment routes (wrapper over DQ enrichment).
 * - POST /enrich/run
 * - POST /enrich/apply
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { handleEnrichRun, handleEnrichApply } from './dq.ts';

export async function handleEnrichRunUnified(request: Request, requestId: string, env: any) {
  try {
    return await handleEnrichRun(request, requestId, env);
  } catch (error: any) {
    return createErrorResponse('ENRICH_RUN_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleEnrichApplyUnified(request: Request, requestId: string, env: any) {
  try {
    return await handleEnrichApply(request, requestId, env);
  } catch (error: any) {
    return createErrorResponse('ENRICH_APPLY_ERROR', error.message, {}, 500, requestId);
  }
}
