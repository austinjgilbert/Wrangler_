#!/bin/bash

# Script to view usage logs from Sanity
# Usage: ./view-usage-logs.sh [options]

WORKER_URL="https://website-scanner.austin-gilbert.workers.dev"

echo "📊 Usage Logs Viewer"
echo "===================="
echo ""

# Function to query usage logs
query_logs() {
  local query="$1"
  local description="$2"
  
  echo "🔍 $description"
  echo "Query: $query"
  echo ""
  
  # Escape the query properly for JSON
  local escaped_query=$(echo "$query" | sed 's/"/\\"/g')
  curl -s -X POST "$WORKER_URL/query" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$escaped_query\"}" | jq '.'
  
  echo ""
  echo "---"
  echo ""
}

# Default: Show recent logs
if [ $# -eq 0 ]; then
  query_logs \
    '*[_type == "usageLog"] | order(timestamp desc) [0...20]' \
    "Recent Usage Logs (Last 20)"
  
  query_logs \
    '*[_type == "usageLog"] | group(userId) | {userId: _key, count: count()}' \
    "Usage by User"
  
  query_logs \
    '*[_type == "usageLog"] | group(endpoint) | {endpoint: _key, count: count(), avgResponseTime: avg(responseTimeMs)}' \
    "Usage by Endpoint"
  
  query_logs \
    '*[_type == "usageLog"] | {total: count(), successful: count(success == true), failed: count(success == false)}' \
    "Summary Statistics"
else
  case "$1" in
    --recent|-r)
      LIMIT=${2:-20}
      query_logs \
        "*[_type == \"usageLog\"] | order(timestamp desc) [0...$LIMIT]" \
        "Recent Usage Logs (Last $LIMIT)"
      ;;
    --user|-u)
      USER_ID=${2:-"anonymous"}
      query_logs \
        "*[_type == \"usageLog\" && userId == \"$USER_ID\"] | order(timestamp desc) [0...50]" \
        "Logs for User: $USER_ID"
      ;;
    --endpoint|-e)
      ENDPOINT=${2:-"/scan"}
      query_logs \
        "*[_type == \"usageLog\" && endpoint == \"$ENDPOINT\"] | order(timestamp desc) [0...50]" \
        "Logs for Endpoint: $ENDPOINT"
      ;;
    --stats|-s)
      query_logs \
        '*[_type == "usageLog"] | {total: count(), successful: count(success == true), failed: count(success == false), avgResponseTime: avg(responseTimeMs)}' \
        "Summary Statistics"
      ;;
    --by-user)
      query_logs \
        '*[_type == "usageLog"] | group(userId) | {userId: _key, count: count(), avgResponseTime: avg(responseTimeMs)} | order(count desc)' \
        "Usage by User (sorted by count)"
      ;;
    --by-endpoint)
      query_logs \
        '*[_type == "usageLog"] | group(endpoint) | {endpoint: _key, count: count(), avgResponseTime: avg(responseTimeMs), successRate: (count(success == true) / count() * 100)} | order(count desc)' \
        "Usage by Endpoint (sorted by count)"
      ;;
    --today)
      query_logs \
        '*[_type == "usageLog" && timestamp >= now() - 24h] | order(timestamp desc)' \
        "Logs from Last 24 Hours"
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --recent, -r [limit]     Show recent logs (default: 20)"
      echo "  --user, -u <userId>      Show logs for specific user"
      echo "  --endpoint, -e <path>    Show logs for specific endpoint"
      echo "  --stats, -s              Show summary statistics"
      echo "  --by-user                Show usage grouped by user"
      echo "  --by-endpoint            Show usage grouped by endpoint"
      echo "  --today                  Show logs from last 24 hours"
      echo "  --help, -h               Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                      # Show default dashboard"
      echo "  $0 --recent 50          # Show last 50 logs"
      echo "  $0 --user user123       # Show logs for user123"
      echo "  $0 --endpoint /scan      # Show logs for /scan endpoint"
      echo "  $0 --stats              # Show summary"
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
fi
