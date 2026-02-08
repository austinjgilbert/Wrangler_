# STEP 6 Verification — Brief Generator

## Changes Made

1. ✅ Added `POST /brief` endpoint
2. ✅ Brief generation with markdown formatting
3. ✅ Citation system (excerpt IDs + URLs)
4. ✅ Key facts extraction from crawled data
5. ✅ Evidence object with keyFacts[] and urls[]
6. ✅ Uses /crawl internally (seedUrl parameter)
7. ✅ Fixed bug in fetchRobotsInfo (removed undefined finalUrl reference)

## Verification Commands

### 1. Test /brief with seedUrl

```bash
# Start dev server
wrangler dev

# Generate brief for a known company
curl -X POST http://localhost:8787/brief \
  -H "Content-Type: application/json" \
  -d '{
    "companyOrSite": "Cloudflare",
    "seedUrl": "https://www.cloudflare.com"
  }' \
  | jq '{briefMarkdown: .data.briefMarkdown, keyFactsCount: (.data.evidence.keyFacts | length), urlsCount: (.data.evidence.urls | length)}'
```

### 2. Test Brief Markdown Format

```bash
# Get full brief markdown
curl -X POST http://localhost:8787/brief \
  -H "Content-Type: application/json" \
  -d '{
    "companyOrSite": "Cloudflare",
    "seedUrl": "https://www.cloudflare.com"
  }' \
  | jq -r '.data.briefMarkdown' | head -30

# Expected: Markdown with sections:
# - # Brief: [Company]
# - ## Key Facts (with [1], [2] citations)
# - ## Sources
# - ## Citations
```

### 3. Test Citations

```bash
# Check citations in brief
curl -X POST http://localhost:8787/brief \
  -H "Content-Type: application/json" \
  -d '{
    "companyOrSite": "Cloudflare",
    "seedUrl": "https://www.cloudflare.com"
  }' \
  | jq '.data.briefMarkdown' | grep -E '\[[0-9]+\]'

# Expected: Should see citation markers [1], [2], etc.
```

### 4. Test Evidence Object

```bash
# Check evidence structure
curl -X POST http://localhost:8787/brief \
  -H "Content-Type: application/json" \
  -d '{
    "companyOrSite": "Cloudflare",
    "seedUrl": "https://www.cloudflare.com"
  }' \
  | jq '.data.evidence | {keyFactsCount: (.keyFacts | length), urlsCount: (.urls | length), firstFact: .keyFacts[0]}'
```

### 5. Test Error Handling

```bash
# Test missing companyOrSite
curl -X POST http://localhost:8787/brief \
  -H "Content-Type: application/json" \
  -d '{"seedUrl": "https://example.com"}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test missing seedUrl and query
curl -X POST http://localhost:8787/brief \
  -H "Content-Type: application/json" \
  -d '{"companyOrSite": "Test"}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test invalid seedUrl
curl -X POST http://localhost:8787/brief \
  -H "Content-Type: application/json" \
  -d '{
    "companyOrSite": "Test",
    "seedUrl": "not-a-url"
  }' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test query (not implemented)
curl -X POST http://localhost:8787/brief \
  -H "Content-Type: application/json" \
  -d '{
    "companyOrSite": "Test",
    "query": "test query"
  }' \
  | jq '.error'

# Expected: NOT_IMPLEMENTED
```

### 6. Test Brief Content Quality

```bash
# Check that brief contains meaningful content
curl -X POST http://localhost:8787/brief \
  -H "Content-Type: application/json" \
  -d '{
    "companyOrSite": "Cloudflare",
    "seedUrl": "https://www.cloudflare.com"
  }' \
  | jq '{
    hasTitle: (.data.briefMarkdown | contains("# Brief: Cloudflare")),
    hasKeyFacts: (.data.briefMarkdown | contains("## Key Facts")),
    hasSources: (.data.briefMarkdown | contains("## Sources")),
    hasCitations: (.data.briefMarkdown | contains("## Citations")),
    keyFactsCount: (.data.evidence.keyFacts | length),
    urlsCount: (.data.evidence.urls | length)
  }'

# Expected: All should be true, keyFactsCount > 0, urlsCount > 0
```

## Expected Results

### Brief Structure
- ✅ Markdown format with proper headers
- ✅ Key Facts section with citations [1], [2], etc.
- ✅ Sources section with numbered URLs
- ✅ Citations section mapping citations to URLs + excerpt IDs

### Evidence Object
- ✅ `keyFacts[]`: Array of {fact, sourceUrl, excerptId}
- ✅ `urls[]`: Array of unique source URLs
- ✅ Limited to 10 key facts

### Content Quality
- ✅ Facts extracted from titles, signals, excerpts
- ✅ Citations properly linked to sources
- ✅ Excerpt IDs included where available

## Summary

The `/brief` endpoint should:
- ✅ Accept POST requests with `{companyOrSite, seedUrl?, query?}`
- ✅ Generate markdown brief with citations
- ✅ Extract key facts from crawled data
- ✅ Include evidence object with keyFacts and urls
- ✅ Handle errors with uniform error format
- ✅ Include requestId in response

