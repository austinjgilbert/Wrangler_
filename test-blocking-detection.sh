#!/bin/bash

# Cloudflare Blocking Detection Test
# Tests various scenarios that might trigger blocking

WORKER_URL="${1:-http://localhost:8787}"
echo "Testing for Cloudflare and service blocking..."
echo "=============================================="
echo ""

# Test URLs that might trigger blocking
TEST_URLS=(
    "https://www.cloudflare.com"
    "https://www.google.com"
    "https://github.com"
    "https://stackoverflow.com"
    "https://example.com"
    "https://httpbin.org/html"
)

BLOCKED=0
PASSED=0

for url in "${TEST_URLS[@]}"; do
    echo -n "Testing $url... "
    
    response=$(curl -s -X POST "$WORKER_URL/extract" \
        -H "Content-Type: application/json" \
        -d "{\"url\":\"$url\",\"mode\":\"fast\"}" 2>&1)
    
    # Check for blocking indicators
    if echo "$response" | grep -qiE "cloudflare.*challenge|blocked|access denied|403|1020|cf-ray.*block|checking your browser"; then
        echo "❌ BLOCKED"
        echo "  Response: $(echo "$response" | head -c 300)"
        ((BLOCKED++))
    elif echo "$response" | jq -e '.ok' > /dev/null 2>&1; then
        echo "✅ PASSED"
        ((PASSED++))
    else
        echo "⚠️  UNKNOWN"
        echo "  Response: $(echo "$response" | head -c 200)"
    fi
    
    sleep 1 # Rate limit protection
done

echo ""
echo "Results: $PASSED passed, $BLOCKED blocked"
if [ $BLOCKED -gt 0 ]; then
    echo "⚠️  Some requests were blocked - may need to adjust headers"
    exit 1
else
    echo "✅ No blocking detected"
    exit 0
fi

