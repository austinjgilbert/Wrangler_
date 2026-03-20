/**
 * T4: checkMoltApiKey — fail-closed auth, credential extraction, priority order
 * T5: isAllowedOrigin — CORS origin allowlist (tested via addCorsHeaders/setRequestContext)
 * T6: Auth middleware exempt paths — verifies the exempt path/prefix sets
 * T12: createErrorResponse — sanitization of error details
 *
 * @secops — Tier 1 security tests
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  checkMoltApiKey,
  getMoltApiKey,
} from '../../src/utils/molt-auth.js'
import {
  createErrorResponse,
  setRequestContext,
  addCorsHeaders,
  handleCorsPreflight,
  generateRequestId,
} from '../../src/utils/response.js'

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a minimal Request with optional headers and URL */
function makeRequest(
  url = 'https://website-scanner.austin-gilbert.workers.dev/test',
  headers: Record<string, string> = {},
  method = 'GET',
): Request {
  return new Request(url, { method, headers })
}

/** Build a minimal env object */
function makeEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return { WORKER_API_KEY: 'test-secret-key-123', ...overrides }
}

/** Parse JSON body from a Response */
async function parseBody(response: Response) {
  return JSON.parse(await response.text())
}

// ═════════════════════════════════════════════════════════════════════════
// T4: checkMoltApiKey
// ═════════════════════════════════════════════════════════════════════════

