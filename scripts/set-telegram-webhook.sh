#!/usr/bin/env bash
# Set Telegram webhook to this worker's /webhooks/telegram.
# Usage: TELEGRAM_BOT_TOKEN=your_token ./scripts/set-telegram-webhook.sh
# Or:   ./scripts/set-telegram-webhook.sh   (will prompt for token if not set)

set -e
WORKER_URL="${WORKER_URL:-https://website-scanner.austin-gilbert.workers.dev}"
WEBHOOK_URL="${WORKER_URL}/webhooks/telegram"

if [ -z "${TELEGRAM_BOT_TOKEN}" ]; then
  echo "TELEGRAM_BOT_TOKEN not set. Paste your bot token (from @BotFather):"
  read -rs TELEGRAM_BOT_TOKEN
  echo
fi

if [ -z "${TELEGRAM_BOT_TOKEN}" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN is empty. Exiting."
  exit 1
fi

echo "Setting webhook to: $WEBHOOK_URL"
RESP=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${WEBHOOK_URL}\"}")

if echo "$RESP" | grep -q '"ok":true'; then
  echo "Webhook set successfully."
  echo "$RESP" | head -1
else
  echo "Failed to set webhook:"
  echo "$RESP"
  exit 1
fi
