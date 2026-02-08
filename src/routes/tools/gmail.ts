/**
 * Gmail tool stub.
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';

export async function handleGmailTool(request: Request, requestId: string) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'gmail');
  if (errorResponse) return errorResponse;

  const action = body.action;
  const input = body.input || {};

  if (action === 'read') {
    return buildToolSuccess(requestId, body, { messages: [], query: input.query || null });
  }

  if (action === 'draft') {
    return buildToolSuccess(requestId, body, {
      draftId: `gmail-draft-${Date.now()}`,
      status: 'draft',
      to: input.to || [],
      subject: input.subject || '',
      body: input.body || '',
    });
  }

  if (action === 'send') {
    return buildToolSuccess(requestId, body, {
      messageId: `gmail-msg-${Date.now()}`,
      status: 'sent',
      to: input.to || [],
      subject: input.subject || '',
    });
  }

  return createErrorResponse(
    'VALIDATION_ERROR',
    'Unsupported gmail action',
    { action },
    400,
    requestId
  );
}
