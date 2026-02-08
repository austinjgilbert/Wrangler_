# Automatic Research Integration Guide

## Overview

The system now automatically triggers complete background research when a user provides any input (URL, company name, or account key). This includes:
1. Account creation/scanning
2. Full enrichment pipeline
3. Competitor discovery and research
4. Comparative analysis
5. Opportunity identification

## How It Works

### Single Input → Complete Research

When a user provides any input:
- **URL**: `https://example.com`
- **Company Name**: `Example Inc`
- **Account Key**: `abc123...`

The system automatically:
1. **Resolves Account**: Creates or finds account
2. **Scans**: Performs initial scan
3. **Enriches**: Queues full enrichment pipeline
4. **Researches Competitors**: Discovers and enriches competitors
5. **Analyzes**: Performs comparative analysis
6. **Identifies Opportunities**: Finds prospecting opportunities

### Automatic Triggers

#### 1. `/scan` Endpoint
After scanning and storing an account, automatically triggers:
- Full enrichment pipeline
- Competitor research
- Comparative analysis

#### 2. `/research` Endpoint (New)
Dedicated endpoint for complete research orchestration:
```bash
POST /research
{
  "input": "https://example.com",
  "inputType": "url"  // or "company" or "accountKey"
}
```

#### 3. `/research/intelligence` Endpoint (New)
Get complete account intelligence:
```bash
GET /research/intelligence?accountKey=abc123
```

## Integration Points

### 1. Auto-Orchestration in `/scan`

**Location**: `src/index.js` - `handleScan` function

After storing account:
```javascript
if (stored && env && client && stored.accountKey) {
  // Trigger orchestration (non-blocking)
  orchestrateAccountResearch({
    input: finalUrl,
    inputType: 'url',
    context: { groqQuery, upsertDocument, patchDocument, client, handleScan, requestId, env },
    options: {},
  }).catch(err => {
    // Silently fail - orchestration is non-critical
  });
}
```

### 2. New `/research` Endpoint

**Location**: `src/index.js` - Main router

```javascript
} else if (url.pathname === '/research') {
  if (request.method !== 'POST') {
    return createErrorResponse('METHOD_NOT_ALLOWED', 'POST required', {}, 405, requestId);
  }
  const { handleResearch } = await import('./handlers/orchestrator.js');
  return await handleResearch(
    request,
    requestId,
    env,
    groqQuery,
    upsertDocument,
    patchDocument,
    assertSanityConfigured,
    { handleScan, handleDiscover, handleCrawl, handleExtract, handleLinkedInProfile, handleBrief, handleVerify }
  );
}
```

### 3. New `/research/intelligence` Endpoint

```javascript
} else if (url.pathname === '/research/intelligence') {
  if (request.method !== 'GET') {
    return createErrorResponse('METHOD_NOT_ALLOWED', 'GET required', {}, 405, requestId);
  }
  const { handleGetIntelligence } = await import('./handlers/orchestrator.js');
  return await handleGetIntelligence(
    request,
    requestId,
    env,
    groqQuery,
    assertSanityConfigured
  );
}
```

## Usage Examples

### Automatic Research from URL
```bash
# Scan triggers automatic research
curl "https://your-worker.workers.dev/scan?url=https://example.com"
```

**Response includes**:
- Scan result (immediate)
- Orchestration status (background)
- Account key for tracking

### Dedicated Research Endpoint
```bash
curl -X POST "https://your-worker.workers.dev/research" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "https://example.com",
    "inputType": "url",
    "options": {
      "competitorLimit": 10
    }
  }'
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "orchestration": {
      "status": "complete",
      "accountKey": "abc123...",
      "stages": {
        "accountCreation": { "status": "complete", "completed": true },
        "enrichment": { "status": "queued", "completed": false },
        "competitorResearch": { "status": "queued", "completed": false }
      }
    },
    "account": {...},
    "researchSet": {...},
    "competitorResearch": {...},
    "opportunities": [...]
  }
}
```

### Get Complete Intelligence
```bash
curl "https://your-worker.workers.dev/research/intelligence?accountKey=abc123"
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "intelligence": {
      "account": {...},
      "researchSet": {...},
      "competitorResearch": {...},
      "opportunities": [...],
      "industryProfile": {...},
      "enrichmentStatus": {...},
      "completeness": {
        "hasAccount": true,
        "hasResearchSet": true,
        "hasCompetitorResearch": true,
        "hasOpportunities": true,
        "enrichmentComplete": true
      }
    }
  }
}
```

## Orchestration Flow

```
User Input (URL/Company/Key)
         │
         ▼
┌────────────────────────┐
│  Resolve Account       │
│  - Create if needed    │
│  - Scan if URL         │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│  Trigger Enrichment    │
│  - Queue pipeline      │
│  - Background exec     │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│  Research Competitors  │
│  - Discover (5 strat)  │
│  - Enrich each         │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│  Comparative Analysis   │
│  - Compare tech         │
│  - Compare positioning  │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│  Identify Opportunities│
│  - Technology gaps      │
│  - Modernization        │
│  - Performance          │
└────────────────────────┘
```

## Background Execution

### Non-Blocking
- Orchestration runs in background
- Doesn't slow down user responses
- Failures don't break main flow

### Progressive Enhancement
- Account created immediately
- Enrichment runs over 60-90 seconds
- Competitor research runs after enrichment
- Results available when ready

### Status Tracking
- Each stage has status: `pending`, `queued`, `in_progress`, `complete`, `error`
- Progress tracked in orchestration result
- Can query status via `/research/intelligence`

## Benefits

1. **Single Input**: One input triggers everything
2. **Automatic**: No manual steps required
3. **Complete**: Full research pipeline executed
4. **Non-Blocking**: Doesn't slow down responses
5. **Progressive**: Results available as they complete
6. **Comprehensive**: Account + Competitors + Opportunities

## Response Structure

### Orchestration Result
```javascript
{
  input: "https://example.com",
  inputType: "url",
  accountKey: "abc123...",
  canonicalUrl: "https://example.com",
  companyName: "Example Inc",
  status: "complete",
  stages: {
    accountCreation: { status: "complete", completed: true },
    enrichment: { status: "complete", completed: true },
    competitorResearch: { status: "complete", completed: true },
  },
  account: {...},
  researchSet: {...},
  competitorResearch: {...},
  opportunities: [...],
  startedAt: "2025-01-01T12:00:00Z",
  completedAt: "2025-01-01T12:05:00Z",
}
```

### Intelligence Result
```javascript
{
  account: {...},
  researchSet: {...},
  competitorResearch: {...},
  opportunities: [...],
  industryProfile: {...},
  enrichmentStatus: {...},
  completeness: {
    hasAccount: true,
    hasResearchSet: true,
    hasCompetitorResearch: true,
    hasOpportunities: true,
    enrichmentComplete: true,
  },
}
```

## Error Handling

- Orchestration errors are non-blocking
- Failures logged but don't break flow
- Partial results returned if available
- Status indicates what completed

## Monitoring

### Track Orchestration
- Status per stage
- Completion times
- Error rates
- Success rates

### Query Status
```bash
# Get complete intelligence (includes status)
curl "/research/intelligence?accountKey=abc123"
```

---

**The system now automatically builds complete research from a single input!**

