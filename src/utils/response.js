/**
 * Response Utilities
 * Standardized JSON responses, CORS, and error handling
 */

/**
 * Generate request ID for tracing
 * @returns {string}
 */
export function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ── CORS Origin Allowlist ────────────────────────────────────────────
// @austin — fill in actual values before production deployment.

const ALLOWED_ORIGINS = new Set([
  'https://website-scanner.austin-gilbert.workers.dev',
  'https://www.sanity.io',
  'chrome-extension://golckjfiiopfdidkohfmfdpeengneaip',
]);

/**
 * Check if an origin is allowed for CORS.
 */
function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Localhost only in non-production
  if (env?.ENVIRONMENT !== 'production' && origin.startsWith('http://localhost:')) return true;
  return false;
}

// Request-scoped origin tracking.
// Safe in CF Workers (single request per isolate). NOT safe in Node/Deno.
let _currentRequestOrigin = '';
let _currentEnv = null;

/**
 * Set the request context for CORS origin checking.
 * Must be called once at the top of the fetch handler.
 * @param {Request} request
 * @param {object} env - Worker environment bindings
 */
export function setRequestContext(request, env) {
  _currentRequestOrigin = request?.headers?.get('Origin') || '';
  _currentEnv = env;
}

// ── Error Response Sanitization ──────────────────────────────────────
// Only these keys are allowed in error details to prevent leaking internals.
const SAFE_DETAIL_KEYS = new Set(['hint', 'path', 'method', 'maxSize', 'receivedSize', 'missing']);

/**
 * Create error response with sanitized details
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Record<string, any>} details - Optional error details (filtered to safe keys)
 * @param {number} status - HTTP status code
 * @param {string} requestId - Request ID
 * @returns {Response}
 */
export function createErrorResponse(code, message, details = null, status = 400, requestId = null) {
  const safeDetails = details ? Object.fromEntries(
    Object.entries(details).filter(([key]) => SAFE_DETAIL_KEYS.has(key))
  ) : null;

  const response = {
    ok: false,
    error: {
      code,
      message,
      ...(safeDetails && Object.keys(safeDetails).length > 0 && { details: safeDetails }),
    },
    ...(requestId && { requestId }),
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...addCorsHeaders({}).headers,
    },
  });
}

/**
 * Create success response
 * @param {any} data - Response data
 * @param {string} requestId - Request ID
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
export function createSuccessResponse(data, requestId = null, status = 200) {
  const response = {
    ok: true,
    data,
    ...(requestId && { requestId }),
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...addCorsHeaders({}).headers,
    },
  });
}

/**
 * Handle CORS preflight request
 * @returns {Response}
 */
export function handleCorsPreflight() {
  return new Response(null, {
    status: 204,
    headers: addCorsHeaders({}).headers,
  });
}

/**
 * Add CORS headers to response — uses origin allowlist instead of wildcard.
 * @param {Response|null} response - Optional Response object (for compatibility)
 * @returns {{headers: Headers}} - Object with headers (for use in new Response())
 */
export function addCorsHeaders(response = null) {
  const headers = new Headers(response?.headers || {});
  if (isAllowedOrigin(_currentRequestOrigin, _currentEnv)) {
    headers.set('Access-Control-Allow-Origin', _currentRequestOrigin);
  }
  // No ACAO header for unknown origins → browser blocks the response
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-API-Key, X-Client-ID');
  headers.set('Access-Control-Max-Age', '86400'); // 24h — prevents preflight 2x latency
  headers.set('Vary', 'Origin'); // Critical for CDN/cache correctness
  return { headers };
}

/**
 * Add CORS headers to existing Response object
 * @param {Response} response - Response object
 * @returns {Response} - New Response with CORS headers
 */
export function addCorsHeadersToResponse(response) {
  const corsHeaders = addCorsHeaders(response);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders.headers,
  });
}
