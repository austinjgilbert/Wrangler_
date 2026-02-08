# STEP 5 Verification — Multi-Source Verification Mode

## Changes Made

1. ✅ Added `POST /verify` endpoint
2. ✅ Multi-source extraction (uses /extract internally with cache)
3. ✅ Claim matching against excerpts from all sources
4. ✅ Status determination:
   - `supported`: >=2 sources provide matching evidence
   - `contradicted`: Explicit mismatch detected
   - `unclear`: Default (conservative)
5. ✅ Excerpt collection (supporting and contradicting)
6. ✅ Conservative approach (unclear by default)

## Verification Commands

### 1. Test /verify with SSO Claim

```bash
# Start dev server
wrangler dev

# Verify claim about SSO using pricing and security pages
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["SSO is available", "Single Sign-On is supported"],
    "sources": [
      "https://www.cloudflare.com/pricing/",
      "https://www.cloudflare.com/security/"
    ]
  }' \
  | jq '.data.verified[] | {claim, status, supportingCount: (.supportingExcerpts | length), contradictingCount: (.contradictingExcerpts | length)}'
```

### 2. Test Multiple Claims

```bash
# Verify multiple claims
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": [
      "SSO is available",
      "API access is included",
      "Free tier is available"
    ],
    "sources": [
      "https://www.cloudflare.com/pricing/",
      "https://www.cloudflare.com/security/"
    ]
  }' \
  | jq '.data.verified[] | {claim, status}'
```

### 3. Test Supported Status (>=2 Sources)

```bash
# Use multiple sources that should support the claim
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["Security features are available"],
    "sources": [
      "https://www.cloudflare.com/security/",
      "https://www.cloudflare.com/products/",
      "https://www.cloudflare.com/pricing/"
    ]
  }' \
  | jq '.data.verified[0] | {claim, status, supportingExcerpts: (.supportingExcerpts | length)}'

# Expected: status should be "supported" if >=2 sources provide evidence
```

### 4. Test Contradicted Status

```bash
# Test with a claim that might be contradicted
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["Free unlimited tier is available"],
    "sources": [
      "https://www.cloudflare.com/pricing/"
    ]
  }' \
  | jq '.data.verified[0] | {claim, status, contradictingExcerpts: (.contradictingExcerpts | length)}'

# Expected: status might be "contradicted" if explicit negation found
```

### 5. Test Unclear Status (Single Source)

```bash
# Test with only 1 source (should be unclear)
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["SSO is available"],
    "sources": [
      "https://www.cloudflare.com/pricing/"
    ]
  }' \
  | jq '.data.verified[0] | {claim, status, reason: "Only 1 source"}'

# Expected: status should be "unclear" (conservative, needs >=2 sources)
```

### 6. Test Cache Usage

```bash
# First verify (will extract and cache)
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["SSO is available"],
    "sources": ["https://example.com"]
  }' > /dev/null

# Second verify (should use cache)
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["SSO is available"],
    "sources": ["https://example.com"]
  }' \
  | jq '.data.verified[0].status'

# Expected: Should work faster (cache hit)
```

### 7. Test Error Handling

```bash
# Test missing claims
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{"sources": ["https://example.com"]}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test missing sources
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{"claims": ["Test claim"]}' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test invalid source URL
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["Test claim"],
    "sources": ["not-a-url"]
  }' \
  | jq '.error'

# Expected: VALIDATION_ERROR

# Test empty claims array
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": [],
    "sources": ["https://example.com"]
  }' \
  | jq '.error'

# Expected: VALIDATION_ERROR
```

### 8. Test Supporting Excerpts

```bash
# Get detailed supporting excerpts
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["Security features are available"],
    "sources": [
      "https://www.cloudflare.com/security/",
      "https://www.cloudflare.com/products/"
    ]
  }' \
  | jq '.data.verified[0].supportingExcerpts[0:2]'

# Expected: Array of {excerptId, text, source} objects
```

### 9. Test Contradicting Excerpts

```bash
# Get contradicting excerpts (if any)
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["Free unlimited tier is available"],
    "sources": ["https://www.cloudflare.com/pricing/"]
  }' \
  | jq '.data.verified[0].contradictingExcerpts'

# Expected: Array of {excerptId, text, source} if contradictions found
```

### 10. Test Full Response Structure

```bash
# Get full verification response
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["SSO is available", "API access is included"],
    "sources": [
      "https://www.cloudflare.com/pricing/",
      "https://www.cloudflare.com/security/"
    ]
  }' \
  | jq '{
    ok,
    requestId,
    verifiedCount: (.data.verified | length),
    verified: .data.verified[] | {claim, status, supportingCount: (.supportingExcerpts | length), contradictingCount: (.contradictingExcerpts | length)}
  }'
```

## Expected Results

### Supported Status
- ✅ `status: "supported"`
- ✅ `supportingExcerpts.length >= 2` (from >=2 sources)
- ✅ `contradictingExcerpts.length === 0`
- ✅ Excerpts include `excerptId`, `text`, `source`

### Contradicted Status
- ✅ `status: "contradicted"`
- ✅ `contradictingExcerpts.length > 0`
- ✅ Contradicting excerpts contain explicit negation patterns

### Unclear Status
- ✅ `status: "unclear"`
- ✅ Either:
  - `supportingExcerpts.length < 2` (needs >=2 sources)
  - No clear evidence found
  - Conservative default

## Summary

The `/verify` endpoint should:
- ✅ Accept POST requests with `{claims: string[], sources: string[]}`
- ✅ Extract data from each source (use cache if available)
- ✅ Compare claims against excerpts from all sources
- ✅ Determine status: supported (>=2 sources), contradicted (explicit mismatch), unclear (default)
- ✅ Return supporting and contradicting excerpts
- ✅ Handle errors with uniform error format
- ✅ Include requestId in response

