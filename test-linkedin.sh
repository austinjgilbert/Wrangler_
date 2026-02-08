#!/bin/bash

# LinkedIn Profile Scanning Test
WORKER_URL="${1:-http://localhost:8787}"

echo "LinkedIn Profile Scanning Test"
echo "=============================="
echo ""

# Test 1: Basic profile scan
echo "Test 1: Basic Profile Scan"
echo -n "  Testing public profile... "
response=$(curl -s -X POST "$WORKER_URL/linkedin/profile" \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "https://www.linkedin.com/in/reidhoffman"}')

if echo "$response" | jq -e '.ok' > /dev/null 2>&1; then
    name=$(echo "$response" | jq -r '.data.name // "N/A"')
    echo "✅ PASSED - Name: $name"
else
    error_code=$(echo "$response" | jq -r '.error.code // "UNKNOWN"')
    echo "❌ FAILED - Error: $error_code"
    if echo "$response" | jq -e '.error.code == "LINKEDIN_BLOCKED"' > /dev/null 2>&1; then
        echo "    ⚠️  LinkedIn blocked the request (expected for some profiles)"
    fi
fi
echo ""

# Test 2: Check for blocking
echo "Test 2: Bot Protection Detection"
echo -n "  Checking for blocking... "
if echo "$response" | grep -qi "challenge\|blocked\|authwall\|sign-in"; then
    echo "⚠️  WARNING - Blocking detected"
else
    echo "✅ PASSED - No blocking detected"
fi
echo ""

# Test 3: Profile data extraction
echo "Test 3: Profile Data Extraction"
if echo "$response" | jq -e '.ok' > /dev/null 2>&1; then
    echo "$response" | jq '{
        name: .data.name,
        headline: .data.headline,
        location: .data.location,
        experienceCount: (.data.experience | length),
        educationCount: (.data.education | length),
        skillsCount: (.data.skills | length),
        connections: .data.connections
    }'
else
    echo "  ⚠️  Cannot test - profile blocked or invalid"
fi
echo ""

# Test 4: Cache functionality
echo "Test 4: Cache Functionality"
echo -n "  First request (miss)... "
curl -s -X POST "$WORKER_URL/linkedin/profile" \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "https://www.linkedin.com/in/reidhoffman"}' > /dev/null 2>&1

response2=$(curl -s -X POST "$WORKER_URL/linkedin/profile" \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "https://www.linkedin.com/in/reidhoffman"}')

cache_hit=$(echo "$response2" | jq -r '.cache.hit // false' 2>/dev/null)
if [ "$cache_hit" = "true" ]; then
    echo "✅ PASSED - Cache hit"
else
    echo "⚠️  WARNING - Cache may not be working"
fi
echo ""

# Test 5: Error handling
echo "Test 5: Error Handling"
echo -n "  Invalid URL... "
error_response=$(curl -s -X POST "$WORKER_URL/linkedin/profile" \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "not-a-linkedin-url"}')

if echo "$error_response" | jq -e '.error.code == "VALIDATION_ERROR"' > /dev/null 2>&1; then
    echo "✅ PASSED"
else
    echo "❌ FAILED"
fi
echo ""

echo "✅ LinkedIn tests complete"
echo ""
echo "Note: LinkedIn has strong bot protection. Some profiles may be blocked."
echo "This is expected behavior for private profiles or high-volume requests."

