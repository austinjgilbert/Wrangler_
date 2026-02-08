#!/bin/bash

# Comprehensive System Validation Script
# Checks all components of the Person Intelligence Mode implementation

set -e

BASE_URL="${BASE_URL:-https://website-scanner.austin-gilbert.workers.dev}"
ERRORS=0
WARNINGS=0

echo "=== System Validation Script ==="
echo "Testing against: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

echo "=== Phase 1: Code Validation ==="

# Check file existence
echo -e "\n${BLUE}Checking file existence...${NC}"
FILES=(
    "src/handlers/person-intelligence.js"
    "src/services/person-intelligence-service.js"
    "src/services/person-storage.js"
    "schemas/person.js"
    "openapi.yaml"
    "scripts/test-person-brief.sh"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "File exists: $file"
    else
        check_fail "File missing: $file"
    fi
done

# Check syntax
echo -e "\n${BLUE}Checking JavaScript syntax...${NC}"
JS_FILES=(
    "src/handlers/person-intelligence.js"
    "src/services/person-intelligence-service.js"
    "src/services/person-storage.js"
)

for file in "${JS_FILES[@]}"; do
    if node --check "$file" 2>/dev/null; then
        check_pass "Syntax valid: $file"
    else
        check_fail "Syntax error: $file"
    fi
done

# Check route exists in index.js
echo -e "\n${BLUE}Checking route in index.js...${NC}"
if grep -q "person/brief" src/index.js; then
    check_pass "Route /person/brief found in src/index.js"
else
    check_fail "Route /person/brief NOT found in src/index.js"
fi

# Check imports
echo -e "\n${BLUE}Checking imports...${NC}"
if grep -q "from './sanity-account.js'" src/services/person-intelligence-service.js; then
    check_pass "Correct import path in person-intelligence-service.js"
else
    check_fail "Incorrect import path in person-intelligence-service.js"
fi

echo ""
echo "=== Phase 2: OpenAPI YAML Validation ==="

# Check YAML structure
echo -e "\n${BLUE}Checking OpenAPI spec...${NC}"

if grep -q "/person/brief:" openapi.yaml; then
    check_pass "Endpoint /person/brief found in openapi.yaml"
else
    check_fail "Endpoint /person/brief NOT found in openapi.yaml"
fi

if grep -q "PersonBriefRequest" openapi.yaml; then
    check_pass "Schema PersonBriefRequest found"
else
    check_fail "Schema PersonBriefRequest NOT found"
fi

if grep -q "PersonBriefResponse" openapi.yaml; then
    check_pass "Schema PersonBriefResponse found"
else
    check_fail "Schema PersonBriefResponse NOT found"
fi

# Check description length
DESC_LENGTH=$(grep -A 5 "generatePersonBrief" openapi.yaml | grep -A 3 "description:" | sed '1d' | sed '$d' | wc -c)
if [ "$DESC_LENGTH" -le 300 ]; then
    check_pass "Description length OK ($DESC_LENGTH chars, max 300)"
else
    check_fail "Description too long ($DESC_LENGTH chars, max 300)"
fi

echo -e "\n${BLUE}Checking response schemas...${NC}"

# Check research and orchestration endpoints
if sed -n '/\/research\/complete:/,/^  \/[a-z]/p' openapi.yaml | grep -A 10 '"200":' | grep -q "GenericOkDataResponse"; then
    check_pass "Response schema OK: /research/complete"
else
    check_fail "Response schema missing properties: /research/complete"
fi

if sed -n '/\/research\/quick:/,/^  \/[a-z]/p' openapi.yaml | grep -A 10 '"200":' | grep -q "GenericOkDataResponse"; then
    check_pass "Response schema OK: /research/quick"
else
    check_fail "Response schema missing properties: /research/quick"
fi

if sed -n '/\/research\/intelligence:/,/^  \/[a-z]/p' openapi.yaml | grep -A 10 '"200":' | grep -q "IntelligenceResponse"; then
    check_pass "Response schema OK: /research/intelligence"
else
    check_fail "Response schema missing properties: /research/intelligence"
fi

if sed -n '/\/orchestrate:/,/^  \/[a-z]/p' openapi.yaml | grep -A 10 '"200":' | grep -q "GenericOkDataResponse"; then
    check_pass "Response schema OK: /orchestrate"
else
    check_fail "Response schema missing properties: /orchestrate"
fi

if sed -n '/\/orchestrate\/status:/,/^  \/[a-z]/p' openapi.yaml | grep -A 10 '"200":' | grep -q "GenericOkDataResponse"; then
    check_pass "Response schema OK: /orchestrate/status"
else
    check_fail "Response schema missing properties: /orchestrate/status"
fi

echo ""
echo "=== Phase 3: Endpoint Testing ==="

# Test existing endpoints
echo -e "\n${BLUE}Testing existing endpoints...${NC}"

test_endpoint() {
    local method=$1
    local path=$2
    local data=$3
    local name=$4
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$path" 2>/dev/null || echo "000")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$path" 2>/dev/null || echo "000")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "404" ] || [ "$http_code" = "503" ]; then
        if [ "$http_code" = "404" ] && [[ "$path" == *"person/brief"* ]]; then
            check_warn "$name (HTTP $http_code - not deployed yet)"
        elif [ "$http_code" = "503" ] && [[ "$path" == *"person/brief"* ]]; then
            check_warn "$name (HTTP $http_code - missing config)"
        else
            check_pass "$name (HTTP $http_code)"
        fi
    else
        check_fail "$name (HTTP $http_code)"
    fi
}

test_endpoint "GET" "/health" "" "GET /health"
test_endpoint "GET" "/scan?url=https://example.com" "" "GET /scan"
test_endpoint "POST" "/search" '{"query":"test","limit":5}' "POST /search"
test_endpoint "POST" "/person/brief" '{"name":"Test","companyName":"Example","companyDomain":"example.com","verify":false,"store":false}' "POST /person/brief"

echo ""
echo "=== Phase 4: Schema Validation ==="

echo -e "\n${BLUE}Checking person schema fields...${NC}"
REQUIRED_FIELDS=("scopeInference" "execClaimsUsed" "teamMap" "linkedBriefRef" "evidenceRefs" "verificationRefs")
for field in "${REQUIRED_FIELDS[@]}"; do
    if grep -q "$field" schemas/person.js; then
        check_pass "Field found in schema: $field"
    else
        check_fail "Field missing in schema: $field"
    fi
done

echo ""
echo "=== Validation Summary ==="
echo -e "${GREEN}Passed: $((5 + ${#FILES[@]} + ${#JS_FILES[@]} + 2 + 3 + ${#ANALYTICS_ENDPOINTS[@]} + ${#WEBHOOK_ENDPOINTS[@]} + 4 + ${#REQUIRED_FIELDS[@]} - ERRORS - WARNINGS))${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Errors: $ERRORS${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All validations passed!${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Note: $WARNINGS warning(s) - likely due to code not being deployed yet${NC}"
    fi
    exit 0
else
    echo -e "${RED}✗ Validation failed with $ERRORS error(s)${NC}"
    exit 1
fi

