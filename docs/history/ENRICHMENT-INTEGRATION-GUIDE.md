# Enrichment Pipeline Integration Guide

## Overview

This guide explains how to integrate the background enrichment pipeline into your existing Worker to automatically build complete research sets for accounts.

## Integration Steps

### Step 1: Auto-Enrich on Account Creation

**Location**: `src/index.js` - `handleScan` function

**Add after account is stored** (around line 6516):

```javascript
import { autoEnrichAccount } from './services/enrichment-service.js';

// After storing account pack and summary
if (client && accountKey && packResult.success) {
  try {
    // Auto-enrich account in background
    await autoEnrichAccount(
      groqQuery,
      upsertDocument,
      client,
      accountKey,
      finalUrl
    );
    // Enrichment queued - will execute over time
  } catch (enrichError) {
    // Don't break scan if enrichment fails
    // Enrichment can be triggered manually later
  }
}
```

### Step 2: Add Enrichment Routes

**Location**: `src/index.js` - Main router (around line 8112)

**Add routes**:

```javascript
import {
  handleQueueEnrichment,
  handleGetEnrichmentStatus,
  handleGetResearchSet,
  handleExecuteEnrichmentStage,
  handleListEnrichmentJobs,
} from './handlers/enrichment.js';

// In main router:
} else if (url.pathname.startsWith('/enrich/')) {
  if (url.pathname === '/enrich/queue') {
    if (request.method !== 'POST') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'POST required', {}, 405, requestId);
    }
    return await handleQueueEnrichment(
      request,
      requestId,
      env,
      groqQuery,
      upsertDocument,
      assertSanityConfigured
    );
  } else if (url.pathname === '/enrich/status') {
    if (request.method !== 'GET') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'GET required', {}, 405, requestId);
    }
    return await handleGetEnrichmentStatus(
      request,
      requestId,
      env,
      groqQuery,
      assertSanityConfigured
    );
  } else if (url.pathname === '/enrich/research') {
    if (request.method !== 'GET') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'GET required', {}, 405, requestId);
    }
    return await handleGetResearchSet(
      request,
      requestId,
      env,
      groqQuery,
      assertSanityConfigured
    );
  } else if (url.pathname === '/enrich/execute') {
    if (request.method !== 'POST') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'POST required', {}, 405, requestId);
    }
    return await handleExecuteEnrichmentStage(
      request,
      requestId,
      env,
      groqQuery,
      upsertDocument,
      patchDocument,
      assertSanityConfigured,
      {
        handleScan,
        handleDiscover,
        handleCrawl,
        handleExtract,
        handleLinkedInProfile,
        handleBrief,
        handleVerify,
      }
    );
  } else if (url.pathname === '/enrich/jobs') {
    if (request.method !== 'GET') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'GET required', {}, 405, requestId);
    }
    return await handleListEnrichmentJobs(
      request,
      requestId,
      env,
      groqQuery,
      assertSanityConfigured
    );
  }
```

### Step 3: Add Research Set to Account Queries

**Location**: `handleQuery` or `/account` endpoint

**Add research set to account response**:

```javascript
import { getCompleteResearchSet } from './services/enrichment-service.js';

// When returning account data
const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);

return createSuccessResponse({
  account: account,
  researchSet: researchSet, // Complete research set if available
  hasResearchSet: !!researchSet,
  enrichmentStatus: await getEnrichmentStatus(groqQuery, client, accountKey),
}, requestId);
```

### Step 4: Background Execution (Choose One)

#### Option A: On-Demand Execution
Execute stages when user queries account:

```javascript
// In account query handler
const status = await getEnrichmentStatus(groqQuery, client, accountKey);
if (status.status === 'in_progress') {
  // Execute next stage
  await handleExecuteEnrichmentStage(
    request,
    requestId,
    env,
    groqQuery,
    upsertDocument,
    patchDocument,
    assertSanityConfigured,
    handlers
  );
}
```

#### Option B: Cloudflare Cron Trigger
Add to `wrangler.toml`:

```toml
[triggers]
crons = ["*/5 * * * *"]  # Every 5 minutes
```

Create cron handler in `index.js`:

```javascript
export default {
  async fetch(request, env) {
    // ... existing code
  },
  
  async scheduled(event, env, ctx) {
    // Execute next stage for in-progress jobs
    const client = assertSanityConfigured(env);
    const jobs = await listEnrichmentJobs(groqQuery, client, {
      status: 'in_progress',
      limit: 10,
    });
    
    for (const job of jobs) {
      try {
        await executeEnrichmentStage(
          groqQuery,
          upsertDocument,
          patchDocument,
          client,
          job._id,
          { /* handlers */ }
        );
      } catch (e) {
        // Continue with other jobs
      }
    }
  },
}
```

## Usage Examples

### Queue Enrichment
```bash
curl -X POST "/enrich/queue" \
  -H "Content-Type: application/json" \
  -d '{
    "canonicalUrl": "https://example.com",
    "options": {
      "includeLinkedIn": true,
      "includeBrief": true
    }
  }'
```

### Check Status
```bash
curl "/enrich/status?accountKey=abc123"
```

### Get Research Set
```bash
curl "/enrich/research?accountKey=abc123"
```

### Execute Next Stage
```bash
curl -X POST "/enrich/execute" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "pipeline-1234567890-abc123"}'
```

## Complete Research Set Structure

When enrichment completes, the research set includes:

```javascript
{
  accountKey: 'abc123...',
  canonicalUrl: 'https://example.com',
  completedAt: '2025-01-01T12:10:00Z',
  
  // Full scan result
  scan: {
    technologyStack: { ... },
    businessUnits: { ... },
    aiReadiness: { ... },
    // ... complete scan data
  },
  
  // Discovered pages
  discovery: {
    canonicalRoot: 'https://example.com',
    candidates: [
      { url: 'https://example.com/pricing', type: 'pricing' },
      { url: 'https://example.com/security', type: 'security' },
      // ... more pages
    ],
  },
  
  // Crawled pages
  crawl: {
    root: 'https://example.com',
    fetched: [
      { url: '...', evidencePack: { ... } },
      // ... more pages
    ],
  },
  
  // Evidence packs
  evidence: {
    extractions: [
      { url: '...', excerpts: [...], signals: [...], entities: [...] },
      // ... more evidence
    ],
    total: 10,
  },
  
  // Research brief
  brief: {
    briefMarkdown: '...',
    evidence: { keyFacts: [...], urls: [...] },
  },
  
  // Summary
  summary: {
    pagesDiscovered: 15,
    pagesCrawled: 12,
    evidencePacks: 10,
    hasBrief: true,
    hasLinkedIn: false,
  },
}
```

## Benefits

1. **Complete Research**: Every account gets full research pipeline
2. **Background Processing**: Doesn't block user requests
3. **Resource Efficient**: Spreads execution over 60-90 seconds
4. **Instant Recall**: Complete research sets available immediately
5. **Progressive**: Accounts get richer over time
6. **Non-Blocking**: Failures don't stop pipeline

## Testing

### Test Enrichment Queue
```bash
curl -X POST "/enrich/queue" \
  -d '{"canonicalUrl": "https://example.com"}'
```

### Test Status
```bash
curl "/enrich/status?accountKey=abc123"
```

### Test Research Set
```bash
curl "/enrich/research?accountKey=abc123"
```

## Monitoring

Track enrichment:
- Jobs queued
- Jobs in progress
- Jobs completed
- Average completion time
- Success rate per stage

View insights:
```bash
curl "/enrich/jobs?status=in_progress"
```

