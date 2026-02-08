#!/bin/bash
echo "Testing usage logging..."
echo ""
echo "1. Making request with user headers..."
curl -s "https://website-scanner.austin-gilbert.workers.dev/health" \
  -H "X-Sanity-User-Id: test-user-$(date +%s)" \
  -H "X-Sanity-User-Email: test@example.com" > /dev/null

echo "2. Waiting 5 seconds for async logging..."
sleep 5

echo "3. Querying logs..."
curl -s -X POST "https://website-scanner.austin-gilbert.workers.dev/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "*[_type == \"usageLog\"] | order(timestamp desc) [0...3]"}'
