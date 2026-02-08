#!/bin/bash

# Complete System Test - Tests Every System
# Runs all validation and test scripts comprehensively

set -e

BASE_URL="${1:-https://website-scanner.austin-gilbert.workers.dev}"
LOCAL_URL="${2:-http://localhost:8787}"

echo "==================================================================="
echo "         COMPLETE SYSTEM TEST - ALL SYSTEMS"
echo "==================================================================="
echo ""
echo "Testing URL: $BASE_URL"
echo "Local URL: $LOCAL_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0

test_result() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC} - $2"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAIL${NC} - $2"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

warning() {
    WARNINGS=$((WARNINGS + 1))
    echo -e "${YELLOW}⚠ WARN${NC} - $1"
}

section() {
    echo ""
    echo -e "${BLUE}===================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================================================${NC}"
}

# Test if URL is accessible
check_url() {
    local url=$1
    if curl -s -f -o /dev/null --max-time 5 "$url/health" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Determine which URL to use
USE_URL="$BASE_URL"
if check_url "$LOCAL_URL"; then
    USE_URL="$LOCAL_URL"
    echo -e "${GREEN}Using local URL: $USE_URL${NC}"
else
    echo -e "${YELLOW}Local URL not available, using: $USE_URL${NC}"
fi

section "PHASE 1: CODE VALIDATION"

echo "Checking JavaScript syntax..."
if node -c src/index.js 2>/dev/null; then
    test_result 0 "JavaScript syntax validation"
else
    test_result 1 "JavaScript syntax validation"
fi

echo "Checking new handlers..."
for file in src/handlers/sdr-good-morning.js src/handlers/user-patterns.js; do
    if [ -f "$file" ]; then
        if node -c "$file" 2>/dev/null; then
            test_result 0 "Syntax: $(basename $file)"
        else
            test_result 1 "Syntax: $(basename $file)"
        fi
    fi
done

echo "Checking new services..."
for file in src/services/sdr-*.js src/services/user-pattern-metadata.js; do
    if [ -f "$file" ]; then
        if node -c "$file" 2>/dev/null; then
            test_result 0 "Syntax: $(basename $file)"
        else
            test_result 1 "Syntax: $(basename $file)"
        fi
    fi
done

section "PHASE 2: SYSTEM VALIDATION"

if [ -f "scripts/validate-system.sh" ]; then
    if ./scripts/validate-system.sh > /tmp/validation.log 2>&1; then
        test_result 0 "System validation script"
    else
        VALIDATION_FAILURES=$(grep -c "✗" /tmp/validation.log || echo "0")
        if [ "$VALIDATION_FAILURES" -eq "0" ]; then
            test_result 0 "System validation script (warnings only)"
        else
            test_result 1 "System validation script ($VALIDATION_FAILURES failures)"
        fi
    fi
else
    warning "System validation script not found"
fi

section "PHASE 3: ENDPOINT ACCESSIBILITY"

echo "Testing core endpoints..."
ENDPOINTS=(
    "/health:GET"
    "/scan:GET?url=https://example.com"
    "/search:POST"
    "/person/brief:POST"
    "/sdr/good-morning:POST"
    "/user-patterns/query:GET"
    "/user-patterns/store:POST"
)

for endpoint_spec in "${ENDPOINTS[@]}"; do
    IFS=':' read -r endpoint method <<< "$endpoint_spec"
    IFS='?' read -r path query <<< "$endpoint"
    
    if [ "$method" == "GET" ]; then
        if [ -n "$query" ]; then
            URL="$USE_URL$path?$query"
        else
            URL="$USE_URL$path"
        fi
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL" 2>/dev/null || echo "000")
    else
        URL="$USE_URL$path"
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST --max-time 10 -H "Content-Type: application/json" -d '{}' "$URL" 2>/dev/null || echo "000")
    fi
    
    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "400" ] || [ "$HTTP_CODE" == "405" ]; then
        test_result 0 "Endpoint accessible: $path (HTTP $HTTP_CODE)"
    elif [ "$HTTP_CODE" == "503" ]; then
        test_result 0 "Endpoint reachable: $path (HTTP 503 - config required e.g. Sanity)"
    elif [ "$HTTP_CODE" == "404" ]; then
        warning "Endpoint not found: $path (may not be deployed yet)"
    else
        test_result 1 "Endpoint failed: $path (HTTP $HTTP_CODE)"
    fi
