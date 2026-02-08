#!/bin/bash

# Limit Testing Script
# Tests various limits and boundaries

WORKER_URL="${1:-http://localhost:8787}"
echo "Testing limits and boundaries..."
echo "================================="
echo ""

# Test 1: Maximum batch size
echo "Test 1: Batch size limits"
echo -n "  Testing max URLs (light mode, 10 URLs)... "
response=$(curl -s -X GET "$WORKER_URL/scan-batch?urls=$(printf 'https://example.com,'%.0s {1..11})&mode=light")
if echo "$response" | jq -e '.error.code == "VALIDATION_ERROR"' > /dev/null 2>&1; then
    echo "✅ PASSED - Limit enforced"
else
    echo "❌ FAILED - Limit not enforced"
fi

# Test 2: Large payload
echo -n "  Testing large payload (50K chars)... "
response=$(curl -s -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com","mode":"deep","maxChars":50000}')
if echo "$response" | jq -e '.ok' > /dev/null 2>&1; then
    size=$(echo "$response" | jq -r '.data.mainText | length' 2>/dev/null)
    if [ "$size" -le 50000 ]; then
        echo "✅ PASSED - Payload limited correctly ($size chars)"
    else
        echo "⚠️  WARNING - Payload may exceed limit ($size chars)"
    fi
else
    echo "❌ FAILED"
fi

# Test 3: Timeout handling
echo -n "  Testing timeout (slow URL)... "
start=$(date +%s)
response=$(curl -s --max-time 15 -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://httpbin.org/delay/10","mode":"fast"}' 2>&1)
end=$(date +%s)
duration=$((end - start))

if [ $duration -lt 15 ]; then
    echo "✅ PASSED - Timeout handled ($duration seconds)"
else
    echo "⚠️  WARNING - May not timeout correctly ($duration seconds)"
fi

# Test 4: Concurrent requests
echo -n "  Testing concurrency limit (5 parallel)... "
start=$(date +%s)
for i in {1..5}; do
    curl -s -X POST "$WORKER_URL/extract" \
        -H "Content-Type: application/json" \
        -d '{"url":"https://example.com","mode":"fast"}' > /dev/null 2>&1 &
done
wait
end=$(date +%s)
duration=$((end - start))

if [ $duration -lt 10 ]; then
    echo "✅ PASSED - Concurrency handled ($duration seconds)"
else
    echo "⚠️  WARNING - Concurrency may be slow ($duration seconds)"
fi

# Test 5: Cache size
echo -n "  Testing cache functionality... "
# First request
curl -s -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com","mode":"fast"}' > /dev/null 2>&1

# Second request (should hit cache)
response=$(curl -s -X POST "$WORKER_URL/extract" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com","mode":"fast"}')

cache_hit=$(echo "$response" | jq -r '.cache.hit // false' 2>/dev/null)
if [ "$cache_hit" = "true" ]; then
    echo "✅ PASSED - Cache working"
else
    echo "⚠️  WARNING - Cache may not be working"
fi

echo ""
echo "✅ Limit tests complete"

