# Smart Crawl Solution for Large Sites

## Problem Solved

**Issue**: Large sites like Sanity.io exceed system limits when doing deep crawls due to:
- Large JavaScript bundles
- Dynamic content
- Many pages
- Response size limits (250KB per page)

## Solution Implemented

### 1. Distributed Deep Crawl Endpoint
**POST `/crawl/distributed`**

Targets specific pages intelligently instead of crawling everything:

```json
{
  "baseUrl": "https://sanity.io",
  "targetPages": ["/studio", "/docs", "/content-lake", "/canvas", "/api"],
  "maxPages": 5,
  "pageSizeLimit": 200000
}
```

**Features**:
- ✅ Targets specific pages (or auto-discovers key pages)
- ✅ Handles size limits gracefully per page
- ✅ Returns partial results (doesn't fail completely)
- ✅ Truncates content intelligently
- ✅ Provides size information and truncation flags

### 2. Smart Crawl with OSINT Fallback
**POST `/crawl/smart`**

Attempts distributed crawl first, automatically suggests OSINT if limits exceeded:

```json
{
  "baseUrl": "https://sanity.io",
  "autoDiscover": true,
  "useOsintFallback": true
}
```

**Features**:
- ✅ Attempts distributed crawl first
- ✅ Auto-suggests OSINT scan if crawl fails
- ✅ Provides OSINT endpoint and payload ready to use
- ✅ Seamless fallback strategy

### 3. Improved Size Handling

**Changes**:
- ✅ Reduced default page size limit to 200KB (from 250KB) for large sites
- ✅ Intelligent content truncation (8KB text per page max)
- ✅ Better error messages with suggestions
- ✅ Size information in responses
- ✅ Graceful degradation (partial results)

### 4. OSINT Integration

When crawl fails, automatically provides:
- Ready-to-use OSINT endpoint
- Pre-filled request body
- Alternative synchronous option
- Clear recommendation message

## Usage Examples

### Option 1: Distributed Deep Crawl
```bash
curl -X POST "https://your-worker.com/crawl/distributed" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://sanity.io",
    "targetPages": ["/studio", "/docs", "/content-lake", "/canvas"],
    "maxPages": 5
  }'
```

### Option 2: Smart Crawl (Auto-fallback)
```bash
curl -X POST "https://your-worker.com/crawl/smart" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://sanity.io",
    "autoDiscover": true,
    "useOsintFallback": true
  }'
```

If crawl fails, response includes OSINT suggestion:
```json
{
  "ok": true,
  "data": {
    "crawlResult": {...},
    "recommendation": "OSINT_SCAN",
    "message": "Large sites benefit from OSINT scan...",
    "osintScan": {
      "endpoint": "/osint/queue",
      "method": "POST",
      "body": {
        "canonicalUrl": "https://sanity.io",
        "mode": "intelligent"
      }
    }
  }
}
```

### Option 3: Direct OSINT Scan
```bash
curl -X POST "https://your-worker.com/osint/queue" \
  -H "Content-Type: application/json" \
  -d '{
    "canonicalUrl": "https://sanity.io",
    "mode": "intelligent"
  }'
```

## Benefits

1. **Handles Large Sites**: No more size limit errors
2. **Targeted Crawling**: Focuses on key pages for tech stack
3. **Graceful Degradation**: Returns partial results instead of failing
4. **Smart Fallback**: Auto-suggests OSINT when needed
5. **Better UX**: Clear recommendations and ready-to-use alternatives

## Response Format

### Successful Distributed Crawl
```json
{
  "ok": true,
  "data": {
    "baseUrl": "https://sanity.io",
    "strategy": "smart",
    "totalPages": 5,
    "successful": 5,
    "skipped": 0,
    "errors": 0,
    "pages": [...],
    "recommendations": null
  }
}
```

### Partial Success
```json
{
  "ok": true,
  "data": {
    "totalPages": 5,
    "successful": 3,
    "skipped": 2,
    "errors": 0,
    "pages": [...],
    "skippedPages": [
      {
        "url": "...",
        "reason": "Response size exceeded limit",
        "suggestion": "Page contains large JavaScript bundles"
      }
    ]
  }
}
```

### OSINT Fallback Suggested
```json
{
  "ok": true,
  "data": {
    "crawlResult": {...},
    "recommendation": "OSINT_SCAN",
    "osintScan": {
      "endpoint": "/osint/queue",
      "method": "POST",
      "body": {...}
    }
  }
}
```

## Integration

### In One-Click Research
The one-click research endpoint now:
- ✅ Uses smart crawl strategy for large sites
- ✅ Auto-suggests OSINT if crawl fails
- ✅ Provides seamless fallback

### In Scan Endpoint
When `/scan` encounters large sites, it can:
- Use distributed crawl internally
- Fall back to OSINT suggestion
- Return partial results with recommendations

---

**Status**: ✅ Ready for Production
**New Endpoints**: 
- `POST /crawl/distributed` - Distributed deep crawl
- `POST /crawl/smart` - Smart crawl with OSINT fallback

