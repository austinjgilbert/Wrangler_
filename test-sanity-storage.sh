#!/bin/bash

# Test script to scan sanity.io and verify storage in Sanity CMS

set -e

echo "🧪 Testing Sanity Auto-Save Functionality"
echo "=========================================="
echo ""

# Get Worker URL from user or use default
if [ -z "$WORKER_URL" ]; then
    echo "Enter your Worker URL (or set WORKER_URL env var):"
    read WORKER_URL
fi

if [ -z "$WORKER_URL" ]; then
    echo "❌ Error: Worker URL required"
    exit 1
fi

echo "📍 Worker URL: $WORKER_URL"
echo ""

# Step 1: Test health endpoint
echo "1️⃣  Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "$WORKER_URL/health")
echo "Response: $HEALTH_RESPONSE"
echo ""

if ! echo "$HEALTH_RESPONSE" | grep -q '"ok":true'; then
    echo "❌ Health check failed"
    exit 1
fi

echo "✅ Health check passed"
echo ""

# Step 2: Scan sanity.io
echo "2️⃣  Scanning sanity.io..."
SCAN_RESPONSE=$(curl -s "$WORKER_URL/scan?url=https://sanity.io")
echo "Scan completed"
echo ""

# Check if stored field is present
if echo "$SCAN_RESPONSE" | grep -q '"stored"'; then
    echo "✅ Auto-save detected in response!"
    echo ""
    echo "Stored data:"
    echo "$SCAN_RESPONSE" | grep -o '"stored":{[^}]*}' || echo "$SCAN_RESPONSE" | jq '.data.stored' 2>/dev/null || echo "Check response manually"
else
    echo "⚠️  No 'stored' field in response"
    echo ""
    echo "Possible reasons:"
    echo "  - Sanity secrets not configured"
    echo "  - Sanity API token doesn't have write permissions"
    echo "  - Auto-save failed silently"
    echo ""
    echo "Response snippet:"
    echo "$SCAN_RESPONSE" | head -c 500
    echo "..."
fi

echo ""
echo ""

# Step 3: Query stored companies
echo "3️⃣  Querying stored companies..."
QUERY_RESPONSE=$(curl -s "$WORKER_URL/query?type=companies&limit=5")
echo "Query completed"
echo ""

if echo "$QUERY_RESPONSE" | grep -q '"documents"'; then
    DOC_COUNT=$(echo "$QUERY_RESPONSE" | jq '.data.count // .data.documents | length' 2>/dev/null || echo "unknown")
    echo "✅ Found $DOC_COUNT stored company document(s)"
    echo ""
    echo "Sample data:"
    echo "$QUERY_RESPONSE" | jq '.data.documents[0] | {accountKey, canonicalUrl, domain, opportunityScore}' 2>/dev/null || echo "Check response manually"
else
    echo "⚠️  No documents found or query failed"
    echo ""
    echo "Response:"
    echo "$QUERY_RESPONSE" | head -c 500
    echo "..."
fi

echo ""
echo ""

# Step 4: Search for sanity.io
echo "4️⃣  Searching for 'sanity' in stored data..."
SEARCH_RESPONSE=$(curl -s "$WORKER_URL/query?type=search&q=sanity&types=account")
echo "Search completed"
echo ""

if echo "$SEARCH_RESPONSE" | grep -q '"documents"'; then
    SEARCH_COUNT=$(echo "$SEARCH_RESPONSE" | jq '.data.count // .data.documents | length' 2>/dev/null || echo "unknown")
    echo "✅ Found $SEARCH_COUNT document(s) matching 'sanity'"
else
    echo "⚠️  No documents found matching 'sanity'"
fi

echo ""
echo "=========================================="
echo "✅ Test Complete!"
echo ""
echo "📋 Next Steps:"
echo "  1. Check Sanity Studio: https://www.sanity.io/manage"
echo "  2. Open your project → Open Studio"
echo "  3. Check Content → Look for 'account' and 'accountPack' documents"
echo ""

