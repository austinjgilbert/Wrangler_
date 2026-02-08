#!/bin/bash

# Quick restart script for Website Scanner Worker

echo "🔄 Restarting Website Scanner Worker..."
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI not found"
    exit 1
fi

# Ask what to restart
echo "What would you like to restart?"
echo "1) Production Worker (deploy)"
echo "2) Local Dev Server"
echo "3) Full Reset (clear cache + redeploy)"
echo "4) Just clear cache"
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Deploying to production..."
        wrangler deploy
        echo ""
        echo "✅ Deployment complete!"
        echo ""
        echo "Test with: curl https://YOUR_WORKER_URL.workers.dev/health"
        ;;
    2)
        echo ""
        echo "🛑 Stopping any running dev servers..."
        pkill -f "wrangler dev" 2>/dev/null || true
        sleep 1
        echo ""
        echo "🚀 Starting local dev server..."
        wrangler dev
        ;;
    3)
        echo ""
        echo "🛑 Stopping processes..."
        pkill -f wrangler 2>/dev/null || true
        sleep 1
        echo ""
        echo "🧹 Clearing cache..."
        rm -rf .wrangler/ 2>/dev/null || true
        rm -rf node_modules/.cache/ 2>/dev/null || true
        echo ""
        echo "🚀 Deploying..."
        wrangler deploy
        echo ""
        echo "✅ Full reset complete!"
        ;;
    4)
        echo ""
        echo "🧹 Clearing cache..."
        rm -rf .wrangler/ 2>/dev/null || true
        rm -rf node_modules/.cache/ 2>/dev/null || true
        echo "✅ Cache cleared!"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac
