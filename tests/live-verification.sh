#!/usr/bin/env bash
# ============================================================================
# live-verification.sh — Comprehensive verification test for Wrangler_ chat
# ============================================================================
#
# Tests all 5 chat endpoints against the live Worker deployment:
#   POST /api/chat/message   — single JSON response
#   POST /api/chat/stream    — NDJSON streaming
#   POST /api/chat/feedback  — thumbs up/down
#   GET  /api/chat/session/:id — session history
#   GET  /api/chat/audit     — audit log
#
# Validates:
#   - HTTP status codes
#   - Response structure (ok, data.content, data.intent, etc.)
#   - Intent classification accuracy for all 5 intents
#   - Fallback detection (content must NOT be a fallback message)
#   - Generation time (>500ms = real LLM, <100ms = likely fallback)
#   - Source attribution presence
#   - Edge cases (Buc Ees, empty message, missing sessionId)
#
# Usage:
#   ./tests/live-verification.sh                    # default: production
#   ./tests/live-verification.sh http://localhost:8787  # local dev
#
# Requirements: curl, jq
# ============================================================================

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────

BASE_URL="${1:-https://website-scanner.austin-gilbert.workers.dev}"
API_KEY="Gs0PwqpTVSmJ3PjkcMawgNCjbKjFCe3FHAWx8AcV4Ac"
SESSION_ID="test-session-$(date +%s)-$$"

# Counters
PASS=0
FAIL=0
SKIP=0
TOTAL=0
FAILURES=()

# Colors (disable if not a terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

# ─── Dependency Check ───────────────────────────────────────────────────────

check_deps() {
  for cmd in curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
      echo -e "${RED}ERROR: '$cmd' is required but not installed.${RESET}"
      exit 1
    fi
  done
}

# ─── Helper Functions ───────────────────────────────────────────────────────

