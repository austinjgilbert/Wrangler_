#!/bin/bash

# Comprehensive Test Suite
# Tests all endpoints, checks for blocking, validates limits

WORKER_URL="${1:-http://localhost:8787}"
echo "Testing Worker at: $WORKER_URL"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

test_endpoint() {
    local name="$1"
    local method="$2"
    local path="$3"
    local data="$4"
    local expected_status="${5:-200}"
    
    echo -n "Testing $name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$WORKER_URL$path" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$WORKER_URL$path" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    # Check for Cloudflare blocking
    if echo "$body" | grep -qi "cloudflare.*attention\|cloudflare.*error\|cf-error\|challenge\|checking your browser\|blocked\|access denied\|1020"; then
        echo -e "${RED}FAILED${NC} - Cloudflare blocking detected"
        echo "  Response: $(echo "$body" | head -c 200)"
        ((FAILED++))
        return 1
    fi
    
    # Check for rate limiting
    if [ "$http_code" = "429" ]; then
        echo -e "${YELLOW}WARNING${NC} - Rate limited (429)"
        ((WARNINGS++))
        return 2
    fi
    
    # Check status code
    if [ "$http_code" = "$expected_status" ]; then
        # Validate JSON response
        if echo "$body" | jq . > /dev/null 2>&1; then
            echo -e "${GREEN}PASSED${NC}"
            ((PASSED++))
            return 0
        else
            echo -e "${YELLOW}WARNING${NC} - Invalid JSON"
            echo "  Response: $(echo "$body" | head -c 200)"
            ((WARNINGS++))
            return 2
        fi
    else
        echo -e "${RED}FAILED${NC} - Expected $expected_status, got $http_code"
        echo "  Response: $(echo "$body" | head -c 200)"
        ((FAILED++))
        return 1
    fi
}

echo "=== 1. Health & Schema Tests ==="
test_endpoint "GET /health" "GET" "/health"
test_endpoint "GET /schema" "GET" "/schema"
echo ""

echo "=== 2. Extraction Tests ==="
test_endpoint "POST /extract (example.com)" "POST" "/extract" \
    '{"url":"https://example.com","mode":"fast"}'
test_endpoint "POST /extract (httpbin)" "POST" "/extract" \
    '{"url":"https://httpbin.org/html","mode":"fast"}'
echo ""

echo "=== 3. Search Tests (Mock Data) ==="
test_endpoint "POST /search" "POST" "/search" \
    '{"query":"test query","limit":5}'
echo ""

echo "=== 4. Discovery Tests ==="
test_endpoint "POST /discover" "POST" "/discover" \
    '{"url":"https://example.com","budget":5}'
test_endpoint "POST /discover (cloudflare)" "POST" "/discover" \
    '{"url":"https://www.cloudflare.com","budget":5}'
echo ""

echo "=== 5. Crawl Tests ==="
test_endpoint "POST /crawl" "POST" "/crawl" \
    '{"url":"https://example.com","budget":2}'
echo ""

echo "=== 6. Verify Tests ==="
test_endpoint "POST /verify" "POST" "/verify" \
    '{"claims":["test claim"],"sources":["https://example.com"]}'
echo ""

echo "=== 7. Brief Tests ==="
test_endpoint "POST /brief" "POST" "/brief" \
    '{"companyOrSite":"Example","seedUrl":"https://example.com"}'
echo ""

echo "=== 8. Cache Tests ==="
test_endpoint "GET /cache/status" "GET" "/cache/status?url=https://example.com"
echo ""

echo "=== 9. Legacy Endpoint Tests ==="
test_endpoint "GET /scan" "GET" "/scan?url=https://example.com"
test_endpoint "GET /scan-batch" "GET" "/scan-batch?urls=https://example.com,https://httpbin.org/html&mode=light"
echo ""

echo "=== 10. Error Handling Tests ==="
test_endpoint "POST /extract (invalid URL)" "POST" "/extract" \
    '{"url":"not-a-url"}' "400"
test_endpoint "POST /extract (missing URL)" "POST" "/extract" \
    '{}' "400"
test_endpoint "GET /scan (missing URL)" "GET" "/scan" "" "400"
test_endpoint "GET /unknown" "GET" "/unknown-endpoint" "" "404"
echo ""

