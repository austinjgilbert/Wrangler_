/**
 * OSINT Utility Functions
 * Helper functions for the OSINT pipeline
 */

/**
 * Extract root domain from URL
 * @param {string} url
 * @returns {string}
 */
export function extractRootDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return url.split('/')[2]?.replace(/^www\./, '') || url;
  }
}

/**
 * Check if URL is first-party (matches root domain)
 * @param {string} url
 * @param {string} rootDomain
 * @returns {boolean}
 */
export function isFirstParty(url, rootDomain) {
  try {
    const urlObj = new URL(url);
    const urlDomain = urlObj.hostname.replace(/^www\./, '');
    return urlDomain === rootDomain || urlDomain.endsWith('.' + rootDomain);
  } catch (e) {
    return false;
  }
}

/**
 * Normalize URL to canonical form
 * @param {string} url
 * @returns {string|null}
 */
export function normalizeUrl(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    // Force https, lowercase, strip trailing slash
    urlObj.protocol = 'https:';
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '') || '/';
    return urlObj.toString().toLowerCase();
  } catch (e) {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Deduplicate array of objects by a key
 * @param {Array} array
 * @param {string} key
 * @returns {Array}
 */
export function deduplicateByKey(array, key = 'url') {
  const seen = new Set();
  return array.filter(item => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/**
 * Calculate days between two dates
 * @param {string|Date} date1
 * @param {string|Date} date2
 * @returns {number}
 */
export function daysBetween(date1, date2 = new Date()) {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

/**
 * Truncate text to max length with ellipsis
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateText(text, maxLength = 500) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Extract keywords from text (simple implementation)
 * @param {string} text
 * @param {number} minLength
 * @returns {Array<string>}
 */
export function extractKeywords(text, minLength = 3) {
  if (!text) return [];
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= minLength);
  
  // Count frequency
  const freq = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }
  
  // Sort by frequency and return top keywords
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

/**
 * Format date to ISO string
 * @param {Date|string|null} date
 * @returns {string|null}
 */
export function formatDate(date) {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return date.toISOString();
}

/**
 * Safe JSON parse with fallback
 * @param {string} json
 * @param {any} fallback
 * @returns {any}
 */
export function safeJsonParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch (e) {
    return fallback;
  }
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn
 * @param {number} maxRetries
 * @param {number} initialDelay
 * @returns {Promise<any>}
 */
export async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

