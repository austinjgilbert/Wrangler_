/**
 * Monitoring and Observability Utility
 * Tracks metrics, logs, and errors
 */

/**
 * Metrics class for tracking request metrics
 */
export class Metrics {
  constructor(env) {
    this.analytics = env.ANALYTICS_ENDPOINT; // Optional analytics endpoint
    this.enabled = env.ENABLE_METRICS !== 'false'; // Enabled by default
    this.metrics = {
      requests: 0,
      errors: 0,
      durations: [],
      endpoints: {},
    };
  }

  /**
   * Track request
   * @param {string} endpoint - Endpoint path
   * @param {number} duration - Request duration in ms
   * @param {number} status - HTTP status code
   * @param {string} requestId - Request ID
   */
  async trackRequest(endpoint, duration, status, requestId) {
    if (!this.enabled) return;

    this.metrics.requests++;
    
    if (status >= 400) {
      this.metrics.errors++;
    }
    
    this.metrics.durations.push(duration);
    
    // Keep only last 1000 durations
    if (this.metrics.durations.length > 1000) {
      this.metrics.durations.shift();
    }
    
    // Track by endpoint
    if (!this.metrics.endpoints[endpoint]) {
      this.metrics.endpoints[endpoint] = {
        count: 0,
        errors: 0,
        totalDuration: 0,
        avgDuration: 0,
      };
    }
    
    const endpointMetrics = this.metrics.endpoints[endpoint];
    endpointMetrics.count++;
    endpointMetrics.totalDuration += duration;
    endpointMetrics.avgDuration = endpointMetrics.totalDuration / endpointMetrics.count;
    
    if (status >= 400) {
      endpointMetrics.errors++;
    }
    
    // Send to analytics endpoint if configured
    if (this.analytics) {
      try {
        await fetch(this.analytics, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint,
            duration,
            status,
            requestId,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {
          // Silently fail analytics
        });
      } catch {
        // Silently fail analytics
      }
    }
  }

  /**
   * Track error
   * @param {Error} error - Error object
   * @param {object} context - Error context
   * @param {string} requestId - Request ID
   */
  async trackError(error, context = {}, requestId = null) {
    if (!this.enabled) return;

    const errorData = {
      message: error.message,
      stack: error.stack,
      context,
      requestId,
      timestamp: new Date().toISOString(),
    };
    
    // Log error (in production, send to error tracking service)
    console.error('Error tracked:', JSON.stringify(errorData));
    
    // Send to analytics if configured
    if (this.analytics) {
      try {
        await fetch(`${this.analytics}/errors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorData),
        }).catch(() => {
          // Silently fail
        });
      } catch {
        // Silently fail
      }
    }
  }

  /**
   * Get metrics summary
   * @returns {object} - Metrics summary
   */
  getMetrics() {
    const durations = this.metrics.durations;
    const sortedDurations = [...durations].sort((a, b) => a - b);
    
    return {
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      errorRate: this.metrics.requests > 0 
        ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2) + '%'
        : '0%',
      duration: {
        avg: durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
        min: durations.length > 0 ? Math.min(...durations) : 0,
        max: durations.length > 0 ? Math.max(...durations) : 0,
        p50: sortedDurations.length > 0
          ? sortedDurations[Math.floor(sortedDurations.length * 0.5)]
          : 0,
        p95: sortedDurations.length > 0
          ? sortedDurations[Math.floor(sortedDurations.length * 0.95)]
          : 0,
        p99: sortedDurations.length > 0
          ? sortedDurations[Math.floor(sortedDurations.length * 0.99)]
          : 0,
      },
      endpoints: this.metrics.endpoints,
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      requests: 0,
      errors: 0,
      durations: [],
      endpoints: {},
    };
  }
}

/**
 * Create monitoring middleware
 * @param {Request} request - Request object
 * @param {string} endpoint - Endpoint path
 * @param {Metrics} metrics - Metrics instance
 * @param {Function} handler - Request handler
 * @returns {Promise<Response>} - Handler response
 */
export async function monitoringMiddleware(request, endpoint, metrics, handler) {
  const startTime = Date.now();
  let requestId = null;
  
  try {
    // Execute handler
    const response = await handler();
    
    // Extract request ID from response if available
    try {
      const responseClone = response.clone();
      const data = await responseClone.json();
      requestId = data.requestId || null;
    } catch {
      // Response not JSON or already consumed
    }
    
    const duration = Date.now() - startTime;
    const status = response.status;
    
    // Track request
    if (metrics) {
      await metrics.trackRequest(endpoint, duration, status, requestId);
    }
    
    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Track error
    if (metrics) {
      await metrics.trackError(error, { endpoint, duration }, requestId);
    }
    
    throw error;
  }
}