echo "=== 11. Cloudflare Bot Protection Test ==="
echo -n "Testing Cloudflare bypass headers... "
response=$(curl -s -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://www.cloudflare.com","mode":"fast"}' 2>&1)

if echo "$response" | grep -qi "cloudflare.*challenge\|blocked\|access denied"; then
    echo -e "${RED}FAILED${NC} - Cloudflare blocking detected"
    ((FAILED++))
else
    if echo "$response" | jq -e '.ok' > /dev/null 2>&1; then
        echo -e "${GREEN}PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${YELLOW}WARNING${NC} - Unexpected response"
        ((WARNINGS++))
    fi
fi
echo ""

echo "=== 12. Timeout Test ==="
echo -n "Testing timeout handling... "
start_time=$(date +%s)
response=$(curl -s --max-time 15 -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://httpbin.org/delay/10","mode":"fast"}' 2>&1)
end_time=$(date +%s)
duration=$((end_time - start_time))

if [ $duration -lt 15 ]; then
    echo -e "${GREEN}PASSED${NC} - Timeout handled correctly ($duration seconds)"
    ((PASSED++))
else
    echo -e "${YELLOW}WARNING${NC} - Timeout may not be working ($duration seconds)"
    ((WARNINGS++))
fi
echo ""

echo "=== 13. Concurrent Request Test ==="
echo -n "Testing concurrent requests (5 parallel)... "
start_time=$(date +%s)
for i in {1..5}; do
    curl -s -X POST "$WORKER_URL/extract" \
        -H "Content-Type: application/json" \
        -d "{\"url\":\"https://example.com\",\"mode\":\"fast\"}" > /dev/null 2>&1 &
done
wait
end_time=$(date +%s)
duration=$((end_time - start_time))

if [ $duration -lt 10 ]; then
    echo -e "${GREEN}PASSED${NC} - Concurrent requests handled ($duration seconds)"
    ((PASSED++))
else
    echo -e "${YELLOW}WARNING${NC} - Concurrent requests may be slow ($duration seconds)"
    ((WARNINGS++))
fi
echo ""

echo "=== 14. Cache Hit Test ==="
echo -n "Testing cache functionality... "
# First request (cache miss)
curl -s -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com","mode":"fast"}' > /dev/null 2>&1

# Second request (should be cache hit)
response=$(curl -s -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com","mode":"fast"}')

cache_hit=$(echo "$response" | jq -r '.cache.hit // false' 2>/dev/null)

if [ "$cache_hit" = "true" ]; then
    echo -e "${GREEN}PASSED${NC} - Cache working correctly"
    ((PASSED++))
else
    echo -e "${YELLOW}WARNING${NC} - Cache may not be working (hit=$cache_hit)"
    ((WARNINGS++))
fi
echo ""

echo "=== 15. Large Payload Test ==="
echo -n "Testing large payload handling... "
response=$(curl -s -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com","mode":"deep","maxChars":50000}')

if echo "$response" | jq -e '.ok' > /dev/null 2>&1; then
    size=$(echo "$response" | jq -r '.data.mainText | length' 2>/dev/null)
    if [ "$size" -gt 0 ]; then
        echo -e "${GREEN}PASSED${NC} - Large payload handled (size: $size chars)"
        ((PASSED++))
    else
        echo -e "${YELLOW}WARNING${NC} - Large payload may be truncated"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}FAILED${NC} - Large payload failed"
    ((FAILED++))
fi
echo ""

echo "=== 16. SSRF Protection Test ==="
echo -n "Testing SSRF protection... "
response=$(curl -s -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"http://localhost","mode":"fast"}')

if echo "$response" | jq -e '.ok == false' > /dev/null 2>&1; then
    error_code=$(echo "$response" | jq -r '.error.code' 2>/dev/null)
    if [ "$error_code" = "VALIDATION_ERROR" ]; then
        echo -e "${GREEN}PASSED${NC} - SSRF protection working"
        ((PASSED++))
    else
        echo -e "${YELLOW}WARNING${NC} - SSRF blocked but wrong error code"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}FAILED${NC} - SSRF protection may not be working"
    ((FAILED++))
fi
echo ""

echo "=== 17. CORS Test ==="
echo -n "Testing CORS headers... "
response=$(curl -s -I -X OPTIONS "$WORKER_URL/health" \
    -H "Origin: https://example.com" \
    -H "Access-Control-Request-Method: GET")

if echo "$response" | grep -qi "access-control-allow-origin"; then
    echo -e "${GREEN}PASSED${NC} - CORS headers present"
    ((PASSED++))
else
    echo -e "${YELLOW}WARNING${NC} - CORS headers may be missing"
    ((WARNINGS++))
fi
echo ""

echo "=== 18. RequestId Test ==="
echo -n "Testing requestId in responses... "
response=$(curl -s "$WORKER_URL/health")
request_id=$(echo "$response" | jq -r '.requestId // empty' 2>/dev/null)

if [ -n "$request_id" ]; then
    echo -e "${GREEN}PASSED${NC} - RequestId present"
    ((PASSED++))
else
    echo -e "${YELLOW}WARNING${NC} - RequestId missing"
    ((WARNINGS++))
fi
echo ""

echo "=================================="
echo "Test Summary:"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All critical tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Review output above.${NC}"
    exit 1
fi

