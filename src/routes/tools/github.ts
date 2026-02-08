/**
 * GitHub tool stub.
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';

export async function handleGithubTool(request: Request, requestId: string) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'github');
  if (errorResponse) return errorResponse;

  const action = body.action;
  if (!['createIssue', 'createPr', 'comment'].includes(action)) {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'Unsupported github action',
      { action },
      400,
      requestId
    );
  }

  return buildToolSuccess(requestId, body, {
    status: 'queued',
    action,
    repository: body.input?.repo || null,
  });
}
