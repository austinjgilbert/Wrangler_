# STEP 1 Verification — Evidence Pack

## Changes Made

1. ✅ Added `POST /extract` endpoint
2. ✅ Implemented EvidencePack schema with:
   - url, finalUrl, title, siteName, fetchedAt, contentType, status
   - mainText (cleaned)
   - excerpts[] (at least 3 from different parts)
   - entities[] (company/person/product/org/unknown)
   - signals[] (pricing/security/careers/docs/blog/comparison/integration/login/newsletter/unknown)
   - claims[] (with evidence references)
   - meta (wordCount, languageHint, readingTimeMin)
3. ✅ Text cleaning (removes scripts, styles, nav, footer)
4. ✅ Excerpt extraction (beginning, middle, end)
5. ✅ Entity extraction (heuristic: capitalized phrases + org suffixes)
6. ✅ Signal detection (9 signal types)
7. ✅ Claim extraction (heuristic patterns)
8. ✅ Meta calculation (word count, reading time, language hint)
9. ✅ Updated CORS to allow POST requests

## Verification Commands

### 1. Test /extract with Docs Page

```bash
# Start dev server
wrangler dev

# Test with a docs page (e.g., Cloudflare Workers docs)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://developers.cloudflare.com/workers/", "mode": "fast"}' \
  | jq '.data.signals[] | select(.type == "docs")'

# Expected: Should detect "docs" signal with confidence > 0.7
# Also check:
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://developers.cloudflare.com/workers/", "mode": "fast"}' \
  | jq '{title, siteName, excerpts: .data.excerpts | length, signals: [.data.signals[].type], meta}'
```

### 2. Test /extract with Pricing Page

```bash
# Test with a pricing page (e.g., Stripe pricing)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://stripe.com/pricing", "mode": "fast"}' \
  | jq '.data.signals[] | select(.type == "pricing")'

# Expected: Should detect "pricing" signal with confidence > 0.7
# Also check:
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://stripe.com/pricing", "mode": "fast"}' \
  | jq '{title, signals: [.data.signals[].type], entities: .data.entities[0:3], claims: .data.claims[0:2]}'
```

### 3. Test /extract with Deep Mode

```bash
# Test deep mode (extracts more text)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "deep", "maxChars": 20000}' \
  | jq '{mainTextLength: (.data.mainText | length), wordCount: .data.meta.wordCount, readingTimeMin: .data.meta.readingTimeMin}'
```

### 4. Test Error Handling

```bash
# Test missing URL
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test invalid URL
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "not-a-url"}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test wrong method
curl -X GET http://localhost:8787/extract \
  | jq '.error'

# Expected: METHOD_NOT_ALLOWED
```

### 5. Verify EvidencePack Structure

```bash
# Full structure check
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' \
  | jq '{
    hasUrl: (.data.url != null),
    hasFinalUrl: (.data.finalUrl != null),
    hasTitle: (.data.title != null),
    hasMainText: (.data.mainText != null),
    excerptsCount: (.data.excerpts | length),
    entitiesCount: (.data.entities | length),
    signalsCount: (.data.signals | length),
    claimsCount: (.data.claims | length),
    hasMeta: (.data.meta != null),
    hasRequestId: (.requestId != null)
  }'

# Expected: All should be true, excerptsCount >= 3
```

### 6. Test Signal Detection Accuracy

```bash
# Test careers page
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com/careers/", "mode": "fast"}' \
  | jq '.data.signals[] | select(.type == "careers")'

# Test blog page
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://blog.cloudflare.com/", "mode": "fast"}' \
  | jq '.data.signals[] | select(.type == "blog")'

# Test security page
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.cloudflare.com/security/", "mode": "fast"}' \
  | jq '.data.signals[] | select(.type == "security")'
```

### 7. Verify Excerpts from Different Parts

```bash
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' \
  | jq '.data.excerpts[] | {id, selectorHint, charRange, textLength: (.text | length)}'

# Expected: At least 3 excerpts with different selectorHint values (beginning, middle, end)
```

## Expected Results

### Docs Page Test
- ✅ `signals` array contains `{type: "docs", confidence: >0.7}`
- ✅ `excerpts.length >= 3`
- ✅ `mainText` is cleaned (no HTML tags, scripts, styles)
- ✅ `meta.wordCount > 0`
- ✅ `meta.readingTimeMin >= 1`

### Pricing Page Test
- ✅ `signals` array contains `{type: "pricing", confidence: >0.7}`
- ✅ May contain entities (company names)
- ✅ May contain claims related to pricing

## Summary

The `/extract` endpoint should:
- ✅ Accept POST requests with `{url, mode?, maxChars?}`
- ✅ Return structured EvidencePack with all required fields
- ✅ Detect signals accurately (docs, pricing, etc.)
- ✅ Extract at least 3 excerpts from different parts
- ✅ Clean mainText (no HTML, scripts, styles)
- ✅ Include requestId in response
- ✅ Handle errors with uniform error format

