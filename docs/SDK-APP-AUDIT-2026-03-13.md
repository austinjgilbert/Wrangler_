# SDK App Audit

Date: 2026-03-13
Scope: `apps/sanity-data-sdk`
Role: Principal QA engineer, product engineer, UX systems auditor

## Phase 1: Discovery Report

### Architecture summary
- The SDK app is a Sanity custom app, not a standalone SPA route tree. Entry is `apps/sanity-data-sdk/src/App.tsx` and deployment/dev wiring lives in `apps/sanity-data-sdk/sanity.cli.ts`.
- Navigation is tab state inside one shell: `Dashboard`, `Accounts`, `Research`, `Activity`, `People`, `Technologies`.
- Most data is read directly from Sanity via `@sanity/sdk-react`.
- Research actions call the Worker through `apps/sanity-data-sdk/src/lib/worker-api.ts`.
- The highest-risk screen is `apps/sanity-data-sdk/src/components/AccountExplorer.tsx`, which combines account search, detail projection, coverage views, linked entities, and research actions.

### Major workflows identified
1. Open the SDK app through the Sanity shell.
2. Land on `Dashboard` and assess dataset health.
3. Open `Accounts`, select an account, inspect coverage and related records.
4. Run research from the account action bar or from a missing-data chip.
5. Open `Research` to inspect jobs, refresh status, advance a job, rerun, or open research output.
6. Browse `Activity`, `People`, and `Technologies` as read-only supporting views.

### Pages and modules found
- `DashboardView`: summary cards, recent jobs, recent signals.
- `AccountExplorer`: account list, detail panel, coverage summary, missing-data chips, CRM contacts, tree/graph modes.
- `EnrichmentView` now presented as Research: recent jobs, live job controls, queue-by-account.
- `ActivityView`: signals and interactions.
- `PeopleListView`: people cards.
- `TechnologiesListView`: technology cards.

### Existing test infrastructure
- Root `vitest` unit tests cover Worker/service logic only by default.
- Root `playwright` coverage targets Worker endpoints, not the SDK app shell.
- `apps/sanity-data-sdk` had no test coverage before this audit.
- CI currently runs root build, root unit tests, and root typecheck. It does not run SDK-specific UI tests.

### Known risks before implementation
- Direct `http://localhost:3333` access redirected to Sanity login instead of showing the app.
- The deployed app URL `https://fhba58obwhfounyb1893q6ea.sanity.studio/` returned `404`.
- Browser audit showed `TypeError: network error` inside the SDK shell before fixes.
- The app previously defaulted to a live worker URL and shipped a placeholder API key value, which made misconfiguration look valid.

## Phase 2: Audit Log

### Runtime shell / app access

| Severity | Area | Finding | Evidence | Recommended fix | Status |
|---|---|---|---|---|---|
| BLOCKER | Access | Hosted app URL returns `404`, so hosted usage is broken. | Browser request to `https://fhba58obwhfounyb1893q6ea.sanity.studio/` returned `404`. | Re-deploy or repair Sanity app hosting config. | Open |
| HIGH | Access | Direct `http://localhost:3333` access redirects to Sanity login, which is confusing for local QA unless the operator already knows the wrapper URL. | Browser navigation landed on `https://www.sanity.io/login?...origin=http://localhost:3333`. | Document the correct dev entry path and make config errors clearer inside the app. | Partially mitigated |
| HIGH | Connectivity | SDK shell showed `TypeError: network error` during runtime. | Browser console on Sanity shell showed `TypeError: network error` from the SDK app bundle. | Harden worker config handling and remove misleading defaults/placeholders. | Mitigated in code; needs fresh dev session verification |

### Page-by-page findings

#### Dashboard
- Intended goal: quick system health check.
- What works:
  - Build compiles.
  - Sanity-backed cards/jobs/signals are structurally coherent.
- What is confusing or risky:
  - MEDIUM: count cards use capped `batchSize` reads, so large datasets can look complete when they are only partially loaded.
  - LOW: wording mixed “DataViewer” and older intelligence terminology in some adjacent views.
