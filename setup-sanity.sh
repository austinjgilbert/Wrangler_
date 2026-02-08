#!/bin/bash

# Sanity Setup Script for Website Scanner Worker
# This script helps you configure Sanity secrets step-by-step

set -e

echo "🚀 Sanity Two-Way Sync Setup"
echo "=============================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI not found"
    echo "   Install it with: npm install -g wrangler"
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

echo "Setting SANITY_API_TOKEN..."
echo "$API_TOKEN" | wrangler secret put SANITY_API_TOKEN
echo "✅ SANITY_API_TOKEN set"
echo ""

# Step 3: SANITY_DATASET (optional)
echo "📝 Step 3: Set SANITY_DATASET (optional)"
echo "   Default is 'production' if not set"
read -p "Enter dataset name (press Enter for 'production'): " DATASET
DATASET=${DATASET:-production}

echo "Setting SANITY_DATASET to '$DATASET'..."
echo "$DATASET" | wrangler secret put SANITY_DATASET
echo "✅ SANITY_DATASET set to '$DATASET'"
echo ""

# Step 4: ADMIN_TOKEN (optional)
echo "📝 Step 4: Set ADMIN_TOKEN (optional, for write protection)"
read -p "Do you want to set an admin token? (y/n): " SET_ADMIN

if [ "$SET_ADMIN" = "y" ] || [ "$SET_ADMIN" = "Y" ]; then
    if command -v openssl &> /dev/null; then
        echo "Generating secure admin token..."
        ADMIN_TOKEN=$(openssl rand -hex 32)
        echo "Generated token: $ADMIN_TOKEN"
        echo "$ADMIN_TOKEN" | wrangler secret put ADMIN_TOKEN
        echo "✅ ADMIN_TOKEN set (save this token securely!)"
    else
        read -p "Enter a secure admin token (or press Enter to skip): " ADMIN_TOKEN
        if [ -n "$ADMIN_TOKEN" ]; then
            echo "$ADMIN_TOKEN" | wrangler secret put ADMIN_TOKEN
            echo "✅ ADMIN_TOKEN set"
        fi
    fi
else
    echo "⏭️  Skipping ADMIN_TOKEN (write operations will be unprotected)"
fi

echo ""
echo "=============================="
echo "✅ Setup Complete!"
echo ""
echo "📋 Summary of configured secrets:"
wrangler secret list
echo ""
echo "🚀 Next steps:"
echo "   1. Deploy: npm run deploy"
echo "   2. Test: curl 'https://YOUR_WORKER_URL.workers.dev/scan?url=https://example.com&store=true'"
echo "   3. Verify in Sanity Studio: https://www.sanity.io/manage"
echo ""