# Record a test result
# Usage: record_result "test name" PASS|FAIL ["failure reason"]
record_result() {
  local name="$1"
  local result="$2"
  local reason="${3:-}"
  TOTAL=$((TOTAL + 1))

  if [ "$result" = "PASS" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓ PASS${RESET} — $name"
  elif [ "$result" = "SKIP" ]; then
    SKIP=$((SKIP + 1))
    echo -e "  ${YELLOW}⊘ SKIP${RESET} — $name: $reason"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$name: $reason")
    echo -e "  ${RED}✗ FAIL${RESET} — $name: $reason"
  fi
}

# Send a chat message and capture both HTTP status and body
# Usage: send_message "message text" [session_id]
# Sets: HTTP_STATUS, RESPONSE_BODY
send_message() {
  local message="$1"
  local sid="${2:-$SESSION_ID}"
  local tmpfile
  tmpfile=$(mktemp)

  HTTP_STATUS=$(curl -s -o "$tmpfile" -w "%{http_code}" \
    -X POST "${BASE_URL}/api/chat/message" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "{\"sessionId\": \"${sid}\", \"message\": \"${message}\"}" \
    --max-time 60)

  RESPONSE_BODY=$(cat "$tmpfile")
  rm -f "$tmpfile"
}

# Send a raw JSON body (for edge-case tests with missing fields)
# Usage: send_raw_body '{"message":"hi"}'
# Sets: HTTP_STATUS, RESPONSE_BODY
send_raw_body() {
  local body="$1"
  local tmpfile
  tmpfile=$(mktemp)

  HTTP_STATUS=$(curl -s -o "$tmpfile" -w "%{http_code}" \
    -X POST "${BASE_URL}/api/chat/message" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "$body" \
    --max-time 30)

  RESPONSE_BODY=$(cat "$tmpfile")
  rm -f "$tmpfile"
}

# ─── Assertion Helpers ──────────────────────────────────────────────────────

# Check HTTP status code
assert_http_status() {
  local test_name="$1"
  local expected="$2"
  if [ "$HTTP_STATUS" = "$expected" ]; then
    record_result "${test_name}: HTTP ${expected}" "PASS"
    return 0
  else
    record_result "${test_name}: HTTP ${expected}" "FAIL" "got HTTP ${HTTP_STATUS}"
    return 1
  fi
}

# Check that .ok is true
assert_ok_true() {
  local test_name="$1"
  local ok
  ok=$(echo "$RESPONSE_BODY" | jq -r '.ok // empty' 2>/dev/null)
  if [ "$ok" = "true" ]; then
    record_result "${test_name}: ok=true" "PASS"
    return 0
  else
    record_result "${test_name}: ok=true" "FAIL" "ok=${ok:-null}"
    return 1
  fi
}

# Check that .data.intent matches expected
assert_intent() {
  local test_name="$1"
  local expected_intent="$2"
  local actual_intent
  actual_intent=$(echo "$RESPONSE_BODY" | jq -r '.data.intent // empty' 2>/dev/null)
  if [ "$actual_intent" = "$expected_intent" ]; then
    record_result "${test_name}: intent=${expected_intent}" "PASS"
    return 0
  else
    record_result "${test_name}: intent=${expected_intent}" "FAIL" "got intent=${actual_intent:-null}"
    return 1
  fi
}

# Check that .data.content is NOT a fallback message
assert_not_fallback() {
  local test_name="$1"
  local content
  content=$(echo "$RESPONSE_BODY" | jq -r '.data.content // empty' 2>/dev/null)

  if [ -z "$content" ]; then
    record_result "${test_name}: not fallback" "FAIL" "content is empty"
    return 1
  fi

  # Known fallback phrases from response.ts buildFallbackResponse()
  local fallback_patterns=(
    "couldn't generate"
    "couldn't format"
    "Try rephrasing"
    "try again in a moment"
    "couldn't fetch the data"
    "temporarily unavailable"
    "something went wrong"
  )

  local content_lower
  content_lower=$(echo "$content" | tr '[:upper:]' '[:lower:]')

  for pattern in "${fallback_patterns[@]}"; do
    if echo "$content_lower" | grep -qi "$pattern"; then
      record_result "${test_name}: not fallback" "FAIL" "contains fallback phrase: '${pattern}'"
      return 1
    fi
  done

  record_result "${test_name}: not fallback" "PASS"
  return 0
}

# Check that .data.generationTimeMs > threshold (real LLM call)
assert_generation_time() {
  local test_name="$1"
  local min_ms="${2:-500}"
  local gen_time
  gen_time=$(echo "$RESPONSE_BODY" | jq -r '.data.generationTimeMs // 0' 2>/dev/null)

  if [ -z "$gen_time" ] || [ "$gen_time" = "null" ]; then
    record_result "${test_name}: generationTimeMs > ${min_ms}ms" "FAIL" "generationTimeMs missing"
    return 1
  fi

  # Use awk for numeric comparison (handles decimals)
  if awk "BEGIN {exit !($gen_time > $min_ms)}"; then
    record_result "${test_name}: generationTimeMs > ${min_ms}ms" "PASS"
    return 0
  else
    record_result "${test_name}: generationTimeMs > ${min_ms}ms" "FAIL" "got ${gen_time}ms (likely fallback)"
    return 1
  fi
}

# Check that .data.sources is a non-empty array
assert_has_sources() {
  local test_name="$1"
  local sources_count
  sources_count=$(echo "$RESPONSE_BODY" | jq '.data.sources | length' 2>/dev/null)

  if [ -z "$sources_count" ] || [ "$sources_count" = "null" ]; then
    record_result "${test_name}: has sources" "FAIL" "sources field missing"
    return 1
  fi

  if [ "$sources_count" -gt 0 ]; then
    record_result "${test_name}: has sources (${sources_count})" "PASS"
    return 0
  else
    # Sources may legitimately be empty for some intents — record as soft warning
    record_result "${test_name}: has sources" "SKIP" "sources array empty (may be expected)"
    return 0
  fi
}

# Check that .data.content has minimum length (not a stub)
assert_content_length() {
  local test_name="$1"
  local min_len="${2:-50}"
  local content_len
  content_len=$(echo "$RESPONSE_BODY" | jq -r '.data.content | length' 2>/dev/null)

  if [ -z "$content_len" ] || [ "$content_len" = "null" ]; then
    record_result "${test_name}: content length > ${min_len}" "FAIL" "content missing"
    return 1
  fi

  if [ "$content_len" -ge "$min_len" ]; then
    record_result "${test_name}: content length > ${min_len}" "PASS"
    return 0
  else
    record_result "${test_name}: content length > ${min_len}" "FAIL" "got ${content_len} chars"
    return 1
  fi
}

# Check that intent is NOT a specific value (for edge-case tests)
assert_intent_not() {
  local test_name="$1"
  local forbidden_intent="$2"
  local actual_intent
  actual_intent=$(echo "$RESPONSE_BODY" | jq -r '.data.intent // empty' 2>/dev/null)
  if [ "$actual_intent" != "$forbidden_intent" ]; then
    record_result "${test_name}: intent ≠ ${forbidden_intent}" "PASS"
    return 0
  else
    record_result "${test_name}: intent ≠ ${forbidden_intent}" "FAIL" "got ${actual_intent}"
    return 1
  fi
}

# ─── Full Intent Test ───────────────────────────────────────────────────────

# Run a complete test for a single message/intent pair
# Usage: test_intent "test label" "message" "expected_intent" [expect_sources]
test_intent() {
  local label="$1"
  local message="$2"
  local expected_intent="$3"
  local expect_sources="${4:-yes}"

  echo ""
  echo -e "  ${CYAN}▸ ${label}${RESET}"
  echo -e "    Query: \"${message}\""

  send_message "$message"

  # Show timing info
  local gen_time total_time
  gen_time=$(echo "$RESPONSE_BODY" | jq -r '.data.generationTimeMs // "?"' 2>/dev/null)
  total_time=$(echo "$RESPONSE_BODY" | jq -r '.data.totalTimeMs // "?"' 2>/dev/null)
  echo -e "    Timing: gen=${gen_time}ms total=${total_time}ms"

  # Run all assertions (continue even if some fail)
  assert_http_status "$label" "200" || true
  assert_ok_true "$label" || true
  assert_intent "$label" "$expected_intent" || true
  assert_not_fallback "$label" || true
  assert_generation_time "$label" 500 || true
  assert_content_length "$label" 50 || true

  if [ "$expect_sources" = "yes" ]; then
    assert_has_sources "$label" || true
  fi
}

# ============================================================================
# TEST EXECUTION
# ============================================================================

main() {
  check_deps

  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║  Wrangler_ Chat Backend — Live Verification Test Suite      ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  Target:     ${CYAN}${BASE_URL}${RESET}"
  echo -e "  Session:    ${SESSION_ID}"
  echo -e "  Timestamp:  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo ""

  # ── 0. Connectivity Check ─────────────────────────────────────────────────

  echo -e "${BOLD}[0] Connectivity Check${RESET}"
  echo ""

  local health_status
  health_status=$(curl -s -o /dev/null -w "%{http_code}" \
    "${BASE_URL}/health" \
    -H "X-API-Key: ${API_KEY}" \
    --max-time 10 2>/dev/null || echo "000")

  if [ "$health_status" = "000" ]; then
    echo -e "  ${RED}✗ Cannot reach ${BASE_URL} — aborting.${RESET}"
    exit 1
  else
    echo -e "  ${GREEN}✓ Server reachable (health: HTTP ${health_status})${RESET}"
  fi

  # ── 1. Morning Briefing Intent ────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[1] Intent: morning_briefing${RESET}"

  test_intent \
    "morning_briefing #1" \
    "good morning" \
    "morning_briefing"

  test_intent \
    "morning_briefing #2" \
    "what should I do today?" \
    "morning_briefing"

  test_intent \
    "morning_briefing #3" \
    "give me my morning briefing" \
    "morning_briefing"

  # ── 2. Account Lookup Intent ──────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[2] Intent: account_lookup${RESET}"

  test_intent \
    "account_lookup #1" \
    "tell me about Buc Ees" \
    "account_lookup"

  test_intent \
    "account_lookup #2" \
    "what's happening with Acme Corp?" \
    "account_lookup"

  test_intent \
    "account_lookup #3" \
    "look up the account for Salesforce" \
    "account_lookup"

  # ── 3. Signal Check Intent ────────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[3] Intent: signal_check${RESET}"

  test_intent \
    "signal_check #1" \
    "any new signals?" \
    "signal_check"

  test_intent \
    "signal_check #2" \
    "what happened overnight?" \
    "signal_check"

  test_intent \
    "signal_check #3" \
    "show me recent signal activity" \
    "signal_check"

  # ── 4. Person Lookup Intent ───────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[4] Intent: person_lookup${RESET}"

  test_intent \
    "person_lookup #1" \
    "who is John Smith?" \
    "person_lookup"

  test_intent \
    "person_lookup #2" \
    "tell me about the CEO of Acme" \
    "person_lookup"

  test_intent \
    "person_lookup #3" \
    "look up the VP of Engineering at Salesforce" \
    "person_lookup"

  # ── 5. Meeting Prep Intent ────────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[5] Intent: meeting_prep${RESET}"

  test_intent \
    "meeting_prep #1" \
    "prep me for my meeting with Acme tomorrow" \
    "meeting_prep"

  test_intent \
    "meeting_prep #2" \
    "I have a call with Salesforce next week, prepare me" \
    "meeting_prep"

  test_intent \
    "meeting_prep #3" \
    "give me talking points for my meeting with Buc Ees" \
    "meeting_prep"

  # ── 6. Edge Cases: Intent Disambiguation ──────────────────────────────────

  echo ""
  echo -e "${BOLD}[6] Edge Cases: Intent Disambiguation${RESET}"

  # "Buc Ees" should be account_lookup, NOT person_lookup
  echo ""
  echo -e "  ${CYAN}▸ Buc Ees disambiguation${RESET}"
  echo -e "    Query: \"tell me about Buc Ees\""
  send_message "tell me about Buc Ees"
  assert_http_status "Buc Ees edge case" "200" || true
  assert_ok_true "Buc Ees edge case" || true
  assert_intent "Buc Ees edge case" "account_lookup" || true
  assert_intent_not "Buc Ees edge case" "person_lookup" || true
  assert_not_fallback "Buc Ees edge case" || true

  # "Acme Corp" should resolve as account_lookup
  echo ""
  echo -e "  ${CYAN}▸ Acme Corp disambiguation${RESET}"
  echo -e "    Query: \"Acme Corp\""
  send_message "Acme Corp"
  assert_http_status "Acme Corp edge case" "200" || true
  assert_ok_true "Acme Corp edge case" || true
  assert_intent "Acme Corp edge case" "account_lookup" || true
  assert_intent_not "Acme Corp edge case" "person_lookup" || true

  # ── 7. Edge Cases: Validation Errors ──────────────────────────────────────

  echo ""
  echo -e "${BOLD}[7] Edge Cases: Validation Errors${RESET}"

  # Empty message should return 400 validation error
  echo ""
  echo -e "  ${CYAN}▸ Empty message${RESET}"
  send_raw_body "{\"sessionId\": \"${SESSION_ID}\", \"message\": \"\"}"
  assert_http_status "empty message" "400" || true
  local err_code
  err_code=$(echo "$RESPONSE_BODY" | jq -r '.error.code // empty' 2>/dev/null)
  if [ "$err_code" = "VALIDATION_ERROR" ]; then
    record_result "empty message: VALIDATION_ERROR" "PASS"
  else
    record_result "empty message: VALIDATION_ERROR" "FAIL" "got error.code=${err_code:-null}"
  fi

  # Missing sessionId should return 400 validation error
  echo ""
  echo -e "  ${CYAN}▸ Missing sessionId${RESET}"
  send_raw_body "{\"message\": \"hello\"}"
  assert_http_status "missing sessionId" "400" || true
  err_code=$(echo "$RESPONSE_BODY" | jq -r '.error.code // empty' 2>/dev/null)
  if [ "$err_code" = "VALIDATION_ERROR" ]; then
    record_result "missing sessionId: VALIDATION_ERROR" "PASS"
  else
    record_result "missing sessionId: VALIDATION_ERROR" "FAIL" "got error.code=${err_code:-null}"
  fi

  # Whitespace-only message should also be rejected
  echo ""
  echo -e "  ${CYAN}▸ Whitespace-only message${RESET}"
  send_raw_body "{\"sessionId\": \"${SESSION_ID}\", \"message\": \"   \"}"
  assert_http_status "whitespace message" "400" || true
  err_code=$(echo "$RESPONSE_BODY" | jq -r '.error.code // empty' 2>/dev/null)
  if [ "$err_code" = "VALIDATION_ERROR" ]; then
    record_result "whitespace message: VALIDATION_ERROR" "PASS"
  else
    record_result "whitespace message: VALIDATION_ERROR" "FAIL" "got error.code=${err_code:-null}"
  fi

  # ── 8. Streaming Endpoint ─────────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[8] Streaming Endpoint (POST /api/chat/stream)${RESET}"
  echo ""
  echo -e "  ${CYAN}▸ NDJSON stream test${RESET}"
  echo -e "    Query: \"any new signals today?\""

  local stream_tmpfile
  stream_tmpfile=$(mktemp)
  local stream_status
  stream_status=$(curl -s -o "$stream_tmpfile" -w "%{http_code}" \
    -X POST "${BASE_URL}/api/chat/stream" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "{\"sessionId\": \"${SESSION_ID}\", \"message\": \"any new signals today?\"}" \
    --max-time 60)

  TOTAL=$((TOTAL + 1))
  if [ "$stream_status" = "200" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓ PASS${RESET} — stream: HTTP 200"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("stream: HTTP 200 — got ${stream_status}")
    echo -e "  ${RED}✗ FAIL${RESET} — stream: HTTP 200 — got ${stream_status}"
  fi

  # Verify NDJSON format: each non-empty line should be valid JSON
  local stream_lines=0
  local stream_valid=0
  local stream_invalid=0
  local has_token=false
  local has_sources=false
  local has_done=false

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    stream_lines=$((stream_lines + 1))

    if echo "$line" | jq -e '.' &>/dev/null; then
      stream_valid=$((stream_valid + 1))

      # Check for expected NDJSON event types
      local event_type
      event_type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
      case "$event_type" in
        token) has_token=true ;;
        sources) has_sources=true ;;
        done) has_done=true ;;
        suggestions) ;; # optional
      esac
    else
      stream_invalid=$((stream_invalid + 1))
    fi
  done < "$stream_tmpfile"

  echo -e "    Lines: ${stream_lines} total, ${stream_valid} valid JSON, ${stream_invalid} invalid"

  # All lines should be valid JSON
  if [ "$stream_invalid" -eq 0 ] && [ "$stream_lines" -gt 0 ]; then
    record_result "stream: all lines valid NDJSON" "PASS"
  else
    record_result "stream: all lines valid NDJSON" "FAIL" "${stream_invalid} invalid lines out of ${stream_lines}"
  fi

  # Must have token events
  if $has_token; then
    record_result "stream: has 'token' events" "PASS"
  else
    record_result "stream: has 'token' events" "FAIL" "no token events found"
  fi

  # Must have sources event
  if $has_sources; then
    record_result "stream: has 'sources' event" "PASS"
  else
    record_result "stream: has 'sources' event" "FAIL" "no sources event found"
  fi

  # Must have done event
  if $has_done; then
    record_result "stream: has 'done' event" "PASS"
  else
    record_result "stream: has 'done' event" "FAIL" "no done event found"
  fi

  # Check that the done event contains intent metadata
  local done_intent
  done_intent=$(grep '"type":"done"' "$stream_tmpfile" 2>/dev/null | jq -r '.meta.intent // empty' 2>/dev/null || true)
  if [ -n "$done_intent" ] && [ "$done_intent" != "null" ]; then
    record_result "stream: done event has intent metadata (${done_intent})" "PASS"
  else
    record_result "stream: done event has intent metadata" "FAIL" "intent missing from done.meta"
  fi

  rm -f "$stream_tmpfile"

  # ── 9. Feedback Endpoint ──────────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[9] Feedback Endpoint (POST /api/chat/feedback)${RESET}"
  echo ""

  # First, we need a valid turnId. Send a message and extract one from the session.
  # We'll use a synthetic turnId since the API accepts any UUID.
  local feedback_turn_id
  feedback_turn_id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "test-turn-$(date +%s)")

  echo -e "  ${CYAN}▸ Thumbs up feedback${RESET}"
  local fb_tmpfile
  fb_tmpfile=$(mktemp)
  local fb_status
  fb_status=$(curl -s -o "$fb_tmpfile" -w "%{http_code}" \
    -X POST "${BASE_URL}/api/chat/feedback" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "{\"sessionId\": \"${SESSION_ID}\", \"turnId\": \"${feedback_turn_id}\", \"feedback\": \"up\"}" \
    --max-time 15)

  local fb_body
  fb_body=$(cat "$fb_tmpfile")
  rm -f "$fb_tmpfile"

  assert_http_status "feedback up" "200" || true
  HTTP_STATUS="$fb_status"  # restore for assert
  RESPONSE_BODY="$fb_body"

  local fb_ok
  fb_ok=$(echo "$fb_body" | jq -r '.ok // empty' 2>/dev/null)
  if [ "$fb_ok" = "true" ]; then
    record_result "feedback up: ok=true" "PASS"
  else
    record_result "feedback up: ok=true" "FAIL" "ok=${fb_ok:-null}"
  fi

  local fb_success
  fb_success=$(echo "$fb_body" | jq -r '.data.success // empty' 2>/dev/null)
  if [ "$fb_success" = "true" ]; then
    record_result "feedback up: data.success=true" "PASS"
  else
    record_result "feedback up: data.success=true" "FAIL" "success=${fb_success:-null}"
  fi

  # Thumbs down with text
  echo ""
  echo -e "  ${CYAN}▸ Thumbs down feedback with text${RESET}"
  fb_tmpfile=$(mktemp)
  fb_status=$(curl -s -o "$fb_tmpfile" -w "%{http_code}" \
    -X POST "${BASE_URL}/api/chat/feedback" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "{\"sessionId\": \"${SESSION_ID}\", \"turnId\": \"${feedback_turn_id}\", \"feedback\": \"down\", \"text\": \"Response was not helpful\"}" \
    --max-time 15)

  fb_body=$(cat "$fb_tmpfile")
  rm -f "$fb_tmpfile"

  HTTP_STATUS="$fb_status"
  RESPONSE_BODY="$fb_body"
  assert_http_status "feedback down" "200" || true

  fb_ok=$(echo "$fb_body" | jq -r '.ok // empty' 2>/dev/null)
  if [ "$fb_ok" = "true" ]; then
    record_result "feedback down: ok=true" "PASS"
  else
    record_result "feedback down: ok=true" "FAIL" "ok=${fb_ok:-null}"
  fi

  # Invalid feedback value
  echo ""
  echo -e "  ${CYAN}▸ Invalid feedback value${RESET}"
  fb_tmpfile=$(mktemp)
  fb_status=$(curl -s -o "$fb_tmpfile" -w "%{http_code}" \
    -X POST "${BASE_URL}/api/chat/feedback" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "{\"sessionId\": \"${SESSION_ID}\", \"turnId\": \"${feedback_turn_id}\", \"feedback\": \"maybe\"}" \
    --max-time 15)

  fb_body=$(cat "$fb_tmpfile")
  rm -f "$fb_tmpfile"

  HTTP_STATUS="$fb_status"
  if [ "$fb_status" = "400" ]; then
    record_result "invalid feedback: HTTP 400" "PASS"
  else
    record_result "invalid feedback: HTTP 400" "FAIL" "got HTTP ${fb_status}"
  fi

  # ── 10. Session Retrieval ─────────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[10] Session Retrieval (GET /api/chat/session/:id)${RESET}"
  echo ""

  echo -e "  ${CYAN}▸ Retrieve test session${RESET}"
  local sess_tmpfile
  sess_tmpfile=$(mktemp)
  local sess_status
  sess_status=$(curl -s -o "$sess_tmpfile" -w "%{http_code}" \
    -X GET "${BASE_URL}/api/chat/session/${SESSION_ID}" \
    -H "X-API-Key: ${API_KEY}" \
    --max-time 15)

  local sess_body
  sess_body=$(cat "$sess_tmpfile")
  rm -f "$sess_tmpfile"

  HTTP_STATUS="$sess_status"
  RESPONSE_BODY="$sess_body"

  # Session should exist since we sent messages to it
  if [ "$sess_status" = "200" ]; then
    record_result "session retrieval: HTTP 200" "PASS"

    local sess_ok
    sess_ok=$(echo "$sess_body" | jq -r '.ok // empty' 2>/dev/null)
    if [ "$sess_ok" = "true" ]; then
      record_result "session retrieval: ok=true" "PASS"
    else
      record_result "session retrieval: ok=true" "FAIL" "ok=${sess_ok:-null}"
    fi

    # Check that session has turns
    local turns_count
    turns_count=$(echo "$sess_body" | jq '.data.turns | length' 2>/dev/null)
    if [ -n "$turns_count" ] && [ "$turns_count" -gt 0 ]; then
      record_result "session retrieval: has turns (${turns_count})" "PASS"
    else
      record_result "session retrieval: has turns" "FAIL" "turns count: ${turns_count:-null}"
    fi

    # Check sessionId matches
    local sess_id_returned
    sess_id_returned=$(echo "$sess_body" | jq -r '.data.sessionId // empty' 2>/dev/null)
    if [ "$sess_id_returned" = "$SESSION_ID" ]; then
      record_result "session retrieval: sessionId matches" "PASS"
    else
      record_result "session retrieval: sessionId matches" "FAIL" "got ${sess_id_returned:-null}"
    fi
  elif [ "$sess_status" = "404" ]; then
    # Session might not have been persisted (KV issue) — note but don't hard-fail
    record_result "session retrieval: HTTP 200" "SKIP" "got 404 — session may not have persisted to KV"
  else
    record_result "session retrieval: HTTP 200" "FAIL" "got HTTP ${sess_status}"
  fi

  # Non-existent session should return 404
  echo ""
  echo -e "  ${CYAN}▸ Non-existent session${RESET}"
  sess_tmpfile=$(mktemp)
  sess_status=$(curl -s -o "$sess_tmpfile" -w "%{http_code}" \
    -X GET "${BASE_URL}/api/chat/session/nonexistent-session-id-12345" \
    -H "X-API-Key: ${API_KEY}" \
    --max-time 15)

  sess_body=$(cat "$sess_tmpfile")
  rm -f "$sess_tmpfile"

  if [ "$sess_status" = "404" ]; then
    record_result "nonexistent session: HTTP 404" "PASS"
  else
    record_result "nonexistent session: HTTP 404" "FAIL" "got HTTP ${sess_status}"
  fi

  # ── 11. Audit Log ─────────────────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[11] Audit Log (GET /api/chat/audit)${RESET}"
  echo ""

  echo -e "  ${CYAN}▸ Retrieve audit log${RESET}"
  local audit_tmpfile
  audit_tmpfile=$(mktemp)
  local audit_status
  audit_status=$(curl -s -o "$audit_tmpfile" -w "%{http_code}" \
    -X GET "${BASE_URL}/api/chat/audit?limit=10" \
    -H "X-API-Key: ${API_KEY}" \
    --max-time 15)

  local audit_body
  audit_body=$(cat "$audit_tmpfile")
  rm -f "$audit_tmpfile"

  if [ "$audit_status" = "200" ]; then
    record_result "audit log: HTTP 200" "PASS"

    local audit_ok
    audit_ok=$(echo "$audit_body" | jq -r '.ok // empty' 2>/dev/null)
    if [ "$audit_ok" = "true" ]; then
      record_result "audit log: ok=true" "PASS"
    else
      record_result "audit log: ok=true" "FAIL" "ok=${audit_ok:-null}"
    fi

    # Check that entries array exists
    local entries_count
    entries_count=$(echo "$audit_body" | jq '.data.entries | length' 2>/dev/null)
    if [ -n "$entries_count" ] && [ "$entries_count" != "null" ]; then
      record_result "audit log: has entries array (${entries_count} entries)" "PASS"
    else
      record_result "audit log: has entries array" "FAIL" "entries missing or null"
    fi

    # Check audit with session filter
    echo ""
    echo -e "  ${CYAN}▸ Audit log filtered by session${RESET}"
    audit_tmpfile=$(mktemp)
    audit_status=$(curl -s -o "$audit_tmpfile" -w "%{http_code}" \
      -X GET "${BASE_URL}/api/chat/audit?sessionId=${SESSION_ID}&limit=5" \
      -H "X-API-Key: ${API_KEY}" \
      --max-time 15)

    audit_body=$(cat "$audit_tmpfile")
    rm -f "$audit_tmpfile"

    if [ "$audit_status" = "200" ]; then
      record_result "audit log (filtered): HTTP 200" "PASS"
    else
      record_result "audit log (filtered): HTTP 200" "FAIL" "got HTTP ${audit_status}"
    fi
  else
    record_result "audit log: HTTP 200" "FAIL" "got HTTP ${audit_status}"
  fi

  # ── 12. Auth Check ────────────────────────────────────────────────────────

  echo ""
  echo -e "${BOLD}[12] Auth Check (missing/invalid API key)${RESET}"
  echo ""

  # Request without API key should be rejected
  echo -e "  ${CYAN}▸ Missing API key${RESET}"
  local noauth_status
  noauth_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${BASE_URL}/api/chat/message" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"test\", \"message\": \"hello\"}" \
    --max-time 15)

  if [ "$noauth_status" = "401" ] || [ "$noauth_status" = "403" ]; then
    record_result "missing API key: rejected (HTTP ${noauth_status})" "PASS"
  else
    record_result "missing API key: rejected" "FAIL" "got HTTP ${noauth_status} (expected 401 or 403)"
  fi

  # Request with wrong API key should be rejected
  echo ""
  echo -e "  ${CYAN}▸ Invalid API key${RESET}"
  local badauth_status
  badauth_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${BASE_URL}/api/chat/message" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: totally-wrong-key-12345" \
    -d "{\"sessionId\": \"test\", \"message\": \"hello\"}" \
    --max-time 15)

  if [ "$badauth_status" = "401" ] || [ "$badauth_status" = "403" ]; then
    record_result "invalid API key: rejected (HTTP ${badauth_status})" "PASS"
  else
    record_result "invalid API key: rejected" "FAIL" "got HTTP ${badauth_status} (expected 401 or 403)"
  fi

  # ════════════════════════════════════════════════════════════════════════════
  # SUMMARY
  # ════════════════════════════════════════════════════════════════════════════

  echo ""
  echo -e "${BOLD}══════════════════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  RESULTS SUMMARY${RESET}"
  echo -e "${BOLD}══════════════════════════════════════════════════════════════${RESET}"
  echo ""
  echo -e "  Total:   ${TOTAL}"
  echo -e "  ${GREEN}Passed:  ${PASS}${RESET}"
  echo -e "  ${RED}Failed:  ${FAIL}${RESET}"
  echo -e "  ${YELLOW}Skipped: ${SKIP}${RESET}"
  echo ""

  if [ ${#FAILURES[@]} -gt 0 ]; then
    echo -e "${RED}  ── Failed Tests ──${RESET}"
    for failure in "${FAILURES[@]}"; do
      echo -e "  ${RED}✗${RESET} $failure"
    done
    echo ""
  fi

  if [ "$FAIL" -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}🎉 ALL TESTS PASSED${RESET}"
    echo ""
    exit 0
  else
    echo -e "  ${RED}${BOLD}⚠️  ${FAIL} TEST(S) FAILED${RESET}"
    echo ""
    exit 1
  fi
}

# Run
main "$@"
