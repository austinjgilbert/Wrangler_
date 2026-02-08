#!/bin/bash

# Run All Tests - Complete System Test + Playwright
# Generates comprehensive test report

set -e

echo "==================================================================="
echo "         COMPLETE TEST SUITE - ALL SYSTEMS + PLAYWRIGHT"
echo "==================================================================="
echo ""

BASE_URL="${1:-https://website-scanner.austin-gilbert.workers.dev}"
LOCAL_URL="${2:-http://localhost:8787}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPORT_DIR="test-reports-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$REPORT_DIR"

echo -e "${BLUE}Report Directory: $REPORT_DIR${NC}"
echo ""

# Phase 1: System Tests
echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}PHASE 1: SYSTEM TESTS${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo ""

if ./scripts/run-complete-system-test.sh "$BASE_URL" "$LOCAL_URL" | tee "$REPORT_DIR/system-tests.log"; then
    echo -e "${GREEN}✓ System tests completed${NC}"
else
    echo -e "${YELLOW}⚠ System tests completed with warnings${NC}"
fi

echo ""
echo ""

# Phase 2: Playwright Tests
echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}PHASE 2: PLAYWRIGHT E2E TESTS${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo ""

export TEST_URL="$BASE_URL"

if TEST_URL="$BASE_URL" npx playwright test --reporter=html,list,json 2>&1 | tee "$REPORT_DIR/playwright-tests.log"; then
    echo -e "${GREEN}✓ Playwright tests completed${NC}"
    PLAYWRIGHT_PASSED=true
else
    echo -e "${YELLOW}⚠ Playwright tests completed with some failures${NC}"
    PLAYWRIGHT_PASSED=false
fi

# Copy Playwright report
if [ -d "playwright-report" ]; then
    cp -r playwright-report "$REPORT_DIR/"
    echo -e "${GREEN}✓ Playwright HTML report saved to $REPORT_DIR/playwright-report${NC}"
fi

echo ""
echo ""

# Phase 3: Generate Summary Report
echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}PHASE 3: GENERATING SUMMARY REPORT${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo ""

# Extract test results
SYSTEM_PASSED=$(grep -c "✓ PASS" "$REPORT_DIR/system-tests.log" 2>/dev/null || echo "0")
SYSTEM_FAILED=$(grep -c "✗ FAIL" "$REPORT_DIR/system-tests.log" 2>/dev/null || echo "0")

if [ -f "$REPORT_DIR/playwright-report/results.json" ]; then
    PLAYWRIGHT_TOTAL=$(jq '.stats.total' "$REPORT_DIR/playwright-report/results.json" 2>/dev/null || echo "0")
    PLAYWRIGHT_PASSED_COUNT=$(jq '.stats.expected' "$REPORT_DIR/playwright-report/results.json" 2>/dev/null || echo "0")
    PLAYWRIGHT_FAILED_COUNT=$(jq '.stats.unexpected' "$REPORT_DIR/playwright-report/results.json" 2>/dev/null || echo "0")
else
    PLAYWRIGHT_TOTAL="N/A"
    PLAYWRIGHT_PASSED_COUNT="N/A"
    PLAYWRIGHT_FAILED_COUNT="N/A"
fi

# Generate summary
cat > "$REPORT_DIR/SUMMARY.md" << EOF
# Complete Test Report

**Generated**: $(date)
**Test URL**: $BASE_URL
**Local URL**: $LOCAL_URL

## System Tests

- **Passed**: $SYSTEM_PASSED
- **Failed**: $SYSTEM_FAILED
- **Status**: $([ "$SYSTEM_FAILED" = "0" ] && echo "✅ PASS" || echo "⚠️  SOME FAILURES")

## Playwright E2E Tests

- **Total**: $PLAYWRIGHT_TOTAL
- **Passed**: $PLAYWRIGHT_PASSED_COUNT
- **Failed**: $PLAYWRIGHT_FAILED_COUNT
- **Status**: $([ "$PLAYWRIGHT_PASSED" = "true" ] && echo "✅ PASS" || echo "⚠️  SOME FAILURES")

## Test Artifacts

1. **System Test Log**: \`$REPORT_DIR/system-tests.log\`
2. **Playwright Test Log**: \`$REPORT_DIR/playwright-tests.log\`
3. **Playwright HTML Report**: \`$REPORT_DIR/playwright-report/index.html\`
4. **Playwright Artifacts**: \`$REPORT_DIR/playwright-artifacts/\`

## View Reports

### Playwright HTML Report
\`\`\`bash
npx playwright show-report $REPORT_DIR/playwright-report
\`\`\`

Or open: \`$REPORT_DIR/playwright-report/index.html\`

### System Test Log
\`\`\`bash
cat $REPORT_DIR/system-tests.log
\`\`\`
EOF

echo -e "${GREEN}✓ Summary report generated: $REPORT_DIR/SUMMARY.md${NC}"

echo ""
echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}                    FINAL SUMMARY${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo ""
cat "$REPORT_DIR/SUMMARY.md"
echo ""
echo -e "${GREEN}✓ Complete test report saved to: $REPORT_DIR/${NC}"
echo ""
echo "To view Playwright HTML report:"
echo "  npx playwright show-report $REPORT_DIR/playwright-report"
echo ""
echo "Or open: $REPORT_DIR/playwright-report/index.html"

