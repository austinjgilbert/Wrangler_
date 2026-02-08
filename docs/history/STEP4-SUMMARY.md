# STEP 4 — Caching + Change Detection

## ✅ Completed

### 1. Cache Interface
- **CacheInterface class** with KV support and in-memory fallback
- **KV Binding**: Uses `env.CACHE_KV` if configured
- **In-Memory Fallback**: Uses Map for dev/testing
- **TTL**: 24 hours (configurable)
- **Methods**: `get()`, `set()`, `delete()`, `getMetadata()`

### 2. Content Hash Calculation
- **SHA-256 Hash**: Uses Web Crypto API (`crypto.subtle.digest`)
- **Hash Source**: mainText content
- **Fallback**: Simple hash function if crypto.subtle unavailable
- **Purpose**: Change detection (same hash = same content)

### 3. Cache Storage
- **Cache Key**: `extract:${hashUrl(url)}`
- **Stored Data**: EvidencePack + metadata (expiresAt, cachedAt, contentHash)
- **TTL**: 24 hours (86400000 ms)
- **KV Expiration**: Uses `expirationTtl` in seconds

### 4. Cache Retrieval
- **Cache Check**: Before fetching, check cache
- **TTL Validation**: Automatically expires old entries
- **Content Hash**: Stored and returned with cached data
- **Cache Hit**: Returns cached data immediately
- **Cache Miss**: Fetches, extracts, stores, then returns

### 5. Cache Metadata in Responses
- **Response Format**: `{ ...evidencePack, cache: { hit, ageSec, contentHash } }`
- **hit**: Boolean indicating cache hit/miss
- **ageSec**: Age of cache entry in seconds (0 for new entries)
- **contentHash**: SHA-256 hash of mainText

### 6. GET /cache/status Endpoint
- **URL**: `/cache/status?url=<target-url>`
- **Returns**: Cache status for a URL
- **Response**: `{ url, cached, cache: { hit, ageSec, contentHash } }`
- **Use Case**: Check if URL is cached without fetching

### 7. Updated /extract Endpoint
- **Caching**: Automatically caches all /extract results
- **Cache Metadata**: Included in every response
- **Transparent**: Works seamlessly with existing clients

## Files Changed

1. **`src/index.js`** - Added:
   - `hashUrl()` - URL hashing for cache keys
   - `calculateContentHash()` - SHA-256 hash calculation
   - `CacheInterface` class - Cache abstraction layer
   - `handleCacheStatus()` - GET /cache/status endpoint handler
   - Updated `handleExtract()` to use caching
   - Updated routing to include `/cache/status`
   - Updated `/schema` endpoint documentation

2. **`wrangler.toml`** - Added:
   - Commented KV namespace configuration example

## Cache Architecture

```
Request → Check Cache → [Hit] → Return Cached Data
                ↓
            [Miss]
                ↓
         Fetch & Extract
                ↓
        Calculate Content Hash
                ↓
        Store in Cache (KV or Memory)
                ↓
        Return Data + Cache Metadata
```

## KV Setup (Optional)

To enable persistent caching with Cloudflare KV:

1. Create namespace:
   ```bash
   wrangler kv:namespace create "CACHE_KV"
   ```

2. Update `wrangler.toml`:
   ```toml
   kv_namespaces = [
     { binding = "CACHE_KV", id = "your-namespace-id" }
   ]
   ```

3. Deploy:
   ```bash
   wrangler deploy
   ```

**Without KV**: Cache uses in-memory storage (works for dev, not persistent in production).

## Verification

See `STEP4-VERIFICATION.md` for detailed test commands.

Quick test:
```bash
# First request (cache miss)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' \
  | jq '.cache'

# Second request (cache hit)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' \
  | jq '.cache'

# Check cache status
curl "http://localhost:8787/cache/status?url=https://example.com" | jq
```

## Benefits

- **Performance**: Cached responses return instantly
- **Cost Savings**: Reduces external fetch requests
- **Change Detection**: Content hash enables change tracking
- **Flexible**: Works with or without KV
- **Transparent**: No changes needed to existing clients

## Next Steps

Ready for **STEP 5 — Multi-source verification mode**

