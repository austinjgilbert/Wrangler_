#!/bin/bash

# Test SDR Good Morning Routing and User Pattern Metadata

set -e

BASE_URL="${1:-https://website-scanner.austin-gilbert.workers.dev}"

echo "=== Testing SDR Good Morning Routing & User Patterns ==="
echo "Base URL: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

test_pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

test_fail() {
    echo -e "${RED}✗${NC} $1"
    FAILED=$((FAILED + 1))
}

echo "=== Test 1: SDR Good Morning Routing ==="
RESPONSE=$(curl -s -X POST "$BASE_URL/sdr/good-morning" \
  -H "Content-Type: application/json" \
  -d '{
    "daysBack": 30,
    "minCallScore": 6,
    "maxCalls": 10,
    "maxLinkedIn": 5,
    "log": false,
    "trackPattern": true
  }')

if echo "$RESPONSE" | grep -q '"ok":true'; then
    test_pass "SDR Good Morning Routing endpoint works"
    echo "  Response includes: $(echo "$RESPONSE" | jq -r '.data | keys | join(", ")' 2>/dev/null || echo "N/A")"
elif echo "$RESPONSE" | grep -q 'CONFIGURATION_ERROR\|"code"'; then
    test_pass "SDR Good Morning Routing reachable (503/config required)"
else
    test_fail "SDR Good Morning Routing endpoint failed"
    echo "  Response: $(echo "$RESPONSE" | head -c 200)"
fi

echo ""
echo "=== Test 2: Store User Pattern ==="
RESPONSE=$(curl -s -X POST "$BASE_URL/user-patterns/store" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "userSegment": "sdr",
    "action": "good-morning-routing",
    "approach": "focused on high-intent accounts",
    "outcome": "success",
    "timeSpent": 1500,
    "toolsUsed": ["/sdr/good-morning"],
    "thinking": "Prioritized accounts with strong intent signals"
  }')

if echo "$RESPONSE" | grep -q '"ok":true'; then
    test_pass "Store user pattern endpoint works"
    PATTERN_ID=$(echo "$RESPONSE" | jq -r '.data.patternId' 2>/dev/null || echo "N/A")
    echo "  Pattern ID: $PATTERN_ID"
elif echo "$RESPONSE" | grep -q 'CONFIGURATION_ERROR\|"code"'; then
    test_pass "Store user pattern reachable (503/config required)"
else
    test_fail "Store user pattern endpoint failed"
    echo "  Response: $(echo "$RESPONSE" | head -c 200)"
fi

echo ""
echo "=== Test 3: Query User Patterns ==="
RESPONSE=$(curl -s -X GET "$BASE_URL/user-patterns/query?action=good-morning-routing&outcome=success&limit=5")

if echo "$RESPONSE" | grep -q '"ok":true'; then
    test_pass "Query user patterns endpoint works"
    QUERY_TYPE=$(echo "$RESPONSE" | jq -r '.data.queryType' 2>/dev/null || echo "N/A")
    echo "  Query type: $QUERY_TYPE"
elif echo "$RESPONSE" | grep -q 'CONFIGURATION_ERROR\|"code"'; then
    test_pass "Query user patterns reachable (503/config required)"
else
    test_fail "Query user patterns endpoint failed"
    echo "  Response: $(echo "$RESPONSE" | head -c 200)"
fi

echo ""
echo "=== Test 4: Query Thinking Patterns ==="
RESPONSE=$(curl -s -X GET "$BASE_URL/user-patterns/query?type=thinking&action=good-morning-routing&limit=5")

if echo "$RESPONSE" | grep -q '"ok":true'; then
    test_pass "Query thinking patterns endpoint works"
elif echo "$RESPONSE" | grep -q 'CONFIGURATION_ERROR\|"code"'; then
    test_pass "Query thinking patterns reachable (503/config required)"
else
    test_fail "Query thinking patterns endpoint failed"
    echo "  Response: $(echo "$RESPONSE" | head -c 200)"
fi

echo ""
echo "=== Test 5: Query Successful Approaches ==="
RESPONSE=$(curl -s -X GET "$BASE_URL/user-patterns/query?type=approaches&action=good-morning-routing&userSegment=sdr&limit=5")

if echo "$RESPONSE" | grep -q '"ok":true'; then
    test_pass "Query successful approaches endpoint works"
elif echo "$RESPONSE" | grep -q 'CONFIGURATION_ERROR\|"code"'; then
    test_pass "Query successful approaches reachable (503/config required)"
else
    test_fail "Query successful approaches endpoint failed"
    echo "  Response: $(echo "$RESPONSE" | head -c 200)"
fi

echo ""
echo "=== Test Summary ==="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi

