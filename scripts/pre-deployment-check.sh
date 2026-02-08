#!/bin/bash

# Pre-Deployment Check
# Validates everything before deployment

set -e

echo "==================================================================="
echo "         PRE-DEPLOYMENT VALIDATION"
echo "==================================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

check() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
        return 0
    else
        echo -e "${RED}✗${NC} $2"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

echo -e "${BLUE}Phase 1: Code Validation${NC}"
node -c src/index.js && check 0 "Main worker syntax" || check 1 "Main worker syntax"

for file in src/handlers/*.js src/services/*.js; do
    if [ -f "$file" ]; then
        node -c "$file" 2>/dev/null && check 0 "Syntax: $(basename $file)" || check 1 "Syntax: $(basename $file)"
    fi
done

echo ""
echo -e "${BLUE}Phase 2: Required Files${NC}"
REQUIRED_FILES=(
    "src/index.js"
    "wrangler.toml"
    "package.json"
    "openapi.yaml"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        check 0 "File exists: $file"
    else
        check 1 "File missing: $file"
    fi
done

echo ""
echo -e "${BLUE}Phase 3: Routes Check${NC}"
if grep -q "sdr/good-morning\|user-patterns\|person/brief" src/index.js; then
    check 0 "New routes present in index.js"
else
    check 1 "New routes missing in index.js"
fi

echo ""
echo -e "${BLUE}Phase 4: OpenAPI Schema${NC}"
if grep -q "GoodMorningRequest\|UserPatternsResponse\|PersonBriefRequest" openapi.yaml; then
    check 0 "New schemas in OpenAPI"
else
    check 1 "New schemas missing in OpenAPI"
fi

echo ""
echo -e "${BLUE}Phase 5: Dependencies${NC}"
if [ -f "package.json" ]; then
    if grep -q "@playwright/test" package.json; then
        check 0 "Playwright in package.json"
    else
        warn "Playwright not in package.json (optional)"
    fi
fi

echo ""
echo "==================================================================="
echo "                    SUMMARY"
echo "==================================================================="
echo ""
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ READY FOR DEPLOYMENT${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. wrangler deploy"
    echo "  2. Test deployed endpoints"
    echo "  3. Monitor logs"
    exit 0
else
    echo -e "${RED}❌ FIX ERRORS BEFORE DEPLOYMENT${NC}"
    exit 1
fi

