#!/usr/bin/env bash
# Quick test for Moltbook API. Start the dev server first: npm run dev
set -e
BASE="${BASE_URL:-http://localhost:8787}"
echo "→ GET $BASE/moltbook/api/activity"
curl -s "$BASE/moltbook/api/activity" | head -c 500
echo -e "\n"
echo "→ POST test activity"
curl -s -X POST "$BASE/moltbook/api/activity" \
  -H "Content-Type: application/json" \
  -d '{"author":"test-bot","text":"Moltbook API test run at '"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' | head -c 300
echo -e "\n"
echo "→ GET again (should show the new item)"
curl -s "$BASE/moltbook/api/activity" | head -c 800
echo -e "\n"
echo "Done. If you see the test-bot message above, the API is working."
