# Sanity Data SDK App

DataViewer: dashboard, accounts, enrichment pipeline, activity, people, and technologies — backed by Sanity and the worker.

## Setup

1. **Copy env and set worker URL**
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   - `VITE_WORKER_URL` — your worker base URL. Prefer an `https://` URL because the SDK runs inside Sanity's secure shell; plain `http://localhost:8787` can be blocked as mixed content.
   - `VITE_WORKER_API_KEY` — optional. Leave it blank unless your worker requires auth. If you use it, set the same value as `MOLT_API_KEY` in the worker. Research routes (`/enrich/queue`, `/enrich/status`, `/enrich/advance`) work without a key unless you add auth to them.
   - `VITE_SANITY_PROJECT_ID` / `VITE_SANITY_DATASET` — Sanity project and dataset (defaults in .env.example).

2. **Install and run**
   ```bash
   npm install
   npm run dev
   ```
   Dev loads `.env` via the script; ensure `.env` exists or worker calls will use fallback URL.

## Build and deploy

- **Build only:** `npm run check` or `npm run build`
- **Deploy to Sanity (hosted):** `npm run deploy` (uses `sanity.cli.ts` deployment config). Set any env vars in the Sanity project dashboard for the deployed app.
- **Worker:** Deploy the worker from the repo root with `npx wrangler deploy` so the SDK’s `VITE_WORKER_URL` points at the live worker.

## Troubleshooting

- **Worker: Unreachable** — Check `VITE_WORKER_URL` in `.env`, CORS on the worker, and that the worker is running. If the SDK is opened through Sanity's https shell, use an https worker URL or a local tunnel instead of plain `http://localhost`.
- **Enrichment queue / status fails** — Confirm the worker is up and `/enrich/queue`, `/enrich/status` are reachable; no API key required for those routes by default.
- **Sanity data missing** — Check `VITE_SANITY_PROJECT_ID` and `VITE_SANITY_DATASET` and that the Sanity project allows the app’s origin.
