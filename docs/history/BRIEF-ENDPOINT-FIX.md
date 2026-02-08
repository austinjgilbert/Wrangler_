# Brief Endpoint Fix

**Date**: January 5, 2026  
**Issue**: `generateBrief` endpoint failed when only `companyOrSite` was provided

## Problem

The GPT called `generateBrief` with `{companyOrSite: 'Sanity.io'}` but the endpoint required either:
- `seedUrl` (a valid URL)
- `query` (search query)

The endpoint validated `companyOrSite` but didn't use it, causing a validation error.

## Solution

Updated `handleBrief` function to:

1. **Auto-derive URL from company name**: When only `companyOrSite` is provided:
   - If it looks like a URL (starts with http/https), use it directly
   - Otherwise, construct a likely URL: `https://{normalized-company-name}.com`
   - If constructed URL is invalid, fall back to search

2. **Search fallback**: When URL construction fails or no URL provided:
   - Use `companyOrSite` as a search query
   - Search for the company using `searchProvider`
   - Use first search result as `seedUrl`
   - Discover and crawl pages from that URL

3. **Better error messages**: Provide actionable hints when validation fails

## Changes Made

**File**: `src/index.js` - `handleBrief` function

- Added `effectiveSeedUrl` logic to derive URL from `companyOrSite`
- Implemented search-based brief generation when URL construction fails
- Improved error messages with actionable hints
- Fixed variable references (use `effectiveSeedUrl` instead of `seedUrl`)

## Testing

```bash
# Test with company name only
curl -X POST https://website-scanner.austin-gilbert.workers.dev/brief \
  -H "Content-Type: application/json" \
  -d '{"companyOrSite": "Sanity.io"}'

# Expected: Should now work (either via constructed URL or search)
```

## Status

✅ **FIXED** - Endpoint now handles `companyOrSite` parameter correctly

---

**Version**: e7ef308c-d645-4ca8-9e63-accd0c6a47e9  
**Deployed**: January 5, 2026

