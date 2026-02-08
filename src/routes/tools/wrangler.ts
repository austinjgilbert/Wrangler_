/**
 * Wrangler tool bridge (stub/proxy).
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';

export async function handleWranglerTool(request: Request, requestId: string, env: any) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'wrangler');
  if (errorResponse) return errorResponse;

  if (body.action !== 'chat') {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'Unsupported wrangler action',
      { action: body.action },
      400,
      requestId
    );
  }

  const prompt = body.input?.prompt || '';
  if (!prompt) {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'prompt is required for wrangler.chat',
      {},
      400,
      requestId
    );
  }

  // If external wrangler service is configured, proxy the request.
  if (env?.WRANGLER_API_URL) {
    const response = await fetch(env.WRANGLER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.WRANGLER_API_KEY ? { Authorization: `Bearer ${env.WRANGLER_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        traceId: body.traceId,
        prompt,
        context: body.input?.context || null,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      return createErrorResponse(
        'WRANGLER_ERROR',
        `Wrangler upstream error: ${response.status}`,
        { error: text },
        502,
        requestId
      );
    }
    const data = await response.json();
    return buildToolSuccess(requestId, body, data);
  }

  // Stubbed response if not configured.
  return buildToolSuccess(requestId, body, {
    response: 'Wrangler response placeholder',
    prompt,
  });
}
