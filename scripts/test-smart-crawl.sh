#!/bin/bash
# Test Smart Crawl for Large Sites (e.g., Sanity.io)

BASE_URL="${1:-http://localhost:8787}"

echo "Testing Smart Crawl for Sanity.io"
echo "=================================="
echo ""

# Test 1: Distributed crawl with specific pages
echo "=== Test 1: POST /crawl/distributed (specific pages) ==="
curl -X POST "$BASE_URL/crawl/distributed" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://sanity.io",
    "targetPages": ["/studio", "/docs", "/content-lake", "/canvas", "/api"],
    "maxPages": 5
  }' | jq '.' || echo "Failed"
echo ""

# Test 2: Smart crawl with auto-discover
echo "=== Test 2: POST /crawl/smart (auto-discover) ==="
curl -X POST "$BASE_URL/crawl/smart" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://sanity.io",
    "autoDiscover": true,
    "useOsintFallback": true
  }' | jq '.' || echo "Failed"
echo ""

echo "✅ Tests complete"

