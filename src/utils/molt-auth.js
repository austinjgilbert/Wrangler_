/**
 * Molt / ChatGPT API authentication
 *
 * Protects /molt/* and /wrangler/ingest when MOLT_API_KEY or CHATGPT_API_KEY is set.
 * Use from: Custom GPTs, ChatGPT API, bridge apps, or any client that should call
 * MoltBot or the GPT worker (wrangler ingest).
 *
 * Accepted credentials (any one):
 *   - Authorization: Bearer <key>
 *   - X-API-Key: <key>
 *
 * Env: MOLT_API_KEY or CHATGPT_API_KEY (same secret; either name works).
 * If neither is set, no auth is required (backward compatible).
 */

import { createErrorResponse } from './response.js';

/**
 * Get the configured API key for Molt/ChatGPT endpoints.
 * @param {object} env - Worker env
 * @returns {string|null} - Configured key or null if auth disabled
 */
export function getMoltApiKey(env) {
  return env.MOLT_API_KEY || env.CHATGPT_API_KEY || null;
}

/**
 * Check if the request has a valid Molt/ChatGPT API key.
 * @param {Request} request
 * @param {object} env
 * @param {string} [requestId] - Optional request ID for the error response
 * @returns {{ allowed: boolean, errorResponse?: Response }}
 */
export function checkMoltApiKey(request, env, requestId = null) {
  const configuredKey = getMoltApiKey(env);
  if (!configuredKey) {
    return { allowed: true };
  }

  const bearer = request.headers.get('Authorization');
  const apiKeyHeader = request.headers.get('X-API-Key');
  const provided = (bearer && bearer.startsWith('Bearer '))
    ? bearer.slice(7).trim()
    : (apiKeyHeader && apiKeyHeader.trim()) || null;

  if (!provided) {
    return {
      allowed: false,
      errorResponse: createErrorResponse(
        'UNAUTHORIZED',
        'Molt/ChatGPT API requires authentication. Send Authorization: Bearer <key> or X-API-Key: <key>. Set MOLT_API_KEY (or CHATGPT_API_KEY) in the worker and use that value.',
        { hint: 'wrangler secret put MOLT_API_KEY' },
        401,
        requestId
      ),
    };
  }

  if (provided !== configuredKey) {
    return {
      allowed: false,
      errorResponse: createErrorResponse(
        'UNAUTHORIZED',
        'Invalid API key',
        {},
        401,
        requestId
      ),
    };
  }

  return { allowed: true };
}