- Recommended follow-up:
  - Replace capped list length with explicit count queries or label the cards as sampled counts.

#### Accounts
- Intended goal: find an account, inspect coverage, trigger research.
- What works:
  - Rich detail projection, searchable list, tree/graph switch, linked records, coverage summary.
- What is broken or risky:
  - HIGH: each sidebar row does its own `useDocumentProjection()`, which is an N+1 query pattern and will degrade with dataset size.
  - HIGH: missing-data chips previously advanced backend jobs every 2 seconds behind a tiny chip control, which hid consequential system behavior from the user.
  - MEDIUM: “View full details” summary row was a clickable `div`, not a keyboard-friendly control.
- Recommended follow-up:
  - Replace per-row projections with a cheaper list projection.
  - Keep backend mutation in explicit job controls, not passive chips.
  - Preserve keyboard-accessible controls everywhere.

#### Research
- Intended goal: inspect jobs, queue jobs, rerun or advance them, open output.
- What works:
  - Worker health endpoint is live.
  - `GET /enrich/status` on the live worker returned a valid response.
- What is confusing or risky:
  - HIGH: queue/account messaging still mixed “research” and “enrichment” language before this audit.
  - MEDIUM: queue-by-account only loads a small recent slice of accounts, not the full set.
  - MEDIUM: manual “Advance step” exists, but background progression semantics are not obvious to a human user.
- Recommended follow-up:
  - Keep wording consistent as “Research”.
  - Make partial-list behavior explicit or support search/filter in the queue panel.
  - Explain when a user should wait, rerun, or manually advance.

#### Activity
- Intended goal: browse recent signals and interactions.
- What works:
  - Read-only layout is straightforward.
- What is risky:
  - LOW: repeated `(doc as any)` casts weaken confidence in the displayed shape and make the view easier to regress.

#### People / Technologies
- Intended goal: browse supporting entities.
- What works:
  - Simple, understandable card layouts.
- What is confusing:
  - LOW: eyebrow labeling was inconsistent with the rest of the SDK shell.

### Workflow-by-workflow findings

| Severity | Workflow | Entry point | Expected result | Actual result | Recommended fix | Status |
|---|---|---|---|---|---|---|
| HIGH | Open app locally | Sanity local dev | App should load with clear state and no deceptive defaults | Access path is wrapper-specific; direct localhost redirects to login | Improve docs and remove misleading worker defaults | Partially fixed |
| HIGH | Queue research from account gaps | Accounts > missing data chip | Queue research and show honest status | Chip previously mutated backend state repeatedly instead of only observing status | Poll status only from chip; keep active mutation in job controls | Fixed |
| MEDIUM | Share or revisit a specific tab | Any tab in app shell | User should return to the same screen after refresh/back | Tab choice was lost on refresh/back | Persist selected view in URL query string | Fixed |
| MEDIUM | Open research summary details | Accounts > Research summary row | Mouse and keyboard users should both be able to open details | Control was a clickable `div` | Convert to button and add focus styles | Fixed |
| HIGH | Configure worker access | `.env` / `.env.example` | Invalid config should fail clearly | Placeholder API key and implicit worker defaults looked valid | Strip placeholders, require explicit worker URL, explain https shell rule | Fixed |

### UX issues
- HIGH: hidden job mutation behind a chip control eroded user trust.
- MEDIUM: lack of persistent tab state made the app feel ephemeral and hard to share.
- MEDIUM: configuration failures were too easy to trigger and too hard to interpret.
- LOW: naming drift remained in several smaller views.

### Architecture issues
- HIGH: `AccountExplorer` is doing too much in one component and mixes list logic, deep projection logic, modal state, and job actions.
- HIGH: per-row projection in the account list creates unnecessary request volume.
- MEDIUM: dashboard metrics are sampled rather than authoritative.
- MEDIUM: SDK test surface was effectively absent for its own env/config logic.

### Testing gaps
- No SDK component or browser tests.
- No CI gate that exercises the SDK app.
- No tests around env safety or worker config behavior before this audit.
- No protection against regressions in tab persistence or job-control UX.

## Phase 3: Prioritized Fix Plan

