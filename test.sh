#!/bin/bash

# Website Scanner Worker - Test Script
# Usage: ./test.sh YOUR-WORKER-URL

if [ -z "$1" ]; then
    echo "Usage: ./test.sh YOUR-WORKER-URL"
    echo "Example: ./test.sh https://website-scanner.YOUR-SUBDOMAIN.workers.dev"
    exit 1
fi

WORKER_URL="$1"

echo "🧪 Testing Website Scanner Worker"
echo "=================================="
echo "Worker URL: $WORKER_URL"
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
echo "--------------------"
curl -s "$WORKER_URL/health" | jq '.' || curl -s "$WORKER_URL/health"
echo ""
echo ""

# Test 2: Scan Example.com
echo "Test 2: Scan https://example.com"
echo "---------------------------------"
curl -s "$WORKER_URL/scan?url=https://example.com" | jq '.' || curl -s "$WORKER_URL/scan?url=https://example.com"
echo ""
echo ""

# Test 3: Test SSRF Protection (should fail)
echo "Test 3: SSRF Protection Test (should return error)"
echo "---------------------------------------------------"
curl -s "$WORKER_URL/scan?url=http://localhost" | jq '.' || curl -s "$WORKER_URL/scan?url=http://localhost"
echo ""
echo ""

# Test 4: Test Invalid URL (should fail)
echo "Test 4: Invalid URL Test (should return error)"
echo "-----------------------------------------------"
curl -s "$WORKER_URL/scan?url=not-a-url" | jq '.' || curl -s "$WORKER_URL/scan?url=not-a-url"
echo ""
echo ""

# Test 5: CORS Preflight
echo "Test 5: CORS Preflight (OPTIONS)"
echo "---------------------------------"
curl -s -X OPTIONS "$WORKER_URL/scan" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: GET" \
  -v 2>&1 | grep -i "access-control"
echo ""
echo ""

echo "✅ Tests complete!"
echo ""
echo "Note: If jq is not installed, install it with:"
echo "  macOS: brew install jq"
echo "  Linux: sudo apt-get install jq"

