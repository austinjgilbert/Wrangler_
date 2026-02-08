/**
 * Memory search tool stub.
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';

export async function handleMemorySearchTool(request: Request, requestId: string) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'memorySearch');
  if (errorResponse) return errorResponse;

  if (body.action !== 'search') {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'Unsupported memorySearch action',
      { action: body.action },
      400,
      requestId
    );
  }

  return buildToolSuccess(requestId, body, {
    matches: [],
    query: body.input?.query || '',
  });
}
