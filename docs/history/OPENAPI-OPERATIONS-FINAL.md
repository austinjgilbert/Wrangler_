# OpenAPI Operations - Final Reconciliation

## ✅ Issue Resolved

**Problem**: OpenAPI spec had 32 operations, exceeding ChatGPT Actions limit of 30.

**Solution**: Removed 2 non-essential operations.

---

## Removed Operations

### 1. `GET /cache/status` (getCacheStatus)
- **Reason**: Internal/debugging endpoint
- **Impact**: None - cache info still available in other endpoint responses
- **Alternative**: Cache metadata included in `/extract` and other responses

### 2. `GET /schema` (getSchema)
- **Reason**: Self-documentation endpoint (redundant)
- **Impact**: None - OpenAPI spec itself is the documentation
- **Alternative**: View OpenAPI spec directly or use API docs

---

## Final Operations List (30/30)

### Core Scanner (3)
1. `healthCheck` - GET /health
2. `scanHomepage` - GET /scan
3. `scanBatchAccounts` - GET /scan-batch

### Content Operations (5)
4. `extractEvidence` - POST /extract
5. `searchWeb` - POST /search
6. `discoverPages` - POST /discover
7. `crawlPages` - POST /crawl
8. `verifyClaims` - POST /verify

### Intelligence (3)
9. `generateBrief` - POST /brief
10. `generatePersonBrief` - POST /person/brief
11. `scanLinkedInProfile` - POST /linkedin-profile

### OSINT (4)
12. `queueOsintJob` - POST /osint/queue
13. `getOsintStatus` - GET /osint/status
14. `getOsintReport` - GET /osint/report
15. `runOsintSync` - POST /osint/run

### SDR & Patterns (3)
16. `generateGoodMorningRouting` - POST /sdr/good-morning
17. `queryUserPatterns` - GET /user-patterns/query
18. `storeUserPattern` - POST /user-patterns/store

### Sanity CMS (5)
19. `storeData` - POST /store/{type}
20. `queryData` - GET /query
21. `queryDataPost` - POST /query
22. `updateDocument` - PUT /update/{docId}
23. `deleteDocument` - DELETE /delete/{docId}

### Analytics (4)
24. `compareAccounts` - POST /analytics/compare
25. `getAccountTrends` - GET /analytics/trends
26. `getAnalyticsDashboard` - GET /analytics/dashboard
27. `exportAccount` - GET /analytics/export

### Webhooks (3)
28. `registerWebhook` - POST /webhooks/register
29. `listWebhooks` - GET /webhooks/list
30. `deleteWebhook` - DELETE /webhooks/delete/{webhookId}

---

## Verification

```bash
# Count operations
grep -c "operationId:" openapi.yaml
# Output: 30 ✅
```

---

## Impact

### ✅ No Breaking Changes
- Removed endpoints still work in Worker (just not in OpenAPI/Actions)
- All core functionality preserved
- Cache info available in responses
- Documentation via OpenAPI spec

### ✅ Ready for ChatGPT Actions
- Exactly 30 operations (at limit)
- All essential features included
- No functionality lost for GPT users

---

**Status**: ✅ **RECONCILED** - Ready for ChatGPT Actions integration

