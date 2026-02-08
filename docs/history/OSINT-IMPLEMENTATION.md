# OSINT Pipeline Implementation Summary

## Overview

Successfully implemented an automatic queued OSINT "Year-Ahead Company Intelligence" pipeline for the Cloudflare Worker codebase. All existing endpoints and behaviors remain intact.

## Files Created

### Core OSINT Module
- `src/osint/types.js` - Type definitions and JSDoc types
- `src/osint/pipeline.js` - 8-stage pipeline implementation
- `src/osint/scoring.js` - Ranking algorithm for sources and initiatives

### Infrastructure
- `src/durable/osintJobState.js` - Durable Object for job state tracking
- `src/handlers/osint.js` - HTTP endpoint handlers

### Configuration Updates
- `wrangler.toml` - Added Queue and Durable Object bindings
- `openapi.yaml` - Added OSINT endpoints and schemas (updated to 3.1.0)
- `README.md` - Added OSINT documentation and examples
- `src/index.js` - Added queue consumer and OSINT route handlers
- `src/sanity-client.js` - Exported functions needed by OSINT handlers

## New Endpoints

1. **POST /osint/queue** - Queue an asynchronous OSINT job
   - Request: `{ url, companyName?, mode?, year?, recencyDays?, force? }`
   - Response: `{ ok: true, data: { jobId, accountKey, queued, year, mode } }`

2. **GET /osint/status** - Get job status
   - Query params: `accountKey` (required), `year?` (default: current year + 1)
   - Response: `{ ok: true, data: { status, stage, progress, startedAt, updatedAt, error?, reportId? } }`

3. **GET /osint/report** - Get generated report
   - Query params: `accountKey` (required), `year?` (default: current year + 1)
   - Response: `{ ok: true, data: { report: OsintReport } }`

4. **POST /osint/run** - Run pipeline synchronously (admin/debug)
   - Requires: `ADMIN_API_KEY` header or `adminKey` in body (if configured)
   - Response: `{ ok: true, data: { success, reportId, report } }`

## Pipeline Stages

1. **Stage 0**: Load or create account context in Sanity
2. **Stage 1**: Discover pages on company website (reuses `/discover`)
3. **Stage 2**: Search web for company news/roadmaps (reuses `/search`)
4. **Stage 3**: Select top sources using ranking algorithm
5. **Stage 4**: Extract evidence from top sources (reuses `/extract`)
6. **Stage 5**: Optional verification (currently skipped)
7. **Stage 6**: Synthesize year-ahead report
8. **Stage 7**: Store results in Sanity (`osintJob` and `osintReport` documents)

## Ranking Algorithm

### Source Scoring
- **Recency** (40%): <= 90 days (100), <= 180 days (70), <= 365 days (40)
- **First-party boost** (30%): +30 for sources from company's own domain
- **Numeric/timeline boost** (20%): +5-20 for dates, years, roadmap keywords
- **Quality score** (10%): Penalizes spam, rewards substantial content

### Initiative Scoring
- Evidence count: +5 per evidence (max +20)
- Corroboration: +3 per additional source (max +15)
- First-party evidence: +5 per first-party source (max +15)

## Sanity Document Types

### `account`
- `_id`: `account.<accountKey>`
- Fields: `accountKey`, `canonicalUrl`, `rootDomain`, `companyName`, `latestOsintReportRef`

### `osintJob`
- `_id`: `osintJob.<accountKey>.<year>.<mode>`
- Fields: `status`, `stage`, `progress`, `requestedAt`, `startedAt`, `completedAt`, `error`, `reportRef`

### `osintReport`
- `_id`: `osintReport.<accountKey>.<year>.<mode>`
- Fields: `executiveSummary[]`, `initiatives[]`, `risks[]`, `hiringSignals[]`, `digitalSignals[]`, `recommendedNextSteps[]`, `sources[]`

### `accountPack`
- Already exists, updated with OSINT data references

## Configuration

### Required Environment Variables
```bash
# Sanity (required for OSINT)
wrangler secret put SANITY_PROJECT_ID
wrangler secret put SANITY_API_TOKEN
wrangler secret put SANITY_DATASET  # Optional, defaults to "production"
wrangler secret put SANITY_API_VERSION  # Optional, defaults to "2023-10-01"
wrangler secret put SANITY_USE_CDN  # Optional, set to "false" for writes
```

### Optional Environment Variables
```bash
# OSINT Configuration
wrangler secret put OSINT_DEFAULT_RECENCY_DAYS  # Default: 365
wrangler secret put OSINT_MAX_SOURCES  # Default: 25
wrangler secret put OSINT_MAX_EXTRACT  # Default: 15
wrangler secret put ADMIN_API_KEY  # For /osint/run endpoint
```

### Queue Setup
```bash
# Create the OSINT queue (one-time setup)
wrangler queues create osint-queue
```

## Deployment Steps

1. **Create Queue** (if not exists):
   ```bash
   wrangler queues create osint-queue
   ```

2. **Set Secrets**:
   ```bash
   wrangler secret put SANITY_PROJECT_ID
   wrangler secret put SANITY_API_TOKEN
   # ... other secrets as needed
   ```

3. **Deploy**:
   ```bash
   wrangler deploy
   ```

4. **Verify**:
   ```bash
   curl -X POST "https://your-worker.workers.dev/osint/queue" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com"}'
   ```

## Testing

### Queue a Job
```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/osint/queue" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "companyName": "Example Inc",
    "year": 2026,
    "recencyDays": 365
  }'
```

### Check Status
```bash
curl "https://website-scanner.austin-gilbert.workers.dev/osint/status?accountKey=<accountKey>&year=2026"
```

### Get Report
```bash
curl "https://website-scanner.austin-gilbert.workers.dev/osint/report?accountKey=<accountKey>&year=2026"
```

## Idempotency

Jobs are idempotent per `accountKey + mode + year`. If a complete report exists:
- `/osint/queue` returns existing job info (unless `force: true`)
- Prevents duplicate processing
- Allows re-queuing failed jobs

## Error Handling

- Queue messages retry on failure (Cloudflare handles retries)
- Job state tracked in Durable Object and Sanity
- Errors stored in `osintJob.error` field
- Pipeline stages update progress incrementally

## Integration Points

The OSINT pipeline reuses existing handlers:
- `handleDiscover` - For stage 1 (page discovery)
- `handleSearch` - For stage 2 (web search)
- `handleExtract` - For stage 4 (evidence extraction)
- `handleVerify` - For stage 5 (verification, currently skipped)

All handlers are called with mock Request objects to maintain compatibility.

## Next Steps

1. **Deploy and Test**: Deploy to Cloudflare and test with real URLs
2. **Monitor**: Watch queue processing and job completion rates
3. **Tune Scoring**: Adjust ranking algorithm weights based on results
4. **Add Verification**: Implement stage 5 verification if needed
5. **Enhance Synthesis**: Improve report generation with better heuristics or optional LLM integration

## Notes

- All existing endpoints remain unchanged
- Response format consistent: `{ ok: boolean, data?: any, error?: { code, message, details? }, requestId: string }`
- OpenAPI schema updated to 3.1.0 with all OSINT endpoints
- Durable Object provides real-time job state tracking
- Sanity provides persistent storage and querying

