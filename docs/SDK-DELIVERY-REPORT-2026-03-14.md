# SDK Delivery Report

Date: 2026-03-14
Scope: `apps/sanity-data-sdk`

## Discovery Update

### Actual runtime path
- Local dev server was restarted and is now running on `http://localhost:3334`.
- The human-usable local entry path is the Sanity wrapper URL printed by `sanity dev`:
  - `https://www.sanity.io/@of8nbhG8g?dev=http%3A%2F%2Flocalhost%3A3334`
- Direct `http://localhost:3334` access in a fresh browser context still redirects to Sanity login, so the wrapper URL remains the correct path for real usage.

### Hosted status
- `npm run deploy` for `apps/sanity-data-sdk` succeeded.
- The direct hostname `https://fhba58obwhfounyb1893q6ea.sanity.studio/` still returns `404`, so that standalone URL is not the correct access path for this custom app.
- The Sanity app route remains the valid hosted path pattern:
  - `https://www.sanity.io/@of8nbhG8g/studio/mp0a9q411nmg41051upk14rc/dataview/structure`
- In the signed-in browser session, that route loaded and the SDK issued live Sanity data queries successfully.

### Local status
- Local SDK runtime is working through the Sanity wrapper path.
- The app now connects to Sanity successfully after restart.
- Browser network logs show live queries for:
  - `account`
  - `person`
  - `signal`
  - `actionCandidate`
  - `enrich.job`

### Blockers discovered
- The `.sanity.studio` hostname still appears broken or irrelevant for this custom app deployment model.
- Browser automation cannot fully click through the embedded app UI because the Sanity wrapper limits accessible tree visibility.
- Direct local access is still auth-mediated, so the wrapper URL must be treated as the supported local runtime path.

## Delivery Fixes Implemented

### Runtime and deployment
- Restarted local SDK dev runtime.
- Re-deployed the SDK app with `npm run deploy`.
- Re-validated local and hosted paths.

### Workflow clarity
- Added automatic refresh for active research jobs in `apps/sanity-data-sdk/src/components/EnrichmentView.tsx`.
- Added guidance copy telling users that running jobs refresh automatically and that manual refresh/advance is for stuck jobs.

### Maintainability
- Extracted SDK view parsing into `apps/sanity-data-sdk/src/lib/view-state.ts`.
- Extracted research/job state helpers into `apps/sanity-data-sdk/src/lib/research-jobs.ts`.
- Updated `apps/sanity-data-sdk/src/App.tsx` and `apps/sanity-data-sdk/src/components/EnrichmentView.tsx` to use those helpers.

### Test coverage
- Added `tests/unit/sdk-view-state.test.ts`.
- Added `tests/unit/sdk-research-jobs.test.ts`.
- Existing SDK env tests remain in `tests/unit/sdk-app-env.test.ts`.

## Verification

### Commands run
- `npm run dev` in `apps/sanity-data-sdk` after restart
- `npm run deploy` in `apps/sanity-data-sdk`
- `npm run test:unit`
- `npm run check` in `apps/sanity-data-sdk`
- `curl -I https://fhba58obwhfounyb1893q6ea.sanity.studio/`
- `curl -I https://www.sanity.io/@of8nbhG8g/studio/mp0a9q411nmg41051upk14rc/dataview`
- Browser validation against the signed-in Sanity route and local dev wrapper URL

### What now works
- The SDK has a valid local runtime path through the Sanity wrapper.
- The signed-in Sanity route is a working hosted/runtime path shape.
- The app issues live Sanity queries in the browser after restart.
- Active research jobs now auto-refresh in the jobs view.
- SDK helper/state behavior is covered by unit tests.

### Test/build status
- Unit tests: `45` passing.
- SDK build: passing.
- Lint diagnostics on changed files: clean.

## Remaining Risks

1. `AccountExplorer` is still too large and remains the biggest maintainability risk.
2. We still do not have true UI-level browser tests for:
   - open app
   - open account
   - run research
   - inspect result
3. Dashboard counts are still sampled from capped list queries rather than authoritative totals.
4. The `.sanity.studio` hostname still returns `404`, which may confuse anyone expecting a standalone deployed host.

## What Requires Human Action

No human action was strictly required for this pass.

If the product requirement is specifically “standalone public URL outside the Sanity route,” then a product/deployment decision is needed because the actual usable path currently appears to be the authenticated Sanity route rather than the `.sanity.studio` hostname.

## Recommended Next Step

The next highest-value step is:

1. Refactor `apps/sanity-data-sdk/src/components/AccountExplorer.tsx` into smaller data/UI units.
2. Add UI-level test coverage for the account -> research workflow.
3. Replace sampled dashboard metrics with authoritative counts or clearly labeled sampled metrics.
