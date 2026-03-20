/**
 * Extension payload sanitization.
 *
 * Defense-in-depth for /extension/ask (and future /extension/feedback).
 * Enforces size limits, strips HTML from stored strings, and truncates
 * arrays to prevent oversized payloads from reaching Sanity or LLMs.
 *
 * SECURITY: Sanitize-on-write, not sanitize-on-read. Values are cleaned
 * before they enter the system, so every downstream consumer is safe.
 */

/** Max total request body size (bytes). Checked via Content-Length header. */
export const MAX_BODY_BYTES = 51200; // 50KB

/** Field-level limits for the extension ask/capture payload. */
const FIELD_LIMITS = {
  prompt: 500,
  rawText: 10240,
  headings: 50,
  links: 50,
  people: 50,
  accounts: 20,
  emails: 30,
  phones: 30,
  technologies: 50,
};

/**
 * Strip HTML tags from a string. Prevents stored XSS when values
 * are later rendered in the SDK dashboard or Sanity Studio.
 *
 * @param {string} value
 * @returns {string}
 */
export function stripHtmlTags(value) {
  return String(value || '').replace(/<[^>]*>/g, '');
}

/**
 * Truncate a string to maxLen characters, appending '…' if truncated.
 *
 * @param {string} value
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(value, maxLen) {
  const str = String(value || '');
  return str.length <= maxLen ? str : str.slice(0, maxLen) + '…';
}

/**
 * Sanitize an extension ask/capture payload in place.
 *
 * Returns a cleaned shallow copy — does NOT mutate the original.
 * Applies:
 *   - String field truncation (prompt, rawText)
 *   - Array field slicing (headings, links, people, accounts, emails, phones, technologies)
 *   - HTML tag stripping on prompt and rawText
 *
 * @param {Record<string, any>} body - Parsed request body
 * @returns {Record<string, any>} Sanitized copy
 */
export function sanitizeExtensionPayload(body) {
  if (!body || typeof body !== 'object') return {};

  const clean = { ...body };

  // ── String fields: strip HTML + truncate ──────────────────────────
  if (clean.prompt != null) {
    clean.prompt = truncate(stripHtmlTags(clean.prompt), FIELD_LIMITS.prompt);
  }
  if (clean.rawText != null) {
    clean.rawText = truncate(stripHtmlTags(clean.rawText), FIELD_LIMITS.rawText);
  }

  // ── Array fields: slice to limit ──────────────────────────────────
  if (Array.isArray(clean.headings)) {
    clean.headings = clean.headings.slice(0, FIELD_LIMITS.headings);
  }
  if (Array.isArray(clean.links)) {
    clean.links = clean.links.slice(0, FIELD_LIMITS.links);
  }
  if (Array.isArray(clean.people)) {
    clean.people = clean.people.slice(0, FIELD_LIMITS.people);
  }
  if (Array.isArray(clean.accounts)) {
    clean.accounts = clean.accounts.slice(0, FIELD_LIMITS.accounts);
  }
  if (Array.isArray(clean.emails)) {
    clean.emails = clean.emails.slice(0, FIELD_LIMITS.emails);
  }
  if (Array.isArray(clean.phones)) {
    clean.phones = clean.phones.slice(0, FIELD_LIMITS.phones);
  }
  if (Array.isArray(clean.technologies)) {
    clean.technologies = clean.technologies.slice(0, FIELD_LIMITS.technologies);
  }

  return clean;
}

/**
 * Check Content-Length header against MAX_BODY_BYTES.
 *
 * @param {Request} request
 * @returns {boolean} true if body is within limits
 */
export function isBodyWithinSizeLimit(request) {
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  // Content-Length of 0 means either no header or empty body — allow it
  // (the handler will reject on missing required fields instead).
  return contentLength === 0 || contentLength <= MAX_BODY_BYTES;
}
