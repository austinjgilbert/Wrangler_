# STEP 2 Verification — SERP Triage + Dedupe Ranking

## Changes Made

1. ✅ Added `POST /search` endpoint
2. ✅ Implemented ranking with scoreBreakdown:
   - `authority` (0-1): Based on domain reputation, official pages, HTTPS
   - `recency` (0-1): Based on publishedDate and recencyDays parameter
   - `relevance` (0-1): Based on query word matching in URL/title/snippet
   - `diversityPenalty` (0-0.5): Penalty for too many results from same domain
   - `finalScore`: Weighted combination (authority*0.3 + recency*0.2 + relevance*0.5 - diversityPenalty)
3. ✅ Deduplication by normalized hostname + similar title (>0.7 similarity)
4. ✅ Intent classification: `docs`, `marketing`, `blog`, `forum`, `news`, `unknown`
5. ✅ Diversity enforcement: Max 3 results per domain (penalty applied after)
6. ✅ Prefers official pages: Docs, security, pricing pages get authority boost
7. ✅ Search provider interface (placeholder with mock data for testing)

## Important Note

**The `searchProvider()` function is currently a mock implementation.** To use real search results, you need to:

1. **Connect to a real search API** (e.g., Google Custom Search, Bing Search, etc.)
2. **Update the `searchProvider()` function** in `src/index.js`
3. **Add API keys to environment variables** (via `wrangler.toml` secrets)

Example integration code is provided in comments within the function.

## Verification Commands

### 1. Test /search with Mock Data

```bash
# Start dev server
wrangler dev

# Test search endpoint
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "company pricing SSO", "limit": 10}' \
  | jq '.data.results[] | {url, title, scoreBreakdown, classifiedIntent, dedupedGroupId}'
```

### 2. Verify Score Breakdown

```bash
# Check score breakdown components
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "company pricing SSO", "limit": 5}' \
  | jq '.data.results[0].scoreBreakdown'

# Expected output:
# {
#   "authority": 0.7-1.0,
#   "recency": 0.3-1.0,
#   "relevance": 0.0-1.0,
#   "diversityPenalty": 0.0-0.5,
#   "finalScore": 0.0-1.0
# }
```

### 3. Verify Deduplication

```bash
# Check dedupedGroupId (similar results from same domain should have same groupId)
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "company pricing SSO", "limit": 10}' \
  | jq '.data.results[] | {url, title, dedupedGroupId}' | head -20

# Expected: Results with similar titles from same domain should share dedupedGroupId
```

### 4. Verify Intent Classification

```bash
# Check classifiedIntent
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "company pricing SSO", "limit": 10}' \
  | jq '.data.results[] | {url, classifiedIntent}'

# Expected: Should classify as docs, marketing, blog, forum, news, or unknown
```

### 5. Test Recency Parameter

```bash
# Test with different recencyDays
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "company pricing SSO", "limit": 5, "recencyDays": 7}' \
  | jq '.data.results[] | {url, recency: .scoreBreakdown.recency}'

# Results with recent publishedDate should have higher recency scores
```

### 6. Test Limit Parameter

```bash
# Test limit clamping (1-50)
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 100}' \
  | jq '.data.results | length'

# Expected: Should return max 50 results (clamped)

curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 0}' \
  | jq '.data.results | length'

# Expected: Should return at least 1 result (clamped)
```

### 7. Test Error Handling

```bash
# Test missing query
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test empty query
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": ""}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test wrong method
curl -X GET http://localhost:8787/search \
  | jq '.error'

# Expected: METHOD_NOT_ALLOWED
```

### 8. Verify Diversity Penalty

```bash
# Check diversity penalty (should increase for results from same domain)
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "company pricing SSO", "limit": 10}' \
  | jq '.data.results[] | {url, diversityPenalty: .scoreBreakdown.diversityPenalty, finalScore: .scoreBreakdown.finalScore}'

# Expected: Results from same domain (after 3rd) should have diversityPenalty > 0
```

### 9. Verify Official Page Preference

```bash
# Check that docs/security/pricing pages rank higher
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "company pricing SSO", "limit": 10}' \
  | jq '.data.results[] | {url, authority: .scoreBreakdown.authority, intent: .classifiedIntent}' \
  | head -20

# Expected: URLs with /docs, /security, /pricing should have higher authority scores
```

## Expected Results

### Query: "company pricing SSO"

- ✅ Results should be ranked by `finalScore` (descending)
- ✅ Each result should have `scoreBreakdown` with all components
- ✅ Each result should have `classifiedIntent` (docs/marketing/blog/forum/news/unknown)
- ✅ Each result should have `dedupedGroupId` (similar results share same ID)
- ✅ Results from same domain (after 3rd) should have `diversityPenalty > 0`
- ✅ Official pages (docs, security, pricing) should have higher `authority` scores
- ✅ Recent results should have higher `recency` scores

## Connecting Real Search Provider

To connect a real search provider, update the `searchProvider()` function:

### Google Custom Search Example

```javascript
async function searchProvider(query, limit = 10) {
  const apiKey = env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = env.GOOGLE_SEARCH_ENGINE_ID;
  
  const response = await fetch(
    `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=${Math.min(limit, 10)}`
  );
  
  if (!response.ok) {
    throw new Error(`Search API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return (data.items || []).map(item => ({
    url: item.link,
    title: item.title,
    snippet: item.snippet,
    source: 'google',
    publishedDate: item.pagemap?.metatags?.[0]?.['article:published_time'] || null,
  }));
}
```

Then add secrets:
```bash
wrangler secret put GOOGLE_SEARCH_API_KEY
wrangler secret put GOOGLE_SEARCH_ENGINE_ID
```

## Summary

The `/search` endpoint should:
- ✅ Accept POST requests with `{query, limit?, recencyDays?, mode?}`
- ✅ Return ranked results with complete scoreBreakdown
- ✅ Deduplicate similar results from same domain
- ✅ Classify intent for each result
- ✅ Apply diversity penalties
- ✅ Prefer official pages in ranking
- ✅ Include requestId in response
- ✅ Handle errors with uniform error format

