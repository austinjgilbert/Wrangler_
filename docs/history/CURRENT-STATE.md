# Current Repository State

## Summary
This is a Cloudflare Worker written in **JavaScript** (module syntax) that provides website scanning capabilities for a ChatGPT Custom GPT Action.

## Current Routes/Endpoints

1. **`GET /health`**
   - Returns: `{ ok: true }`
   - Purpose: Health check

2. **`GET /scan?url=<target>`**
   - Returns: Comprehensive scan data including:
     - Tech stack detection (CMS, frameworks, legacy systems)
     - Business units detection
     - Digital goals analysis
     - Job postings analysis
     - AI readiness score
     - Business scale analysis
     - Performance analysis
     - Digital maturity score

3. **`GET /scan-batch?urls=<url1,url2,...>&mode=light|full`**
   - Returns: Stack-ranked batch scan results with peer comparisons
   - Supports light/full modes with resource limits

## Current Features

### Fetch/Extract Logic
- ✅ Browser-like headers to bypass Cloudflare bot protection
- ✅ SSRF protection (blocks localhost, private IPs, .local domains)
- ✅ URL validation
- ✅ HTML parsing (meta tags, script srcs, link hrefs)
- ✅ Robots.txt and sitemap detection
- ✅ Size limits (250KB HTML, 20KB snippets)
- ✅ Timeout handling

### Technology Detection
- Legacy CMS detection (AEM, Sitecore, Drupal, WordPress, etc.)
- Modern/Headless CMS detection
- Framework detection (React, Vue, Angular, Next.js, etc.)
- PIM/DAM/LMS system detection
- System duplication detection
- Migration opportunity scoring

### Business Intelligence
- Business unit detection (legal, support, marketing, etc.)
- Digital goals analysis
- Job postings analysis (careers page, recent hires, role baselines)
- AI readiness scoring
- Business scale analysis (traffic, revenue, costs)
- Performance analysis
- Digital maturity scoring
- Peer comparison (within batch)

### Search Provider Integration
- ❌ **NOT FOUND**: User mentioned "existing search provider" but no search functionality is present in the codebase. This will need to be added in STEP 2.

## Current Structure

```
website-scanner-worker/
├── src/
│   └── index.js          # Main Worker (3100+ lines, JavaScript)
├── wrangler.toml         # Cloudflare config (main = "src/index.js")
├── openapi.yaml          # OpenAPI schema for GPT Actions
├── openapi-actions.yaml  # Minimal OpenAPI for ChatGPT Actions
└── [various .md docs]
```

## Wrangler.toml Bindings

- **No KV bindings** currently configured
- **No D1 bindings** currently configured
- **No other bindings** (R2, Durable Objects, etc.)

## Error Handling (Current State)

- Inconsistent: Some endpoints return `{ error: "..." }`, others return `{ ok: false, error: {...} }`
- No requestId tracking
- No structured error codes

## Response Format (Current State)

- No uniform response wrapper
- No requestId in responses
- CORS headers added via `addCorsHeaders()` helper

## Next Steps for STEP 0

1. Set up TypeScript infrastructure (minimal)
2. Enhance `/health` with `{ ok, ts, version }`
3. Add uniform error format: `{ ok:false, error:{ code, message, details? } }`
4. Add `requestId` generation and include in all responses
5. Add `/schema` endpoint for self-documentation

