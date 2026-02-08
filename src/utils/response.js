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

/**
 * Create error response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Record<string, any>} details - Optional error details
 * @param {number} status - HTTP status code
 * @param {string} requestId - Request ID
 * @returns {Response}
 */
export function createErrorResponse(code, message, details = null, status = 400, requestId = null) {
  const response = {
    ok: false,
    error: {
      code,
      message,
      ...(details && { details }),
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
 * Add CORS headers to response
 * @param {Response|null} response - Optional Response object (for compatibility)
 * @returns {{headers: Headers}} - Object with headers (for use in new Response())
 */
export function addCorsHeaders(response = null) {
  const headers = new Headers(response?.headers || {});
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token, X-API-Key');
  headers.set('Access-Control-Max-Age', '86400');
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

