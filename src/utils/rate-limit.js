/**
 * Rate Limiting Utility
 * Prevents API abuse by limiting requests per IP/endpoint
 */

/**
 * Rate limiter class
 */
export class RateLimiter {
  constructor(env) {
    this.kv = env.RATE_LIMIT_KV; // KV namespace (optional)
    this.limits = {
      '/scan': { requests: 100, window: 3600 }, // 100 per hour
      '/scan-batch': { requests: 10, window: 3600 }, // 10 per hour
      '/research': { requests: 50, window: 3600 }, // 50 per hour
      '/enrich/queue': { requests: 20, window: 3600 }, // 20 per hour
      '/competitors/research': { requests: 30, window: 3600 }, // 30 per hour
      '/molt': { requests: 120, window: 3600 }, // 120/hour for MoltBot + GPT worker
      '/wrangler': { requests: 120, window: 3600 }, // 120/hour for wrangler ingest
      '/analytics/superuser': { requests: 30, window: 3600 },
      '/analytics/superuser/command': { requests: 20, window: 3600 },
      '/analytics/nightly-intelligence': { requests: 6, window: 3600 },
      default: { requests: 200, window: 3600 }, // 200 per hour
    };
    this.inMemoryCache = new Map(); // Fallback if KV not available
    this.cacheCleanupInterval = 3600000; // 1 hour
  }

  /**
   * Get client IP from request
   * @param {Request} request - Request object
   * @returns {string} - Client IP
   */
  getClientIP(request) {
    // Cloudflare Workers provides CF-Connecting-IP header
    const cfIP = request.headers.get('CF-Connecting-IP');
    if (cfIP) return cfIP;
    
    // Fallback to X-Forwarded-For
    const forwarded = request.headers.get('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    // Last resort: use request URL hostname
    try {
      const url = new URL(request.url);
      return url.hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get rate limit for endpoint
   * @param {string} endpoint - Endpoint path
   * @returns {{requests: number, window: number}} - Rate limit config
   */
  getLimit(endpoint) {
    // Find exact match first
    if (this.limits[endpoint]) {
      return this.limits[endpoint];
    }
    
    // Find prefix match (e.g., /enrich/* matches /enrich/queue)
    for (const [key, value] of Object.entries(this.limits)) {
      if (endpoint.startsWith(key) && key !== 'default') {
        return value;
      }
    }
    
    // Return default
    return this.limits.default;
  }

  /**
   * Check rate limit using KV
   * @param {string} key - Rate limit key
   * @param {number} limit - Request limit
   * @param {number} window - Time window in seconds
   * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
   */
  async checkLimitKV(key, limit, window) {
    if (!this.kv) {
      // Fallback to in-memory if KV not available
      return this.checkLimitMemory(key, limit, window);
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const windowKey = `${key}:${Math.floor(now / window)}`;
      
      // Get current count
      const countStr = await this.kv.get(windowKey);
      const count = countStr ? parseInt(countStr, 10) : 0;
      
      if (count >= limit) {
        const resetAt = (Math.floor(now / window) + 1) * window;
        return {
          allowed: false,
          remaining: 0,
          resetAt,
        };
      }
      
      // Increment count
      const newCount = count + 1;
      await this.kv.put(windowKey, newCount.toString(), {
        expirationTtl: window + 60, // Add 60s buffer
      });
      
      const resetAt = (Math.floor(now / window) + 1) * window;
      return {
        allowed: true,
        remaining: limit - newCount,
        resetAt,
      };
    } catch (error) {
      // If KV fails, fallback to in-memory
      console.error('Rate limit KV error:', error);
      return this.checkLimitMemory(key, limit, window);
    }
  }

  /**
   * Check rate limit using in-memory cache
   * @param {string} key - Rate limit key
   * @param {number} limit - Request limit
   * @param {number} window - Time window in seconds
   * @returns {{allowed: boolean, remaining: number, resetAt: number}}
   */
  checkLimitMemory(key, limit, window) {
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `${key}:${Math.floor(now / window)}`;
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      this.cleanupMemoryCache(window);
    }
    
    // Get current count
    const entry = this.inMemoryCache.get(windowKey);
    const count = entry ? entry.count : 0;
    
    if (count >= limit) {
      const resetAt = (Math.floor(now / window) + 1) * window;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }
    
    // Increment count
    const newCount = count + 1;
    this.inMemoryCache.set(windowKey, {
      count: newCount,
      expiresAt: now + window,
    });
    
    const resetAt = (Math.floor(now / window) + 1) * window;
    return {
      allowed: true,
      remaining: limit - newCount,
      resetAt,
    };
  }

  /**
   * Cleanup in-memory cache
   * @param {number} window - Time window in seconds
   */
  cleanupMemoryCache(window) {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, entry] of this.inMemoryCache.entries()) {
      if (entry.expiresAt < now) {
        this.inMemoryCache.delete(key);
      }
    }
  }

  /**
   * Check if request is allowed
   * @param {Request} request - Request object
   * @param {string} endpoint - Endpoint path
   * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number, limit: number}>}
   */
  async check(request, endpoint) {
    const ip = this.getClientIP(request);
    const limit = this.getLimit(endpoint);
    const key = `rate_limit:${ip}:${endpoint}`;
    
    const result = await this.checkLimitKV(key, limit.requests, limit.window);
    
    return {
      ...result,
      limit: limit.requests,
    };
  }

  /**
   * Create rate limit error response
   * @param {number} resetAt - Reset timestamp
   * @param {number} limit - Request limit
   * @param {string} requestId - Request ID
   * @returns {Response}
   */
  createRateLimitResponse(resetAt, limit, requestId) {
    const resetIn = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
    
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Limit: ${limit} requests per hour. Try again in ${resetIn} seconds.`,
          details: {
            limit,
            resetAt,
            resetIn,
          },
        },
        requestId,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toString(),
          'Retry-After': resetIn.toString(),
        },
      }
    );
  }
}

/**
 * Rate limit middleware
 * @param {Request} request - Request object
 * @param {string} endpoint - Endpoint path
 * @param {RateLimiter} rateLimiter - Rate limiter instance
 * @param {string} requestId - Request ID
 * @returns {Promise<Response|null>} - Error response if rate limited, null if allowed
 */
export async function rateLimitMiddleware(request, endpoint, rateLimiter, requestId) {
  if (!rateLimiter) {
    return null; // Rate limiting disabled
  }

  try {
    const url = new URL(request.url);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      return null;
    }
  } catch {
    // ignore URL parsing errors and continue with normal rate limiting
  }

  const check = await rateLimiter.check(request, endpoint);
  
  if (!check.allowed) {
    return rateLimiter.createRateLimitResponse(check.resetAt, check.limit, requestId);
  }
  
  return null; // Allowed
}

