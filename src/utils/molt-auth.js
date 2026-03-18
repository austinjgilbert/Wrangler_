/**
 * Molt / ChatGPT API authentication
 *
 * Protects all endpoints via global auth middleware in routeRequest().
 * Use from: Custom GPTs, ChatGPT API, bridge apps, Chrome extension,
 * SDK app (via Next.js proxy), or any client that should call the worker.
 *
 * Accepted credentials (checked in priority order):
 *   1. Authorization: Bearer <key>     (preferred)
 *   2. X-API-Key: <key>                (preferred)
 *   3. ?apiKey=<key> or ?key=<key>     (DEPRECATED — will be removed)
 *
 * Env: MOLT_API_KEY or CHATGPT_API_KEY (same secret; either name works).
 *
 * SECURITY: Fail-closed — if no key is configured, ALL requests are rejected
 * with 503. This prevents accidental open access during initial setup.
 */

import { createErrorResponse } from './response.js';

/**
 * Get the configured API key for Molt/ChatGPT endpoints.
 * @param {object} env - Worker env
 * @returns {string|null} - Configured key or null if not set
 */
export function getMoltApiKey(env) {
  return env.MOLT_API_KEY || env.CHATGPT_API_KEY || null;
}

/**
 * Check if the request has a valid Molt/ChatGPT API key.
 *
 * FAIL-CLOSED: Returns rejected if no key is configured.
 *
 * @param {Request} request
 * @param {object} env
 * @param {string} [requestId] - Optional request ID for the error response
 * @returns {{ allowed: boolean, errorResponse?: Response }}
 */
export function checkMoltApiKey(request, env, requestId = null) {
  const configuredKey = getMoltApiKey(env);
  if (!configuredKey) {
    // FAIL CLOSED — no key configured = no access
    console.error('[AUTH] MOLT_API_KEY not configured — rejecting request');
    return {
      allowed: false,
      errorResponse: createErrorResponse(
        'CONFIG_ERROR',
        'API authentication not configured. Set MOLT_API_KEY in worker secrets.',
        { hint: 'wrangler secret put MOLT_API_KEY' },
        503,
        requestId
      ),
    };
  }

  const url = new URL(request.url);
  const bearer = request.headers.get('Authorization');
  const apiKeyHeader = request.headers.get('X-API-Key');
  const apiKeyQuery = url.searchParams.get('apiKey') || url.searchParams.get('key');

  // Check in priority order: Bearer > X-API-Key > query param
  let provided = null;
  let authMethod = 'none';

  if (bearer && bearer.startsWith('Bearer ')) {
    provided = bearer.slice(7).trim();
    authMethod = 'bearer';
  } else if (apiKeyHeader && apiKeyHeader.trim()) {
    provided = apiKeyHeader.trim();
    authMethod = 'x-api-key';
  } else if (apiKeyQuery && apiKeyQuery.trim()) {
    provided = apiKeyQuery.trim();
    authMethod = 'query-param';
    // ⚠️ DEPRECATION: Query param auth will be removed in a future release.
    // API keys in URLs appear in server logs, browser history, and Referer headers.
    // Migrate to Authorization: Bearer <key> or X-API-Key header.
    console.warn(`[AUTH] DEPRECATED: Query param auth used for ${url.pathname}. Migrate to header-based auth.`);
  }

  if (!provided) {
    return {
      allowed: false,
      errorResponse: createErrorResponse(
        'UNAUTHORIZED',
        'API key required. Send via Authorization: Bearer <key> or X-API-Key header.',
        { hint: 'wrangler secret put MOLT_API_KEY' },
        401,
        requestId
      ),
    };
  }

  if (provided !== configuredKey) {
    return {
      allowed: false,
      errorResponse: createErrorResponse('UNAUTHORIZED', 'Invalid API key', {}, 401, requestId),
    };
  }

  return { allowed: true };
}
