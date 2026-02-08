# Background Enrichment Pipeline Architecture

## Overview

A complete research pipeline system that enriches accounts in the background, building comprehensive research sets that can be recalled later. The system executes research stages over time to avoid resource limits while building complete account intelligence.

## Core Concept

**Complete Research Set**: Every account gets a full research pipeline executed:
1. Initial scan
2. Site discovery
3. Page crawling
4. Evidence extraction
5. LinkedIn research (optional)
6. Brief generation
7. Verification (optional)

**Background Execution**: Stages execute over time (with delays) to avoid resource limits.

**Recall**: Complete research sets are stored and can be retrieved instantly.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Account Created/Scanned                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Auto-Enrichment Trigger                          │
│  - Check if enrichment needed                           │
│  - Queue enrichment job                                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Research Pipeline Job                            │
│  - Stage 1: Initial Scan (immediate)                    │
│  - Stage 2: Discovery (5s delay)                        │
│  - Stage 3: Crawl (10s delay)                           │
│  - Stage 4: Extraction (15s delay)                    │
│  - Stage 5: LinkedIn (20s delay, optional)               │
│  - Stage 6: Brief (25s delay, optional)                │
│  - Stage 7: Verification (30s delay, optional)         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Complete Research Set                            │
│  - All stage results                                     │
│  - Summary statistics                                    │
│  - Stored in accountPack                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Instant Recall                                   │
│  - GET /enrich/research?accountKey=...                  │
│  - Returns complete research set                        │
└─────────────────────────────────────────────────────────┘
```

## Pipeline Stages

### Stage 1: Initial Scan
- **Delay**: 0ms (immediate)
- **Action**: Full website scan
- **Output**: Tech stack, business units, AI readiness, etc.

### Stage 2: Discovery
- **Delay**: 5 seconds
- **Action**: Discover pages (pricing, security, docs, careers, etc.)
- **Budget**: 20 pages
- **Output**: List of candidate pages

### Stage 3: Crawl
- **Delay**: 10 seconds
- **Action**: Crawl discovered pages
- **Budget**: 15 pages
- **Output**: Fetched pages with evidence packs

### Stage 4: Extraction
- **Delay**: 15 seconds
- **Action**: Extract evidence from crawled pages
- **Budget**: 10 pages
- **Output**: Evidence packs with signals, entities, claims

### Stage 5: LinkedIn (Optional)
- **Delay**: 20 seconds
- **Action**: Research LinkedIn profiles
- **Output**: LinkedIn profile data

### Stage 6: Brief (Optional)
- **Delay**: 25 seconds
- **Action**: Generate research brief
- **Output**: Complete brief with citations

### Stage 7: Verification (Optional)
- **Delay**: 30 seconds
- **Action**: Verify claims against sources
- **Output**: Verification results

## Data Model

### Enrichment Job Document
```javascript
{
  _type: 'enrichmentJob',
  _id: 'pipeline-1234567890-abc123',
  accountKey: 'abc123...',
  canonicalUrl: 'https://example.com',
  status: 'in_progress', // pending, in_progress, complete, failed
  currentStage: 'crawl',
  completedStages: ['initial_scan', 'discovery'],
  failedStages: [],
  results: {
    initial_scan: { ... },
    discovery: { ... },
  },
  startedAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:05:00Z',
  priority: 5,
  options: {
    includeLinkedIn: true,
    includeBrief: true,
    maxDepth: 2,
    budget: 20,
  },
  metadata: {
    createdBy: 'system',
    source: 'background_enrichment',
  },
}
```

### Complete Research Set
```javascript
{
  accountKey: 'abc123...',
  canonicalUrl: 'https://example.com',
  completedAt: '2025-01-01T12:10:00Z',
  pipelineJobId: 'pipeline-1234567890-abc123',
  
  // Core data
  scan: { ... }, // Full scan result
  discovery: { ... }, // Discovered pages
  crawl: { ... }, // Crawled pages
  evidence: { ... }, // Evidence packs
  linkedin: { ... }, // LinkedIn data
  brief: { ... }, // Research brief
  verification: { ... }, // Verification results
  
  // Metadata
  stages: {
    completed: ['initial_scan', 'discovery', 'crawl', ...],
    failed: [],
    total: 7,
  },
  
  // Summary
  summary: {
    pagesDiscovered: 15,
    pagesCrawled: 12,
    evidencePacks: 10,
    hasBrief: true,
    hasLinkedIn: true,
  },
}
```

## API Endpoints

### POST /enrich/queue
Queue enrichment job for account

**Request**:
```json
{
  "canonicalUrl": "https://example.com",
  "accountKey": "abc123",
  "options": {
    "includeLinkedIn": true,
    "includeBrief": true,
    "maxDepth": 2
  }
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "queued": true,
    "jobId": "pipeline-1234567890-abc123",
    "status": "pending"
  }
}
```

### GET /enrich/status?accountKey=...
Get enrichment status

**Response**:
```json
{
  "ok": true,
  "data": {
    "status": {
      "status": "in_progress",
      "jobId": "pipeline-1234567890-abc123",
      "progress": 42,
      "currentStage": "crawl",
      "estimatedTimeRemaining": 45
    }
  }
}
```

### GET /enrich/research?accountKey=...
Get complete research set

**Response**:
```json
{
  "ok": true,
  "data": {
    "researchSet": {
      "scan": { ... },
      "discovery": { ... },
      "crawl": { ... },
      "evidence": { ... },
      "brief": { ... },
      "summary": { ... }
    }
  }
}
```

### POST /enrich/execute
Execute next stage (for background processing)

**Request**:
```json
{
  "jobId": "pipeline-1234567890-abc123"
}
```

### GET /enrich/jobs
List enrichment jobs

**Query Params**: `status`, `accountKey`, `limit`

## Background Processing

### Option 1: On-Demand Execution
Execute stages when requested via API:
- User queries account → trigger next stage
- Spreads execution over time
- No background worker needed

### Option 2: Scheduled Execution
Use Cloudflare Cron Triggers:
- Execute stages on schedule
- Process queued jobs
- Automatic progression

### Option 3: Hybrid
- Queue job immediately
- Execute first stage
- Subsequent stages on-demand or scheduled

## Integration Points

### Auto-Enrich on Account Creation

**In handleScan, after storing account**:
```javascript
// Auto-enrich account in background
if (client && accountKey) {
  try {
    const { autoEnrichAccount } = await import('./services/enrichment-service.js');
    await autoEnrichAccount(
      groqQuery,
      upsertDocument,
      client,
      accountKey,
      finalUrl
    );
  } catch (e) {
    // Don't break scan if enrichment fails
  }
}
```

### Recall Research Set

**In account query endpoint**:
```javascript
// Get complete research set if available
const { getCompleteResearchSet } = await import('./services/enrichment-service.js');
const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);

