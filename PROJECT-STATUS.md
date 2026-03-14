# Project status — what’s connected

Short overview of where the project lives and how the pieces connect. Use this after cloning or when onboarding.

---

## Repository

| Item | Value |
|------|--------|
| **GitHub** | https://github.com/austinjgilbert/-website-scanner-worker (private) |
| **Clone** | `git clone https://github.com/austinjgilbert/-website-scanner-worker.git` |
| **Push** | PAT with **repo** + **workflow** scopes — [GITHUB-PUSH.md](GITHUB-PUSH.md) |

---

## Deployed services

| Service | URL / identifier |
|--------|-------------------|
| **Worker (production)** | https://website-scanner.austin-gilbert.workers.dev |
| **Sanity Studio** | https://molt-content-os.sanity.studio |
| **Sanity project** | `nlqb7zmk` (dataset: production) |
| **Custom GPT** | Configure with **openapi-gpt.yaml** + **gpt-instructions.md**; server URL = worker URL above |

---

## Local setup (after clone)

1. `npm install` (root), `cd sanity && npm install`
2. Copy `.env.example` → `.dev.vars` and fill (at least `SANITY_PROJECT_ID`, `SANITY_TOKEN`)
3. `wrangler login`
4. `npm run dev` → worker at http://localhost:8787; optionally `cd sanity && npm run dev` for Studio

Full steps: [SETUP.md](SETUP.md) and [CUSTOM-GPT-UPDATE.md](CUSTOM-GPT-UPDATE.md).

---

## CI (GitHub Actions)

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| **Deploy** | Push to `main` | Runs build + unit tests, then `wrangler deploy --env=production` |
| **Health check** | Every 30 min + manual | Calls worker `/health`; fails if not OK |

To enable deploy from GitHub: add repo secrets **CLOUDFLARE_API_TOKEN** and **CLOUDFLARE_ACCOUNT_ID** (see README or SETUP.md).

---

## Tests and quality

| Command | Purpose |
|--------|--------|
| `npm run check-deps` | Verify Node, npm, wrangler, .dev.vars |
| `npm run typecheck` | TypeScript (tsc --noEmit) — must pass for CI |
| `npm run test:unit` | Vitest unit tests (e.g. account-completeness) |
| `npm test` | System test: core files and route strings present |
| `npm run build` | Wrangler dry-run deploy (bundle check) |

Constants are centralized in **src/config/constants.js**; the worker entry **src/index.js** imports them to avoid duplication.

## Key docs

- [SETUP.md](SETUP.md) — setup, deploy; [CUSTOM-GPT-UPDATE.md](CUSTOM-GPT-UPDATE.md) — Custom GPT updates
- [README.md](README.md) — overview, API, usage
- [GITHUB-PUSH.md](GITHUB-PUSH.md) — push to GitHub (PAT, workflow scope)
- [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) — production checklist
- [sanity/SANITY-SYSTEMS-CHECK.md](sanity/SANITY-SYSTEMS-CHECK.md) — Sanity validate + build
