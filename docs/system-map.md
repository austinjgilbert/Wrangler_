# System Map

## Runtime Surfaces

- `apps/sanity-data-sdk`: primary operator UI for browsing accounts and triggering enrichment.
- `src/index.js`: Cloudflare Worker entrypoint and route dispatcher.
- `src/handlers/enrichment.js`: worker handlers for `/enrich/queue`, `/enrich/status`, `/enrich/execute`, `/enrich/process`.
- `src/services/enrichment-service.js`: canonical enrichment job state, stage execution, research-set persistence.
- `src/services/research-pipeline.js`: pipeline stage definitions and per-stage execution.
- `src/services/gap-fill-orchestrator.js`: post-enrichment account updates and Content OS shaping.
- `sanity/schemas/accountAssumed.ts`, `sanity/schemas/accountPack.ts`, `sanity/schemas/enrichmentJob.ts`: persisted data structures used by the golden path.

## Golden Path

1. User opens an account in `apps/sanity-data-sdk/src/components/AccountExplorer.tsx`.
2. User clicks a gap/stage chip in the account detail panel.
3. `queueEnrichment()` posts to `/enrich/queue` with `accountId`, `accountKey`, and the account's real `canonicalUrl`.
4. Worker stores or reuses an `enrichmentJob` document.
5. UI polls `/enrich/status?accountKey=...&advance=1`.
6. Each status poll advances one real pipeline stage through `executeEnrichmentStage()`.
7. When the pipeline completes, the worker stores `accountPack.payload.researchSet` and runs `onEnrichmentComplete()`.
8. `onEnrichmentComplete()` updates the `account` document with `profileCompleteness`, `classification`, `lastEnrichedAt`, technologies, leadership, pain points, benchmarks, and competitors.
9. The SDK app re-reads Sanity data for the same account and renders the updated result.

## Core Entities

- `account`: canonical company/entity record shown in the UI.
- `accountPack`: raw enrichment payload and stored `researchSet`.
- `enrichmentJob`: progress-tracking document for the pipeline.
- `technology`, `person`, `crawl.snapshot`, `signal`: related entities linked into the account view.
