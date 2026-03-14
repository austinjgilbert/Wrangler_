# What to Update as a Human: GPT + YAML Instructions

Use this checklist so ChatGPT (Custom GPT) and any YAML-based config stay in sync with the enrichment pipeline and worker API.

---

## 1. Custom GPT → Actions (Schema)

**File to copy:** `openapi-gpt.yaml` (repo root)

1. Open your Custom GPT → **Configure** → **Actions**.
2. Delete the existing schema.
3. Paste the **entire** contents of `openapi-gpt.yaml`.
4. Confirm **Server URL** is: `https://website-scanner.austin-gilbert.workers.dev`

**Enrichment-related operations (must be present):**

| Operation      | Method | Purpose |
|----------------|--------|---------|
| `enrichQueue`  | **POST** `/enrich/queue` | Queue a job. Body: `accountKey`, `canonicalUrl` (or `accountId`), optional `mode` (`standard` \| `restart` \| `deep`). |
| `enrichStatus` | **GET** `/enrich/status?accountKey=...` | Get current job status, progress, stage, errors. |
| `enrichAdvance`| **POST** `/enrich/advance` | Run one pipeline step (call when status is `in_progress` or `not_started` to unblock). Body: `{ "accountKey": "..." }`. |

If your schema still has **GET** `/enrich/queue` or is missing **GET** `/enrich/status` or **POST** `/enrich/advance`, replace the schema with the repo’s current `openapi-gpt.yaml`.

---

## 2. Custom GPT → Instructions

**File to copy:** `gpt-instructions.md` (repo root)

1. Custom GPT → **Configure** → **Instructions**.
2. Replace the contents with the full contents of `gpt-instructions.md`.

**Enrichment wording to keep (or add):**

- **enrichQueue** — POST with `accountKey` and `canonicalUrl` (or `accountId`) to queue. Use `mode: "deep"` for full pipeline + higher budget; `mode: "restart"` for a fresh run.
- **enrichStatus** — GET with `accountKey` to see status, `currentStage`, `progress`, `advanceError`. Use when the user asks “what’s the status?” or “why is it stuck?”.
- **enrichAdvance** — POST with `accountKey` to run one step. Use when status is `in_progress` or `not_started` and the user wants to “advance” or “unblock” the job.

So in instructions you can say:

- “**enrichQueue / enrichStatus / enrichAdvance** — When the user asks to enrich an account, call enrichQueue (POST) with accountKey and canonicalUrl. Use enrichStatus to report progress; use enrichAdvance if the user wants to run the next step or unblock a stuck job.”

---

## 3. Environment / Secrets (Human)

- **Worker URL:** `https://website-scanner.austin-gilbert.workers.dev` (or your deployed worker URL).
- **SDK app (Sanity DataViewer):** In `apps/sanity-data-sdk/.env` set:
  - `VITE_WORKER_URL=https://website-scanner.austin-gilbert.workers.dev`
  - Optionally `VITE_WORKER_API_KEY` if the worker requires API key for `/enrich/*`.
- **Custom GPT Authentication:** If you use API key protection, set the same key in the GPT’s Authentication (e.g. Bearer) and in the worker (`wrangler secret put MOLT_API_KEY --env=production`).

---

## 4. Quick verification

After updating:

- **GPT:** In the chat, ask to “Queue enrichment for account acme.com” then “What’s the enrichment status for acme-com?”. It should call POST `/enrich/queue` then GET `/enrich/status?accountKey=acme-com`.
- **SDK app:** Open Enrichment in the DataViewer; you should see job list, per-job diagnostics (jobId, stage, progress, errors), and controls: Advance, Run again, Deep research.

---

## Summary

| What | Where | Action |
|------|--------|--------|
| Schema (enrich queue/status/advance) | Custom GPT → Actions | Paste full `openapi-gpt.yaml` |
| Instructions (enrich wording) | Custom GPT → Instructions | Paste full `gpt-instructions.md` |
| Worker URL / API key | GPT config + SDK `.env` | Set URLs and optional API key |
