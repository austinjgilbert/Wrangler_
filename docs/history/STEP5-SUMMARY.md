# STEP 5 — Multi-Source Verification Mode

## ✅ Completed

### 1. POST /verify Endpoint
- Accepts: `{ claims: string[], sources: string[] }`
- Returns: `{ ok: true, data: { verified: VerificationResult[] }, requestId }`
- Validates claims and sources arrays
- Validates each source URL

### 2. Multi-Source Extraction
- **Reuses /extract logic**: Calls extraction for each source URL
- **Uses cache**: Leverages existing cache from STEP 4
- **Error handling**: Continues with other sources if one fails
- **Source tracking**: Adds source URL to excerpts

### 3. Claim Verification Logic
- **Keyword matching**: Compares claim words against excerpts
- **Match threshold**: >=50% word overlap required
- **Excerpt collection**: Collects supporting and contradicting excerpts
- **Signal consideration**: Checks signals for additional context

### 4. Status Determination
- **supported**: >=2 sources provide matching evidence
- **contradicted**: Explicit mismatch detected (negation patterns)
- **unclear**: Default (conservative approach)
  - Single source evidence
  - No clear evidence
  - Ambiguous cases

### 5. Contradiction Detection
- **Negation patterns**: Detects "no", "not", "doesn't", "unavailable", etc.
- **Context checking**: Verifies contradiction is about claim topic
- **Explicit mismatches**: Only marks contradicted if explicit negation found

### 6. Excerpt Collection
- **Supporting excerpts**: Excerpts that match claim (>=50% word overlap)
- **Contradicting excerpts**: Excerpts with explicit negation
- **Limits**: Max 5 supporting, max 5 contradicting per claim
- **Metadata**: Includes excerptId, text (truncated to 200 chars), source URL

### 7. Conservative Approach
- **Default unclear**: When in doubt, mark as unclear
- **Requires >=2 sources**: Single source evidence not enough for "supported"
- **Explicit contradictions only**: Only marks contradicted if clear negation

## Files Changed

1. **`src/index.js`** - Added:
   - `verifyClaim()` - Claim verification logic
   - `handleVerify()` - POST /verify endpoint handler
   - Updated routing to include `/verify`
   - Updated `/schema` endpoint documentation

## Verification Algorithm

```
For each claim:
  1. Extract data from all sources (use cache)
  2. Collect all excerpts from all sources
  3. For each excerpt:
     - Calculate word overlap with claim
     - If >=50% overlap:
       - Check for contradiction patterns
       - Add to supporting or contradicting
  4. Determine status:
     - If contradicting.length > 0: "contradicted"
     - Else if supporting.length >= 2: "supported"
     - Else: "unclear"
  5. Return result with excerpts
```

## Verification

See `STEP5-VERIFICATION.md` for detailed test commands.

Quick test:
```bash
# Verify SSO claim using pricing and security pages
curl -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d '{
    "claims": ["SSO is available"],
    "sources": [
      "https://www.cloudflare.com/pricing/",
      "https://www.cloudflare.com/security/"
    ]
  }' \
  | jq '.data.verified[] | {claim, status, supportingCount: (.supportingExcerpts | length)}'
```

## Benefits

- **Multi-source validation**: Cross-reference claims across multiple pages
- **Cache efficiency**: Reuses cached extraction results
- **Conservative**: Defaults to unclear when evidence is insufficient
- **Transparent**: Returns supporting and contradicting excerpts
- **Flexible**: Works with any number of claims and sources

## Next Steps

Ready for **STEP 6 — Brief generator (action-ready artifact)**

