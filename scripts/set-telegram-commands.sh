#!/usr/bin/env bash
# Register the bot's slash command list with Telegram (shows in the bot menu).
# Usage: TELEGRAM_BOT_TOKEN=your_token ./scripts/set-telegram-commands.sh

set -e
if [ -z "${TELEGRAM_BOT_TOKEN}" ]; then
  echo "Set TELEGRAM_BOT_TOKEN (from @BotFather) and run again."
  exit 1
fi

# Telegram setMyCommands: list of {command, description} (no leading slash, 1–256 chars for description)
# See https://core.telegram.org/bots/api#setmycommands
BODY='{
  "commands": [
    {"command": "start", "description": "Start the bot"},
    {"command": "help", "description": "List all commands and phrases"},
    {"command": "status", "description": "System health"},
    {"command": "account", "description": "Account summary (e.g. /account example.com)"},
    {"command": "enrich", "description": "Run enrichment (/enrich example.com)"},
    {"command": "competitors", "description": "Competitor research (/competitors example.com)"},
    {"command": "compare", "description": "Compare two accounts (/compare a.com b.com)"},
    {"command": "people", "description": "People at company (/people example.com)"},
    {"command": "tech", "description": "Accounts by tech (/tech React)"},
    {"command": "patterns", "description": "Tech & pain point patterns"},
    {"command": "captures", "description": "Recent extension captures"},
    {"command": "briefing", "description": "Daily SDR briefing"},
    {"command": "jobs", "description": "Recent enrichment jobs"},
    {"command": "network", "description": "Moltbook & network updates"}
  ]
}'

RESP=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands" \
  -H "Content-Type: application/json" \
  -d "$BODY")

if echo "$RESP" | grep -q '"ok":true'; then
  echo "Commands registered. They will appear in the Telegram bot menu."
else
  echo "Failed: $RESP"
  exit 1
fi
