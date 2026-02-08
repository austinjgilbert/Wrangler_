# How to Run Comprehensive Tests

## 🚀 Quick Start

### Step 1: Start the Worker
```bash
cd /Users/austin.gilbert/website-scanner-worker
wrangler dev
```

Keep this running in one terminal.

### Step 2: Run Tests (in another terminal)
```bash
cd /Users/austin.gilbert/website-scanner-worker

# Run comprehensive test suite
./test-comprehensive.sh http://localhost:8787

# Or test specific areas:
./test-blocking-detection.sh http://localhost:8787
./test-limits.sh http://localhost:8787
```

## 📋 Test Suites

### 1. Comprehensive Test (`test-comprehensive.sh`)
**18 test categories** covering:
- ✅ All 11 endpoints
- ✅ Error handling
- ✅ Cloudflare blocking detection
- ✅ Timeout handling
- ✅ Concurrent requests
- ✅ Cache functionality
- ✅ SSRF protection
- ✅ CORS headers
- ✅ RequestId validation

### 2. Blocking Detection (`test-blocking-detection.sh`)
Tests multiple high-profile sites to detect:
- Cloudflare challenges
- Bot protection blocking
- Access denied patterns
- Rate limiting

### 3. Limits Testing (`test-limits.sh`)
Tests boundaries:
- Batch size limits
- Payload size limits
- Timeout limits
- Concurrency limits
- Cache limits

## 🧪 Manual Testing (If Scripts Don't Work)

### Test 1: Health Check
```bash
curl http://localhost:8787/health | jq
```

### Test 2: Extract (Check for Blocking)
```bash
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.cloudflare.com","mode":"fast"}' | jq
```

**Look for**: No "challenge", "blocked", "access denied" in response

### Test 3: Cache Functionality
```bash
# First request (cache miss)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"fast"}' | jq '.cache'

# Second request (should be cache hit)
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"fast"}' | jq '.cache'
```

**Expected**: First has `"hit": false`, second has `"hit": true`

### Test 4: SSRF Protection
```bash
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localhost","mode":"fast"}' | jq '.error'
```

**Expected**: `"code": "VALIDATION_ERROR"`

### Test 5: Concurrent Requests
```bash
# Run 5 requests in parallel
for i in {1..5}; do
  curl -s -X POST http://localhost:8787/extract \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com","mode":"fast"}' > /dev/null &
done
wait
echo "All requests completed"
```

### Test 6: Timeout Handling
```bash
# Test with slow URL (should timeout)
time curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/delay/10","mode":"fast"}'
```

**Expected**: Should complete in <15 seconds (timeout enforced)

## 🔍 What to Look For

### ✅ Success Indicators
- All responses return valid JSON
- `"ok": true` for successful requests
- `"ok": false` with proper error codes for failures
- No Cloudflare challenge pages
- No "blocked" or "access denied" messages
- RequestId present in all responses
- Cache working (hit on second request)

### ❌ Failure Indicators
- Cloudflare challenge pages
- "blocked" or "access denied" messages
- HTTP 403 or 1020 errors
- Invalid JSON responses
- Missing RequestId
- Timeouts not working
- SSRF protection not working

## 📊 Expected Test Results

### Comprehensive Test
- **Passed**: 15-18 tests
- **Warnings**: 0-3 (non-critical)
- **Failed**: 0 (critical)

### Blocking Detection
- **Passed**: 5-6 URLs
- **Blocked**: 0 URLs

### Limits Test
- **All limits enforced**: ✅
- **Timeouts working**: ✅
- **Concurrency handled**: ✅

## 🐛 Troubleshooting

### Issue: "Worker not running"
**Solution**: Start with `wrangler dev` in another terminal

### Issue: "jq: command not found"
**Solution**: Install jq: `brew install jq` (macOS) or `apt-get install jq` (Linux)

### Issue: Tests timing out
**Solution**: Check network connectivity, Worker may be slow

### Issue: Cloudflare blocking detected
**Solution**: 
1. Check `getBrowserHeaders()` function
2. Update User-Agent if needed
3. Add more browser-like headers

### Issue: Cache not working
**Solution**: 
1. Check if KV is configured (optional)
2. In-memory cache should still work
3. Verify cache key generation

## 📝 Test Results Logging

To save test results:
```bash
./test-comprehensive.sh http://localhost:8787 2>&1 | tee test-results.log
```

## 🎯 Production Testing

After deployment:
```bash
# Update WORKER_URL
WORKER_URL="https://your-worker.workers.dev"

./test-comprehensive.sh $WORKER_URL
./test-blocking-detection.sh $WORKER_URL
./test-limits.sh $WORKER_URL
```

---

**Status**: Test suites ready  
**Next**: Run tests and review results

