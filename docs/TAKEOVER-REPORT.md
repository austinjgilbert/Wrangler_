# Takeover Report: Project Understanding, Current State, Gaps

## A) Project Understanding

This system is a **website intelligence and account research platform** that:

- **Core:** Cloudflare Worker API that scans sites (tech stack, AI readiness), discovers/crawls pages, extracts evidence, runs LinkedIn and brief/verification stages, and persists results into Sanity CMS. Accounts and account packs are the primary entities; enrichment is a multi-stage pipeline (initial_scan → discovery → crawl → extraction → linkedin → brief → verification).
- **Users:** Operators (via Operator Console Next.js app and/or Sanity DataViewer SDK app), Custom GPT, Telegram, Chrome extension. SDR/autopilot and nightly intelligence pipelines run on cron.
- **Intended flow:** User picks an account → queues enrichment (or it is auto-queued) → pipeline runs (via UI “Advance” and/or cron) → research set and profile completeness are stored → UI shows updated account. The system should work end-to-end without requiring the UI to be open (cron advances jobs).

---

## B) Current State

- **Worker:** Single entrypoint `src/index.js`; routes for /health, /scan, /scan-batch, /enrich/queue, /enrich/status, /enrich/advance, /enrich/process, /enrich/execute, /enrich/research, /enrich/jobs, /query, /wrangler/ingest, /research/*, /osint/*, /operator/console/*, /dq/*, /molt/*, /webhooks/*, etc. Sanity client and handlers live in `src/`; enrichment logic in `src/handlers/enrichment.js`, `src/services/enrichment-service.js`, `src/services/research-pipeline.js`, `src/services/gap-fill-orchestrator.js`.
- **Enrichment pipeline:** Queue creates `enrich.job` in Sanity or falls back to virtual job (KV-backed state). Advance path: POST /enrich/advance calls executeEnrichmentStage (Sanity job) or executeVirtualEnrichmentStage (virtual). Status is read-only. Self-heal and gap-fill run in background on queue/advance.
- **Operator Console:** Next.js app in `apps/operator-console/`; proxies to worker; dashboard, accounts, research, enrichment UI.
- **SDK app:** Sanity DataViewer in `apps/sanity-data-sdk/`; Sanity SDK React, reads from Sanity; enrichment queue/status/advance and diagnostics (worker status, Refresh, Advance step, Run again, Deep research, View research).
- **Cron:** `scheduled()` in index.js runs every 15 min and calls `/enrich/process`. `/enrich/process` calls `processPendingEnrichmentJobs` in enrichment-executor.js.
- **Tests:** Unit tests (Vitest) pass (32 tests). Typecheck and worker dry-run build pass. SDK app build passes.
- **Docs:** Blockers, system-map, validation-report, GPT/YAML update docs exist. Golden path validated for one account (Vercel) with UI advance; validation report notes legacy job cleanup and re-run on a second account.

---

## C) Gaps

1. **Cron does not advance current enrichment jobs.**  
   `processPendingEnrichmentJobs` in `enrichment-executor.js` queries only `_type == "enrichmentJob"` (legacy). Canonical type is `enrich.job`; virtual jobs exist only in KV. So cron never advances `enrich.job` or virtual jobs. Pipeline only moves when the UI calls POST /enrich/advance.

2. **Virtual job final write can still hit Sanity attribute limit.**  
   Blockers doc: oversized historical `accountPack` payloads can reject the final compact write (2000 attribute limit). Mitigations (sanitized research set, no brief auto-save) are in place; some packs may still need cleanup or quarantine before write.

3. **Legacy `enrichmentJob` and stale `enrich.job` records.**  
   Validation report and blockers: legacy docs can make status/job creation brittle for fresh accounts. Cleanup or quarantining of old records would allow consistent behavior for untouched accounts.

4. **Tool stubs.**  
   Several tools return placeholders (wrangler, slack, whisper, summarize, webSearch, memorySearch, calendar, github, etc.). Required for full “product” only if those features are in scope; not blocking enrichment end-to-end.

5. **No automated test for full enrichment flow.**  
   Golden path proven manually; no Playwright or script that queues and advances to completion and asserts on Sanity state.

6. **UPDATE-INSTRUCTIONS.md missing.**  
   README/SETUP reference `UPDATE-INSTRUCTIONS.md` for Custom GPT; file is missing (replaced by CUSTOM-GPT-UPDATE.md and docs/GPT-AND-YAML-UPDATE.md). Link is broken for new users.
