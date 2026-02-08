# STEP 3 — Site Discovery and Smart Crawl (Bounded)

## ✅ Completed

### 1. POST /discover Endpoint
- Accepts: `{ url: string, budget?: number }`
- Returns: `{ ok: true, data: { canonicalRoot, candidates: [{url, type, reason}] }, requestId }`
- Discovers likely pages using:
  - Common paths (/pricing, /security, /docs, /careers, /about, /blog, /news, /press)
  - Same-domain links from homepage navigation
  - Sitemap.xml parsing (if available)
- Budget: 1-50 candidates (clamped)
- Prioritizes: pricing, security, docs first

### 2. POST /crawl Endpoint
- Accepts: `{ url: string, depth?: 1|2, budget?: number, includeTypes?: string[] }`
- Returns: `{ ok: true, data: { root, fetched: EvidencePack[], skipped: [{url, reason}] }, requestId }`
- Crawls discovered pages with:
  - Concurrency limit: 3 concurrent requests
  - Timeout: 8 seconds per page
  - Budget: 1-50 pages (clamped)
  - Depth: 1 or 2 (currently depth 2 same as depth 1)
  - Type filtering: `includeTypes` array to filter by page type

### 3. Page Discovery Logic
- **Common Paths**: Checks 10 common paths (pricing, security, docs, careers, etc.)
- **Link Parsing**: Extracts same-domain links from homepage navigation
- **Sitemap Parsing**: Fetches robots.txt, extracts sitemap URLs, parses sitemap XML
- **Type Classification**: Classifies pages as pricing, security, docs, careers, blog, about, news, unknown
- **Prioritization**: Sorts candidates by type priority (pricing=1, security=2, docs=3, etc.)

### 4. Smart Crawling
- **Concurrency Pool**: `crawlWithConcurrency()` function with configurable concurrency
- **Timeout Enforcement**: 8-second timeout per page via Promise.race()
- **Budget Enforcement**: Limits total pages fetched
- **Type Filtering**: Can filter by page types before crawling
- **EvidencePack-like Output**: Returns structured data (url, title, mainText, excerpts, signals)

### 5. Helper Functions
- `parseSitemapXml()` - Simple XML parser for sitemap URLs
- `discoverPages()` - Main discovery logic
- `crawlWithConcurrency()` - Concurrency pool implementation

## Files Changed

1. **`src/index.js`** - Added:
   - `parseSitemapXml()` - Sitemap XML parsing
   - `discoverPages()` - Page discovery logic
   - `crawlWithConcurrency()` - Concurrency pool
   - `handleDiscover()` - POST /discover endpoint handler
   - `handleCrawl()` - POST /crawl endpoint handler
   - Updated routing to include `/discover` and `/crawl`
   - Updated `/schema` endpoint documentation

## Reused Existing Functions

- `extractNavigationLinks()` - Extract links from homepage
- `extractRobotsInfo()` - Get robots.txt URL
- `fetchRobotsInfo()` - Fetch robots.txt and extract sitemap URLs
- `checkSitemaps()` - Check sitemap candidates
- `readHtmlWithLimit()` - Read HTML with size limits
- `cleanMainText()` - Clean HTML text
- `extractTitle()` - Extract page title
- `extractExcerpts()` - Extract text excerpts
- `detectSignals()` - Detect page signals

## Verification

See `STEP3-VERIFICATION.md` for detailed test commands.

Quick test:
```bash
# Discover pages
curl -X POST http://localhost:8787/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 10}' \
  | jq '.data.candidates[0:5]'

# Crawl discovered pages
curl -X POST http://localhost:8787/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com", "budget": 3}' \
  | jq '.data.fetched[] | {url, title}'
```

## Constraints

- **Budget Limits**: 1-50 pages (clamped)
- **Concurrency**: Max 3 concurrent requests
- **Timeout**: 8 seconds per page
- **HTML Size**: 250KB limit (reused from existing limits)
- **Sitemap Parsing**: Simple regex-based (not full XML parser)

## Next Steps

Ready for **STEP 4 — Caching + Change Detection**