return createSuccessResponse({
  account: account,
  researchSet: researchSet, // Complete research set
  hasResearchSet: !!researchSet,
}, requestId);
```

## Execution Flow

### Stage Execution
1. Get job from queue
2. Execute current stage
3. Store results
4. Update job status
5. Move to next stage
6. If complete, build research set
7. Store research set in accountPack

### Time Management
- Stages execute with delays to avoid resource limits
- Total pipeline time: ~60-90 seconds (spread out)
- Can be paused/resumed
- Non-blocking (failures don't stop pipeline)

## Benefits

1. **Complete Research**: Every account gets full research pipeline
2. **Background Processing**: Doesn't block user requests
3. **Resource Efficient**: Spreads execution over time
4. **Instant Recall**: Complete research sets available immediately
5. **Progressive Enhancement**: Accounts get richer over time
6. **Non-Blocking**: Failures in one stage don't stop others

## Status Tracking

### Job Status
- `pending`: Queued, not started
- `in_progress`: Currently executing
- `complete`: All stages finished
- `failed`: Critical failure

### Progress
- Percentage complete (0-100%)
- Current stage
- Estimated time remaining
- Completed/failed stages

## Storage

### Enrichment Jobs
- Stored in Sanity as `enrichmentJob` documents
- Tracked by `accountKey`
- Queryable by status

### Research Sets
- Stored in `accountPack.payload.researchSet`
- Complete research data
- Instantly retrievable

## Monitoring

### Metrics
- Jobs queued
- Jobs in progress
- Jobs completed
- Average completion time
- Success rate per stage

### Alerts
- Jobs stuck in progress
- High failure rates
- Resource limit warnings

## Future Enhancements

1. **Priority Queue**: Prioritize important accounts
2. **Retry Logic**: Retry failed stages
3. **Parallel Execution**: Execute independent stages in parallel
4. **Incremental Updates**: Update research sets incrementally
5. **Webhooks**: Notify when enrichment complete
6. **Analytics**: Track enrichment effectiveness

