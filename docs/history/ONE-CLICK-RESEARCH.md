# One-Click Research System

## Overview

Complete research capabilities in a single request. The system automatically orchestrates all research functions to build comprehensive account intelligence.

## 1-Click Endpoints

### POST `/research/complete`

Complete 1-click research endpoint that does everything:

```bash
POST /research/complete
{
  "input": "https://example.com",  // URL, domain, company name, or accountKey
  "inputType": "auto",              // 'url', 'domain', 'company', 'accountKey', 'auto'
  "includeCompetitors": true,       // Research competitors
  "includeComparison": true,        // Compare to similar accounts
  "mode": "fast",                   // 'fast' or 'deep'
  "autoEnrich": true                // Auto-trigger enrichment
}
```

**What it does:**
1. Scans/creates account
2. Triggers full enrichment pipeline
3. Researches competitors (if enabled)
4. Compares to similar accounts (if enabled)
5. Returns complete intelligence

**Response includes:**
- Account data
- Research set
- Competitor research
- Similar accounts
- Enrichment status
- Opportunities

### GET `/research/quick`

Quick account lookup with auto-enrichment:

```bash
GET /research/quick?domain=sanity.io
GET /research/quick?accountKey=abc123
GET /research/quick?url=https://example.com
```

**What it does:**
1. Gets complete profile
2. Triggers enrichment if not enriched
3. Auto-advances enrichment if in progress

## Complete Features

### ✅ Full Research Pipeline

1. **Initial Scan** - Tech stack, AI readiness, business scale
2. **Discovery** - Find key pages (pricing, security, docs, etc.)
3. **Crawl** - Fetch and analyze pages
4. **Extraction** - Extract evidence, signals, entities
5. **LinkedIn** - Profile research (optional)
6. **Brief** - Generate research brief (optional)
7. **Verification** - Verify claims against sources (optional)

### ✅ Automatic Enrichment

- **Triggers automatically** when accounts are:
  - Scanned
  - Queried
  - Searched
  
- **Auto-advances** when account is accessed

- **Background processing** (non-blocking)

### ✅ Smart Processing

- Skips if recently enriched (< 7 days)
- Skips if enrichment in progress
- Prioritizes high-opportunity accounts
- Processes in background

### ✅ Complete Profiles

Returns complete account intelligence:
- Account summary
- Full account pack
- Enrichment status
- Similar accounts
- Research set
- Competitor analysis

## Usage Examples

### Complete Research
```bash
curl -X POST "https://your-worker.com/research/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "https://sanity.io",
    "includeCompetitors": true,
    "includeComparison": true
  }'
```

### Quick Lookup
```bash
curl "https://your-worker.com/research/quick?domain=sanity.io"
```

### Complete Profile
```bash
curl "https://your-worker.com/query/quick?type=profile&accountKey=abc123"
```

## Background Processing

### Enrichment Executor

Automatically processes enrichment jobs:
- Executes pipeline stages
- Updates job status
- Stores research sets
- Handles errors gracefully

### Enrichment Scheduler

Processes pending jobs:
- Can be triggered via cron
- Processes up to 10 jobs per run
- One stage per job per run
- Non-blocking execution

### Auto-Advance

Automatically advances enrichment:
- When account is queried
- When profile is accessed
- Non-blocking background execution

## Integration

### On Account Scan
```javascript
// Automatically triggers enrichment
onAccountScanned(client, groqQuery, upsertDocument, canonicalUrl, accountKey, scanData);
```

### On Account Query
```javascript
// Triggers enrichment if needed, advances if in progress
onAccountQueried(client, groqQuery, upsertDocument, identifier);
```

### On Profile Access
```javascript
// Auto-advances enrichment pipeline
autoAdvanceEnrichment(groqQuery, upsertDocument, patchDocument, client, accountKey, handlers, env, requestId);
```

## Verification Stage

The verification stage now:
1. Extracts claims from brief and evidence
2. Gathers sources
3. Verifies claims against sources
4. Returns verification results

Previously incomplete, now fully functional!

## Status

✅ **Production Ready**
- All features complete
- Background processing working
- Non-blocking execution
- Error handling robust

---

**Endpoints:**
- `POST /research/complete` - Complete 1-click research
- `GET /research/quick` - Quick lookup with auto-enrichment
- `GET /query/quick?type=profile` - Complete profile

