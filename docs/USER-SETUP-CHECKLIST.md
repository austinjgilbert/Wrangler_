# Complete user setup checklist

Everything you need to update and configure to get the worker, GPT, Gmail, tracking, and extensions working.

---

## 1. Local environment (`.dev.vars`)

Copy from template and set values:

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars
```

### Required for basic worker + Sanity

| Variable | Description | Example / where to get it |
|----------|--------------|----------------------------|
| `SANITY_PROJECT_ID` | Sanity project ID | Sanity dashboard → Project ID |
| `SANITY_TOKEN` | Sanity API token (read/write) | Sanity dashboard → API → Tokens |
| `BASE_URL` | Worker URL for local dev | `http://localhost:8787` (already in example) |

### Required for Custom GPT (and protected routes)

| Variable | Description | Example / where to get it |
|----------|--------------|----------------------------|
| `MOLT_API_KEY` | API key for GPT + extension auth | Generate: `openssl rand -base64 32` |

### Required for Gmail (draft/send from GPT)

| Variable | Description | Example / where to get it |
|----------|--------------|----------------------------|
| `GMAIL_CLIENT_ID` | Google OAuth client ID | Google Cloud Console → Credentials → OAuth 2.0 Client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret | Same credentials page |
| `GMAIL_REFRESH_TOKEN` | Gmail refresh token | Run `npm run gmail:auth` after setting the two above; paste printed value |

See **docs/setup/GMAIL-API-SETUP.md** for full Gmail setup (OAuth consent, scopes, redirect URI).

### Optional but recommended

| Variable | Description | Example |
|----------|--------------|---------|
| `GMAIL_FROM_NAME` | “From” display name | `Austin @ Sanity` |
| `GMAIL_FROM_EMAIL` | Sending address | `you@company.com` |
| `GMAIL_SIGNATURE` | Appended to every email (use `\n` for newlines) | `--\nYour Name\nTitle` |
| `SANITY_DATASET` | Sanity dataset | `production` (default) |
| `SANITY_WEBHOOK_SECRET` | Secret for Sanity webhook (if using) | Random string; set same in Sanity webhook config |
| `ADMIN_TOKEN` | Protects admin/write operations | `openssl rand -base64 32` |
| `ADMIN_API_KEY` | For operator console / API | Same or another key |

### Optional (Slack, Telegram, search, etc.)

