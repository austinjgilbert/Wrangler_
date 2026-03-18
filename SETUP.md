# Setup guide — run and deploy for anyone

This guide gets the website-scanner-worker running with minimal steps, so anyone can try the system.

**Full checklist (YAML, GPT instructions, .dev.vars, API keys, Gmail, extension):** [docs/USER-SETUP-CHECKLIST.md](docs/USER-SETUP-CHECKLIST.md)

## What you need

- **Node.js 18+** — [Download](https://nodejs.org) or `nvm install 18`
- **Cloudflare account** — [Sign up](https://dash.cloudflare.com/sign-up) (free tier is enough for the worker)
- **Sanity (recommended)** — [Create a project](https://www.sanity.io/manage) and get Project ID + API token for the content lake

## 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/website-scanner-worker.git
cd website-scanner-worker
npm run setup
```

`npm run setup` will:

- Install root and Sanity dependencies
- Create `.dev.vars` from `.dev.vars.example` if it doesn’t exist
- Run a dependency check (Node, npm, wrangler)

If the dependency check fails, it will print what’s missing and how to fix it.

## 2. Verify dependencies (optional)

```bash
npm run check-deps
```

You should see ✓ for Node, npm, wrangler, package.json, node_modules, and optionally Sanity and `.dev.vars`.

## 3. Configure secrets

Edit **`.dev.vars`** in the project root. At minimum for local dev:

- `SANITY_PROJECT_ID` — your Sanity project ID
- `SANITY_TOKEN` — Sanity API token (with read/write)

See [.env.example](.env.example) for the full list; [.dev.vars.example](.dev.vars.example) is the template copied to `.dev.vars`.

## 4. Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser to authenticate with your Cloudflare account.

## 5. Run locally

```bash
npm run dev
```

Worker will be at **http://localhost:8787**. Quick check:

```bash
curl http://localhost:8787/health
# or
npm run health-check:local
```

## 6. Deploy to Cloudflare

```bash
npm run deploy
```

Before or after the first deploy, set production secrets (replace with your values):

```bash
npx wrangler secret put SANITY_PROJECT_ID --env=production
npx wrangler secret put SANITY_TOKEN --env=production
# Optional:
npx wrangler secret put ADMIN_TOKEN --env=production
npx wrangler secret put MOLT_API_KEY --env=production
```

Your worker URL will be like: `https://website-scanner.<your-subdomain>.workers.dev` (see `wrangler.toml` or the deploy output). Update `wrangler.toml` under `[env.production.vars]` if you want a different name or subdomain.

## 7. Optional add-ons

- **Chrome extension (Wrangler)** — [CHROME-EXTENSION-SETUP.md](CHROME-EXTENSION-SETUP.md) — capture pages from the browser and send to the worker
- **Telegram bot** — [TELEGRAM-BOT-SETUP.md](TELEGRAM-BOT-SETUP.md) — control enrichment and queries via Telegram
- **Custom GPT** — [CUSTOM-GPT-UPDATE.md](CUSTOM-GPT-UPDATE.md) — connect ChatGPT to your worker
- **Sanity Studio** — `cd sanity && npm run dev` — edit content and schemas locally

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `wrangler not found` | Run `npm run setup` again; wrangler is a devDependency. Or use `npx wrangler`. |
| Node version too old | Install Node 18+ from nodejs.org or `nvm install 18`. |
| `.dev.vars` missing | Run `cp .dev.vars.example .dev.vars` and set SANITY_PROJECT_ID, SANITY_TOKEN. |
| 401 / Unauthorized from worker | Set `MOLT_API_KEY` in `.dev.vars` (or the header your client sends) if you use protected routes. |
| Deploy fails in CI | Add GitHub repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. See [README](README.md#repository-and-ci). |

## Scripts reference

| Command | Description |
|---------|-------------|
| `npm run setup` | Install deps, create `.dev.vars` from `.dev.vars.example`, run check-deps |
| `npm run check-deps` | Verify Node, npm, wrangler, and optional Sanity / .dev.vars |
| `npm run dev` | Start local worker (Wrangler dev) |
| `npm run deploy` | Deploy to Cloudflare production |
| `npm run build` | Dry-run build (no deploy) |
| `npm run test:unit` | Run unit tests |

## Publishing so others can try it

1. Create a new repository on GitHub (public or private).
2. Add it as `origin` and push: `git remote add origin https://github.com/YOUR_USERNAME/website-scanner-worker.git`, then `git push -u origin main`.
3. Share the clone URL; others can run `git clone ... && cd website-scanner-worker && npm run setup` and follow this guide.
