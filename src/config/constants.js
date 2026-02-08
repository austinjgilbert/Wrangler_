/**
 * Application Constants
 * Centralized configuration and limits
 */

// SSRF Protection
export const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
];

export const BLOCKED_TLDS = ['.local'];

// Security: Allowed headers to return (don't leak sensitive info)
export const ALLOWED_HEADERS = [
  'server',
  'x-powered-by',
  'content-type',
  'cache-control',
  'via',
  'cf-ray',
  'cf-cache-status',
  'x-vercel-id',
  'x-vercel-cache',
  'x-served-by',
  'x-cache',
  'x-amz-cf-id',
  'x-amz-cf-pop',
  'strict-transport-security',
];

// Size Limits
export const MAX_HTML_SIZE = 250 * 1024; // 250KB
export const HTML_SNIPPET_SIZE = 20 * 1024; // 20KB
export const MAX_SCRIPTS = 300;
export const MAX_LINKS = 300;
export const SITEMAP_SNIPPET_SIZE = 20 * 1024; // 20KB

// Batch Scanning Limits (avoid Cloudflare 1102 resource limit errors)
export const BATCH_MAX_URLS_LIGHT = 10;
export const BATCH_MAX_URLS_FULL = 3;
export const BATCH_CONCURRENCY_LIGHT = 2;
export const BATCH_CONCURRENCY_FULL = 1;
export const BATCH_FETCH_TIMEOUT_MS_LIGHT = 8000;
export const BATCH_FETCH_TIMEOUT_MS_FULL = 12000;
export const BATCH_MAX_HTML_SIZE = 150 * 1024; // Smaller than MAX_HTML_SIZE to reduce CPU/memory in batch

// Cache Configuration
export const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
export const CACHE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// API Configuration
export const API_VERSION = '1.0.0';
export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_CONCURRENCY = 5;

