#!/bin/bash
# Test script for OSINT pipeline endpoints

BASE_URL="${1:-https://website-scanner.austin-gilbert.workers.dev}"
TEST_URL="${2:-https://example.com}"

echo "Testing OSINT Pipeline"
echo "======================"
echo "Base URL: $BASE_URL"
echo "Test URL: $TEST_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Queue OSINT job
echo -e "${YELLOW}1. Queueing OSINT job...${NC}"
QUEUE_RESPONSE=$(curl -s -X POST "$BASE_URL/osint/queue" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$TEST_URL\",
    \"companyName\": \"Example Inc\",
    \"year\": 2026
  }")

echo "$QUEUE_RESPONSE" | jq '.'

ACCOUNT_KEY=$(echo "$QUEUE_RESPONSE" | jq -r '.data.accountKey // empty')
JOB_ID=$(echo "$QUEUE_RESPONSE" | jq -r '.data.jobId // empty')

if [ -z "$ACCOUNT_KEY" ] || [ "$ACCOUNT_KEY" == "null" ]; then
  echo -e "${RED}Failed to get accountKey from queue response${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Job queued${NC}"
echo "Account Key: $ACCOUNT_KEY"
echo "Job ID: $JOB_ID"
echo ""

# Test 2: Check status (poll until complete)
echo -e "${YELLOW}2. Checking job status (will poll until complete)...${NC}"
MAX_ATTEMPTS=60
ATTEMPT=0
STATUS="queued"

while [ "$STATUS" != "complete" ] && [ "$STATUS" != "failed" ] && [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  STATUS_RESPONSE=$(curl -s "$BASE_URL/osint/status?accountKey=$ACCOUNT_KEY&year=2026")
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status // "unknown"')
  STAGE=$(echo "$STATUS_RESPONSE" | jq -r '.data.stage // 0')
  PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.data.progress // 0')
  
  echo "Attempt $ATTEMPT: Status=$STATUS, Stage=$STAGE, Progress=$PROGRESS%"
  
  if [ "$STATUS" == "failed" ]; then
    ERROR=$(echo "$STATUS_RESPONSE" | jq -r '.data.error // "Unknown error"')
    echo -e "${RED}✗ Job failed: $ERROR${NC}"
    exit 1
  fi
  
  if [ "$STATUS" == "complete" ]; then
    echo -e "${GREEN}✓ Job completed${NC}"
    break
  fi
  
  sleep 5
done

if [ "$STATUS" != "complete" ]; then
  echo -e "${RED}✗ Job did not complete within timeout${NC}"
  exit 1
fi

echo ""

# Test 3: Get report
echo -e "${YELLOW}3. Fetching OSINT report...${NC}"
REPORT_RESPONSE=$(curl -s "$BASE_URL/osint/report?accountKey=$ACCOUNT_KEY&year=2026")

if echo "$REPORT_RESPONSE" | jq -e '.ok == true' > /dev/null; then
  echo -e "${GREEN}✓ Report retrieved${NC}"
  echo ""
  echo "Report Summary:"
  echo "$REPORT_RESPONSE" | jq '{
    companyName: .data.report.companyName,
    year: .data.report.year,
    initiativesCount: (.data.report.initiatives | length),
    risksCount: (.data.report.risks | length),
    sourcesCount: (.data.report.sources | length),
    topInitiatives: [.data.report.initiatives[0:3][] | {title, importanceScore, confidence, timeHorizon}]
  }'
else
  echo -e "${RED}✗ Failed to get report${NC}"
  echo "$REPORT_RESPONSE" | jq '.'
  exit 1
fi

echo ""
echo -e "${GREEN}All tests passed!${NC}"