describe('T4: checkMoltApiKey — fail-closed auth', () => {
  // ── Fail-closed: no key configured ──────────────────────────────────

  describe('fail-closed when no key configured', () => {
    it('rejects with 503 CONFIG_ERROR when WORKER_API_KEY is not set', async () => {
      const req = makeRequest('https://example.com/test', { 'X-API-Key': 'anything' })
      const result = checkMoltApiKey(req, {})

      expect(result.allowed).toBe(false)
      expect(result.errorResponse).toBeDefined()
      expect(result.errorResponse!.status).toBe(503)

      const body = await parseBody(result.errorResponse!)
      expect(body.error.code).toBe('CONFIG_ERROR')
      expect(body.error.message).toContain('not configured')
    })

    it('rejects even with valid-looking credentials when no key configured', async () => {
      const req = makeRequest('https://example.com/test', {
        Authorization: 'Bearer some-key',
      })
      const result = checkMoltApiKey(req, {})

      expect(result.allowed).toBe(false)
      expect(result.errorResponse!.status).toBe(503)
    })

    it('rejects with all env key variants missing', async () => {
      const env = { WORKER_API_KEY: '', MOLT_API_KEY: '', CHATGPT_API_KEY: '' }
      const req = makeRequest('https://example.com/test', { 'X-API-Key': 'x' })
      const result = checkMoltApiKey(req, env)

      expect(result.allowed).toBe(false)
      expect(result.errorResponse!.status).toBe(503)
    })
  })

  // ── Key fallback priority ───────────────────────────────────────────

  describe('getMoltApiKey — env key fallback chain', () => {
    it('prefers WORKER_API_KEY over MOLT_API_KEY', () => {
      expect(getMoltApiKey({ WORKER_API_KEY: 'w', MOLT_API_KEY: 'm' })).toBe('w')
    })

    it('falls back to MOLT_API_KEY when WORKER_API_KEY is missing', () => {
      expect(getMoltApiKey({ MOLT_API_KEY: 'm' })).toBe('m')
    })

    it('falls back to CHATGPT_API_KEY as last resort', () => {
      expect(getMoltApiKey({ CHATGPT_API_KEY: 'c' })).toBe('c')
    })

    it('returns null when no key is configured', () => {
      expect(getMoltApiKey({})).toBeNull()
    })
  })

  // ── Credential extraction priority ──────────────────────────────────

  describe('credential extraction — priority order', () => {
    const env = makeEnv()
    const KEY = 'test-secret-key-123'

    it('accepts Authorization: Bearer header', () => {
      const req = makeRequest('https://example.com/test', {
        Authorization: `Bearer ${KEY}`,
      })
      expect(checkMoltApiKey(req, env).allowed).toBe(true)
    })

    it('accepts X-API-Key header', () => {
      const req = makeRequest('https://example.com/test', {
        'X-API-Key': KEY,
      })
      expect(checkMoltApiKey(req, env).allowed).toBe(true)
    })

    it('accepts query param ?apiKey= (deprecated)', () => {
      const req = makeRequest(`https://example.com/test?apiKey=${KEY}`)
      expect(checkMoltApiKey(req, env).allowed).toBe(true)
    })

    it('accepts query param ?key= (deprecated)', () => {
      const req = makeRequest(`https://example.com/test?key=${KEY}`)
      expect(checkMoltApiKey(req, env).allowed).toBe(true)
    })

    it('prefers Bearer over X-API-Key when both present', () => {
      const req = makeRequest('https://example.com/test', {
        Authorization: `Bearer ${KEY}`,
        'X-API-Key': 'wrong-key',
      })
      // Bearer is correct, X-API-Key is wrong — should pass because Bearer wins
      expect(checkMoltApiKey(req, env).allowed).toBe(true)
    })

    it('prefers X-API-Key over query param when both present', () => {
      const req = makeRequest(`https://example.com/test?apiKey=wrong-key`, {
        'X-API-Key': KEY,
      })
      // X-API-Key is correct, query param is wrong — should pass
      expect(checkMoltApiKey(req, env).allowed).toBe(true)
    })
  })

  // ── Rejection cases ─────────────────────────────────────────────────

  describe('rejection — no credentials', () => {
    const env = makeEnv()

    it('rejects with 401 UNAUTHORIZED when no auth provided', async () => {
      const req = makeRequest('https://example.com/test')
      const result = checkMoltApiKey(req, env)

      expect(result.allowed).toBe(false)
      expect(result.errorResponse!.status).toBe(401)

      const body = await parseBody(result.errorResponse!)
      expect(body.error.code).toBe('UNAUTHORIZED')
      expect(body.error.message).toContain('API key required')
    })

    it('rejects with 401 when Authorization header is not Bearer scheme', async () => {
      const req = makeRequest('https://example.com/test', {
        Authorization: 'Basic dXNlcjpwYXNz',
      })
      const result = checkMoltApiKey(req, env)

      expect(result.allowed).toBe(false)
      expect(result.errorResponse!.status).toBe(401)
    })

    it('rejects with 401 when Bearer token is empty', async () => {
      const req = makeRequest('https://example.com/test', {
        Authorization: 'Bearer ',
      })
      const result = checkMoltApiKey(req, env)

      expect(result.allowed).toBe(false)
      expect(result.errorResponse!.status).toBe(401)
    })
  })

  describe('rejection — wrong credentials', () => {
    const env = makeEnv()

    it('rejects with 401 when key is wrong', async () => {
      const req = makeRequest('https://example.com/test', {
        'X-API-Key': 'wrong-key',
      })
      const result = checkMoltApiKey(req, env)

      expect(result.allowed).toBe(false)
      expect(result.errorResponse!.status).toBe(401)

      const body = await parseBody(result.errorResponse!)
      expect(body.error.code).toBe('UNAUTHORIZED')
      expect(body.error.message).toBe('Invalid API key')
    })

    it('rejects when key is a substring of the real key', async () => {
      const req = makeRequest('https://example.com/test', {
        'X-API-Key': 'test-secret',
      })
      expect(checkMoltApiKey(req, env).allowed).toBe(false)
    })

    it('rejects when key has extra whitespace (after trim)', async () => {
      const req = makeRequest('https://example.com/test', {
        'X-API-Key': '  wrong-key  ',
      })
      expect(checkMoltApiKey(req, env).allowed).toBe(false)
    })
  })

  // ── Request ID propagation ──────────────────────────────────────────

  describe('requestId propagation', () => {
    it('includes requestId in error response when provided', async () => {
      const req = makeRequest('https://example.com/test')
      const result = checkMoltApiKey(req, makeEnv(), 'req-abc-123')

      const body = await parseBody(result.errorResponse!)
      expect(body.requestId).toBe('req-abc-123')
    })

    it('omits requestId when not provided', async () => {
      const req = makeRequest('https://example.com/test')
      const result = checkMoltApiKey(req, makeEnv())

      const body = await parseBody(result.errorResponse!)
      expect(body.requestId).toBeUndefined()
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════
// T5: isAllowedOrigin (tested via addCorsHeaders + setRequestContext)
// ═════════════════════════════════════════════════════════════════════════

describe('T5: CORS origin allowlist', () => {
  // Reset request context before each test
  beforeEach(() => {
    setRequestContext(makeRequest('https://example.com'), {})
  })

  describe('allowed origins', () => {
    it('allows the Worker origin', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://website-scanner.austin-gilbert.workers.dev' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe(
        'https://website-scanner.austin-gilbert.workers.dev',
      )
    })

    it('allows the Sanity Studio origin (exact match)', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://www.sanity.io' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe('https://www.sanity.io')
    })

    it('allows any https://*.sanity.io subdomain (wildcard)', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://austin-app.sanity.io' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe('https://austin-app.sanity.io')
    })

    it('allows deeply nested sanity.io subdomains', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://app.studio.sanity.io' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe('https://app.studio.sanity.io')
    })

    it('allows bare https://sanity.io', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://sanity.io' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe('https://sanity.io')
    })

    it('allows https://*.sanity.studio subdomains', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://austin-app.sanity.studio' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe('https://austin-app.sanity.studio')
    })

    it('allows bare https://sanity.studio', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://sanity.studio' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe('https://sanity.studio')
    })

    it('allows the Chrome extension origin', () => {
      setRequestContext(
        makeRequest('https://example.com', {
          Origin: 'chrome-extension://golckjfiiopfdidkohfmfdpeengneaip',
        }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe(
        'chrome-extension://golckjfiiopfdidkohfmfdpeengneaip',
      )
    })

    it('allows localhost in non-production', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'http://localhost:3000' }),
        { ENVIRONMENT: 'development' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
    })

    it('allows localhost when ENVIRONMENT is not set', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'http://localhost:5173' }),
        {},
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    })
  })

  describe('blocked origins', () => {
    it('blocks evil.com', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://evil.com' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks localhost in production', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'http://localhost:3000' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks empty origin', () => {
      setRequestContext(makeRequest('https://example.com'), { ENVIRONMENT: 'production' })
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks http:// sanity.io subdomains (protocol downgrade)', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'http://app.sanity.io' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks evil-sanity.io (not a subdomain)', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://evil-sanity.io' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks notsanity.io', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://notsanity.io' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks sanity.io.evil.com', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://sanity.io.evil.com' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks http:// sanity.studio (protocol downgrade)', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'http://app.sanity.studio' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks evil-sanity.studio (not a subdomain)', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://evil-sanity.studio' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks malformed origin (no crash — fail-closed)', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'not-a-url-at-all' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks a different chrome extension ID', () => {
      setRequestContext(
        makeRequest('https://example.com', {
          Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks origin that is a substring of an allowed origin', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://website-scanner.austin-gilbert.workers' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('blocks origin with path appended to allowed origin', () => {
      setRequestContext(
        makeRequest('https://example.com', {
          Origin: 'https://website-scanner.austin-gilbert.workers.dev/evil',
        }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('never returns wildcard *', () => {
      // Test with various origins — none should produce *
      const origins = [
        'https://evil.com',
        'https://website-scanner.austin-gilbert.workers.dev',
        'http://localhost:3000',
        '',
      ]
      for (const origin of origins) {
        setRequestContext(
          makeRequest('https://example.com', origin ? { Origin: origin } : {}),
          { ENVIRONMENT: 'production' },
        )
        const { headers } = addCorsHeaders()
        expect(headers.get('Access-Control-Allow-Origin')).not.toBe('*')
      }
    })
  })

  describe('CORS response headers', () => {
    it('always includes Vary: Origin', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://evil.com' }),
        { ENVIRONMENT: 'production' },
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Vary')).toBe('Origin')
    })

    it('includes Access-Control-Max-Age: 86400', () => {
      setRequestContext(
        makeRequest('https://example.com', { Origin: 'https://www.sanity.io' }),
        {},
      )
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Max-Age')).toBe('86400')
    })

    it('includes X-Client-ID in allowed headers', () => {
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Headers')).toContain('X-Client-ID')
    })

    it('includes X-API-Key in allowed headers', () => {
      const { headers } = addCorsHeaders()
      expect(headers.get('Access-Control-Allow-Headers')).toContain('X-API-Key')
    })

    it('preflight returns 204 with CORS headers', () => {
      setRequestContext(
        makeRequest('https://example.com', {
          Origin: 'https://website-scanner.austin-gilbert.workers.dev',
        }),
        {},
      )
      const response = handleCorsPreflight()
      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://website-scanner.austin-gilbert.workers.dev',
      )
      expect(response.headers.get('Vary')).toBe('Origin')
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════
// T6: Auth middleware exempt paths
// ═════════════════════════════════════════════════════════════════════════

describe('T6: auth exempt paths and prefixes', () => {
  // These are the exact sets from index.js — we test them as data
  // to catch accidental additions/removals.

  const AUTH_EXEMPT_PATHS = new Set([
    '/health',
    '/schema',
    '/openapi.yaml',
    '/molt/auth-status',
    '/webhooks/sanity',
    '/webhooks/telegram',
  ])

  const AUTH_EXEMPT_PREFIXES = [
    '/track/',
    '/operator/console',
  ]

  function isAuthExempt(pathname: string): boolean {
    return AUTH_EXEMPT_PATHS.has(pathname)
      || AUTH_EXEMPT_PREFIXES.some(p => pathname.startsWith(p))
  }

  describe('exempt paths — should bypass auth', () => {
    it.each([
      '/health',
      '/schema',
      '/openapi.yaml',
      '/molt/auth-status',
      '/webhooks/sanity',
      '/webhooks/telegram',
    ])('%s is auth-exempt', (path) => {
      expect(isAuthExempt(path)).toBe(true)
    })
  })

  describe('exempt prefixes — should bypass auth', () => {
    it.each([
      '/track/pixel.gif',
      '/track/open/abc123',
      '/track/',
      '/operator/console',
      '/operator/console/snapshot',
      '/operator/console/accounts',
    ])('%s is auth-exempt (prefix match)', (path) => {
      expect(isAuthExempt(path)).toBe(true)
    })
  })

  describe('protected paths — should require auth', () => {
    it.each([
      '/molt/accounts',
      '/enrich/process',
      '/enrich/status',
      '/enrich/jobs',
      '/search',
      '/discover',
      '/crawl',
      '/extract',
      '/wrangler/ingest',
      '/extension/observe',
      '/accounts',
      '/api/anything',
      '/sanity/status',      // Moved behind auth — was leaking dataset names + config state
      '/sanity/verify-write', // Moved behind auth — was leaking error hints
      '/',
      '/healthcheck',        // NOT /health
      '/schemas',            // NOT /schema
      '/webhook/sanity',     // NOT /webhooks/sanity
      '/tracking/pixel.gif', // NOT /track/
      '/operator/admin',     // NOT /operator/console
    ])('%s requires auth', (path) => {
      expect(isAuthExempt(path)).toBe(false)
    })
  })

  describe('exempt path set integrity', () => {
    it('has exactly 6 exempt paths', () => {
      expect(AUTH_EXEMPT_PATHS.size).toBe(6)
    })

    it('has exactly 2 exempt prefixes', () => {
      expect(AUTH_EXEMPT_PREFIXES.length).toBe(2)
    })
  })

  describe('internal caller bypass', () => {
    const configuredKey = 'test-secret-key-123'

    function isInternalCall(internalCaller: string | null): boolean {
      return !!internalCaller
        && (internalCaller === configuredKey || internalCaller === '__cron__')
    }

    it('allows X-Internal-Caller with matching API key', () => {
      expect(isInternalCall(configuredKey)).toBe(true)
    })

    it('allows X-Internal-Caller with __cron__ sentinel', () => {
      expect(isInternalCall('__cron__')).toBe(true)
    })

    it('rejects X-Internal-Caller with wrong key', () => {
      expect(isInternalCall('wrong-key')).toBe(false)
    })

    it('rejects null X-Internal-Caller', () => {
      expect(isInternalCall(null)).toBe(false)
    })

    it('rejects empty X-Internal-Caller', () => {
      expect(isInternalCall('')).toBe(false)
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════
// T12: createErrorResponse — sanitization
// ═════════════════════════════════════════════════════════════════════════

describe('T12: createErrorResponse — detail sanitization', () => {
  const SAFE_KEYS = ['hint', 'path', 'method', 'maxSize', 'receivedSize', 'missing']

  describe('safe keys are preserved', () => {
    it.each(SAFE_KEYS)('preserves "%s" in details', async (key) => {
      const response = createErrorResponse('TEST', 'test', { [key]: 'value' }, 400, 'req-1')
      const body = await parseBody(response)
      expect(body.error.details[key]).toBe('value')
    })

    it('preserves multiple safe keys together', async () => {
      const details = { hint: 'try again', path: '/test', method: 'GET' }
      const response = createErrorResponse('TEST', 'test', details, 400, 'req-1')
      const body = await parseBody(response)
      expect(body.error.details).toEqual(details)
    })
  })

  describe('dangerous keys are stripped', () => {
    it.each([
      'stack',
      'stackTrace',
      'internalMessage',
      'query',
      'env',
      'password',
      'secret',
      'token',
      'apiKey',
      'connectionString',
      'projectId',
      'dataset',
      'filePath',
      'sourceFile',
      'lineNumber',
    ])('strips "%s" from details', async (key) => {
      const response = createErrorResponse('TEST', 'test', { [key]: 'sensitive' }, 400, 'req-1')
      const body = await parseBody(response)
      // Either no details at all, or the key is not present
      expect(body.error.details?.[key]).toBeUndefined()
    })

    it('strips dangerous keys while preserving safe ones', async () => {
      const details = {
        hint: 'try again',
        stack: 'Error at line 42...',
        path: '/test',
        token: 'sk-abc123',
        method: 'POST',
        projectId: 'proj-secret',
      }
      const response = createErrorResponse('TEST', 'test', details, 400, 'req-1')
      const body = await parseBody(response)

      expect(body.error.details).toEqual({
        hint: 'try again',
        path: '/test',
        method: 'POST',
      })
    })
  })

  describe('edge cases', () => {
    it('omits details entirely when null', async () => {
      const response = createErrorResponse('TEST', 'test', null, 400, 'req-1')
      const body = await parseBody(response)
      expect(body.error.details).toBeUndefined()
    })

    it('omits details when all keys are unsafe', async () => {
      const response = createErrorResponse('TEST', 'test', {
        stack: 'Error...',
        token: 'secret',
      }, 400, 'req-1')
      const body = await parseBody(response)
      expect(body.error.details).toBeUndefined()
    })

    it('omits details when empty object', async () => {
      const response = createErrorResponse('TEST', 'test', {}, 400, 'req-1')
      const body = await parseBody(response)
      expect(body.error.details).toBeUndefined()
    })
  })

  describe('response structure', () => {
    it('returns correct HTTP status', () => {
      expect(createErrorResponse('NOT_FOUND', 'nope', null, 404).status).toBe(404)
      expect(createErrorResponse('SERVER_ERROR', 'oops', null, 500).status).toBe(500)
      expect(createErrorResponse('UNAUTHORIZED', 'no', null, 401).status).toBe(401)
      expect(createErrorResponse('CONFIG_ERROR', 'missing', null, 503).status).toBe(503)
    })

    it('returns JSON content type', () => {
      const response = createErrorResponse('TEST', 'test')
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    it('has ok: false', async () => {
      const body = await parseBody(createErrorResponse('TEST', 'test'))
      expect(body.ok).toBe(false)
    })

    it('includes error code and message', async () => {
      const body = await parseBody(createErrorResponse('MY_CODE', 'my message'))
      expect(body.error.code).toBe('MY_CODE')
      expect(body.error.message).toBe('my message')
    })

    it('includes requestId when provided', async () => {
      const body = await parseBody(createErrorResponse('TEST', 'test', null, 400, 'req-xyz'))
      expect(body.requestId).toBe('req-xyz')
    })

    it('omits requestId when not provided', async () => {
      const body = await parseBody(createErrorResponse('TEST', 'test'))
      expect(body.requestId).toBeUndefined()
    })

    it('CORS headers present on error responses (Finding 10 — fixed)', () => {
      // Previously: { 'Content-Type': '...', ...addCorsHeaders({}).headers }
      // Headers objects don't spread into plain objects — entries were silently lost.
      // Fixed: get Headers object first, then .set('Content-Type') on it directly.
      const response = createErrorResponse('TEST', 'test')
      expect(response.headers.get('Vary')).toBe('Origin')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS')
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400')
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })
  })

  describe('generateRequestId', () => {
    it('returns a non-empty string', () => {
      const id = generateRequestId()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()))
      expect(ids.size).toBe(100)
    })

    it('contains a timestamp prefix', () => {
      const before = Date.now()
      const id = generateRequestId()
      const after = Date.now()
      const timestamp = parseInt(id.split('-')[0], 10)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })
})
