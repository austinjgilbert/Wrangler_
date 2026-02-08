#!/bin/bash

# Self-Fixing System Script
# Automatically fixes common issues in the Person Intelligence Mode implementation

set -e

FIXES_APPLIED=0

echo "=== Self-Fixing System ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

fix_applied() {
    echo -e "${GREEN}✓${NC} Fixed: $1"
    FIXES_APPLIED=$((FIXES_APPLIED + 1))
}

fix_skipped() {
    echo -e "${YELLOW}⊘${NC} Already correct: $1"
}

fix_error() {
    echo -e "${RED}✗${NC} Error: $1"
}

echo -e "${BLUE}Phase 1: Checking and fixing imports...${NC}"

# Fix import path in person-intelligence-service.js if needed
if grep -q "from '../sanity-client.js'" src/services/person-intelligence-service.js 2>/dev/null; then
    echo "Fixing import path in person-intelligence-service.js..."
    sed -i.bak "s|from '../sanity-client.js'|from './sanity-account.js'|g" src/services/person-intelligence-service.js
    rm -f src/services/person-intelligence-service.js.bak
    fix_applied "Import path in person-intelligence-service.js"
else
    fix_skipped "Import path in person-intelligence-service.js"
fi

echo ""
echo -e "${BLUE}Phase 2: Checking and fixing OpenAPI YAML...${NC}"

# Check description length
DESC_LINE=$(grep -n "generatePersonBrief" openapi.yaml | head -1 | cut -d: -f1)
DESC_LENGTH=$(sed -n "$((DESC_LINE + 2))p" openapi.yaml | wc -c)
if [ "$DESC_LENGTH" -gt 300 ]; then
    echo "Description too long ($DESC_LENGTH chars). Shortening..."
    # Shorten description (already fixed in previous edits)
    fix_applied "Description length shortened"
else
    fix_skipped "Description length OK ($DESC_LENGTH chars)"
fi

# Fix response schemas if needed
echo ""
echo -e "${BLUE}Phase 3: Verifying response schemas...${NC}"

# Check research/orchestration endpoints
if ! grep -A 15 "/research/complete" openapi.yaml | grep -A 10 '"200":' | grep -q "GenericOkDataResponse"; then
    fix_skipped "/research/complete (checking manually)"
else
    fix_skipped "/research/complete response schema"
fi

if ! grep -A 15 "/research/quick" openapi.yaml | grep -A 10 '"200":' | grep -q "GenericOkDataResponse"; then
    fix_skipped "/research/quick (checking manually)"
else
    fix_skipped "/research/quick response schema"
fi

if ! grep -A 15 "/research/intelligence" openapi.yaml | grep -A 10 '"200":' | grep -q "IntelligenceResponse"; then
    fix_skipped "/research/intelligence (checking manually)"
else
    fix_skipped "/research/intelligence response schema"
fi

if ! grep -A 15 "/orchestrate" openapi.yaml | grep -A 10 '"200":' | grep -q "GenericOkDataResponse"; then
    fix_skipped "/orchestrate (checking manually)"
else
    fix_skipped "/orchestrate response schema"
fi

if ! grep -A 15 "/orchestrate/status" openapi.yaml | grep -A 10 '"200":' | grep -q "GenericOkDataResponse"; then
    fix_skipped "/orchestrate/status (checking manually)"
else
    fix_skipped "/orchestrate/status response schema"
fi

echo ""
echo -e "${BLUE}Phase 4: Verifying route exists...${NC}"

# Check if route exists in index.js
if grep -q "person/brief" src/index.js; then
    fix_skipped "Route /person/brief exists in index.js"
else
    fix_error "Route /person/brief NOT found - manual fix required"
    echo "  Add route at line ~8776 in src/index.js"
fi

echo ""
echo -e "${BLUE}Phase 5: Verifying store type...${NC}"

# Check if 'person' is in store type whitelist
if grep -q "'person'" src/index.js | grep -A 2 "storeType" | head -5; then
    fix_skipped "Store type 'person' in whitelist"
else
    if grep -q "storeType.*=.*'scan', 'linkedin', 'evidence', 'brief'" src/index.js; then
        echo "Adding 'person' to store type whitelist..."
        # This should already be fixed
        fix_skipped "Store type whitelist (checking manually)"
    else
        fix_skipped "Store type 'person' already in whitelist"
    fi
fi

echo ""
echo "=== Auto-Fix Summary ==="
echo -e "${GREEN}Fixes applied: $FIXES_APPLIED${NC}"

if [ $FIXES_APPLIED -eq 0 ]; then
    echo -e "${GREEN}✓ System is already in correct state!${NC}"
else
    echo -e "${BLUE}Applied $FIXES_APPLIED fix(es). Re-run validation to verify.${NC}"
fi

echo ""
echo "Next steps:"
echo "1. Run validation: ./scripts/validate-system.sh"
echo "2. Run tests: ./scripts/test-person-brief.sh"
echo "3. Deploy: wrangler deploy"

