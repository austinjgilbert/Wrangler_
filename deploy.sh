#!/bin/bash

# Deployment script for Website Scanner Worker

set -e

echo "🚀 Website Scanner Worker Deployment"
echo "===================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI not found"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "wrangler.toml" ]; then
    echo "❌ Error: wrangler.toml not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Syntax check
echo "📝 Running syntax check..."
if ! node -c src/index.js; then
    echo "❌ Syntax check failed"
    exit 1
fi
echo "✅ Syntax check passed"
echo ""

# Deploy
echo "🚀 Deploying to Cloudflare Workers..."
wrangler deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Test health endpoint: curl https://YOUR-WORKER.workers.dev/health"
echo "2. Update openapi.yaml with production URL"
echo "3. Run test suite: ./test-comprehensive.sh https://YOUR-WORKER.workers.dev"
echo "4. Update ChatGPT Actions with new OpenAPI schema"
echo ""

