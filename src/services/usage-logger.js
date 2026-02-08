/**
 * Usage Logger Service
 * Logs API usage by Sanity users for analytics and monitoring
 */

/**
 * Extract user identification from request headers
 * Supports common Sanity headers and custom headers
 * 
 * @param {Request} request - The incoming request
 * @returns {Object} User identification object with userId and userEmail
 */
export function extractUserFromRequest(request) {
  const headers = request.headers;
  
  // Try various header formats for Sanity user identification
  const userId = 
    headers.get('X-Sanity-User-Id') ||
    headers.get('X-User-Id') ||
    headers.get('X-Sanity-User') ||
    headers.get('Authorization')?.match(/user[_-]?id[=:](\w+)/i)?.[1] ||
    null;
  
  const userEmail = 
    headers.get('X-Sanity-User-Email') ||
    headers.get('X-User-Email') ||
    headers.get('X-Sanity-Email') ||
    null;
  
  return {
    userId: userId || 'anonymous',
    userEmail: userEmail || null,
  };
}

/**
 * Extract request metadata for logging
 * 
 * @param {Request} request - The incoming request
 * @param {URL} url - Parsed URL object
 * @returns {Object} Request metadata
 */
export function extractRequestMetadata(request, url) {
  const headers = request.headers;
  
  // Extract query parameters (sanitized - exclude sensitive data)
  const queryParams = {};
  const sensitiveParams = ['token', 'key', 'password', 'secret', 'auth'];
  for (const [key, value] of url.searchParams.entries()) {
    if (!sensitiveParams.some(param => key.toLowerCase().includes(param))) {
      queryParams[key] = value;
    }
  }
  
  return {
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    userAgent: headers.get('user-agent') || undefined,
    referer: headers.get('referer') || undefined,
    ipAddress: headers.get('cf-connecting-ip') || 
               headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
               undefined,
    requestBodySize: headers.get('content-length') ? 
                     parseInt(headers.get('content-length')) : undefined,
  };
}

/**
 * Log API usage to Sanity
 * 
 * @param {Object} client - Sanity client
 * @param {Function} upsertDocument - Upsert document function
 * @param {Object} logData - Usage log data
 * @returns {Promise<{success: boolean, logId?: string, error?: string}>}
 */
export async function logUsage(client, upsertDocument, logData) {
  if (!client) {
    // Sanity not configured, skip logging
    return { success: false, error: 'Sanity not configured' };
  }
  
  try {
    const {
      userId,
      userEmail,
      endpoint,
      method,
      requestId,
      statusCode,
      success,
      responseTimeMs,
      responseBodySize,
      prompt,
      accountKey,
      accountDomain,
      personId,
      techSummary,
      enrichmentSummary,
      ...metadata
    } = logData;
    
    const timestamp = new Date().toISOString();
    const logId = `usageLog-${requestId || `log-${Date.now()}-${Math.random().toString(36).substring(7)}`}`;
    
    const logDocument = {
      _type: 'usageLog',
      _id: logId,
      userId: userId || 'anonymous',
      userEmail: userEmail || undefined,
      endpoint: endpoint || 'unknown',
      method: method || 'GET',
      prompt: prompt || undefined,
      accountKey: accountKey || undefined,
      accountDomain: accountDomain || undefined,
      personId: personId || undefined,
      techSummary: techSummary || undefined,
      enrichmentSummary: enrichmentSummary || undefined,
      requestId: requestId || undefined,
      statusCode: statusCode || undefined,
      success: success !== undefined ? success : (statusCode >= 200 && statusCode < 300),
      timestamp: timestamp,
      responseTimeMs: responseTimeMs || undefined,
      responseBodySize: responseBodySize || undefined,
      queryParams: metadata.queryParams || undefined,
      requestBodySize: metadata.requestBodySize || undefined,
      userAgent: metadata.userAgent || undefined,
      ipAddress: metadata.ipAddress || undefined,
      referer: metadata.referer || undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
    
    // Remove undefined fields to keep document clean
    Object.keys(logDocument).forEach(key => {
      if (logDocument[key] === undefined) {
        delete logDocument[key];
      }
    });
    
    await upsertDocument(client, logDocument);
    
    return {
      success: true,
      logId: logId,
    };
  } catch (error) {
    // Don't throw - logging failures shouldn't break the API
    console.error('Failed to log usage:', error);
    return {
      success: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Create a usage logging wrapper for request handlers
 * Automatically logs usage after request completion
 * 
 * @param {Function} handler - Request handler function
 * @param {Object} options - Options for logging
 * @returns {Function} Wrapped handler with usage logging
 */
export function withUsageLogging(handler, options = {}) {
  return async (request, ...args) => {
    const startTime = Date.now();
    const url = new URL(request.url);
    const requestId = args.find(arg => typeof arg === 'string' && arg.startsWith('req-')) || 
                     `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Extract user info
    const userInfo = extractUserFromRequest(request);
    
    // Extract request metadata
    const requestMetadata = extractRequestMetadata(request, url);
    
    let response = null;
    let statusCode = 500;
    let responseBodySize = 0;
    
    try {
      // Execute handler
      response = await handler(request, ...args);
      
      // Extract status code and response size
      statusCode = response.status || 500;
      
      // Try to get response body size (if available)
      const responseText = await response.clone().text().catch(() => '');
      responseBodySize = new TextEncoder().encode(responseText).length;
      
      return response;
    } catch (error) {
      statusCode = 500;
      throw error;
    } finally {
      // Log usage asynchronously (don't block response)
      const responseTimeMs = Date.now() - startTime;
      
      // Get env and client from args (usually passed to handlers)
      const env = args.find(arg => arg && typeof arg === 'object' && arg.SANITY_PROJECT_ID) || 
                  args.find(arg => arg && typeof arg === 'object' && typeof arg.fetch === 'function');
      
      if (env) {
        try {
          const { initSanityClient } = await import('../sanity-client.js');
          const { groqQuery, upsertDocument } = await import('../sanity-client.js');
          
          const client = initSanityClient(env);
          if (client) {
            // Log asynchronously - don't await
            logUsage(client, upsertDocument, {
              ...userInfo,
              endpoint: url.pathname,
              method: request.method,
              requestId: requestId,
              statusCode: statusCode,
              success: statusCode >= 200 && statusCode < 300,
              responseTimeMs: responseTimeMs,
              responseBodySize: responseBodySize,
              ...requestMetadata,
            }).catch(err => {
              console.error('Background usage logging failed:', err);
            });
          }
        } catch (err) {
          // Silently fail - don't break the API
          console.error('Usage logging setup failed:', err);
        }
      }
    }
  };
}
