#!/usr/bin/env bash
# Test Molt/ChatGPT API auth: /molt/run and /wrangler/ingest
# Usage:
#   ./scripts/test-molt-auth.sh                    # worker has NO key -> auth optional
#   MOLT_API_KEY=your-key ./scripts/test-molt-auth.sh   # worker has key -> use this key to test

set -e
BASE_URL="${BASE_URL:-http://localhost:8787}"
KEY="${MOLT_API_KEY:-}"

echo "=== Molt auth test ==="
echo "BASE_URL=$BASE_URL"
echo "MOLT_API_KEY=${KEY:+<set>}${KEY:-<not set>}"
echo ""

# 0) Check whether the worker has MOLT_API_KEY set
echo "0) GET /molt/auth-status (worker config)"
STATUS_BODY=$(curl -s "$BASE_URL/molt/auth-status" || true)
if echo "$STATUS_BODY" | grep -q '"authRequired":true'; then
  WORKER_HAS_KEY=1
  echo "   -> authRequired: true (worker will require API key)"
elif echo "$STATUS_BODY" | grep -q '"authRequired":false'; then
  WORKER_HAS_KEY=0
  echo "   -> authRequired: false (worker will NOT require API key)"
else
  echo "   -> Could not reach worker or parse response. Is it running? (npm run dev)"
  echo "   Raw: $STATUS_BODY"
  exit 1
fi
echo ""

if [ -n "$KEY" ] && [ "$WORKER_HAS_KEY" = "0" ]; then
  echo "*** Worker does not have MOLT_API_KEY set. ***"
  echo ""
  echo "Create .dev.vars in the project root with:"
  echo "  MOLT_API_KEY=$KEY"
  echo ""
  echo "Then restart the worker (Ctrl+C in the terminal running 'npm run dev', then run 'npm run dev' again)."
  echo ""
  exit 1
fi

# 1) POST /molt/run without auth
echo "1) POST /molt/run (no auth)"
CODE=$(curl -s -o /tmp/molt_run.json -w "%{http_code}" -X POST "$BASE_URL/molt/run" \
  -H "Content-Type: application/json" \
  -d '{"requestText":"Auth test"}')
if [ "$CODE" = "401" ]; then
  echo "   -> 401 (auth required). OK."
else
  echo "   -> $CODE"
  if [ "$WORKER_HAS_KEY" = "1" ]; then
    echo "   FAIL: expected 401 when worker has MOLT_API_KEY and no key is sent"
    exit 1
  fi
fi
echo ""

# 2) Wrong key (only when worker has key and we have key to compare)
if [ -n "$KEY" ] && [ "$WORKER_HAS_KEY" = "1" ]; then
  echo "2) POST /molt/run (wrong key)"
  CODE=$(curl -s -o /tmp/molt_run_wrong.json -w "%{http_code}" -X POST "$BASE_URL/molt/run" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer wrong-key" \
    -d '{"requestText":"Auth test"}')
  if [ "$CODE" = "401" ]; then
    echo "   -> 401 Invalid API key. OK."
  else
    echo "   -> $CODE FAIL (expected 401 for wrong key)"
    exit 1
  fi
  echo ""

  echo "3) POST /molt/run (correct Bearer)"
  CODE=$(curl -s -o /tmp/molt_run_ok.json -w "%{http_code}" -X POST "$BASE_URL/molt/run" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $KEY" \
    -d '{"requestText":"Auth test"}')
  if [ "$CODE" = "401" ]; then
    echo "   -> 401 FAIL (expected success with correct key)"
    exit 1
  fi
  echo "   -> $CODE OK (not 401)"
  echo ""

  echo "4) POST /wrangler/ingest (X-API-Key)"
  CODE=$(curl -s -o /tmp/wrangler_ingest.json -w "%{http_code}" -X POST "$BASE_URL/wrangler/ingest" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $KEY" \
    -d '{"userPrompt":"Test","gptResponse":"Test response"}')
  if [ "$CODE" = "401" ]; then
    echo "   -> 401 FAIL (expected success with X-API-Key)"
    exit 1
  fi
  echo "   -> $CODE OK (not 401)"
else
  echo "2) Skipped (run with MOLT_API_KEY=your-key when worker has auth required)"
  echo "   Example: MOLT_API_KEY=test-secret-12345 ./scripts/test-molt-auth.sh"
fi

echo ""
echo "=== Done ==="
