#!/bin/bash
# Test 1-Click Research Endpoints

set -e

BASE_URL="${1:-http://localhost:8787}"
echo "Testing 1-Click Research at: $BASE_URL"
echo ""

# Test 1: Complete Research (one-click)
echo "=== Test 1: POST /research/complete ==="
curl -X POST "$BASE_URL/research/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "https://sanity.io",
    "inputType": "url",
    "includeCompetitors": true,
    "includeComparison": true,
    "mode": "fast"
  }' | jq '.' || echo "Failed"
echo ""

# Test 2: Quick Research
echo "=== Test 2: GET /research/quick?domain=sanity.io ==="
curl -X GET "$BASE_URL/research/quick?domain=sanity.io" | jq '.' || echo "Failed"
echo ""

# Test 3: Quick Query - Complete Profile
echo "=== Test 3: GET /query/quick?type=profile&accountKey=... ==="
# First get accountKey from a scan
ACCOUNT_KEY=$(curl -s "$BASE_URL/scan?url=https://sanity.io" | jq -r '.data.accountKey // empty')
if [ -n "$ACCOUNT_KEY" ]; then
  curl -X GET "$BASE_URL/query/quick?type=profile&accountKey=$ACCOUNT_KEY" | jq '.' || echo "Failed"
else
  echo "Could not get accountKey from scan"
fi
echo ""

echo "✅ Tests complete"

