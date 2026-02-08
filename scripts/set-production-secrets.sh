#!/bin/bash
# Set production secrets for website-scanner worker.
# Run: ./scripts/set-production-secrets.sh
# You'll be prompted for each secret value. Use values from .dev.vars or create new ones.

set -e
ENV="${1:-production}"

echo "Setting secrets for env: $ENV"
echo ""

# Required for Sanity
echo "--- SANITY_PROJECT_ID (required) ---"
wrangler secret put SANITY_PROJECT_ID --env="$ENV"

echo ""
echo "--- SANITY_TOKEN (required) ---"
wrangler secret put SANITY_TOKEN --env="$ENV"

# Optional but recommended
echo ""
read -p "Set ADMIN_TOKEN? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  wrangler secret put ADMIN_TOKEN --env="$ENV"
fi

echo ""
read -p "Set MOLT_API_KEY (for MoltBot/ChatGPT)? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  wrangler secret put MOLT_API_KEY --env="$ENV"
fi

echo ""
read -p "Set BRAVE_SEARCH_API_KEY? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  wrangler secret put BRAVE_SEARCH_API_KEY --env="$ENV"
fi

echo ""
read -p "Set TELEGRAM_BOT_TOKEN? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  wrangler secret put TELEGRAM_BOT_TOKEN --env="$ENV"
fi

echo ""
read -p "Set SANITY_WEBHOOK_SECRET? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  wrangler secret put SANITY_WEBHOOK_SECRET --env="$ENV"
fi

echo ""
echo "Done. Secrets set for env: $ENV"