| Variable | Description |
|----------|-------------|
| `SLACK_SIGNING_SECRET` | Slack app signing secret |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token |
| `SLACK_DEFAULT_CHANNEL` | Default channel ID |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `WRANGLER_API_URL` | Wrangler bridge API URL (if used) |
| `WRANGLER_API_KEY` | Bridge API key |
| `BRAVE_SEARCH_API_KEY` | [brave.com/search/api](https://brave.com/search/api) |
| `GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_ENGINE_ID` | Google Custom Search |
| `MOLT_TOOL_BASE_URL` / `MOLTBOOK_BASE_URL` | Override worker URL for tools (default: same as BASE_URL) |
| LLM_* / ANTHROPIC_API_KEY / OPENAI_API_KEY | Enrichment, OSINT, etc. (see .dev.vars.example) |

**Email tracking** uses `MOLTBOOK_ACTIVITY_KV` (configured in `wrangler.toml`). No extra env vars needed; ensure KV namespace exists and is bound.

---

## 2. Production secrets (Wrangler)

Set secrets for the **same env you deploy to**. This repo uses `npm run deploy`, which runs `wrangler deploy --env=production`, so set production secrets with `--env=production`:

```bash
npx wrangler secret put SANITY_PROJECT_ID --env=production
npx wrangler secret put SANITY_TOKEN --env=production
npx wrangler secret put MOLT_API_KEY --env=production
npx wrangler secret put GMAIL_CLIENT_ID --env=production
npx wrangler secret put GMAIL_CLIENT_SECRET --env=production
npx wrangler secret put GMAIL_REFRESH_TOKEN --env=production
```

Optional:

```bash
npx wrangler secret put ADMIN_TOKEN --env=production
npx wrangler secret put ADMIN_API_KEY --env=production
npx wrangler secret put SANITY_WEBHOOK_SECRET --env=production
npx wrangler secret put TELEGRAM_BOT_TOKEN --env=production
# etc.
```

Production **vars** (non-secret) are in `wrangler.toml` under `[env.production.vars]` (e.g. `BASE_URL`, `MOLT_TOOL_BASE_URL`, `MOLTBOOK_BASE_URL`). Edit there if your worker URL or subdomain differs (e.g. `https://website-scanner.austin-gilbert.workers.dev`).

---

## 3. YAML (Custom GPT Actions schema)

**File:** `openapi-gpt.yaml` (repo root)

1. Open your Custom GPT → **Configure** → **Actions**.
2. Delete the existing schema.
3. Paste the **entire** contents of `openapi-gpt.yaml`.
4. Confirm **Server URL** matches your deployed worker, e.g.:
   - `https://website-scanner.austin-gilbert.workers.dev`
5. Save.

If your worker is on a different URL, either:
- Edit the `servers[0].url` in `openapi-gpt.yaml` before copying, or  
- Change the server URL in the GPT UI after pasting.

---

## 4. GPT instructions

**File:** `gpt-instructions.md` (repo root)

1. Custom GPT → **Configure** → **Instructions**.
2. Replace the contents with the **full** contents of `gpt-instructions.md`.
3. Save.

This gives the GPT the correct flow for query → wranglerIngest, enrichment (enrichQueue / enrichStatus / enrichAdvance), and **gmailTool** (draft first, show email, send only after approval).

---

## 5. Custom GPT authentication

If you use an API key for the worker:

1. Set the same key in the worker (e.g. `MOLT_API_KEY` in `.dev.vars` or `wrangler secret put MOLT_API_KEY`).
2. In Custom GPT → **Configure** → **Authentication**:
   - Type: **API Key**
   - Auth type: **Bearer**
   - API Key: paste the same value as `MOLT_API_KEY`.

---

## 6. Chrome extension

1. Load the extension (Chrome → Extensions → Load unpacked → select `chrome-extension`).
2. Open the extension popup → **Settings** (or gear).
3. Set **Worker URL** to your worker (e.g. `https://website-scanner.austin-gilbert.workers.dev` or `http://localhost:8787` for local).
4. If the worker requires auth, set **API Key** to the same value as `MOLT_API_KEY`.

The **Email** tab polls `GET /track/opens` to show recent email opens (read receipts, device, location). No extra API key is needed for that if the extension already uses the worker URL and optional API key for other calls.

---

## 7. Sanity webhook (optional)

If you use Sanity’s webhook to trigger auto-enrichment:

1. **URL:** `https://<your-worker-host>/webhooks/sanity`  
   Example: `https://website-scanner.austin-gilbert.workers.dev/webhooks/sanity`
2. **Secret:** Generate a random string; set it in Sanity’s webhook config **and** in the worker as `SANITY_WEBHOOK_SECRET` (`.dev.vars` or `wrangler secret put SANITY_WEBHOOK_SECRET`).
3. Test: `npm run test:webhook` (uses `BASE_URL` and `SANITY_WEBHOOK_SECRET` from `.dev.vars`).

---

## 8. Gmail-specific checklist

- [ ] Google Cloud project created; Gmail API enabled.
- [ ] OAuth consent screen configured; scopes include gmail.readonly, gmail.compose, gmail.send (or gmail.modify).
- [ ] OAuth client ID (Web application) with redirect URI `http://localhost:3456/callback`.
- [ ] `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in `.dev.vars`.
- [ ] `npm run gmail:auth` run once; `GMAIL_REFRESH_TOKEN` added to `.dev.vars`.
- [ ] Optional: `GMAIL_FROM_NAME`, `GMAIL_FROM_EMAIL`, `GMAIL_SIGNATURE` in `.dev.vars`.
- [ ] Production: `wrangler secret put GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (no `--env=production` if using default env).

---

## 9. Quick verification

| What | How |
|------|-----|
| Worker | `curl https://website-scanner.austin-gilbert.workers.dev/health` (or your BASE_URL) |
| GPT | In the GPT: “Scan https://example.com” or “Queue enrichment for acme.com” then “What’s the status for acme-com?” |
| Gmail | In the GPT: “Draft an email to me@example.com with subject Test and body Hello.” Then “send” after reviewing. |
| Email opens | Send a test email via the GPT; open it; check extension **Email** tab for the open (read receipt, device, location). |
| Sanity webhook | `npm run test:webhook` (with correct BASE_URL and SANITY_WEBHOOK_SECRET in `.dev.vars`) |

---

## 10. Reference: API keys / secrets not in `.dev.vars.example`

These are used by the code but may be missing from the example file or only mentioned in comments. Set them in `.dev.vars` (or as Wrangler secrets) if you use the feature:

| Variable | Used for |
|----------|----------|
| `CHATGPT_API_KEY` | Alias for `MOLT_API_KEY` (same behavior) |
| `MOLTBOOK_API_KEY` | Moltbook POST protection (if used) |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, etc. | Enrichment / OSINT LLM |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | If used by enrichment or tools |
| `BRAVE_SEARCH_API_KEY` / `GOOGLE_SEARCH_*` | Web search tools |
| `OSINT_*` | OSINT job defaults |
| `CRAWL_ALLOWLIST` | Crawl allowlist |
| `ANALYTICS_ENDPOINT` / `ENABLE_METRICS` | Metrics |

---

## Summary table

| Area | What to update | Where |
|------|----------------|-------|
| Local env | All required + optional vars | `.dev.vars` (from `.dev.vars.example`) |
| Production secrets | SANITY_*, MOLT_API_KEY, GMAIL_*, etc. | `npx wrangler secret put VAR` |
| GPT schema | Full OpenAPI for Actions | Custom GPT → Actions → paste `openapi-gpt.yaml` |
| GPT instructions | Full instructions | Custom GPT → Instructions → paste `gpt-instructions.md` |
| GPT auth | API key | Custom GPT → Authentication → Bearer + MOLT_API_KEY value |
| Worker URL in YAML | If different from repo default | `openapi-gpt.yaml` `servers[0].url` or GPT UI |
| Chrome extension | Worker URL + optional API key | Extension → Settings |
| Sanity webhook | URL + secret | Sanity project → Webhooks; worker `SANITY_WEBHOOK_SECRET` |
| Gmail | OAuth + refresh token + optional From/signature | `.dev.vars` + `npm run gmail:auth`; production secrets |

For more detail: **SETUP.md**, **CUSTOM-GPT-UPDATE.md**, **docs/GPT-AND-YAML-UPDATE.md**, **docs/setup/GMAIL-API-SETUP.md**.
