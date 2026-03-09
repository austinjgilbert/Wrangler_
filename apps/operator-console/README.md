# Operator Console (Dashboard)

Next.js app for the website-scanner worker: overview, workspace, accounts, signals, patterns, actions, research, jobs, metrics, and system lab.

**Part of the same repo as the worker.** From the repo root:

- Run worker: `npm run dev` (→ http://localhost:8787)
- Run this app: `npm run console:dev` (→ http://localhost:3000)

## Setup

```bash
# From repo root
npm run console:dev
```

Or from this directory:

```bash
cd apps/operator-console
npm install
npm run dev
```

## Worker URL

The app proxies API calls to the worker. Default: `http://127.0.0.1:8787` (see `lib/server-proxy.ts`). Override with `WORKER_BASE_URL` in `.env.local` or environment.

## Structure

- `app/` — Next.js App Router (pages, API routes that proxy to worker)
- `components/` — Layout, command palette, section views (Overview, Workspace, Graph, Timeline, Pattern Discovery, Intelligence Map, etc.)
- `lib/` — Types, API client, server proxy, pattern/territory/outcome data helpers
