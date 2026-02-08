# Connect Telegram bot to the worker

The worker exposes **POST /webhooks/telegram** and can reply to messages with account lookups, enrichment, patterns, status, and more.

---

## 1. Create the bot (Telegram)

1. Open Telegram and message **@BotFather**.
2. Send: `/newbot`
3. Follow prompts: choose a **name** (e.g. "Molt Content OS") and a **username** (e.g. `molt_content_os_bot` — must end in `bot`).
4. BotFather replies with a **token** like `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Copy it.

---

## 2. Set the token in production

From the project root:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN --env=production
```

When prompted, paste the token from BotFather. (Use the same for local dev in `.dev.vars` if you want to test locally.)

**Full checklist (Cron + Secrets + Webhook):** [CHECKLIST-3-TELEGRAM-ENRICHMENT.md](CHECKLIST-3-TELEGRAM-ENRICHMENT.md)

---

## 3. Set the webhook (tell Telegram where to send updates)

Replace `YOUR_BOT_TOKEN` with the token from step 1 (the same value you set in step 2):

```bash
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://website-scanner.austin-gilbert.workers.dev/webhooks/telegram"}'
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`.

**Optional script (if you have the token in env):**

```bash
# Only run this if you still have the token (e.g. from a safe env var)
TELEGRAM_BOT_TOKEN=your_token_here ./scripts/set-telegram-webhook.sh
```

---

## 4. Test the bot

1. In Telegram, open your bot (search for the username you chose).
2. Send `/start` — you should get a welcome message with commands.
3. Try: `/help`, `/status`, or "what do we know about example.com".

---

## Commands and natural language

**Full reference:** [TELEGRAM-COMMANDS.md](TELEGRAM-COMMANDS.md) — all slash commands and natural-language phrases.

| You say | What the bot does |
|--------|--------------------|
| `/start` | Welcome + command list |
| `/help` | Help text and example phrases |
| `/patterns` | Tech & pain point patterns from Sanity |
| `/status` | Worker health and Sanity reachability |
| "what do we know about example.com" | Account summary |
| "enrich fleetfeet.com" | Run enrichment for that domain |
| "competitors of Acme" | Competitor research |
| "compare X and Y" | Side-by-side comparison |
| "accounts using React" | Accounts with that tech |
| "people at example.com" | Leadership / contacts |
| "good morning" | Daily SDR briefing |
| "recent captures" | Latest extension captures |

---

## Troubleshooting (bot doesn’t reply)

### 1. Confirm the webhook is set

Telegram must know to send updates to your worker. Run (replace `YOUR_BOT_TOKEN` with your token):

```bash
curl -s "https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo"
```

You should see `"url":"https://website-scanner.austin-gilbert.workers.dev/webhooks/telegram"`. If `url` is empty, set it again:

```bash
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://website-scanner.austin-gilbert.workers.dev/webhooks/telegram"}'
```

### 2. Confirm the token is set in production

The worker must have the same token. Set it for the production env:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN --env=production
```

### 3. Watch live logs while you message the bot

In one terminal, from the project directory, run:

```bash
cd /path/to/website-scanner-worker
npm run tail
```

Or: `wrangler tail --env=production` (must be run from the project root so wrangler finds `wrangler.toml`).

Then in Telegram send `/start` to your bot. You should see a request in the tail. If you see `[Telegram] sendMessage failed:` then the token may be wrong or revoked; create a new token with @BotFather and update the secret.

### 4. Remove webhook (to stop Telegram sending to this worker)

```bash
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/deleteWebhook"
```
