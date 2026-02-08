# STEP 4 Verification — Caching + Change Detection

## Changes Made

1. ✅ Added cache interface with KV (if bound) and in-memory fallback
2. ✅ Content hash calculation (SHA-256 of mainText)
3. ✅ Cache storage with TTL (24 hours)
4. ✅ Cache retrieval with content hash checking
5. ✅ Cache metadata in responses: `{hit, ageSec, contentHash}`
6. ✅ GET /cache/status endpoint
7. ✅ Updated /extract endpoint to use caching

## Cache Implementation

- **KV Support**: Uses Cloudflare KV if `CACHE_KV` binding is configured
- **In-Memory Fallback**: Uses Map for dev/testing when KV not available
- **TTL**: 24 hours (configurable)
- **Content Hash**: SHA-256 of mainText for change detection
- **Cache Key**: `extract:${hashUrl(url)}`

## Verification Commands

### 1. Test Cache Miss (First Request)

```bash
# Start dev server
wrangler dev

# First request - should be cache miss
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' \
  | jq '{cache, title: .data.title}'

# Expected:
# {
#   "cache": {
#     "hit": false,
#     "ageSec": 0,
#     "contentHash": "abc123..."
#   },
#   "title": "Example Domain"
# }
```

### 2. Test Cache Hit (Second Request)

```bash
# Second request - should be cache hit
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' \
  | jq '{cache, title: .data.title}'

# Expected:
# {
#   "cache": {
#     "hit": true,
#     "ageSec": 1-5,  # Should be > 0
#     "contentHash": "abc123..."  # Same as first request
#   },
#   "title": "Example Domain"
# }
```

### 3. Test Cache Status Endpoint

```bash
# Check cache status
curl -s "http://localhost:8787/cache/status?url=https://example.com" | jq

# Expected (if cached):
# {
#   "ok": true,
#   "data": {
#     "url": "https://example.com",
#     "cached": true,
#     "cache": {
#       "hit": true,
#       "ageSec": 10,
#       "contentHash": "abc123..."
#     }
#   },
#   "requestId": "..."
# }

# Expected (if not cached):
# {
#   "ok": true,
#   "data": {
#     "url": "https://example.com",
#     "cached": false,
#     "cache": {
#       "hit": false,
#       "ageSec": null,
#       "contentHash": null
#     }
#   },
#   "requestId": "..."
# }
```

### 4. Test Cache with Different URLs

```bash
# Extract first URL
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' \
  | jq '.cache.hit'  # Should be false

# Extract different URL (should be cache miss)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://httpbin.org/html", "mode": "fast"}' \
  | jq '.cache.hit'  # Should be false

# Extract first URL again (should be cache hit)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' \
  | jq '.cache.hit'  # Should be true
```

### 5. Test Content Hash Consistency

```bash
# Extract same URL twice and compare content hashes
HASH1=$(curl -s -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' \
  | jq -r '.cache.contentHash')

sleep 2

HASH2=$(curl -s -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' \
  | jq -r '.cache.contentHash')

echo "Hash 1: $HASH1"
echo "Hash 2: $HASH2"
echo "Match: $([ "$HASH1" == "$HASH2" ] && echo "Yes" || echo "No")"

# Expected: Hashes should match (same content)
```

### 6. Test Cache Age

```bash
# Extract URL
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' > /dev/null

# Wait a few seconds
sleep 3

# Check cache status
curl -s "http://localhost:8787/cache/status?url=https://example.com" \
  | jq '.data.cache.ageSec'

# Expected: Should be >= 3 (age in seconds)
```

### 7. Test Error Handling

```bash
# Test missing URL parameter
curl -s "http://localhost:8787/cache/status" | jq '.error'

# Expected: VALIDATION_ERROR

# Test invalid URL
curl -s "http://localhost:8787/cache/status?url=not-a-url" | jq '.error'

# Expected: VALIDATION_ERROR
```

### 8. Test Cache Expiration (Manual)

```bash
# Note: TTL is 24 hours, so manual expiration test requires code modification
# For testing, you can modify the TTL in CacheInterface constructor to 60 seconds

# Extract URL
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' > /dev/null

# Wait for expiration (if TTL modified to 60s)
# sleep 61

# Extract again - should be cache miss if expired
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "mode": "fast"}' \
  | jq '.cache.hit'

# Expected: false if expired, true if not expired
```

## Expected Results

### Cache Hit
- ✅ `cache.hit = true`
- ✅ `cache.ageSec > 0` (age in seconds)
- ✅ `cache.contentHash` present (SHA-256 hash)
- ✅ Response data matches cached data

### Cache Miss
- ✅ `cache.hit = false`
- ✅ `cache.ageSec = 0`
- ✅ `cache.contentHash` present (newly calculated)
- ✅ Data fetched and stored in cache

### Cache Status Endpoint
- ✅ Returns cache metadata for URL
- ✅ `cached: true/false` indicates if URL is cached
- ✅ Includes `ageSec` and `contentHash` if cached

## Setting Up KV (Optional)

To use Cloudflare KV for persistent caching:

1. Create KV namespace:
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

**Note**: Without KV, the cache uses in-memory storage (dev only, not persistent across requests in production).

## Summary

The caching system should:
- ✅ Cache EvidencePack results for 24 hours
- ✅ Calculate and store content hash (SHA-256)
- ✅ Return cache metadata in responses
- ✅ Support KV (if configured) or in-memory fallback
- ✅ Provide /cache/status endpoint for cache inspection
- ✅ Handle cache expiration automatically

