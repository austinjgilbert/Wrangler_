# Quick Query & Auto-Enrichment Usage Guide

## Quick Start

### Fast Account Lookup
```bash
# Get account by domain
curl "https://your-worker.com/query/quick?type=account&domain=sanity.io"

# Get account by accountKey
curl "https://your-worker.com/query/quick?type=account&accountKey=abc123"
```

### Complete Profile (with enrichment status)
```bash
curl "https://your-worker.com/query/quick?type=profile&accountKey=abc123"
```

Returns:
- Account summary
- Full account pack (all stored data)
- Enrichment job status
- Similar accounts (top 5)

### Search Accounts
```bash
curl "https://your-worker.com/query/quick?type=search&search=cms&limit=20"
```

## Query Types

### 1. `account` - Get account by key/domain
```
GET /query/quick?type=account&accountKey=xxx
GET /query/quick?type=account&domain=example.com
GET /query/quick?type=account&key=xxx
```

**Auto-enrichment**: ✅ Triggers if account exists

### 2. `pack` - Get complete account pack
```
GET /query/quick?type=pack&accountKey=xxx
```

Returns all stored data (scans, evidence, briefs, etc.)

### 3. `profile` - Get complete profile
```
GET /query/quick?type=profile&accountKey=xxx
```

Returns:
- Account summary
- Account pack
- Enrichment status
- Similar accounts

**Auto-enrichment**: ✅ Triggers if not enriched

### 4. `similar` - Find similar accounts
```
GET /query/quick?type=similar&accountKey=xxx&limit=10
```

Finds accounts with similar:
- Tech stack
- Signals
- AI readiness scores
- Industry indicators

### 5. `search` - Search accounts
```
GET /query/quick?type=search&search=sanity&limit=20&minScore=50
```

**Auto-enrichment**: ✅ Triggers for top 5 results

### 6. `top` - Top accounts by score
```
GET /query/quick?type=top&limit=50&minScore=50
```

### 7. `exists` - Check if account exists
```
GET /query/quick?type=exists&key=xxx
GET /query/quick?type=exists&domain=example.com
```

### 8. `enrichment-status` - Check enrichment progress
```
GET /query/quick?type=enrichment-status&accountKey=xxx
```

### 9. `stale` - Get accounts needing refresh
```
GET /query/quick?type=stale&days=30&limit=100
```

## Auto-Enrichment

### How It Works

The system automatically enriches accounts when:

1. **Account is scanned** (`/scan`)
   - Triggers for new accounts
   - Triggers for high-opportunity accounts (score >= 50)

2. **Account is queried** (`/query`, `/query/quick`)
   - Triggers if account exists but not enriched
   - Non-blocking (doesn't slow down queries)

3. **Account is searched** (`/query?type=search`, `/query/quick?type=search`)
   - Triggers for top 5 search results
   - Background processing

### Enrichment Process

1. **Queues enrichment job** (non-blocking)
2. **Runs background pipeline**:
   - Website scanning
   - Page discovery & crawling
   - Evidence extraction
   - LinkedIn scanning
   - Brief generation
   - Claim verification
   - Competitor research
3. **Compares to similar accounts**
4. **Stores complete profile**

### Enrichment Status

Check status:
```bash
curl "https://your-worker.com/query/quick?type=enrichment-status&accountKey=xxx"
```

Status values:
- `pending` - Queued, not started
- `in_progress` - Currently enriching
- `completed` - Finished successfully
- `failed` - Error occurred

### Smart Enrichment

The system automatically:
- ✅ Skips if already enriched (< 7 days)
- ✅ Skips if enrichment in progress
- ✅ Prioritizes high-opportunity accounts
- ✅ Runs in background (non-blocking)

## Comparison Features

### Similar Accounts

The system automatically finds and compares similar accounts:

```bash
curl "https://your-worker.com/query/quick?type=similar&accountKey=xxx&limit=10"
```

Compares by:
- Technology stack overlap
- Shared signals
- Similar AI readiness scores
- Industry indicators

### Complete Profile with Comparisons

```bash
curl "https://your-worker.com/query/quick?type=profile&accountKey=xxx"
```

Returns similar accounts with:
- Shared signals count
- Opportunity score comparison
- AI readiness comparison

## Performance

- **Fast Queries**: Optimized GROQ with indexes
- **Non-Blocking**: Enrichment doesn't slow queries
- **Background Processing**: Enrichment runs asynchronously
- **Smart Caching**: Results cached where possible

## Examples

### Example 1: Quick Account Lookup
```bash
curl "https://your-worker.com/query/quick?type=account&domain=sanity.io"
```

Response:
```json
{
  "ok": true,
  "data": {
    "type": "account",
    "data": {
      "_id": "account-abc123",
      "accountKey": "abc123",
      "companyName": "Sanity",
      "domain": "sanity.io",
      "opportunityScore": 85,
      "aiReadiness": { "score": 92 },
      "lastScannedAt": "2025-01-XX..."
    },
    "count": 1
  }
}
```

### Example 2: Complete Profile
```bash
curl "https://your-worker.com/query/quick?type=profile&accountKey=abc123"
```

Response:
```json
{
  "ok": true,
  "data": {
    "type": "profile",
    "data": {
      "account": {...},
      "pack": {...},
      "enrichment": {
        "status": "completed",
        "currentStage": "complete"
      },
      "similarAccounts": [...],
      "isEnriched": true,
      "isEnriching": false
    },
    "count": 1
  }
}
```

### Example 3: Search with Auto-Enrichment
```bash
curl "https://your-worker.com/query/quick?type=search&search=cms&limit=20"
```

Returns accounts immediately, enriches top 5 in background.

---

**Status**: ✅ Production Ready  
**Performance**: Fast queries, non-blocking enrichment  
**Auto-Enrichment**: Enabled by default

