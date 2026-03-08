# SDR Command Interface

The SDR command interface is the operator-facing execution surface for the ranked action queue.

Its primary view is:

## TOP ACTIONS TODAY

This view is backed by the nightly priority queue and exposed as a paged list of SDR action rows.

## Row Contract

Each row includes exactly these fields:

- `account`
- `person`
- `action`
- `whyNow`
- `confidence`
- `pattern`
- `draftReady`

In code, the row is `SdrTopActionRow` in `shared/types.ts`.

## Allowed Commands

The SDR can execute only these commands:

- `send_email`
- `call_now`
- `follow_up`
- `research_more`
- `validate_signal`
- `snooze`
- `mark_done`

These are represented by `SdrCommandAction` in `shared/types.ts`.

## Internal vs SDR Actions

The SDR interface is intentionally separate from internal `ActionCandidate.actionType`.

Internal action types:

- `send_email`
- `send_linkedin_message`
- `make_call`
- `create_followup_task`
- `run_targeted_research`

SDR-facing commands:

- `send_email`
- `call_now`
- `follow_up`
- `research_more`
- `validate_signal`
- `snooze`
- `mark_done`

Mapping layer:

- `send_email` → `send_email`
- `make_call` → `call_now`
- `create_followup_task` → `follow_up`
- `run_targeted_research` → `research_more` or `validate_signal` when the row is evidence-light or has validation gaps
- `send_linkedin_message` → `follow_up`

This mapping lives in `src/lib/sdrCommandInterface.ts`.

## Confidence

The interface shows `confidence` as a 0–100 integer:

- If `ActionCandidate.confidence` is stored as `0–1`, it is converted to percent.
- If it is already `0–100`, it is used directly.

## Draft Ready

`draftReady` is `true` when `draftStatus` is one of:

- `ready`
- `drafted`
- `approved`

Otherwise it is `false`.

## Paging / Daily Volume

The interface must support **50–200 actions daily**.

The response/view contract therefore includes:

- `title`
- `generatedAt`
- `totalActions`
- `page`
- `pageSize`
- `hasMore`
- `actions`

Rules:

- default `pageSize` = `50`
- minimum `pageSize` = `50`
- maximum `pageSize` = `200`
- rows remain rank-ordered from the priority queue

This is represented by `SdrTopActionsTodayView` in `shared/types.ts`.

## Data Source

Source of truth:

- `TopActionQueue` from `src/lib/opportunityEngine.ts`

Transformation layer:

- `buildTopActionsTodayView()` in `src/lib/sdrCommandInterface.ts`

The transformation preserves rank ordering and adds the SDR command semantics required by the execution UI.

## Morning Briefing Integration

The nightly pipeline now stores `topActionsToday` inside `operatorDailyBriefing.summaryJson`.

This lets the SDR:

- read a morning briefing summary
- render the exact `TOP ACTIONS TODAY` table
- execute commands against each row without re-deriving UI semantics client-side

## Output Example

```json
{
  "title": "TOP ACTIONS TODAY",
  "generatedAt": "2026-03-08T02:00:00.000Z",
  "totalActions": 126,
  "page": 1,
  "pageSize": 50,
  "hasMore": true,
  "actions": [
    {
      "rank": 1,
      "actionCandidateId": "actionCandidate-123",
      "account": "Acme Corp",
      "person": "Jane Smith",
      "action": "send_email",
      "whyNow": "The account is currently scoring 84/100 for opportunity. Active signals: pricing_page_visit, intent_spike.",
      "confidence": 88,
      "pattern": "scan.execution_ready",
      "draftReady": true,
      "allowedCommands": ["send_email", "call_now", "follow_up", "snooze", "mark_done"]
    }
  ]
}
```

## Files

- `shared/types.ts`
- `src/lib/sdrCommandInterface.ts`
- `src/lib/nightlyIntelligence.ts`
