# Blockers

## Active

1. `Sanity document quota exceeded`
   - Where: real `/enrich/queue` requests against the worker.
   - Break: creating `enrichmentJob` and telemetry docs fails with `documentLimitExceededError`.
   - Status: mitigated by deleting telemetry backlog and disabling non-core request logging by default.

2. `Primary account-detail trigger sent the wrong URL`
   - Where: `apps/sanity-data-sdk/src/components/AccountExplorer.tsx`.
   - Break: gap/stage chips sent `https://<accountKey>` instead of the real account URL.
   - Status: fixed in code.

3. `Queued jobs did not reliably advance for the UI loop`
   - Where: `/enrich/queue` + `/enrich/status`.
   - Break: queue created jobs, but the visible UI loop depended on cron or alternate execution paths.
   - Status: fixed by splitting read-only status from explicit `POST /enrich/advance` execution and moving the SDK/account-page polling loop to the explicit advance path.

4. `Execution paths drifted on completion behavior`
   - Where: `enrichment-service` vs `enrichment-executor`.
   - Break: some execution paths stored raw research data without updating account-facing fields.
   - Status: primary loop converged on `executeEnrichmentStage()` because it runs `onEnrichmentComplete()`.

5. `Fresh-account queue depended on creating new job docs`
   - Where: `/enrich/queue` and `getActiveEnrichmentJob()`.
   - Break: untouched accounts could not start because new `enrich.job` creation still tripped Sanity's type attribute ceiling, and stale legacy `enrichmentJob` docs could hijack status reads.
   - Status: partially fixed in code by adding a virtual queue fallback and ignoring legacy `enrichmentJob` records for active execution.

6. `Virtual fallback still hits accountPack type pressure when persisting richer results`
   - Where: `executeVirtualEnrichmentStage()` / `accountPack` persistence.
   - Break: the fresh-account runtime now reaches the virtual path, but later stage writes still trigger `Total attribute/datatype count 2017 exceeds limit of 2000`.
   - Status: in progress; the worker now uses explicit advance, KV-backed virtual progress, sanitized research-set writes, and disables pipeline brief auto-save, but oversized historical `accountPack` payloads can still reject the final compact write and need one more cleanup/quarantine pass.

## Closed

1. `SDK app env error for dashboard worker URL`
   - Where: hosted and local SDK app configuration.
   - Status: previously fixed and redeployed.

2. `Hosted SDK deploy could bundle localhost worker settings`
   - Where: `apps/sanity-data-sdk/package.json` deploy/build scripts plus local `apps/sanity-data-sdk/.env`.
   - Break: production deploys were sourcing local `.env`, so the hosted app could be built with `VITE_WORKER_URL=http://localhost:8787`, causing browser-side `TypeError: Failed to fetch`.
   - Status: fixed by limiting `.env` loading to `npm run dev`; build/deploy now use production defaults and the app was redeployed.

3. `SDK worker client forced preflight-heavy GET requests`
   - Where: `apps/sanity-data-sdk/src/lib/worker-api.ts`.
   - Break: snapshot/status GETs always sent `Content-Type` plus duplicated auth headers, increasing the chance of hosted cross-origin fetch failure.
   - Status: fixed by simplifying GET auth, adding clearer network errors, and redeploying the app and worker.
