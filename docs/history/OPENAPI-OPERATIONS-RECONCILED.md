# OpenAPI Operations Reconciliation

## Issue
OpenAPI spec had 32 operations, but ChatGPT Actions has a maximum limit of 30 operations.

## Solution
Removed 2 non-essential operations to bring the count to exactly 30:

### Removed Operations

1. **`GET /cache`** (operationId: `getCacheStatus`)
   - **Reason**: Internal/debugging endpoint, not needed for GPT functionality
   - **Impact**: Cache status is still available in response metadata from other endpoints
   - **Alternative**: Cache info included in `/extract` and other endpoint responses

2. **`GET /schema`** (operationId: `getSchema`)
   - **Reason**: Self-documentation endpoint, not needed for ChatGPT Actions
   - **Impact**: Documentation is available via OpenAPI spec itself
   - **Alternative**: Users can view OpenAPI spec directly or use API docs

### Removed Tags
- `Cache` - No longer needed
- `Documentation` - No longer needed

## Current Status

**Operations**: 30/30 ✅  
**Status**: ✅ **WITHIN LIMIT**

### Remaining Operations (30)

#### Core Scanner (3)
1. `healthCheck` - GET /health
2. `scanHomepage` - GET /scan
3. `scanBatchAccounts` - GET /scan-batch

#### Content Operations (5)
4. `extractEvidence` - POST /extract
5. `searchWeb` - POST /search
6. `discoverPages` - POST /discover
7. `crawlPages` - POST /crawl
8. `verifyClaims` - POST /verify

#### Intelligence (3)
9. `generateBrief` - POST /brief
10. `generatePersonBrief` - POST /person/brief
11. `scanLinkedInProfile` - POST /linkedin-profile

#### OSINT (4)
12. `queueOsintJob` - POST /osint/queue
13. `getOsintStatus` - GET /osint/status
14. `getOsintReport` - GET /osint/report
15. `runOsintSync` - POST /osint/run

#### SDR & Patterns (3)
16. `generateGoodMorningRouting` - POST /sdr/good-morning
17. `queryUserPatterns` - GET /user-patterns/query
18. `storeUserPattern` - POST /user-patterns/store

#### Sanity CMS (5)
19. `storeData` - POST /store/{type}
20. `queryData` - GET /query
21. `queryDataPost` - POST /query
22. `updateDocument` - PUT /update/{docId}
23. `deleteDocument` - DELETE /delete/{docId}

#### Analytics (4)
24. `compareAccounts` - POST /analytics/compare
25. `getAccountTrends` - GET /analytics/trends
26. `getAnalyticsDashboard` - GET /analytics/dashboard
27. `exportAccount` - GET /analytics/export

#### Webhooks (3)
28. `registerWebhook` - POST /webhooks/register
29. `listWebhooks` - GET /webhooks/list
30. `deleteWebhook` - DELETE /webhooks/delete/{webhookId}

## Impact Assessment

### ✅ No Breaking Changes
- Removed endpoints are still accessible in the Worker
- Only removed from OpenAPI spec (ChatGPT Actions)
- Core functionality unchanged

### Cache Status
- Cache metadata is still returned in `/extract` and other endpoint responses
- No loss of functionality for GPT users

### Schema Documentation
- OpenAPI spec itself serves as documentation
- No need for separate schema endpoint in Actions

## Verification

```bash
# Count operations
grep -c "operationId:" openapi.yaml
# Should output: 30
```

## Status

✅ **RECONCILED** - OpenAPI spec now has exactly 30 operations, within ChatGPT Actions limit.

