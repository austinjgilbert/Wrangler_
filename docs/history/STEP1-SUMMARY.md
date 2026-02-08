# STEP 1 — Evidence Pack: Structured Extraction Output

## ✅ Completed

### 1. POST /extract Endpoint
- Accepts: `{ url: string, mode?: "fast"|"deep", maxChars?: number }`
- Returns: `{ ok: true, data: EvidencePack, requestId }`
- Validates URL and request body
- Supports fast mode (10K chars) and deep mode (50K chars)

### 2. EvidencePack Schema
Implemented with all required fields:
- **Basic**: `url`, `finalUrl`, `title`, `siteName?`, `fetchedAt`, `contentType`, `status`
- **Content**: `mainText` (cleaned, HTML-free)
- **Excerpts**: Array of `{id, text, selectorHint?, charRange?}` (minimum 3 from different parts)
- **Entities**: Array of `{type: "company"|"person"|"product"|"org"|"unknown", name}`
- **Signals**: Array of `{type, evidenceExcerptId, confidence}` (9 signal types)
- **Claims**: Array of `{text, evidenceExcerptId, confidence}`
- **Meta**: `{wordCount, languageHint?, readingTimeMin}`

### 3. Text Cleaning
- Removes `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>` tags and content
- Strips HTML tags and normalizes whitespace
- Converts HTML entities to text
- Produces clean, readable mainText

### 4. Excerpt Extraction
- Extracts at least 3 excerpts from:
  - Beginning of text
  - Middle of text
  - End of text
- Each excerpt includes `id`, `text`, `selectorHint`, and `charRange`
- Filters out very short excerpts (< 20 chars)

### 5. Entity Extraction
- Heuristic-based extraction:
  - Company names: Capitalized words + org suffixes (Inc, LLC, Corp, etc.)
  - Organizations: Capitalized phrases (often with "The")
- Limits to top 20 entities
- Deduplicates by lowercase name

### 6. Signal Detection
Detects 9 signal types:
- `pricing` - Price, cost, subscription mentions
- `security` - Security, SSL, privacy, compliance
- `careers` - Jobs, hiring, careers page
- `docs` - Documentation, guides, API reference
- `blog` - Blog, articles, news
- `comparison` - Compare, vs, alternatives
- `integration` - API, webhook, connector, plugin
- `login` - Login, sign in, account, dashboard
- `newsletter` - Newsletter, subscribe, email updates

Each signal includes `confidence` (0.6-0.85) and `evidenceExcerptId`.

### 7. Claim Extraction
- Heuristic patterns for claim-like statements:
  - "We/Our/The/This [verb] [capability]"
  - "Over/More than [number]..."
  - "The best/fastest/most/leading..."
- Links claims to excerpts via `evidenceExcerptId`
- Limits to 5 claims per page

### 8. Meta Calculation
- `wordCount`: Count of words in mainText
- `languageHint`: Detects English based on common words (or null)
- `readingTimeMin`: Calculated as `wordCount / 200` (words per minute)

## Files Changed

1. **`src/index.js`** - Added:
   - `cleanMainText()` - HTML cleaning function
   - `extractTitle()` - Title extraction
   - `extractSiteName()` - Site name detection
   - `extractExcerpts()` - Multi-part excerpt extraction
   - `extractEntities()` - Heuristic entity extraction
   - `detectSignals()` - Signal detection (9 types)
   - `extractClaims()` - Claim extraction
   - `calculateMeta()` - Meta information calculation
   - `handleExtract()` - POST /extract endpoint handler
   - Updated CORS to allow POST requests
   - Updated `/schema` endpoint to document `/extract`

## Verification

See `STEP1-VERIFICATION.md` for detailed test commands.

Quick test:
```bash
# Test docs page (should detect "docs" signal)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://developers.cloudflare.com/workers/", "mode": "fast"}' \
  | jq '.data.signals[] | select(.type == "docs")'

# Test pricing page (should detect "pricing" signal)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://stripe.com/pricing", "mode": "fast"}' \
  | jq '.data.signals[] | select(.type == "pricing")'
```

## Next Steps

Ready for **STEP 2 — SERP triage + dedupe ranking layer**

