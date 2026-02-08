#!/bin/bash

# Interactive Sanity Secrets Setup Script

set -e

echo "🔧 Sanity Secrets Setup"
echo "======================"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI not found"
    echo "   Install with: npm install -g wrangler"
    exit 1
fi

echo "✅ wrangler CLI found"
echo ""

# Step 1: SANITY_PROJECT_ID
echo "📝 Step 1: Set SANITY_PROJECT_ID"
echo "   Go to https://www.sanity.io/manage → Your Project → Settings"
echo "   Copy your Project ID (e.g., 'abc123xyz')"
echo ""
read -p "Enter your Sanity Project ID: " PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Project ID cannot be empty"
    exit 1
fi

echo ""
echo "Setting SANITY_PROJECT_ID..."
echo "$PROJECT_ID" | wrangler secret put SANITY_PROJECT_ID
echo "✅ SANITY_PROJECT_ID set"
echo ""

# Step 2: SANITY_API_TOKEN
echo "📝 Step 2: Set SANITY_API_TOKEN"
echo "   Go to https://www.sanity.io/manage → Your Project → API → Tokens"
echo "   Create a new token with 'Editor' or 'Admin' permissions"
echo "   Copy the token"
echo ""
read -p "Enter your Sanity API Token: " API_TOKEN

if [ -z "$API_TOKEN" ]; then
    echo "❌ API Token cannot be empty"
    exit 1
fi

echo ""
echo "Setting SANITY_API_TOKEN..."
echo "$API_TOKEN" | wrangler secret put SANITY_API_TOKEN
echo "✅ SANITY_API_TOKEN set"
echo ""

# Step 3: SANITY_DATASET (optional)
echo "📝 Step 3: Set SANITY_DATASET (optional)"
echo "   Default is 'production' if not set"
read -p "Enter dataset name (press Enter for 'production'): " DATASET
DATASET=${DATASET:-production}

echo ""
echo "Setting SANITY_DATASET to '$DATASET'..."
echo "$DATASET" | wrangler secret put SANITY_DATASET
echo "✅ SANITY_DATASET set to '$DATASET'"
echo ""

# Step 4: Verify
echo "📋 Verifying secrets..."
echo ""
wrangler secret list | grep -i sanity || echo "⚠️  No Sanity secrets found (this shouldn't happen)"

echo ""
echo "=============================="
echo "✅ Setup Complete!"
echo ""
echo "🚀 Next steps:"
echo "   1. Deploy: wrangler deploy"
echo "   2. Test: curl \"https://YOUR_WORKER_URL/scan?url=https://sanity.io\" | jq '.data.stored'"
echo "   3. Verify in Sanity Studio: https://www.sanity.io/manage"
echo ""
