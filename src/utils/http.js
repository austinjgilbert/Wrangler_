/**
 * HTTP Utilities
 * Fetch wrappers, timeouts, and concurrency control
 */

/**
 * Fetch with timeout
 * @param {RequestInfo} resource - URL or Request object
 * @param {RequestInit} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>}
 * @throws {Error} AbortError if timeout occurs
 */
export async function fetchWithTimeout(resource, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    // Enhance timeout error message
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      const timeoutError = new Error(`Request timeout after ${timeoutMs}ms: ${typeof resource === 'string' ? resource : resource.url || 'unknown URL'}`);
      timeoutError.name = 'AbortError';
      timeoutError.timeout = true;
      timeoutError.timeoutMs = timeoutMs;
      throw timeoutError;
    }
    throw error;
  }
}

/**
 * Map over items with concurrency limit
 * @template T, R
 * @param {T[]} items - Items to process
 * @param {number} limit - Maximum concurrent operations
 * @param {(item: T, index: number) => Promise<R>} fn - Async function to apply
 * @returns {Promise<R[]>}
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = [];
  const workerCount = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

/**
 * Clamp array to maximum length
 * @template T
 * @param {T[]} arr - Array to clamp
 * @param {number} max - Maximum length
 * @returns {T[]}
 */
export function clampArray(arr, max) {
  if (!Array.isArray(arr)) return [];
  return arr.length > max ? arr.slice(0, max) : arr;
}

/**
 * Clamp number to range
 * @param {number} n - Number to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number}
 */
export function clampNumber(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

