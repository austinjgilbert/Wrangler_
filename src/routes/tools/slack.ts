/**
 * Slack tool stub.
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';

export async function handleSlackTool(request: Request, requestId: string) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'slack');
  if (errorResponse) return errorResponse;

  const action = body.action;
  const input = body.input || {};

  if (action === 'draft') {
    return buildToolSuccess(requestId, body, {
      draftId: `slack-draft-${Date.now()}`,
      status: 'draft',
      channel: input.channel || '',
      text: input.text || '',
    });
  }

  if (action === 'post') {
    return buildToolSuccess(requestId, body, {
      ts: `${Date.now()}`,
      status: 'posted',
      channel: input.channel || '',
    });
  }

  return createErrorResponse(
    'VALIDATION_ERROR',
    'Unsupported slack action',
    { action },
    400,
    requestId
  );
}
