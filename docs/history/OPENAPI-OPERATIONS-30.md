# OpenAPI Operations - Exactly 30

## ✅ Status: Fixed

The OpenAPI specification now has exactly **30 operations** (the maximum allowed).

## Changes Made

### Removed Operations

1. **POST /crawl (crawlPages)**
   - **Reason**: Replaced by `/crawl/distributed` which provides better functionality
   - **Alternative**: Use `POST /crawl/distributed` instead
   - **Note**: The endpoint still exists in code for backward compatibility, but is not documented in OpenAPI

2. **POST /osint/run (runOsintSync)**
   - **Reason**: Admin-only endpoint, not needed in public API
   - **Alternative**: Use `POST /osint/queue` for normal operations
   - **Note**: Still available in code for admin use, but not in OpenAPI

## Current Operations (30 total)

### Health & Core
1. `healthCheck` - GET /health
2. `scanHomepage` - GET /scan
3. `scanBatchAccounts` - GET /scan-batch
4. `scanLinkedInProfile` - POST /linkedin-profile

### Research & Extraction
5. `extractEvidence` - POST /extract
6. `searchWeb` - POST /search
7. `discoverPages` - POST /discover

### Crawling
8. `distributedCrawl` - POST /crawl (updated from /crawl/distributed)
9. `smartCrawl` - POST /crawl/smart

### Intelligence
10. `generateBrief` - POST /brief
11. `generatePersonBrief` - POST /person/brief
12. `generateGoodMorningRouting` - POST /sdr/good-morning

### User Patterns
13. `queryUserPatterns` - POST /user-patterns/query
14. `storeUserPattern` - POST /user-patterns/store

### Verification
15. `verifyClaims` - POST /verify

### Sanity Storage & Query
16. `storeData` - POST /store/{type}
17. `queryData` - POST /query
18. `quickQuery` - GET /query/quick
19. `updateDocument` - PUT /update/{docId}
20. `deleteDocument` - DELETE /update/{docId}

### OSINT
21. `queueOsintJob` - POST /osint/queue
22. `getOsintStatus` - GET /osint/status
23. `getOsintReport` - GET /osint/report

### Analytics
24. `compareAccounts` - POST /analytics/compare
25. `getAccountTrends` - GET /analytics/trends
26. `getAnalyticsDashboard` - GET /analytics/dashboard
27. `exportAccount` - GET /analytics/export

### Webhooks
28. `registerWebhook` - POST /webhooks/register
29. `listWebhooks` - GET /webhooks
30. `deleteWebhook` - DELETE /webhooks/delete/{webhookId}

## Verification

```bash
# Count operations
grep -c "operationId:" openapi.yaml
# Expected: 30

# List all operations
grep "operationId:" openapi.yaml
```

## Migration Notes

### For /crawl endpoint
- **Old**: `POST /crawl` (no longer in OpenAPI)
- **New**: `POST /crawl/distributed` or `POST /crawl/smart`
- **Backward Compatibility**: The old `/crawl` endpoint still works in code but is not documented

### For OSINT sync execution
- **Old**: `POST /osint/run` (no longer in OpenAPI)
- **New**: Use `POST /osint/queue` for async execution
- **Admin Use**: The sync endpoint is still available but not in public API spec

## Status

✅ **Exactly 30 operations**  
✅ **No linting errors**  
✅ **Ready for deployment**

---

**Updated**: January 2025  
**Validation**: Passed

