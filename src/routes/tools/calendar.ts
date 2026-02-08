/**
 * Calendar tool stub.
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';

export async function handleCalendarTool(request: Request, requestId: string) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'calendar');
  if (errorResponse) return errorResponse;

  const action = body.action;
  const input = body.input || {};

  if (action === 'read') {
    return buildToolSuccess(requestId, body, { events: [], range: input.range || null });
  }

  if (action === 'proposeEvent') {
    return buildToolSuccess(requestId, body, {
      proposalId: `cal-proposal-${Date.now()}`,
      status: 'draft',
      title: input.title || '',
      attendees: input.attendees || [],
      proposedTimes: input.proposedTimes || [],
    });
  }

  if (action === 'createEvent') {
    return buildToolSuccess(requestId, body, {
      eventId: `cal-event-${Date.now()}`,
      status: 'created',
      title: input.title || '',
      attendees: input.attendees || [],
      start: input.start || null,
      end: input.end || null,
    });
  }

  return createErrorResponse(
    'VALIDATION_ERROR',
    'Unsupported calendar action',
    { action },
    400,
    requestId
  );
}
