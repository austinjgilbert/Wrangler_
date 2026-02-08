# Complete Testing Guide

## 🎯 Testing Objectives

1. ✅ Verify all endpoints work correctly
2. ✅ Detect Cloudflare and service blocking
3. ✅ Validate limits and boundaries
4. ✅ Test error handling
5. ✅ Verify security (SSRF, CORS)
6. ✅ Test performance (timeouts, concurrency)

## 📦 Test Suites Available

### 1. `test-comprehensive.sh` (18 test categories)
Full endpoint coverage with blocking detection

### 2. `test-blocking-detection.sh` (6 high-profile sites)
Specific Cloudflare blocking detection

### 3. `test-limits.sh` (5 limit tests)
Boundary and limit validation

### 4. `quick-test.sh` (4 quick checks)
Fast manual verification

## 🚀 Running Tests

### Prerequisites
```bash
# 1. Install jq (if not installed)
brew install jq  # macOS
# or
apt-get install jq  # Linux

# 2. Start Worker
wrangler dev
```

### Run All Tests
```bash
cd /Users/austin.gilbert/website-scanner-worker

# Comprehensive (takes ~2-3 minutes)
./test-comprehensive.sh http://localhost:8787

# Blocking detection (takes ~30 seconds)
./test-blocking-detection.sh http://localhost:8787

# Limits (takes ~30 seconds)
./test-limits.sh http://localhost:8787

# Quick test (takes ~10 seconds)
./quick-test.sh http://localhost:8787
```

## 🔍 Key Tests to Run

### Critical: Cloudflare Blocking Test
```bash
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.cloudflare.com","mode":"fast"}' | jq
```

**Check for**:
- ❌ "challenge", "blocked", "access denied"
- ❌ HTTP 403, 1020
- ✅ Valid JSON with `"ok": true`

### Critical: SSRF Protection
```bash
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localhost","mode":"fast"}' | jq '.error.code'
```

**Expected**: `"VALIDATION_ERROR"`

### Critical: Timeout Handling
```bash
time curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/delay/10","mode":"fast"}'
```

**Expected**: Completes in <15 seconds

### Critical: Cache Functionality
```bash
# First request
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"fast"}' | jq '.cache.hit'
# Should be: false

# Second request
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"fast"}' | jq '.cache.hit'
# Should be: true
```

## 📊 Expected Results

### ✅ All Tests Should Pass
- Health check returns `{"ok": true, "version": "1.0.0", ...}`
- All endpoints return valid JSON
- No Cloudflare blocking detected
- SSRF protection working
- Timeouts enforced
- Cache working
- CORS headers present
- RequestId in all responses

### ⚠️ Acceptable Warnings
- Rate limiting (429) - expected under heavy load
- Cache miss on first request - expected
- Slow network responses - not a code issue

### ❌ Should Never Happen
- Cloudflare challenge pages
- "blocked" or "access denied"
- Invalid JSON responses
- Missing RequestId
- SSRF bypass
- Timeout not working

## 🐛 Troubleshooting

### Cloudflare Blocking Detected
**Symptoms**: Challenge pages, 403 errors, "blocked" messages

**Solutions**:
1. Update `getBrowserHeaders()` with more realistic headers
2. Rotate User-Agent strings
3. Add more browser-like headers (Accept-Encoding, etc.)
4. Consider using proxy service

### Timeouts Not Working
**Symptoms**: Requests hang indefinitely

**Solutions**:
1. Verify `fetchWithTimeout()` is used everywhere
2. Check timeout values (should be 5-15 seconds)
3. Verify AbortController is working

### Cache Not Working
**Symptoms**: Cache hit always false

**Solutions**:
1. Check if KV is configured (optional)
2. Verify in-memory cache fallback
3. Check cache key generation
4. Verify TTL settings

### Rate Limiting
**Symptoms**: HTTP 429 responses

**Solutions**:
1. Add delays between requests
2. Implement request queuing
3. Add rate limiting on Worker side

## 📝 Test Results Template

After running tests, document:

```
Test Date: [DATE]
Worker URL: [URL]
Environment: [local/production]

Results:
- Comprehensive: X passed, Y warnings, Z failed
- Blocking: X passed, Y blocked
- Limits: X passed, Y warnings

Issues Found:
- [List any issues]

Recommendations:
- [List recommendations]
```

## 🎯 Production Readiness Checklist

Before deploying to production:

- [ ] All comprehensive tests pass
- [ ] No Cloudflare blocking detected
- [ ] SSRF protection verified
- [ ] Timeouts working correctly
- [ ] Cache functioning
- [ ] CORS headers present
- [ ] RequestId in all responses
- [ ] Error handling tested
- [ ] Limits enforced
- [ ] Concurrent requests handled

---

**Status**: Test suites ready  
**Action**: Run tests and verify all pass before production deployment

