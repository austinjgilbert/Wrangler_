# Next-Stage Delivery Prompt

Use this prompt to drive the next execution phase for the SDK app.

---

You are now acting as the **principal delivery engineer, product QA owner, and implementation lead** for the SDK app in this repository.

Your mission is to take the SDK from its current audited state into a **working, trustworthy, delivery-ready product**.

You are not starting from zero.
You are starting from a partially hardened system that has already been audited, reviewed, and improved.

Your job now is to close the gap between:

- "the app is healthier"
- and
- "the app is actually ready for real usage and confident iteration"

You must treat this as a **delivery phase**, not just another review pass.

## Context You Must Inherit

The following work has already been done:

- SDK audit documented in `docs/SDK-APP-AUDIT-2026-03-13.md`
- Self-review and delivery assessment documented in `docs/SELF-GRADE-RESEARCH-UI.md`
- Worker/env hardening already implemented in:
  - `apps/sanity-data-sdk/src/lib/app-env.ts`
  - `apps/sanity-data-sdk/src/lib/worker-api.ts`
- URL-backed tab persistence already implemented in:
  - `apps/sanity-data-sdk/src/App.tsx`
- Hidden backend auto-advance behavior removed from account gap chips in:
  - `apps/sanity-data-sdk/src/components/AccountExplorer.tsx`
- Accessibility/focus improvement added for one important summary control in:
  - `apps/sanity-data-sdk/src/App.css`
- SDK env helper tests added in:
  - `tests/unit/sdk-app-env.test.ts`

You must build on that work.
Do not redo the same audit from scratch unless needed to validate something specific.

## What Is Still True Right Now

The current state still has meaningful delivery blockers and risks:

1. The hosted SDK app URL returned `404` during audit.
2. Local SDK usage is confusing because direct `http://localhost:3333` access lands in a Sanity auth/wrapper flow.
3. The running local dev session must be restarted to pick up the latest env/config changes.
4. The core user workflow is still under-tested.
5. `AccountExplorer` remains too large and too risky as a single unit.
6. Research/job progress is still not sufficiently self-explanatory for a human operator.
7. Dashboard counts remain sampled rather than authoritative.

Your job is to move this from **improved** to **delivery-ready**.

## Primary Objective

Take the SDK app through the next stage to delivery by doing the following:

1. restore a real working runtime path for the SDK
2. verify hosted and/or local usable entrypoints
3. harden the primary user workflow end-to-end
4. improve the highest-risk UX and architecture issues still remaining
5. add the minimum high-value automated test coverage required for confidence
6. produce a final delivery report with:
   - what is now working
   - what was fixed
   - what still remains
   - what is blocked on human action

## Delivery Definition

You should consider this phase successful only if all of the following are true:

1. A human can open the SDK through a valid runtime path.
2. A human can navigate to an account.
3. A human can run research.
4. A human can understand research status and outcome.
5. The primary workflow is protected by automated tests where practical.
6. The system is more maintainable than before, not less.

## Order of Operations

Follow this order unless runtime reality forces a better one.

### Phase 1: Re-establish Runtime Truth

You must first determine the actual usable runtime path for the SDK.

Tasks:
- inspect `apps/sanity-data-sdk/sanity.cli.ts`
- inspect any deployment/runtime settings related to the Sanity hosted app
- verify whether the hosted SDK app is still `404`
- restart the local SDK dev environment if needed so current `.env` changes take effect
- determine the real human-usable local entry path through Sanity
- document the correct local and hosted access paths

If hosted deployment is broken, fix it if possible from this repo/workflow.
If it cannot be fixed without external credentials or dashboard action, clearly identify that as human action.

### Phase 2: Validate the Primary Product Workflow

You must execute the main user journey as if you are the end user:

1. open the SDK
2. land on the right tab or navigate to it
3. open `Accounts`
4. select an account
5. understand the account page
6. run research
7. observe queue/progress/status
8. inspect results or research output
9. confirm the user knows what happened

For each step determine:
- expected behavior
- actual behavior
- gaps in clarity
- data disconnects
- required fixes

### Phase 3: Fix the Highest-Risk Remaining Issues

Prioritize these areas:

#### P1
- hosted/runtime access
- broken or unclear research workflow
- misleading status/state communication
- missing recovery or retry guidance
- missing runtime verification after env/config hardening

#### P2
- `AccountExplorer` maintainability risk
- lack of test protection for the main workflow
- dashboard truthfulness issues
- queue/account panel clarity

#### P3
- copy polish
- secondary view cleanup
- broader accessibility improvement

## Architecture and Refactor Expectations

Do not refactor for vanity.
Refactor only where it improves delivery confidence.

You should strongly consider splitting `apps/sanity-data-sdk/src/components/AccountExplorer.tsx` into smaller units if doing so will:

- reduce regression risk
- make testing easier
- isolate research controls from account rendering
- separate data loading concerns from presentation concerns

If you do refactor, keep it practical and incremental.

## Testing Requirements

You must add the highest-value missing tests that protect delivery.

At minimum, evaluate and implement the most practical tests for:

1. SDK app tab persistence in `apps/sanity-data-sdk/src/App.tsx`
2. worker config / runtime safety in `apps/sanity-data-sdk/src/lib/app-env.ts` and `apps/sanity-data-sdk/src/lib/worker-api.ts`
3. research queue/status behavior in:
   - `apps/sanity-data-sdk/src/components/EnrichmentView.tsx`
   - `apps/sanity-data-sdk/src/components/AccountExplorer.tsx`

You may introduce component/unit test infrastructure if needed, but prefer the smallest stable setup that provides real value.

Do not add superficial tests.
Add tests that protect the workflow most likely to break delivery.

## UX Standard

At every step ask:

- does the user know where they are?
- does the user know what to click next?
- does the user understand what “Run research” actually did?
- does the user trust the displayed status?
- does the user know whether they should wait, refresh, rerun, or investigate?
- is the UI asking the user to infer too much?

If the answer is yes, fix it.

## Required Outputs

You must produce and execute against the following:

### 1. Discovery Update
Short update on:
- actual runtime path
- hosted status
- local status
- blockers discovered

### 2. Delivery Fix Plan
Prioritized by:
- issue
- severity
- root cause
- proposed fix
- files to change
- tests to add

### 3. Implementation
Implement the highest-value fixes directly.

### 4. Verification
Run:
- relevant builds
- relevant tests
- any runtime/manual checks needed for confidence

### 5. Final Delivery Report
Include:
- what now works
- what was fixed in code
- what was verified
- what still remains risky
- what requires human action

## Human Action Rule

Only ask for human input if absolutely necessary.

Use this exact format:

HUMAN ACTION REQUIRED:
[precise item needed]
[why it is required]

Examples:
- hosted Sanity deployment must be re-triggered from dashboard
- missing deployment credential
- missing app permission in Sanity
- external env var not available locally

If human action is not strictly necessary, proceed.

## Delivery Mindset

You are no longer primarily auditing.
You are now responsible for getting this over the line.

That means:

- restore runtime truth
- close the main workflow
- add the right test coverage
- reduce operator confusion
- reduce maintainer risk
- leave behind a clearer, more trustworthy SDK

Do not stop after identifying issues.
Do not stop after making a plan.
Do not stop after one or two code fixes.

Drive the SDK to the next stage of delivery.

