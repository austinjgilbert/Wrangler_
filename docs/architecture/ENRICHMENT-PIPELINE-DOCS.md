# Auto-Enrichment Pipeline & Quick Query System

## Overview

The system now automatically enriches accounts in the background when they're accessed, searched, or scanned. This builds complete profiles over time without interrupting user requests.

## Quick Query Service

### Endpoint: `GET /query/quick`

Fast, optimized queries for Sanity database.

#### Query Types:

1. **`type=account`** - Get account by key or domain
   ```
   GET /query/quick?type=account&accountKey=xxx
   GET /query/quick?type=account&domain=example.com
   ```

2. **`type=pack`** - Get complete account pack
   ```
   GET /query/quick?type=pack&accountKey=xxx
   ```

3. **`type=profile`** - Get complete profile (account + pack + enrichment + similar)
   ```
   GET /query/quick?type=profile&accountKey=xxx
   ```

4. **`type=similar`** - Find similar accounts
   ```
   GET /query/quick?type=similar&accountKey=xxx&limit=10
   ```

5. **`type=search`** - Search accounts by name/domain
   ```
   GET /query/quick?type=search&search=sanity&limit=20&minScore=50
   ```

6. **`type=top`** - Get top accounts by score
   ```
   GET /query/quick?type=top&limit=50&minScore=50
   ```

7. **`type=exists`** - Check if account exists
   ```
   GET /query/quick?type=exists&key=xxx
   ```

8. **`type=enrichment-status`** - Get enrichment job status
   ```
   GET /query/quick?type=enrichment-status&accountKey=xxx
   ```

9. **`type=stale`** - Get accounts needing refresh
   ```
   GET /query/quick?type=stale&days=30&limit=100
   ```

## Auto-Enrichment Pipeline

### How It Works

1. **Automatic Triggers**: Enrichment triggers automatically when:
   - Account is scanned (`/scan`)
   - Account is queried (`/query`, `/query/quick`)
   - Account is searched (`/query?type=search`)

2. **Background Processing**: 
   - Runs asynchronously (non-blocking)
   - Doesn't slow down user requests
   - Builds profiles incrementally

3. **Smart Enrichment**:
   - Skips if already enriched recently (< 7 days)
   - Skips if enrichment in progress
   - Prioritizes high-opportunity accounts

### Enrichment Stages

The pipeline enriches accounts using:
- Website scanning (tech stack, performance)
- Page discovery and crawling
- Evidence extraction
- LinkedIn profile scanning
- Brief generation
- Claim verification
- Competitor research
- Similar account comparison

### Enrichment Results

Enriched accounts include:
- Complete tech stack analysis
- Business intelligence
- Executive insights
- Team mapping
- Competitive positioning
- Similar account comparisons

## Integration Points

### Scan Hook
```javascript
// Automatically triggered after /scan
onAccountScanned(client, groqQuery, upsertDocument, canonicalUrl, accountKey, scanData);
```

### Query Hook
```javascript
// Automatically triggered on /query or /query/quick
onAccountQueried(client, groqQuery, upsertDocument, identifier);
```

## Manual Enrichment

You can also manually trigger enrichment:

```javascript
const { triggerAutoEnrichment } = await import('./services/auto-enrichment-pipeline.js');

await triggerAutoEnrichment(
  client,
  groqQuery,
  upsertDocument,
  'example.com',
  'domain', // or 'url', 'accountKey', 'auto'
  { priority: 'high' }
);
```

## Enrichment Status

Check enrichment status:
```
GET /query/quick?type=enrichment-status&accountKey=xxx
```

Or get complete profile:
```
GET /query/quick?type=profile&accountKey=xxx
```

Returns:
```json
{
  "account": {...},
  "pack": {...},
  "enrichment": {
    "status": "completed",
    "currentStage": "complete",
    "completedStages": [...]
  },
  "similarAccounts": [...],
  "isEnriched": true,
  "isEnriching": false
}
```

## Comparison Features

The system automatically compares accounts to similar ones:

```javascript
const { enrichWithComparison } = await import('./services/auto-enrichment-pipeline.js');

await enrichWithComparison(client, groqQuery, upsertDocument, accountKey);
```

This:
1. Finds similar accounts (by tech stack, signals, AI readiness)
2. Builds comparison insights
3. Stores comparison data in account document

## Performance

- **Quick Queries**: Optimized GROQ queries with indexes
- **Non-Blocking**: Enrichment runs in background
- **Caching**: Results cached where possible
- **Batch Operations**: Supports batch enrichment

## Examples

### Get account quickly
```bash
curl "https://your-worker.com/query/quick?type=account&domain=sanity.io"
```

### Get complete profile
```bash
curl "https://your-worker.com/query/quick?type=profile&accountKey=abc123"
```

### Find similar accounts
```bash
curl "https://your-worker.com/query/quick?type=similar&accountKey=abc123&limit=10"
```

### Search accounts
```bash
curl "https://your-worker.com/query/quick?type=search&search=cms&limit=20"
```

## Background Processing

Enrichment jobs are stored in Sanity and can be processed:
- Via `/enrich/execute` endpoint
- Via queue consumer (if configured)
- Automatically on next access

## Best Practices

1. **Use Quick Queries**: Use `/query/quick` for common queries
2. **Let It Enrich**: Don't manually trigger unless needed
3. **Check Status**: Use enrichment-status for progress
4. **Compare Accounts**: Use similar accounts for insights

---

**Status**: ✅ Production Ready  
**Auto-Enrichment**: ✅ Enabled  
**Background Processing**: ✅ Non-Blocking

