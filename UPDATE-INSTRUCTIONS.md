# Update instructions — get everything working

One place for: **first-time setup**, **running locally**, **deploying**, and **updating the Custom GPT** after changes.

---

## 1. First-time setup (get everything working)

### Prerequisites

- **Node.js 18+** and npm  
- **Cloudflare account** and **Wrangler CLI**: `npm install -g wrangler`  
- (Optional) Sanity project for content; Custom GPT for ChatGPT integration  

### Install

```bash
# Clone (if needed) and enter repo
cd website-scanner-worker

# Root dependencies
npm install

# Sanity Studio (if you use it)
cd sanity && npm install && cd ..
```

### Local secrets

Wrangler reads local secrets from `.dev.vars` (not committed).

```bash
# Copy the example and fill in values
cp .env.example .dev.vars

# Edit .dev.vars — at minimum set:
#   SANITY_PROJECT_ID=
#   SANITY_TOKEN=
# (Leave BASE_URL=http://localhost:8787 for dev.)
```

See `.env.example` for all optional vars (ADMIN_TOKEN, MOLT_*, BRAVE_SEARCH_API_KEY, etc.).

### Log in to Cloudflare

```bash
wrangler login
```

### Run locally

```bash
npm run dev
```

- Worker: **http://localhost:8787**  
- Quick check: `curl http://localhost:8787/health` or `npm run health-check:local`  

### Optional: Sanity Studio

```bash
cd sanity
npm run dev
```

Open the URL it prints (e.g. http://localhost:3333). Schemas are in `sanity/schemas/`; if you add new types, register them in `sanity/schemas/index.ts`.

### Optional: Playwright tests

```bash
# Start worker in another terminal: npm run dev
SKIP_WEB_SERVER=1 TEST_URL=http://localhost:8787 npx playwright test account-page --project=chromium
```

---

## 2. After you change worker code or API

### Worker: build and deploy

```bash
npm run build          # dry-run build
npm run test:unit      # unit tests
npm run deploy         # deploys to Cloudflare (default env)
```

Deploy uses the default Wrangler env (no `--env`). If you use a named env (e.g. `production`), run `wrangler deploy --env=production` and set secrets for that env.

### Custom GPT: update schema and instructions

When you add/change endpoints or behavior that the GPT should use:

1. **Schema (Actions)**  
   - In the repo we keep **`openapi-gpt.yaml`** at **30 operations** so it fits ChatGPT’s limit.  
   - In your Custom GPT: **Configure → Actions** → **Import** or paste the contents of **`openapi-gpt.yaml`**.  
   - Set the **server URL** to your worker (e.g. `https://website-scanner.austin-gilbert.workers.dev`).  

2. **Instructions**  
   - Copy the contents of **`gpt-instructions.md`** (under 8k characters for Custom GPT).  
   - In your Custom GPT: **Configure → Instructions** → paste and save.  
   - Use **`gpt-instructions-full.md`** only if you need the longer version elsewhere (Custom GPT has an 8k limit).  

3. **Auth (if you use Molt/protected routes)**  
   - Use the same **API Key** (e.g. `MOLT_API_KEY`) in ChatGPT Actions (Bearer or Custom header).  
   - See [docs/MOLT-PRODUCTION-SETUP.md](docs/MOLT-PRODUCTION-SETUP.md) for details.  

After updating schema + instructions, the GPT will use the new endpoints and behavior on the next run.

---

## 3. After you update dependencies

```bash
# Root
npm install
npm run build
npm run test:unit

# Sanity (if you use it)
cd sanity && npm install && npm run build && cd ..
```

If the worker or Sanity build fails, fix any new type or API breakages before deploying.

---

## 4. Production deploy and secrets

### One-time: set production secrets

Use the script (it prompts for each secret):

```bash
./scripts/set-production-secrets.sh
```

Or set them manually (use `--env=""` for default env, or `--env=production` if you use that name):

```bash
wrangler secret put SANITY_PROJECT_ID --env=""
wrangler secret put SANITY_TOKEN --env=""
# Optional: ADMIN_TOKEN, MOLT_API_KEY, BRAVE_SEARCH_API_KEY, TELEGRAM_BOT_TOKEN, SANITY_WEBHOOK_SECRET
```

### Deploy

```bash
npm run deploy
```

### Verify

```bash
curl -sf https://<your-worker>.workers.dev/health
curl -sf https://<your-worker>.workers.dev/sanity/status   # if Sanity is configured
```

See [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) for the full checklist (KV, Queues, Cron, etc.).

---

## 5. When you change Sanity schemas

If you add or change document types in `schemas/` (e.g. in the repo’s `schemas/` or `sanity/schemas/`):

1. Copy or update the schema files in your **Sanity Studio** project (e.g. `sanity/schemas/`).  
2. Register new types in `sanity/schemas/index.ts`.  
3. Rebuild and redeploy Sanity Studio if you host it.  

The worker talks to Sanity via the API; it doesn’t need a redeploy for schema changes unless you change how the worker stores or queries data.

---

## Quick reference

| Goal | Command / action |
|------|-------------------|
| First-time install | `npm install` then `cd sanity && npm install` |
| Local secrets | Copy `.env.example` → `.dev.vars`, fill values |
| Run worker locally | `npm run dev` → http://localhost:8787 |
| Run Sanity Studio | `cd sanity && npm run dev` |
| Unit tests | `npm run test:unit` |
| Playwright (account page) | `SKIP_WEB_SERVER=1 TEST_URL=http://localhost:8787 npx playwright test account-page --project=chromium` |
| Deploy worker | `npm run deploy` |
| Set production secrets | `./scripts/set-production-secrets.sh` or `wrangler secret put <NAME>` |
| Update Custom GPT schema | Re-import **openapi-gpt.yaml** in GPT Actions; set server URL |
| Update Custom GPT instructions | Paste **gpt-instructions.md** into GPT Instructions |
| Health check (prod) | `curl https://<your-worker>.workers.dev/health` |

---

## File reference

| File | Purpose |
|------|--------|
| **openapi-gpt.yaml** | OpenAPI schema for Custom GPT (30 operations; use this in ChatGPT) |
| **openapi.yaml** | Full API schema (served at `GET /openapi.yaml`; reference only) |
| **gpt-instructions.md** | GPT instructions (≤8k chars; paste into Custom GPT) |
| **gpt-instructions-full.md** | Extended instructions (reference; too long for Custom GPT limit) |
| **.env.example** | Template for `.dev.vars` (local secrets) |
| **PRODUCTION-READINESS.md** | Pre-deploy checklist, security, monitoring |

If something doesn’t work, check: (1) `.dev.vars` present and populated for local runs, (2) `wrangler login` and correct account, (3) production secrets set for the env you deploy to, (4) Custom GPT server URL and schema match your deployed worker.
