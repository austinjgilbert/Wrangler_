# Superuser Interface

The Superuser interface is the control plane for the SDR intelligence system.

It is designed for a human operator who needs to override scoring behavior, inject new strategic direction, and force the system to reinterpret existing data without waiting for the normal learning loop.

## Required Capabilities

The interface supports these commands:

- adjust signal weights
- add patterns
- trigger re-analysis
- inspect weak data
- inject strategy updates
- re-rank actions

## Interface Shape

### `GET /analytics/superuser`

Returns the current Superuser state:

- `title: "SUPERUSER"`
- `capabilities`
- `actionsToday`
- `weakData`
- `latestStrategyUpdateAt`

### `POST /analytics/superuser/command`

Executes one command at a time.

Body shape:

```json
{
  "command": "inject_strategy_updates",
  "title": "Q2 enterprise push",
  "operatingRules": [
    "Prioritize enterprise buying committees over single-thread outreach."
  ],
  "toneRules": [
    "Lead with business risk reduction, not feature inventory."
  ],
  "values": [
    "Proof over hype"
  ],
  "accountRefs": ["account-123"],
  "note": "Shift near-term emphasis to enterprise expansion motions."
}
```

## Capabilities

### 1. Adjust signal weights

Command: `adjust_signal_weights`

Purpose:

- Directly override the relative influence of signal types on ranking.

Storage:

- Updates `molt.pattern` with `patternType: "operator.signalWeights"`

Example payload:

```json
{
  "command": "adjust_signal_weights",
  "weights": {
    "pricing_page_visit": 1.4,
    "intent_spike": 1.2,
    "job_posting": 0.6
  },
  "note": "Temporarily bias toward active buying intent."
}
```

### 2. Add patterns

Command: `add_pattern`

Purpose:

- Inject a new hand-authored pattern before the system discovers it organically.

Storage:

- Creates or updates `molt.pattern` with `patternType: "superuser.custom.<key>"`

Example payload:

```json
{
  "command": "add_pattern",
  "patternKey": "enterprise-buying-committee",
  "summary": "Multiple senior stakeholders plus pricing activity indicates a coordinated buying motion.",
  "conditions": {
    "signals": ["pricing_page_visit", "intent_spike"],
    "personaMix": ["vp", "director"]
  },
  "recommendedMoves": [
    "Prioritize multi-thread outreach.",
    "Generate risk-focused draft copy."
  ]
}
```

### 3. Trigger re-analysis

Command: `trigger_reanalysis`

Purpose:

- Force the system to reinterpret current entity state instead of waiting for the next inbound signal or nightly run.

Behavior:

- Queues `action-candidate.generate` jobs for target accounts.
- Queues `enrich.job` records for target people.

Example payload:

```json
{
  "command": "trigger_reanalysis",
  "accountRefs": ["account-123", "account-456"],
  "personRefs": ["person-123"]
}
```

### 4. Inspect weak data

Command: `inspect_weak_data`

Purpose:

- Surface weak evidence and sparse records that undermine good ranking or drafting.

Weak-data buckets:

- low-confidence action candidates
- accounts with poor completeness
- people missing title/company/LinkedIn
- signals with very low strength

Example payload:

```json
{
  "command": "inspect_weak_data",
  "limit": 25
}
```

### 5. Inject strategy updates

Command: `inject_strategy_updates`

Purpose:

- Push a deliberate strategic shift into the system immediately.

This updates:

- `moltbot.config.operatingRules`
- `moltbot.config.toneRules`
- `moltbot.config.values`

It also writes an audit trail strategy brief:

- `_type: "molt.strategyBrief"`

#### Automatic triggers

A strategy update automatically triggers all three downstream actions:

1. **Entity reinterpretation**
   - queues re-analysis for the affected accounts
   - ensures current entities are re-read through the new strategy lens

2. **Draft regeneration**
   - regenerates top email drafts for the affected action candidates
   - stores them in `gmailDraft`

3. **Priority recalculation**
   - re-scores and re-ranks action candidates
   - rebuilds `TOP ACTIONS TODAY`

This is the key design rule for the Superuser surface:

**Strategy is not passive configuration. Strategy changes immediately propagate into interpretation, draft output, and priority order.**

### 6. Re-rank actions

Command: `rerank_actions`

Purpose:

- Recalculate the queue without changing the underlying strategy configuration.

Behavior:

- re-scores action candidates
- rebuilds tomorrow’s queue
- returns `topActionsToday`

Example payload:

```json
{
  "command": "rerank_actions",
  "dailyLimit": 100,
  "maxPerAccount": 3,
  "page": 1,
  "pageSize": 50
}
```

## TOP ACTIONS TODAY Relationship

The Superuser interface reuses the SDR command interface rather than inventing another list format.

Returned action view:

- `SdrTopActionsTodayView`

This means the Superuser can inspect the exact same action surface the SDR sees after any control-plane change.

## Auditability

Every Superuser mutation writes an audit event:

- `molt.event`

Key event types:

- `superuser.adjust_signal_weights`
- `superuser.add_pattern`
- `superuser.trigger_reanalysis`
- `superuser.inject_strategy_updates`
- `superuser.rerank_actions`

Strategy updates also write a metric snapshot summarizing the cascade:

- reinterpretation
- draft regeneration
- priority recalculation

## Files

- `shared/types.ts`
- `src/lib/superuserInterface.ts`
- `src/routes/superuser.ts`
- `src/lib/sdrCommandInterface.ts`
- `src/lib/nightlyIntelligence.ts`
