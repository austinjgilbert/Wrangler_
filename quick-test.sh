#!/bin/bash
# Quick manual test script
WORKER="${1:-http://localhost:8787}"

echo "Quick Test Suite"
echo "================"
echo ""

echo "1. Health Check:"
curl -s "$WORKER/health" | jq '{ok, version, requestId}' || echo "❌ Failed"
echo ""

echo "2. Extract Test (Cloudflare.com - check for blocking):"
response=$(curl -s -X POST "$WORKER/extract" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.cloudflare.com","mode":"fast"}')
echo "$response" | jq '{ok, cache: .cache.hit, title: .data.title}' || echo "❌ Failed or blocked"
if echo "$response" | grep -qi "challenge\|blocked\|access denied"; then
  echo "⚠️  WARNING: Possible Cloudflare blocking detected"
fi
echo ""

echo "3. SSRF Protection Test:"
curl -s -X POST "$WORKER/extract" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localhost","mode":"fast"}' | jq '{ok, error: .error.code}' || echo "❌ Failed"
echo ""

echo "4. Cache Test:"
echo "  First request (miss):"
curl -s -X POST "$WORKER/extract" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"fast"}' | jq '.cache.hit' || echo "❌ Failed"
echo "  Second request (should hit):"
curl -s -X POST "$WORKER/extract" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"fast"}' | jq '.cache.hit' || echo "❌ Failed"
echo ""

echo "✅ Quick test complete"
