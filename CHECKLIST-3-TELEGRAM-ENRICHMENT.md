# Checklist #3: Telegram + Enrichment pipeline

Use this to verify **Cron**, **Secrets**, and **Webhook** so Telegram commands queue the worker and data flows to Sanity.

---

## 1. Cron (enrichment job processing)

**What it does:** Every 15 minutes the worker runs `POST /enrich/process`, which advances queued enrichment jobs (scan → discovery → crawl → brief → etc.). Without this, `/enrich example.com` would queue a job but it would never run.

**Check:**

- [ ] **wrangler.toml** has a cron that runs every 15 minutes:
  ```toml
  [triggers]
  crons = [
    "*/15 * * * *",  # frequent job runner → runs /enrich/process
    ...
  ]
  ```
- [ ] You deploy **production** so the cron runs with production env:
  ```bash
  npm run deploy
  # or: npx wrangler deploy --env=production
  ```
- [ ] Cron runs in UTC. No extra config needed; Cloudflare triggers it for your deployed worker.

**Code reference:** `src/index.js` → `scheduled()` → when `cron === '*/15 * * * *'` it calls `runRoute('/enrich/process', {})`.

---

## 2. Secrets (production)

These must be set for the **production** worker so Telegram and Sanity work.

**Required for Telegram + Sanity:**

| Secret | Purpose | Set with |
|--------|--------|----------|
| `TELEGRAM_BOT_TOKEN` | Bot replies, webhook receives updates | `wrangler secret put TELEGRAM_BOT_TOKEN --env=production` |
| `SANITY_PROJECT_ID` | Sanity project | `wrangler secret put SANITY_PROJECT_ID --env=production` |
| `SANITY_TOKEN` | Sanity API token (read/write) | `wrangler secret put SANITY_TOKEN --env=production` |

**Optional (pipeline / search):**

| Secret | Purpose |
|--------|--------|
| `BRAVE_SEARCH_API_KEY` | Search/brief steps in pipeline (get key at https://brave.com/search/api/) |
| `SANITY_DATASET` | Default `production` if unset |
| `BASE_URL` | Set via `[env.production.vars]` in wrangler.toml (already `https://website-scanner.austin-gilbert.workers.dev`) |

**Verify (after deploy):**

```bash
# List production secrets (names only)
npx wrangler secret list --env=production
```

You should see at least: `TELEGRAM_BOT_TOKEN`, `SANITY_PROJECT_ID`, `SANITY_TOKEN`.

**Health check:**

```bash
curl -s "https://website-scanner.austin-gilbert.workers.dev/health" | jq '.dependencies.sanity, .status'
```

If Sanity is configured, `dependencies.sanity.reachable` should be `true`.

---

## 3. Webhook (Telegram → worker)

Telegram must send updates to your worker’s `/webhooks/telegram` URL.

**Option A – Script (recommended):**

```bash
# From project root. Uses production URL by default.
TELEGRAM_BOT_TOKEN=your_token_here ./scripts/set-telegram-webhook.sh
```

**Option B – curl:**

```bash
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://website-scanner.austin-gilbert.workers.dev/webhooks/telegram"}'
```

Expected: `{"ok":true,"result":true,"description":"Webhook was set"}`.

**Verify webhook is set:**

```bash
curl -s "https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo" | jq '.result.url'
```

Should show: `"https://website-scanner.austin-gilbert.workers.dev/webhooks/telegram"`.

**If you use a different worker URL:** set it when running the script:

```bash
WORKER_URL=https://your-worker.workers.dev TELEGRAM_BOT_TOKEN=xxx ./scripts/set-telegram-webhook.sh
```

---

## Quick test

1. In Telegram, open your bot and send: `/start` → you should get a welcome message.
2. Send: `/status` → should report worker OK and Sanity connected.
3. Send: `/enrich example.com` → should reply that enrichment is queued and pipeline is running; within ~15 min (or on next cron run) the job advances.

---

## Summary

| # | Item | Status |
|---|------|--------|
| 1 | Cron `*/15 * * * *` in wrangler.toml and production deploy | ✅ Check wrangler.toml + deploy with `--env=production` |
| 2 | Secrets: TELEGRAM_BOT_TOKEN, SANITY_PROJECT_ID, SANITY_TOKEN (production) | ✅ `wrangler secret put <NAME> --env=production` |
| 3 | Webhook points to worker `/webhooks/telegram` | ✅ Run `set-telegram-webhook.sh` or curl `setWebhook` |
