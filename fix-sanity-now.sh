#!/bin/bash

# Quick fix for Sanity secrets

echo "🔧 Sanity Secrets Quick Fix"
echo "========================="
echo ""

echo "This will help you update your Sanity secrets."
echo ""

# Step 1: Project ID
echo "📝 Step 1: Update SANITY_PROJECT_ID"
echo "   Get it from: https://www.sanity.io/manage → Your Project → Settings"
echo ""
read -p "Enter Sanity Project ID: " PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Project ID required"
    exit 1
fi

echo "$PROJECT_ID" | wrangler secret put SANITY_PROJECT_ID
echo "✅ Updated"

echo ""

# Step 2: API Token
echo "📝 Step 2: Update SANITY_API_TOKEN"
echo "   Get it from: https://www.sanity.io/manage → Your Project → API → Tokens"
echo "   Make sure it has 'Editor' or 'Admin' permissions"
echo ""
read -p "Enter Sanity API Token: " API_TOKEN

if [ -z "$API_TOKEN" ]; then
    echo "❌ API Token required"
    exit 1
fi

echo "$API_TOKEN" | wrangler secret put SANITY_API_TOKEN
echo "✅ Updated"

echo ""

# Step 3: Verify
echo "📋 Verifying secrets..."
wrangler secret list | grep -i sanity

echo ""
echo "✅ Secrets updated!"
echo ""
echo "🚀 Next: Redeploy the Worker"
echo "   wrangler deploy"
echo ""
