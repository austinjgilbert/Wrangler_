# Complete Background Enrichment System

## Overview

A comprehensive background research pipeline that automatically enriches accounts with complete research sets. The system executes research stages over time to avoid resource limits while building comprehensive account intelligence that can be instantly recalled.

## Key Features

### ✅ Complete Research Pipeline
Every account gets a full 7-stage research pipeline:
1. **Initial Scan** - Tech stack, business units, AI readiness
2. **Discovery** - Find key pages (pricing, security, docs, etc.)
3. **Crawl** - Fetch and analyze pages
4. **Extraction** - Extract evidence, signals, entities
5. **LinkedIn** - Profile research (optional)
6. **Brief** - Generate research brief (optional)
7. **Verification** - Verify claims (optional)

### ✅ Background Execution
- Stages execute over 60-90 seconds
- Delays between stages (5-30s) to avoid resource limits
- Non-blocking (doesn't slow down user requests)
- Can be paused/resumed

### ✅ Complete Research Sets
- All pipeline results stored in `accountPack.payload.researchSet`
- Instant recall via `/enrich/research?accountKey=...`
- Includes: scan, discovery, crawl, evidence, brief, linkedin, verification
- Summary statistics included

### ✅ Auto-Enrichment
- Automatically triggers when account is created/scanned
- Queues enrichment job in background
- Executes over time without user waiting

### ✅ Progress Tracking
- Real-time status updates
- Progress percentage (0-100%)
- Current stage indicator
- Estimated time remaining

## How It Works

### 1. Account Creation/Scan
```
User scans account → Account stored → Auto-enrichment triggered
```

### 2. Enrichment Queue
```
Enrichment job created → Stored in Sanity → Status: "pending"
```

### 3. Pipeline Execution
```
Stage 1: Scan (0s) → Stage 2: Discovery (5s) → Stage 3: Crawl (10s) → 
Stage 4: Extraction (15s) → Stage 5: LinkedIn (20s) → 
Stage 6: Brief (25s) → Stage 7: Verification (30s) → Complete
```

### 4. Research Set Storage
```
All results combined → Stored in accountPack → Status: "complete"
```

### 5. Instant Recall
```
User queries account → Research set retrieved → Complete data returned
```

## Data Flow

```
┌─────────────────┐
│ Account Scanned │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Auto-Enrichment │
│ Job Queued      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Pipeline Stages │
│ (60-90 seconds) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Research Set    │
│ Stored          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Instant Recall   │
│ Available       │
└─────────────────┘
```

## Complete Research Set Structure

When enrichment completes, each account has:

```javascript
{
  accountKey: 'abc123...',
  canonicalUrl: 'https://example.com',
  completedAt: '2025-01-01T12:10:00Z',
  
  // 1. Full scan result
  scan: {
    technologyStack: { cms: [...], frameworks: [...], legacySystems: [...] },
    businessUnits: { companyName: '...', units: [...] },
    aiReadiness: { score: 75, explanation: '...' },
    opportunityScore: 85,
    performance: { performanceScore: 80 },
    businessScale: { businessScale: 'large' },
    // ... complete scan data
  },
  
  // 2. Discovered pages
  discovery: {
    canonicalRoot: 'https://example.com',
    candidates: [
      { url: 'https://example.com/pricing', type: 'pricing', reason: 'Common path' },
      { url: 'https://example.com/security', type: 'security', reason: 'Common path' },
      { url: 'https://example.com/docs', type: 'docs', reason: 'Common path' },
      // ... more pages
    ],
  },
  
  // 3. Crawled pages
  crawl: {
    root: 'https://example.com',
    fetched: [
      {
        url: 'https://example.com/pricing',
        evidencePack: {
          excerpts: [...],
          signals: ['pricing'],
          entities: [...],
        },
      },
      // ... more pages
    ],
    skipped: [],
  },
  
  // 4. Evidence packs
  evidence: {
    extractions: [
      {
        url: 'https://example.com/pricing',
        excerpts: [
          { id: 'excerpt-0', text: '...', selectorHint: 'beginning' },
        ],
        signals: [
          { type: 'pricing', evidenceExcerptId: 'excerpt-0', confidence: 0.9 },
        ],
        entities: [
          { type: 'company', name: 'Example Inc' },
        ],
        claims: [
          { text: 'Enterprise pricing available', evidenceExcerptId: 'excerpt-0' },
        ],
      },
      // ... more evidence
    ],
    total: 10,
  },
  
  // 5. Research brief
  brief: {
    briefMarkdown: '# Research Brief\n\n## Executive Summary\n...',
    evidence: {
      keyFacts: [
        'Uses WordPress CMS',
        'Has legacy systems',
        'Low AI readiness score',
      ],
      urls: [
        'https://example.com',
        'https://example.com/pricing',
      ],
    },
  },
  
  // 6. Summary statistics
  summary: {
    pagesDiscovered: 15,
    pagesCrawled: 12,
    evidencePacks: 10,
    hasBrief: true,
    hasLinkedIn: false,
  },
  
  // 7. Pipeline metadata
  stages: {
    completed: ['initial_scan', 'discovery', 'crawl', 'extraction', 'brief'],
    failed: [],
    total: 5,
  },
}
```

## API Usage

### Queue Enrichment
```bash
curl -X POST "https://your-worker.workers.dev/enrich/queue" \
  -H "Content-Type: application/json" \
  -d '{
    "canonicalUrl": "https://example.com",
    "options": {
      "includeLinkedIn": true,
      "includeBrief": true,
      "maxDepth": 2
    }
  }'
```

### Check Status
```bash
curl "https://your-worker.workers.dev/enrich/status?accountKey=abc123"
```

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

### Get Complete Research Set
```bash
curl "https://your-worker.workers.dev/enrich/research?accountKey=abc123"
```

**Response**: Complete research set with all stages

### Execute Next Stage (Background)
```bash
curl -X POST "https://your-worker.workers.dev/enrich/execute" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "pipeline-1234567890-abc123"}'
```

## Integration

### Auto-Enrich on Scan
```javascript
// In handleScan, after storing account
if (client && accountKey) {
  await autoEnrichAccount(
    groqQuery,
    upsertDocument,
    client,
    accountKey,
    finalUrl
  );
}
```

### Recall in Account Query
```javascript
// In account query handler
const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);

return createSuccessResponse({
  account: account,
  researchSet: researchSet, // Complete research set
  hasResearchSet: !!researchSet,
}, requestId);
```

## Benefits

1. **Complete Intelligence**: Every account has full research pipeline
2. **Background Processing**: Doesn't block user requests
3. **Resource Efficient**: Spreads execution over time
4. **Instant Recall**: Complete research sets available immediately
5. **Progressive Enhancement**: Accounts get richer over time
6. **Non-Blocking**: Failures in one stage don't stop others

## Timeline

### Immediate (0s)
- Initial scan completes
- Tech stack, business units identified

### 5 seconds
- Discovery completes
- Key pages identified

### 15 seconds
- Crawl completes
- Pages fetched and analyzed

### 30 seconds
- Extraction completes
- Evidence packs created

### 50 seconds
- Brief generation completes
- Research brief available

### 60-90 seconds
- Pipeline complete
- Complete research set stored
- Ready for instant recall

## Status Tracking

### Job Status
- `pending`: Queued, not started
- `in_progress`: Currently executing
- `complete`: All stages finished
- `failed`: Critical failure

### Progress
- Percentage: 0-100%
- Current stage: Which stage is running
- Estimated time: Seconds remaining
- Completed stages: List of completed
- Failed stages: List of failures (non-blocking)

## Storage

### Enrichment Jobs
- Type: `enrichmentJob`
- ID: `pipeline-{timestamp}-{random}`
- Tracked by: `accountKey`
- Queryable by: `status`, `accountKey`

### Research Sets
- Stored in: `accountPack.payload.researchSet`
- Complete: All pipeline results
- Retrievable: Via `/enrich/research?accountKey=...`

## Monitoring

### Metrics
- Jobs queued per day
- Jobs in progress
- Jobs completed
- Average completion time
- Success rate per stage

### Queries
```bash
# Active jobs
curl "/enrich/jobs?status=in_progress"

# Completed jobs
curl "/enrich/jobs?status=complete"

# Jobs for account
curl "/enrich/jobs?accountKey=abc123"
```

## Future Enhancements

1. **Priority Queue**: Prioritize important accounts
2. **Retry Logic**: Retry failed stages
3. **Parallel Execution**: Execute independent stages in parallel
4. **Incremental Updates**: Update research sets incrementally
5. **Webhooks**: Notify when enrichment complete
6. **Scheduled Refresh**: Re-enrich accounts periodically

## Implementation Status

✅ **Completed**:
- Research pipeline service
- Enrichment service
- API handlers
- Complete documentation

⏳ **To Do**:
- Integrate auto-enrichment into account creation
- Add enrichment routes to main router
- Add research set recall to account queries
- Test pipeline execution
- Monitor enrichment progress

---

**The enrichment pipeline is ready to build complete research sets for every account!**

