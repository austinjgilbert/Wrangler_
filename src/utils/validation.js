/**
 * Validation Utilities
 * URL validation, SSRF protection, and input sanitization
 */

import { BLOCKED_HOSTS, BLOCKED_TLDS } from '../config/constants.js';

/**
 * Check if URL is blocked (SSRF protection)
 * @param {string} urlString - URL to check
 * @returns {boolean}
 */
export function isBlockedUrl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    
    // Check blocked hosts
    if (BLOCKED_HOSTS.some(blocked => hostname === blocked || hostname.endsWith(`.${blocked}`))) {
      return true;
    }
    
    // Check blocked TLDs
    if (BLOCKED_TLDS.some(tld => hostname.endsWith(tld))) {
      return true;
    }
    
    // Block private IP ranges
    if (hostname.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/)) {
      return true;
    }
    
    return false;
  } catch (e) {
    return true; // Invalid URL is considered blocked
  }
}

/**
 * Validate and normalize URL
 * @param {string} urlString - URL to validate
 * @returns {{valid: boolean, url?: string, error?: string}}
 */
export function validateUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }
  
  if (urlString.length > 2048) {
    return { valid: false, error: 'URL exceeds maximum length of 2048 characters' };
  }
  
  // Add protocol if missing
  let normalized = urlString.trim();
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = `https://${normalized}`;
  }
  
  try {
    const url = new URL(normalized);
    
    // Only allow http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }
    
    // Check if blocked
    if (isBlockedUrl(normalized)) {
      return { valid: false, error: 'URL is blocked for security reasons (SSRF protection)' };
    }
    
    return { valid: true, url: normalized };
  } catch (e) {
    return { valid: false, error: `Invalid URL format: ${e.message}` };
  }
}

/**
 * Extract allowed headers from response (security: don't leak sensitive info)
 * @param {Headers} headers - Response headers
 * @param {string[]} allowedHeaders - Array of allowed header names (lowercase)
 * @returns {Record<string, string>}
 */
export function extractAllowedHeaders(headers, allowedHeaders) {
  if (!headers || !allowedHeaders) {
    return {};
  }
  
  const result = {};
  for (const [key, value] of headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (allowedHeaders.includes(lowerKey)) {
      result[key] = value;
    }
  }
  return result;
}

