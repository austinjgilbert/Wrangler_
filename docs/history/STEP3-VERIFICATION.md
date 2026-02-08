# STEP 3 Verification — Site Discovery and Smart Crawl

## Changes Made

1. ✅ Added `POST /discover` endpoint
2. ✅ Added `POST /crawl` endpoint
3. ✅ Implemented page discovery:
   - Common paths checking (/pricing, /security, /docs, /careers, etc.)
   - Same-domain link parsing from homepage
   - Sitemap.xml parsing
   - Budget limits (1-50)
4. ✅ Implemented smart crawling:
   - Concurrency pool (max 3 concurrent requests)
   - Timeout enforcement (8 seconds per page)
   - Budget limits (1-50 pages)
   - Depth support (1 or 2)
   - Type filtering (includeTypes parameter)
5. ✅ Prioritization: pricing, security, docs first
6. ✅ Reused existing functions: extractNavigationLinks, fetchRobotsInfo, checkSitemaps

## Verification Commands

### 1. Test /discover Endpoint

```bash
# Start dev server
wrangler dev

# Discover pages on a known company site
curl -X POST http://localhost:8787/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 20}' \
  | jq '{canonicalRoot, candidateCount: (.candidates | length), candidates: .candidates[0:5]}'

# Expected: Should return candidates with types (pricing, security, docs, careers, etc.)
```

### 2. Verify Candidate Types

```bash
# Check what types of pages were discovered
curl -X POST http://localhost:8787/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 20}' \
  | jq '.data.candidates | group_by(.type) | map({type: .[0].type, count: length})'
```

### 3. Test /crawl Endpoint

```bash
# Crawl discovered pages
curl -X POST http://localhost:8787/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 5, "depth": 1}' \
  | jq '{root, fetchedCount: (.fetched | length), skippedCount: (.skipped | length), firstFetched: .fetched[0]}'
```

### 4. Test Type Filtering

```bash
# Only crawl pricing and security pages
curl -X POST http://localhost:8787/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 10, "includeTypes": ["pricing", "security"]}' \
  | jq '.data.fetched[] | {url, title, signals: [.signals[].type]}'
```

### 5. Test Budget Limits

```bash
# Test budget clamping
curl -X POST http://localhost:8787/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 100}' \
  | jq '.data.candidates | length'

# Expected: Should return max 50 candidates (clamped)

curl -X POST http://localhost:8787/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 0}' \
  | jq '.data.candidates | length'

# Expected: Should return at least 1 candidate (clamped)
```

### 6. Test Error Handling

```bash
# Test missing URL
curl -X POST http://localhost:8787/discover \
  -H "Content-Type: application/json" \
  -d '{}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test invalid URL
curl -X POST http://localhost:8787/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "not-a-url"}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test wrong method
curl -X GET http://localhost:8787/discover \
  | jq '.error'

# Expected: METHOD_NOT_ALLOWED
```

### 7. Verify Prioritization

```bash
# Check that pricing, security, docs come first
curl -X POST http://localhost:8787/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 20}' \
  | jq '.data.candidates[0:10] | map({type, url})'

# Expected: First few should be pricing, security, or docs
```

### 8. Test Crawl Timeout and Concurrency

```bash
# Crawl with small budget to test concurrency
curl -X POST http://localhost:8787/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 5, "depth": 1}' \
  | jq '{fetched: (.data.fetched | length), skipped: (.data.skipped | length), firstTitle: .data.fetched[0].title}'

# Should complete within reasonable time (concurrency limit: 3)
```

### 9. Test Full Workflow: Discover → Crawl

```bash
# Step 1: Discover pages
DISCOVER_RESULT=$(curl -s -X POST http://localhost:8787/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 10}')

echo $DISCOVER_RESULT | jq '.data.candidates[0:3] | map({type, url})'

# Step 2: Crawl discovered pages
curl -X POST http://localhost:8787/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 3, "includeTypes": ["pricing", "security"]}' \
  | jq '.data.fetched[] | {url, title, excerptCount: (.excerpts | length), signalCount: (.signals | length)}'
```

## Expected Results

### /discover
- ✅ Returns `canonicalRoot` (origin URL)
- ✅ Returns `candidates` array with `{url, type, reason}`
- ✅ Types include: pricing, security, docs, careers, blog, about, news, unknown
- ✅ Prioritized: pricing, security, docs first
- ✅ Budget respected (1-50)

### /crawl
- ✅ Returns `root`, `fetched`, `skipped`
- ✅ `fetched` contains EvidencePack-like objects (url, title, mainText, excerpts, signals)
- ✅ `skipped` contains failed URLs with reasons
- ✅ Respects budget (1-50)
- ✅ Concurrency limit: 3
- ✅ Timeout: 8 seconds per page
- ✅ Type filtering works (includeTypes)

## Summary

The `/discover` and `/crawl` endpoints should:
- ✅ Discover likely pages (pricing, security, docs, careers, etc.)
- ✅ Parse same-domain links from homepage
- ✅ Check common paths
- ✅ Parse sitemap.xml if available
- ✅ Crawl with concurrency limits and timeouts
- ✅ Prioritize important page types
- ✅ Respect budget and timeout constraints
- ✅ Include requestId in responses
- ✅ Handle errors with uniform error format