### P1
1. Worker config safety
   - Root cause: misleading defaults and placeholder values.
   - Fix: sanitize worker URL/API key, require explicit worker URL, explain https shell restrictions.
   - Files: `src/lib/app-env.ts`, `src/lib/worker-api.ts`, `.env`, `.env.example`, `README.md`
   - Tests: unit tests for config helpers.

2. Hidden backend mutation from gap chips
   - Root cause: `GapChip` called `advanceEnrichment()` in an interval.
   - Fix: queue once, then poll status only.
   - Files: `src/components/AccountExplorer.tsx`
   - Tests: future component test for queued/running/failed states.

3. Tab persistence
   - Root cause: local `useState` only, no URL persistence.
   - Fix: sync selected view to `?view=` and restore on refresh/back.
   - Files: `src/App.tsx`
   - Tests: future component test for initial query-param selection and popstate.

### P2
4. Keyboard-accessible detail controls and focus styling
   - Root cause: non-semantic clickable containers.
   - Fix: convert to button and add focus-visible styles.
   - Files: `src/components/AccountExplorer.tsx`, `src/App.css`

5. Copy consistency
   - Root cause: mixed “enrichment” vs “research” wording.
   - Fix: normalize user-facing labels.
   - Files: `src/App.tsx`, `src/components/EnrichmentView.tsx`, `src/components/DashboardView.tsx`, `src/components/PeopleListView.tsx`, `src/components/TechnologiesListView.tsx`

### P3
6. Performance and data-accuracy improvements
   - Root cause: N+1 list projections and capped count cards.
   - Fix: refactor list projection strategy and add count-safe data access.
   - Files: `src/components/AccountExplorer.tsx`, `src/components/DashboardView.tsx`
   - Tests: future integration tests and performance profiling.

## Phase 4: Implementation Completed

### Code fixes shipped in this audit
- Hardened worker configuration in `src/lib/app-env.ts`.
- Hardened worker client guards in `src/lib/worker-api.ts`.
- Added URL-backed tab persistence in `src/App.tsx`.
- Removed hidden backend advancement from account gap chips in `src/components/AccountExplorer.tsx`.
- Converted the research summary details trigger into a real button and added focus-visible styles in `src/App.css`.
- Normalized research wording in the SDK shell and key views.
- Cleaned the duplicate canonical-url fallback in `src/components/EnrichmentView.tsx`.
- Removed placeholder SDK API keys from `.env` and `.env.example`.
- Updated the SDK README to document the https Sanity shell constraint.

### Tests added
- `tests/unit/sdk-app-env.test.ts`
  - Placeholder key stripping
  - Worker URL normalization
  - Missing config messaging
  - https shell + insecure worker warning
  - secure worker acceptance

## Phase 5: Verification

### Commands run
- `npm run test:unit`
- `npm run check` in `apps/sanity-data-sdk`
- Live worker checks:
  - `curl https://website-scanner.austin-gilbert.workers.dev/health`
  - `curl "https://website-scanner.austin-gilbert.workers.dev/enrich/status?accountKey=test-account"`

### Results
- Unit tests: passed (`37` tests).
- SDK build: passed.
- Lint diagnostics for edited files: no issues.
- Live worker health: reachable and operational.
- Live enrich status endpoint: reachable and returned a valid status payload.

### Remaining risks
- Hosted SDK URL still returned `404` during audit and needs deployment/config attention.
- Browser automation can see the Sanity shell but not the embedded app contents directly, so true click-by-click visual verification remains partially constrained by the shell/iframe environment.
- No browser automation or component tests yet protect the primary user flows.
- Dashboard counts remain sampled, not authoritative.
- Account sidebar still uses per-item projections and may degrade at scale.

### Recommended next steps
1. Re-deploy or repair the hosted Sanity app and verify the production URL end-to-end.
2. Restart the local SDK dev server so the updated `.env` is picked up.
3. Add component/browser tests for:
   - opening with `?view=accounts`
   - queueing research
   - status/error display
   - account coverage details
4. Refactor `AccountExplorer` into smaller data and UI units.