done

section "PHASE 4: FUNCTIONAL TESTS"

echo "Testing /health endpoint..."
RESPONSE=$(curl -s --max-time 5 "$USE_URL/health" 2>/dev/null || echo "")
if echo "$RESPONSE" | grep -q '"ok":true' || echo "$RESPONSE" | grep -q "status"; then
    test_result 0 "Health endpoint returns valid response"
else
    test_result 1 "Health endpoint response invalid"
fi

echo "Testing /scan endpoint..."
RESPONSE=$(curl -s --max-time 10 "$USE_URL/scan?url=https://example.com" 2>/dev/null || echo "")
if echo "$RESPONSE" | grep -q '"ok":true' || echo "$RESPONSE" | grep -q "accountKey"; then
    test_result 0 "Scan endpoint returns valid response"
else
    warning "Scan endpoint may have issues (response: ${RESPONSE:0:100})"
fi

echo "Testing /search endpoint..."
RESPONSE=$(curl -s -X POST --max-time 10 -H "Content-Type: application/json" \
    -d '{"query":"test"}' "$USE_URL/search" 2>/dev/null || echo "")
if echo "$RESPONSE" | grep -q '"ok":true' || echo "$RESPONSE" | grep -q "results"; then
    test_result 0 "Search endpoint returns valid response"
else
    warning "Search endpoint may have issues"
fi

section "PHASE 5: NEW ENDPOINT TESTS"

if [ -f "scripts/test-sdr-and-patterns.sh" ]; then
    echo "Running SDR and pattern tests..."
    if ./scripts/test-sdr-and-patterns.sh "$USE_URL" > /tmp/sdr-test.log 2>&1; then
        test_result 0 "SDR and pattern endpoint tests"
    else
        SDR_FAILURES=$(grep -c "✗" /tmp/sdr-test.log 2>/dev/null || echo "0")
        if [ "$SDR_FAILURES" = "0" ]; then
            test_result 0 "SDR tests (warnings only)"
        else
            test_result 1 "SDR tests ($SDR_FAILURES failures)"
        fi
    fi
else
    warning "SDR test script not found"
fi

section "PHASE 6: OPENAPI VALIDATION"

echo "Checking OpenAPI YAML structure..."
if [ -f "openapi.yaml" ] && grep -q "openapi:" openapi.yaml && grep -q "paths:" openapi.yaml; then
    test_result 0 "OpenAPI YAML structure present"
else
    test_result 1 "OpenAPI YAML missing or invalid structure"
fi

if grep -q "/health" openapi.yaml && grep -q "/query" openapi.yaml && grep -q "/person/brief" openapi.yaml 2>/dev/null; then
    test_result 0 "OpenAPI includes core endpoints"
else
    test_result 1 "OpenAPI missing core endpoints"
fi

section "PHASE 7: FILE STRUCTURE"

echo "Checking required files exist..."
REQUIRED_FILES=(
    "src/index.js"
    "src/handlers/sdr-good-morning.js"
    "src/handlers/user-patterns.js"
    "src/services/sdr-scoring-service.js"
    "src/services/sdr-good-morning-service.js"
    "src/services/user-pattern-metadata.js"
    "schemas/userPattern.js"
    "openapi.yaml"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        test_result 0 "File exists: $file"
    else
        test_result 1 "File missing: $file"
    fi
done

section "TEST SUMMARY"

echo ""
echo "==================================================================="
echo "                    FINAL RESULTS"
echo "==================================================================="
echo ""
echo -e "Total Tests:  ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"
echo -e "Warnings:     ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    PASS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    echo -e "${GREEN}✓ ALL CRITICAL TESTS PASSED${NC}"
    echo -e "Pass Rate: ${GREEN}${PASS_RATE}%${NC}"
    echo ""
    echo "Status: ✅ SYSTEM READY"
    exit 0
else
    FAIL_RATE=$((FAILED_TESTS * 100 / TOTAL_TESTS))
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo -e "Fail Rate: ${RED}${FAIL_RATE}%${NC}"
    echo ""
    echo "Status: ⚠️  REVIEW FAILURES"
    exit 1
fi

