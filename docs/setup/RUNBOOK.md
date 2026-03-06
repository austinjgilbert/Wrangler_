# RUNBOOK — MoltBot OS v1

## Local Development
```bash
npm install
npm run dev
```

## Environment Variables (required)
- `SANITY_PROJECT_ID`
- `SANITY_DATASET` (optional, default `production`)
- `SANITY_TOKEN` (preferred) or `SANITY_API_TOKEN`
- `SANITY_API_VERSION` (optional, default `2023-10-01`)
- `MOLT_TOOL_BASE_URL` (optional; defaults to worker URL)
- `SLACK_WEBHOOK_URL` (optional for future Slack wiring)

### Set secrets (Cloudflare)
```bash
wrangler secret put SANITY_PROJECT_ID
wrangler secret put SANITY_TOKEN
wrangler secret put SANITY_DATASET
wrangler secret put SANITY_API_VERSION
```

## Sanity Schemas
Assumption: Sanity Studio consumes `sanity/schemas/index.ts`.

### Deploy schemas
1. Copy `sanity/schemas/index.ts` into your Sanity Studio schema entry.
2. Deploy Studio or run local Studio.

## Seed moltbot.config
```bash
SANITY_PROJECT_ID=... SANITY_TOKEN=... npm run seed:molt-config
```

## Smoke Test
```bash
BASE_URL=http://localhost:8787 \
SANITY_PROJECT_ID=... \
SANITY_TOKEN=... \
npm run smoke-test
```

## Example cURL Commands
```bash
curl -X POST "$BASE_URL/molt/log" \
  -H "Content-Type: application/json" \
  -d '{"text":"Logged: sent follow-up","channel":"slack","entityHints":["Jane Doe","Ubiquiti"],"outcome":"pending"}'

curl -X POST "$BASE_URL/wrangler/ingest" \
  -H "Content-Type: application/json" \
  -d '{"userPrompt":"Draft a follow-up","gptResponse":"Draft response here","sessionId":null}'

curl -X POST "$BASE_URL/calls/ingest" \
  -H "Content-Type: application/json" \
  -d '{"transcript":"00:01 Austin: ...","meetingType":"discovery","accountHint":"Ubiquiti","peopleHints":["Jane Doe"]}'

curl -X POST "$BASE_URL/network/dailyRun" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Cron Triggers (Free Tier)
Configured in `wrangler.toml`:
- `*/15 * * * *` → `/molt/jobs/run`
- `0 */6 * * *` → `/dq/scan` + `/enrich/run`
- `15 13 * * *` → `/network/dailyRun`
- `30 13 * * *` → `/opportunities/daily`

Deploy to activate:
```bash
npm run deploy
```

## Continuous Deployment (GitHub Actions)
Workflow: `.github/workflows/deploy.yml`

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Behavior:
- Deploys on every push to `main`
- Manual deploy via GitHub Actions "Run workflow"

## MoltBot Tool Gateway Integration
MoltBot tools are called via HTTP endpoints. Configure either a single base URL or per-tool URLs:

- `MOLT_TOOL_BASE_URL` (base URL for `/tools/*`)
- `MOLT_RESEARCH_TOOL_URL`
- `MOLT_GMAIL_TOOL_URL`
- `MOLT_CALENDAR_TOOL_URL`
- `MOLT_SLACK_TOOL_URL`
- `MOLT_WEB_SEARCH_TOOL_URL`
- `MOLT_SUMMARIZE_TOOL_URL`
- `MOLT_MEMORY_SEARCH_TOOL_URL`
- `MOLT_WHISPER_TOOL_URL`
- `MOLT_GITHUB_TOOL_URL`
- `MOLT_WRANGLER_TOOL_URL`

Set for Cloudflare:
```bash
wrangler secret put MOLT_TOOL_BASE_URL
```

Trigger MoltBot from the CLI:
```bash
BASE_URL=http://localhost:8787 ./scripts/molt-run.sh "research Ubiquiti CMS stack"
```

## Gmail Tool Setup
For real Gmail read/draft/send instead of compose-link fallback, add:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

If these are not set, the Gmail tool can still generate outreach drafts and return a Gmail compose URL for final user review/send.

## Slack Webhook (Mobile Testing)
If you wire Slack:
1. Create a Slack incoming webhook.
2. Set `SLACK_WEBHOOK_URL` in environment.
3. Update `notify()` to send (currently draft-only).

## Slack DM + Commands (Front Door)
Required secrets:
- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`

Optional:
- `SLACK_DEFAULT_CHANNEL`

Set secrets:
```bash
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_DEFAULT_CHANNEL
```

Slack app settings:
- **Event Subscriptions** → Request URL: `https://<worker>/slack/events`
- **Slash Commands** → Request URL: `https://<worker>/slack/command`
- Bot scopes: `chat:write`, `im:history`, `commands`

Example DM commands:
- `log sent follow-up to Jane`
- `run summarize Ubiquiti CMS stack`
- `approve molt.approval.123`
- `reject molt.approval.123`

## Wrangler Integration
Set these vars to connect your Wrangler service:
- `WRANGLER_API_URL`
- `WRANGLER_API_KEY` (optional)

Example:
```bash
wrangler secret put WRANGLER_API_URL
wrangler secret put WRANGLER_API_KEY
```
