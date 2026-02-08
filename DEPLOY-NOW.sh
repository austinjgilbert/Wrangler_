#!/bin/bash

# Deploy Now Script
# Complete deployment process with validation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}"

cd "${REPO_ROOT}"

echo "==================================================================="
echo "         DEPLOYMENT PROCESS"
echo "==================================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Step 1: Pre-deployment check
echo -e "${BLUE}Step 1: Pre-Deployment Validation${NC}"
if ./scripts/pre-deployment-check.sh; then
    echo -e "${GREEN}✓ Pre-deployment checks passed${NC}"
else
    echo -e "${RED}✗ Pre-deployment checks failed${NC}"
    echo "Fix errors before deploying"
    exit 1
fi

echo ""
echo -e "${BLUE}Step 2: Deploying to Cloudflare Workers${NC}"
echo "Running: scripts/wrangler-deploy.sh"
echo ""

# Deploy
if ./scripts/wrangler-deploy.sh; then
    echo ""
    echo -e "${GREEN}✓ Deployment successful!${NC}"
    echo ""
    
    echo -e "${BLUE}Step 3: Verifying Deployment${NC}"
    
    # Wait a moment for deployment to propagate
    sleep 2
    
    # Test health endpoint
    echo "Testing health endpoint..."
    if curl -s -f "https://website-scanner.austin-gilbert.workers.dev/health" > /dev/null; then
        echo -e "${GREEN}✓ Health endpoint responding${NC}"
    else
        echo -e "${YELLOW}⚠ Health endpoint not responding yet (may take a few seconds)${NC}"
    fi
    
    echo ""
    echo "==================================================================="
    echo -e "${GREEN}         DEPLOYMENT COMPLETE!${NC}"
    echo "==================================================================="
    echo ""
    echo "Service URL: https://website-scanner.austin-gilbert.workers.dev"
    echo ""
    echo "Next steps:"
    echo "  1. Run tests: ./scripts/run-all-tests.sh"
    echo "  2. Test new endpoints (see DEPLOYMENT-READY.md)"
    echo "  3. Monitor Cloudflare dashboard"
    echo ""
    
else
    echo ""
    echo -e "${RED}✗ Deployment failed${NC}"
    echo "Check the error messages above"
    exit 1
fi

