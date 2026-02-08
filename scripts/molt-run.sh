#!/bin/bash

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 \"request text\""
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:8787}"
PAYLOAD="$(node -e "console.log(JSON.stringify({ requestText: process.argv.slice(1).join(' '), mode: 'auto' }))" "$@")"

curl -sS "${BASE_URL}/molt/run" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}"
