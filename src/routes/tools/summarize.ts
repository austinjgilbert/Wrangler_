/**
 * Summarize tool stub.
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';

export async function handleSummarizeTool(request: Request, requestId: string) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'summarize');
  if (errorResponse) return errorResponse;

  if (body.action !== 'summarize') {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'Unsupported summarize action',
      { action: body.action },
      400,
      requestId
    );
  }

  const source = body.input?.source || 'source';
  return buildToolSuccess(requestId, body, {
    summary: `Summary placeholder for ${source}`,
    source,
  });
}
