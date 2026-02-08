/**
 * Web search tool stub.
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';

export async function handleWebSearchTool(request: Request, requestId: string) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'webSearch');
  if (errorResponse) return errorResponse;

  if (body.action !== 'search') {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'Unsupported webSearch action',
      { action: body.action },
      400,
      requestId
    );
  }

  return buildToolSuccess(
    requestId,
    body,
    { results: [], query: body.input?.query || '' },
    { citations: [] }
  );
}
