#!/bin/bash

# Test script for Person Intelligence Mode
# Tests POST /person/brief endpoint and verifies existing endpoints still work

set -e

BASE_URL="${BASE_URL:-https://website-scanner.austin-gilbert.workers.dev}"
echo "Testing against: $BASE_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
test_endpoint() {
    local name="$1"
    local method="$2"
    local path="$3"
    local data="$4"
    local expected_status="$5"
    
    echo -n "Testing $name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$path" || echo "000")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$path" || echo "000")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        
        # Validate JSON structure
        if echo "$body" | jq empty 2>/dev/null; then
            echo "  JSON is valid"
            
            # Check Content-Type header (approximate check)
            content_type=$(curl -s -I "$BASE_URL$path" | grep -i "content-type" | grep -i "application/json" || echo "")
            if [ -n "$content_type" ] || [ "$http_code" != "200" ]; then
                echo "  Content-Type check: OK"
            fi
        else
            echo -e "  ${YELLOW}Warning: Response is not valid JSON${NC}"
        fi
    else
        echo -e "${RED}✗ FAILED${NC} (Expected HTTP $expected_status, got $http_code)"
        echo "  Response: $body"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    echo ""
}

# Test 1: Health check (existing endpoint)
echo "=== Test 1: Health Check (Existing Endpoint) ==="
test_endpoint "GET /health" "GET" "/health" "" "200"

# Test 2: Scan endpoint (existing endpoint)
echo "=== Test 2: Scan Endpoint (Existing Endpoint) ==="
test_endpoint "GET /scan" "GET" "/scan?url=https://example.com" "" "200"

# Test 3: Search endpoint (existing endpoint)
echo "=== Test 3: Search Endpoint (Existing Endpoint) ==="
test_endpoint "POST /search" "POST" "/search" '{"query":"sanity.io","limit":5}' "200"

# Test 4: Person Brief - Basic request
echo "=== Test 4: Person Brief - Basic Request ==="
test_endpoint "POST /person/brief" "POST" "/person/brief" '{
  "name": "Example Person",
  "companyName": "Sanity",
  "companyDomain": "sanity.io",
  "mode": "fast",
  "verify": false,
  "store": false,
  "crawlBudget": 5,
  "evidenceBudget": 3
}' "200"

# Test 5: Person Brief - Validation (missing name)
echo "=== Test 5: Person Brief - Validation Error (Missing Name) ==="
test_endpoint "POST /person/brief (missing name)" "POST" "/person/brief" '{
  "companyName": "Sanity",
  "companyDomain": "sanity.io"
}' "400"

# Test 6: Person Brief - Validation (no company info)
echo "=== Test 6: Person Brief - Validation Error (No Company Info) ==="
test_endpoint "POST /person/brief (no company)" "POST" "/person/brief" '{
  "name": "Example Person"
}' "400"

# Validate Person Brief Response Structure
echo "=== Validating Person Brief Response Structure ==="
response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Person",
      "companyName": "Example Corp",
      "companyDomain": "example.com",
      "mode": "fast",
      "verify": false,
      "store": false
    }' \
    "$BASE_URL/person/brief" || echo "{}")

if echo "$response" | jq empty 2>/dev/null; then
    echo -n "Checking response structure... "
    
    # Check required fields
    if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1 && \
       echo "$response" | jq -e '.data' > /dev/null 2>&1 && \
       echo "$response" | jq -e '.data.personBrief' > /dev/null 2>&1; then
        
        # Check bounded fields
        exec_summary_len=$(echo "$response" | jq '.data.personBrief.executiveSummary | length' 2>/dev/null || echo "0")
        exec_drops_len=$(echo "$response" | jq '.data.personBrief.execNameDrops | length' 2>/dev/null || echo "0")
        roi_plays_len=$(echo "$response" | jq '.data.personBrief.topRoiPlays | length' 2>/dev/null || echo "0")
        
        if [ "$exec_summary_len" -le 4 ] && [ "$exec_drops_len" -le 5 ] && [ "$roi_plays_len" -le 3 ]; then
            echo -e "${GREEN}✓ PASSED${NC}"
            echo "  executiveSummary length: $exec_summary_len (max 4) ✓"
            echo "  execNameDrops length: $exec_drops_len (max 5) ✓"
            echo "  topRoiPlays length: $roi_plays_len (max 3) ✓"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}✗ FAILED${NC}"
            echo "  executiveSummary length: $exec_summary_len (expected <= 4)"
            echo "  execNameDrops length: $exec_drops_len (expected <= 5)"
            echo "  topRoiPlays length: $roi_plays_len (expected <= 3)"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        echo -e "${YELLOW}⚠ SKIPPED${NC} (Response structure validation - endpoint may have returned error)"
    fi
else
    echo -e "${RED}✗ FAILED${NC} (Invalid JSON response)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Summary
echo "=== Test Summary ==="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi

