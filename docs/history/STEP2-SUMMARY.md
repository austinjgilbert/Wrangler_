# STEP 2 — SERP Triage + Dedupe Ranking Layer

## ✅ Completed

### 1. POST /search Endpoint
- Accepts: `{ query: string, limit?: number, recencyDays?: number, mode?: "fast"|"deep" }`
- Returns: `{ ok: true, data: { results: RankedResult[] }, requestId }`
- Validates query and parameters
- Clamps limit to 1-50 range

### 2. RankedResult Schema
Each result includes:
- `url`, `title`, `snippet?`, `source?`
- `scoreBreakdown`: `{ authority, recency, relevance, diversityPenalty, finalScore }`
- `classifiedIntent`: `"docs"|"marketing"|"blog"|"forum"|"news"|"unknown"`
- `dedupedGroupId`: Group ID for deduplication

### 3. Ranking Algorithm
- **Authority Score** (0-1): Based on:
  - Domain reputation (GitHub, Stack Overflow, Wikipedia, Reddit get boost)
  - Official pages (/docs, /security, /pricing get boost)
  - Subdomain patterns (docs.*, security.* get boost)
  - HTTPS (small boost)
- **Recency Score** (0-1): Based on `publishedDate`:
  - Linear decay from 1.0 to 0.5 over `recencyDays`
  - Older than `recencyDays` = 0.3
  - Unknown date = 0.5 (neutral)
- **Relevance Score** (0-1): Based on:
  - Query word matching in URL, title, snippet
  - Exact phrase match gets +0.3 boost
- **Diversity Penalty** (0-0.5): Applied after deduplication:
  - Penalty = (count - maxPerDomain) * 0.1 for results beyond 3rd from same domain
- **Final Score**: `authority * 0.3 + recency * 0.2 + relevance * 0.5 - diversityPenalty`

### 4. Deduplication
- Groups results by normalized hostname (www. stripped, lowercase)
- Calculates title similarity using Jaccard similarity on words
- Results with similarity > 0.7 share same `dedupedGroupId`
- Prevents duplicate results from same domain with similar titles

### 5. Intent Classification
Classifies based on URL patterns and content:
- `docs`: /docs, /documentation, /guides, /api, /reference
- `blog`: /blog, /articles, /posts, /news
- `forum`: /forum, /discussion, /community, Reddit, Stack Overflow
- `news`: /news, /press, /media, /releases
- `marketing`: /pricing, /features, /about, /home (default)
- `unknown`: Fallback

### 6. Diversity Enforcement
- Limits results from same domain to max 3 (via penalty, not hard filter)
- Applies diversity penalty to 4th+ results from same domain
- Penalty increases linearly: 0.1, 0.2, 0.3, etc. (capped at 0.5)

### 7. Official Page Preference
- Official pages (docs, security, pricing) get +0.2 authority boost
- Subdomain patterns (docs.*, security.*) get +0.15 authority boost
- These pages naturally rank higher due to higher authority scores

### 8. Search Provider Interface
- Created `searchProvider()` function interface
- Currently returns mock data for testing
- **TODO**: Connect to real search API (Google Custom Search, Bing, etc.)
- Example integration code provided in comments

## Files Changed

1. **`src/index.js`** - Added:
   - `searchProvider()` - Search provider interface (mock implementation)
   - `normalizeHostname()` - Hostname normalization for deduplication
   - `titleSimilarity()` - Jaccard similarity calculation
   - `classifyIntent()` - Intent classification
   - `calculateAuthorityScore()` - Authority scoring
   - `calculateRecencyScore()` - Recency scoring
   - `calculateRelevanceScore()` - Relevance scoring
   - `deduplicateResults()` - Deduplication logic
   - `applyDiversityPenalty()` - Diversity penalty application
   - `rankAndDeduplicateResults()` - Main ranking function
   - `handleSearch()` - POST /search endpoint handler
   - Updated `/schema` endpoint to document `/search`

## Verification

See `STEP2-VERIFICATION.md` for detailed test commands.

Quick test:
```bash
# Test search with mock data
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "company pricing SSO", "limit": 10}' \
  | jq '.data.results[] | {url, title, scoreBreakdown.finalScore, classifiedIntent, dedupedGroupId}'
```

## Important Notes

1. **Search Provider**: The `searchProvider()` function is currently a mock. You need to connect it to a real search API (Google Custom Search, Bing, etc.) for production use.

2. **Mock Data**: Mock results are included for testing ranking/deduplication logic. Remove mock data when connecting real provider.

3. **Environment Variables**: When connecting a real provider, add API keys as secrets:
   ```bash
   wrangler secret put GOOGLE_SEARCH_API_KEY
   wrangler secret put GOOGLE_SEARCH_ENGINE_ID
   ```

## Next Steps

Ready for **STEP 3 — Site discovery and smart crawl (bounded)**

