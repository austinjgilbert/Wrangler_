# OSINT Pipeline Implementation - Changelog

## Summary

Added automatic queued OSINT "Year-Ahead Company Intelligence" pipeline to the Cloudflare Worker codebase. All existing endpoints and behaviors remain intact.

## New Features

### OSINT Pipeline
- 8-stage asynchronous pipeline for generating year-ahead company intelligence
- Automatic queuing via Cloudflare Queues
- Job state tracking via Durable Objects
- Comprehensive ranking algorithm for sources and initiatives
- Sanity CMS integration for persistent storage

### New Endpoints
- `POST /osint/queue` - Queue an OSINT job
- `GET /osint/status` - Get job status
- `GET /osint/report` - Get generated report
- `POST /osint/run` - Run pipeline synchronously (admin/debug)

## Files Added

### Core Implementation
- `src/osint/types.js` - Type definitions
- `src/osint/pipeline.js` - Pipeline stages implementation
- `src/osint/scoring.js` - Ranking algorithm
- `src/osint/utils.js` - Utility functions
- `src/durable/osintJobState.js` - Durable Object for job state
- `src/handlers/osint.js` - HTTP endpoint handlers

### Documentation
- `OSINT-IMPLEMENTATION.md` - Implementation details
- `OSINT-DEPLOYMENT-CHECKLIST.md` - Deployment guide
- `docs/OSINT-QUICK-START.md` - Quick start guide
- `CHANGELOG-OSINT.md` - This file

### Testing
- `scripts/test-osint.sh` - Test script for OSINT endpoints

## Files Modified

### Configuration
- `wrangler.toml`
  - Added Queue producer binding: `OSINT_QUEUE`
  - Added Queue consumer: `osint-queue`
  - Added Durable Object binding: `OSINT_JOBS_DO`
  - Added environment variable documentation

- `openapi.yaml`
  - Updated to OpenAPI 3.1.0
  - Added OSINT tag
  - Added OSINT endpoint schemas:
    - `OsintQueueRequest`
    - `OsintQueueResponse`
    - `OsintStatusResponse`
    - `OsintReportResponse`
    - `OsintRunRequest`
    - `OsintRunResponse`
    - `OsintInitiative`
    - `OsintReport`
  - Added 4 new endpoint paths

- `README.md`
  - Added OSINT section to API endpoints
  - Added OSINT configuration instructions
  - Added OSINT usage examples
  - Added OSINT pipeline architecture explanation
  - Added ranking algorithm documentation

### Code
- `src/index.js`
  - Added OSINT route handlers
  - Added queue consumer export
  - Exported Durable Object class
  - Integrated OSINT endpoints into routing

- `src/sanity-client.js`
  - Exported `generateAccountKey`
  - Exported `normalizeCanonicalUrl`
  - Exported `extractDomain` (as `extractRootDomain`)
  - Exported all Sanity helper functions

## Breaking Changes

**None** - All existing endpoints and behaviors remain unchanged.

## Configuration Required

### Required Secrets
- `SANITY_PROJECT_ID` - Sanity project ID
- `SANITY_API_TOKEN` - Sanity API token with write permissions

### Optional Secrets
- `SANITY_DATASET` - Default: "production"
- `SANITY_API_VERSION` - Default: "2023-10-01"
- `SANITY_USE_CDN` - Recommended: "false" for writes
- `OSINT_DEFAULT_RECENCY_DAYS` - Default: 365
- `OSINT_MAX_SOURCES` - Default: 25
- `OSINT_MAX_EXTRACT` - Default: 15
- `ADMIN_API_KEY` - For `/osint/run` endpoint

### Infrastructure
- Cloudflare Queue: `osint-queue` (create with `wrangler queues create osint-queue`)
- Durable Object: `OsintJobState` (created automatically on deploy)

## Sanity Document Types

### New Types
- `osintJob` - Tracks OSINT job state
  - `_id`: `osintJob.<accountKey>.<year>.<mode>`
  - Fields: `status`, `stage`, `progress`, `requestedAt`, `startedAt`, `completedAt`, `error`, `reportRef`

- `osintReport` - Stores generated reports
  - `_id`: `osintReport.<accountKey>.<year>.<mode>`
  - Fields: `executiveSummary[]`, `initiatives[]`, `risks[]`, `hiringSignals[]`, `digitalSignals[]`, `recommendedNextSteps[]`, `sources[]`

### Updated Types
- `account` - Added `latestOsintReportRef` field

## Pipeline Stages

1. **Stage 0**: Load or create account context
2. **Stage 1**: Discover pages (reuses `/discover`)
3. **Stage 2**: Search web (reuses `/search`)
4. **Stage 3**: Select top sources (ranking algorithm)
5. **Stage 4**: Extract evidence (reuses `/extract`)
6. **Stage 5**: Verify claims (optional, currently skipped)
7. **Stage 6**: Synthesize report
8. **Stage 7**: Store results in Sanity

## Ranking Algorithm

### Source Scoring
- Recency (40%): <= 90 days (100), <= 180 days (70), <= 365 days (40)
- First-party boost (30%): +30 for company's own domain
- Numeric/timeline boost (20%): +5-20 for dates, years, roadmap keywords
- Quality score (10%): Penalizes spam, rewards substantial content

### Initiative Scoring
- Evidence count: +5 per evidence (max +20)
- Corroboration: +3 per additional source (max +15)
- First-party evidence: +5 per first-party source (max +15)

## Idempotency

Jobs are idempotent per `accountKey + mode + year`:
- Prevents duplicate processing
- Returns existing job if complete (unless `force: true`)
- Allows safe re-queuing

## Error Handling

- Queue messages retry automatically on failure
- Job state tracked in Durable Object and Sanity
- Errors stored in `osintJob.error` field
- Pipeline stages update progress incrementally
- Duration tracking for performance monitoring

## Testing

Use the provided test script:
```bash
./scripts/test-osint.sh [BASE_URL] [TEST_URL]
```

Or test manually:
```bash
# Queue job
curl -X POST "https://your-worker.workers.dev/osint/queue" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Check status
curl "https://your-worker.workers.dev/osint/status?accountKey=<accountKey>"

# Get report
curl "https://your-worker.workers.dev/osint/report?accountKey=<accountKey>"
```

## Performance

- Pipeline runs asynchronously via Cloudflare Queues
- Typical completion time: 2-5 minutes (depends on sources)
- Concurrent processing supported via queue
- Job state updates in real-time via Durable Object

## Security

- Admin endpoint (`/osint/run`) protected by `ADMIN_API_KEY`
- All endpoints use existing authentication/authorization
- SSRF protection via existing URL validation
- Input validation on all parameters

## Migration Notes

No migration required. The OSINT pipeline is additive and doesn't affect existing functionality.

## Future Enhancements

Potential improvements:
- Implement Stage 5 verification
- Add LLM-based synthesis (optional)
- Enhanced initiative extraction
- Multi-year reports
- Custom scoring weights
- Report templates
- Email/webhook notifications

## Support

For issues or questions:
1. Check `OSINT-DEPLOYMENT-CHECKLIST.md` for troubleshooting
2. Review worker logs: `wrangler tail`
3. Check Sanity documents for job state
4. Verify queue processing: `wrangler queues list`

## Version

- Implementation Date: 2024-01-15
- Worker Version: 1.1.0 (with OSINT)
- OpenAPI Version: 3.1.0

