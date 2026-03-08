# Nightly Intelligence Pipeline

The nightly intelligence pipeline is the batch process that prepares the SDR system for the next morning.

It runs once per night and performs six ordered tasks:

1. Re-score all `ActionCandidate` documents.
2. Decay stale `signal` strength values.
3. Backfill missing entity fields by queueing enrichment work.
4. Detect emerging patterns from the last 24 hours of signals.
5. Generate tomorrow's priority queue.
6. Produce a morning briefing for the operator.

## Run Entry Points

- Manual/API trigger: `POST /analytics/nightly-intelligence`
- Job-runner trigger: queue a `molt.job` with `jobType: "intelligence.nightly"`
- Core implementation: `src/lib/nightlyIntelligence.ts`

## Ordered Steps

### 1. Re-score all ActionCandidates

Function: `rescoreAllActionCandidates()`

- Fetches all accounts, people, action candidates, and signals.
- Re-ranks all action candidates using the existing opportunity engine in `src/lib/opportunityEngine.ts`.
- Writes the latest `opportunityScore` back to each candidate.
- Detects **newly elevated accounts** by looking for accounts whose top candidate crossed the working threshold from below `70` to `70+`.

Why this runs first:

- Every downstream output should reflect the latest ranking state.
- The priority queue and morning briefing both depend on fresh scores.

### 2. Decay stale signals

Function: `decayStaleSignals()`

- Recomputes signal strength from `metadata.baseStrength`, `signalType`, and `timestamp`.
- Uses the existing half-life model in `src/lib/signalIngestion.ts`.
- Updates `signal.strength` and `metadata.decayedStrength` when the change is meaningful.

Why this matters:

- Yesterday's hot signal should not dominate tomorrow's queue.
- Opportunity scoring becomes more reliable when urgency is decayed in batch as well as at ingest time.

### 3. Backfill missing entity fields

Function: `backfillMissingEntityFields()`

- Scans `account` and `person` documents for missing core fields and stale enrichment.
- Queues `enrich.job` records for entities missing critical fields or overdue for refresh.

Current heuristics:

- Accounts: missing `name/companyName`, `domain`, `industry`, or `description`, or stale enrichment.
- People: missing `name`, `title/currentTitle`, `currentCompany`, or `linkedinUrl`, or stale updates.

Why this runs before pattern/briefing consumption:

- The queue for tomorrow is only as good as the entity completeness behind it.

### 4. Detect emerging patterns

Function: `detectEmergingPatterns()`

- Looks at signals from the last 24 hours.
- Groups them by `signalType`.
- Computes:
  - `signalCount`
  - `avgStrength`
  - `accountCount`
  - `weightedScore`
- Stores the result in `molt.pattern` with `patternType: "nightly.emergingPatterns"`.

Why store it:

- Emerging patterns become reusable intelligence, not just one-time console output.
- The morning briefing can reference a stable pattern artifact.

### 5. Generate tomorrow's priority queue

Function: `generateTomorrowPriorityQueue()`

- Uses the freshly rescored candidates to build the top action queue.
- Applies queue rules from the opportunity engine:
  - daily limit
  - max actions per account
  - expiration filtering
- Persists the queue into `molt.metricSnapshot` for auditability and downstream analytics.

Stored artifact:

- `_type: "molt.metricSnapshot"`
- `_id: "molt.metricSnapshot.priorityQueue.<date>"`

### 6. Produce a morning briefing

Function: `produceMorningBriefing()`

- Writes an `operatorDailyBriefing` document with the exact morning sections requested:
  - newly elevated accounts
  - strongest signals
  - patterns detected
  - actions ready

Stored artifact:

- `_type: "operatorDailyBriefing"`
- `_id: "operatorDailyBriefing.<tomorrow-date>"`

## Morning Briefing Shape

The morning briefing is stored in `operatorDailyBriefing.summaryJson` and rendered into `summaryMarkdown`.

### Required sections

#### Newly elevated accounts

Accounts that crossed the overnight elevation threshold because their best action candidate materially improved.

Stored per item:

- `accountRef`
- `accountKey`
- `companyName`
- `previousScore`
- `newScore`
- `strongestDrivers`
- `candidateRef`

#### Strongest signals

Top recent signals by decayed strength.

Stored per item:

- `signalRef`
- `signalType`
- `accountRef`
- `accountName`
- `strength`
- `timestamp`
- `summary`

#### Patterns detected

Emerging signal clusters detected overnight.

Stored per item:

- `key`
- `label`
- `signalCount`
- `avgStrength`
- `accountCount`
- `weightedScore`

#### Actions ready

Top ranked action candidates from tomorrow's queue.

Stored per item:

- `rank`
- `actionCandidateRef`
- `accountRef`
- `accountName`
- `actionType`
- `score`
- `whyNow`

## Output Contract

`runNightlyIntelligencePipeline()` returns a compact execution summary:

- `rescoredCandidates`
- `decayedSignals`
- `backfillJobsQueued`
- `emergingPatterns`
- `queueSize`
- `briefingId`
- `topElevatedAccounts`

## Files

- `src/lib/nightlyIntelligence.ts`
- `src/routes/analyticsNightly.ts`
- `src/lib/opportunityEngine.ts`
- `src/lib/signalIngestion.ts`
- `src/lib/jobs.ts`
- `src/lib/sanity.ts`
- `sanity/schemas/operatorDailyBriefing.ts`

## Scheduling Recommendation

Recommended sequence:

1. Run nightly at a fixed off-hours window, e.g. `02:00 UTC`.
2. Trigger `POST /analytics/nightly-intelligence`.
3. Optionally enqueue `molt.job` with `jobType: "intelligence.nightly"` if you want all scheduled work centralized in the job runner.

## Notes

- The pipeline reuses existing opportunity and signal-decay logic instead of introducing a second scoring system.
- The operator morning briefing is now narrower and more operational than the older `analytics/operator-brief` report.
- `analytics/operator-brief` remains useful for broader retrospective analysis; the nightly pipeline is for next-day prioritization.
