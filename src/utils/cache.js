/**
 * Cache Utilities
 * Content hashing and cache management
 */

/**
 * Hash URL for cache key
 * @param {string} url - URL to hash
 * @returns {string}
 */
export function hashUrl(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Calculate content hash (SHA-256)
 * @param {string} text - Text to hash
 * @returns {Promise<string>}
 */
export async function calculateContentHash(text) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback to simple hash if crypto.subtle not available
    return hashUrl(text);
  }
}

/**
 * Cache interface (abstract - implement with KV or in-memory)
 */
export class CacheInterface {
  constructor(kvNamespace = null) {
    this.kv = kvNamespace;
    this.memory = new Map(); // Fallback in-memory cache
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {Promise<{value: any, ageSec: number, contentHash: string}|null>}
   */
  async get(key) {
    try {
      if (this.kv) {
        const cached = await this.kv.get(key, { type: 'json' });
        if (cached) {
          const ageSec = Math.floor((Date.now() - cached.timestamp) / 1000);
          return {
            value: cached.value,
            ageSec,
            contentHash: cached.contentHash,
          };
        }
      } else {
        const cached = this.memory.get(key);
        if (cached) {
          const ageSec = Math.floor((Date.now() - cached.timestamp) / 1000);
          if (ageSec < 86400) { // 24 hours
            return {
              value: cached.value,
              ageSec,
              contentHash: cached.contentHash,
            };
          }
          this.memory.delete(key);
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Set cached value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {string} contentHash - Content hash
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<void>}
   */
  async set(key, value, contentHash, ttlSeconds = 86400) {
    try {
      const cached = {
        value,
        contentHash,
        timestamp: Date.now(),
      };
      
      if (this.kv) {
        await this.kv.put(key, JSON.stringify(cached), { expirationTtl: ttlSeconds });
      } else {
        this.memory.set(key, cached);
        // Clean up old entries periodically
        if (this.memory.size > 1000) {
          const oldestKey = this.memory.keys().next().value;
          this.memory.delete(oldestKey);
        }
      }
    } catch (e) {
      // Cache failures are non-fatal
    }
  }
}

