/**
 * Shared helpers for tool routes.
 */

import { createErrorResponse, createSuccessResponse } from '../../utils/response.js';

export async function parseToolRequest(request: Request, requestId: string, expectedTool: string) {
  let body: any;
  try {
    body = await request.json();
  } catch (_e: any) {
    return {
      errorResponse: createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid or missing request body',
        {},
        400,
        requestId
      ),
    };
  }

  if (!body?.traceId || !body?.tool || !body?.action || body?.input == null) {
    return {
      errorResponse: createErrorResponse(
        'VALIDATION_ERROR',
        'traceId, tool, action, and input are required',
        {},
        400,
        requestId
      ),
    };
  }

  if (body.tool !== expectedTool) {
    return {
      errorResponse: createErrorResponse(
        'VALIDATION_ERROR',
        `Invalid tool. Expected ${expectedTool}`,
        { tool: body.tool },
        400,
        requestId
      ),
    };
  }

  return { body };
}

export function buildToolSuccess(requestId: string, body: any, output: any, extras: any = {}) {
  return createSuccessResponse(
    {
      traceId: body.traceId,
      status: 'ok',
      output,
      ...extras,
    },
    requestId
  );
}
