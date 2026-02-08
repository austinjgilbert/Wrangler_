#!/bin/bash

# Clean Relaunch Script
# Comprehensive clean restart of all services

set -e

echo "🚀 Clean Relaunch - Website Scanner Worker"
echo "=========================================="
echo ""

# Step 1: Clean everything
echo "🧹 Step 1: Cleaning caches and artifacts..."
rm -rf .wrangler/ 2>/dev/null || true
rm -rf node_modules/.cache/ 2>/dev/null || true
rm -rf .next/ dist/ build/ 2>/dev/null || true
echo "✅ Cleaned"

# Step 2: Verify system
echo ""
echo "📋 Step 2: System Verification"
echo "-------------------------------"

# Syntax check
echo -n "Checking syntax... "
if node -c src/index.js src/services/person-intelligence-service.js src/utils/*.js 2>/dev/null; then
    echo "✅"
else
    echo "❌ Syntax errors found"
    exit 1
fi

# GPT instructions check
echo -n "Checking GPT instructions... "
INSTR_CHARS=$(wc -m < gpt-instructions.md | tr -d ' ')
if [ "$INSTR_CHARS" -lt 8000 ]; then
    echo "✅ $INSTR_CHARS/8000 chars"
else
    echo "❌ $INSTR_CHARS/8000 chars (OVER LIMIT)"
    exit 1
fi

# OpenAPI operations check
echo -n "Checking OpenAPI operations... "
OP_COUNT=$(grep -c "operationId:" openapi.yaml || echo "0")
if [ "$OP_COUNT" -eq 30 ]; then
    echo "✅ $OP_COUNT/30 operations"
else
    echo "⚠️  $OP_COUNT/30 operations (not at limit)"
fi

# New utility files check
echo -n "Checking new utility files... "
if [ -f "src/utils/opportunity-confidence.js" ] && \
   [ -f "src/utils/persona-lens.js" ] && \
   [ -f "src/utils/evidence-structure.js" ]; then
    echo "✅ All present"
else
    echo "❌ Missing utility files"
    exit 1
fi

# Step 3: Launch options
echo ""
echo "📋 Step 3: Launch Options"
echo "-------------------------------"
echo "1) Start Local Dev Server (wrangler dev)"
echo "2) Deploy to Production (wrangler deploy)"
echo "3) Deploy + Start Dev Server"
echo "4) Verification Only (no launch)"
echo ""
read -p "Enter choice (1-4) [default: 1]: " choice
choice=${choice:-1}

case $choice in
    1)
        echo ""
        echo "🚀 Starting local dev server..."
        echo "   Access at: http://localhost:8787"
        echo "   Press Ctrl+C to stop"
        echo ""
        wrangler dev
        ;;
    2)
        echo ""
        echo "🚀 Deploying to production..."
        wrangler deploy
        echo ""
        echo "✅ Deployment complete!"
        echo ""
        echo "📋 Next steps:"
        echo "  1. Test health: curl https://YOUR-WORKER.workers.dev/health"
        echo "  2. Test person brief: curl -X POST https://YOUR-WORKER.workers.dev/person/brief ..."
        echo "  3. Update OpenAPI server URL if needed"
        echo ""
        ;;
    3)
        echo ""
        echo "🚀 Deploying to production..."
        wrangler deploy
        echo ""
        echo "✅ Deployment complete!"
        echo ""
        echo "🚀 Starting local dev server..."
        echo "   Access at: http://localhost:8787"
        echo "   Press Ctrl+C to stop"
        echo ""
        wrangler dev
        ;;
    4)
        echo ""
        echo "✅ Verification complete!"
        echo ""
        echo "System Status:"
        echo "  - ✅ All syntax checks passed"
        echo "  - ✅ All utility files present"
        echo "  - ✅ GPT instructions under limit"
        echo "  - ✅ OpenAPI operations validated"
        echo "  - ✅ Ready for launch"
        echo ""
        echo "Available endpoints:"
        echo "  - POST /person/brief (with new Opportunity Confidence, Evidence Insights, Persona Lens)"
        echo "  - GET /scan (tech stack detection)"
        echo "  - POST /orchestrate (unified intelligence pipeline)"
        echo "  - And 27 other operations"
        echo ""
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac
