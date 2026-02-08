#!/bin/bash

# Verify Sanity Connection and Secrets

set -e

echo "🔍 Verifying Sanity Connection"
echo "=============================="
echo ""

# Check secrets
echo "1️⃣  Checking secrets..."
SECRETS=$(wrangler secret list 2>&1)

if echo "$SECRETS" | grep -q "SANITY_PROJECT_ID"; then
    echo "✅ SANITY_PROJECT_ID: Set"
else
    echo "❌ SANITY_PROJECT_ID: Not set"
fi

if echo "$SECRETS" | grep -q "SANITY_API_TOKEN"; then
    echo "✅ SANITY_API_TOKEN: Set"
else
    echo "❌ SANITY_API_TOKEN: Not set"
fi

if echo "$SECRETS" | grep -q "SANITY_DATASET"; then
    echo "✅ SANITY_DATASET: Set"
else
    echo "⚠️  SANITY_DATASET: Not set (will use default: production)"
fi

echo ""

# Test connection by scanning
echo "2️⃣  Testing Worker connection..."
WORKER_URL="https://website-scanner.austin-gilbert.workers.dev"

HEALTH=$(curl -s "$WORKER_URL/health")
if echo "$HEALTH" | grep -q '"ok":true'; then
    echo "✅ Worker is accessible"
else
    echo "❌ Worker health check failed"
    exit 1
fi

echo ""

# Test scan with storage
echo "3️⃣  Testing scan with auto-save..."
SCAN_RESPONSE=$(curl -s "$WORKER_URL/scan?url=https://sanity.io")

if echo "$SCAN_RESPONSE" | jq -e '.data.stored' > /dev/null 2>&1; then
    echo "✅ SUCCESS! Data is being stored to Sanity"
    echo ""
    echo "Stored data:"
    echo "$SCAN_RESPONSE" | jq '.data.stored'
else
    echo "⚠️  Data is NOT being stored"
    echo ""
    echo "Possible issues:"
    echo "  1. Secrets may have incorrect values"
    echo "  2. API token may not have write permissions"
    echo "  3. Worker may need redeploy after secret changes"
    echo ""
    echo "To fix:"
    echo "  1. Update secrets: wrangler secret put SANITY_PROJECT_ID"
    echo "  2. Redeploy: wrangler deploy"
fi

echo ""

