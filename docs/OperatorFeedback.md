# OperatorFeedback System Design

OperatorFeedback captures outcome-bearing SDR actions on action candidates so the system can learn from sends, edits, ignores, correctness flags, and meetings booked.

## When We Capture Feedback

| SDR action | `feedbackType` | Meaning |
|------------|----------------|--------|
| Sends a draft (no edit) | `sent_draft` | Draft was good enough to send as-is; positive signal. |
| Edits then sends | `edited_draft` | Draft needed changes; operator edit text is stored for prompt retraining. |
| Ignores the action | `ignored_action` | Candidate was not acted on; weak negative signal. |
| Marks something incorrect | `marked_incorrect` | Strong negative; evidence or angle was wrong. |
| Books a meeting | `booked_meeting` | Strong positive outcome; pattern and signals reinforced. |

## Storage: OperatorFeedback

Stored as Sanity document type `operatorFeedback`.

| Field | Type | Description |
|-------|------|-------------|
| `actionCandidateId` | string | ID of the action candidate (Sanity `_id`). |
| `feedbackType` | string | One of: `sent_draft`, `edited_draft`, `ignored_action`, `marked_incorrect`, `booked_meeting`. |
| `operatorEdit` | text (optional) | For `edited_draft`: the SDR’s edited copy used to retrain tone/phrasing. |
| `timestamp` | datetime | When the feedback was recorded (ISO 8601). |
| `outcome` | string (optional) | Free-text outcome (e.g. "meeting scheduled", "no reply"). |

Schema: `sanity/schemas/operatorFeedback.ts`  
Types: `shared/types.ts` (`OperatorFeedback`, `OperatorFeedbackType`)

## Implemented Functions

### 1. `recordFeedback(env, input)`

**Role:** Single entry point for recording SDR feedback.

- Validates that the action candidate exists (by `actionCandidateId`).
- Builds an `OperatorFeedback` document and persists it via `createOperatorFeedback`.
- Updates the action candidate’s state from feedback (e.g. `draftStatus`, `lifecycleStatus`).
- Calls `updateSignalWeights`, `updatePatternStrength`, and `retrainDraftPrompts`.
- Writes learning artifacts (`learning`, `userPattern`) for downstream use.

**Input:** `{ actionCandidateId, feedbackType, operatorEdit?, timestamp?, outcome? }`

**Location:** `src/lib/operatorFeedback.ts`

---

### 2. `updateSignalWeights(env, { actionCandidate, feedback, signals? })`

**Role:** Adjust per-signal-type weights based on feedback outcome.

- Loads or creates the `molt.pattern` with `patternType: 'operator.signalWeights'`.
- Applies a delta per `feedbackType` (e.g. positive for `booked_meeting`/`sent_draft`, negative for `ignored_action`/`marked_incorrect`).
- Updates weights for each signal type attached to the action candidate (clamped e.g. 0.4–1.6).
- Persists updated weights and counters in the pattern’s `successStats`.

**Location:** `src/lib/operatorFeedback.ts`

---

### 3. `updatePatternStrength(env, { actionCandidate, feedback })`

**Role:** Update strength of the pattern that produced the candidate.

- Loads or creates the `molt.pattern` with `patternType: 'operator.patternStrength'`.
- Keyed by `actionCandidate.patternMatch` (e.g. `scan.execution_ready`).
- Adjusts score by feedback delta; stores count and last outcome.
- Used so the opportunity engine can favor patterns that lead to sends/meetings and deprioritize those that get ignored or marked incorrect.

**Location:** `src/lib/operatorFeedback.ts`

---

### 4. `retrainDraftPrompts(env, { actionCandidate, feedback })`

**Role:** Feed feedback into Moltbot config so future drafts improve.

- Loads latest `moltbot.config`.
- **Tone rules:** e.g. from `edited_draft` (operator edit text), `booked_meeting` (concise, business-relevant), `marked_incorrect` (avoid unverified claims).
- **Operating rules:** e.g. favor action type when pattern + signals led to send/meeting; de-prioritize when ignored; require stronger evidence when marked incorrect.
- Appends new rules (with cap) and patches the config.

**Location:** `src/lib/operatorFeedback.ts`

## API

**POST /molt/feedback**

Body (JSON):

```json
{
  "actionCandidateId": "<action candidate _id>",
  "feedbackType": "sent_draft",
  "operatorEdit": "optional for edited_draft",
  "outcome": "optional free text"
}
```

`timestamp` defaults to server time if omitted. Same auth as other `/molt/*` routes (e.g. `MOLT_API_KEY` when set).

## Data Flow

1. **Frontend / SDR tool** records an SDR action → `POST /molt/feedback` with `actionCandidateId` and `feedbackType` (and optional `operatorEdit`/`outcome`).
2. **recordFeedback** creates the OperatorFeedback doc and updates the action candidate.
3. **updateSignalWeights** and **updatePatternStrength** update `molt.pattern` documents used by the opportunity engine and ranking.
4. **retrainDraftPrompts** updates `moltbot.config` so the drafting engine produces better drafts over time.
5. **Learning / userPattern** records are written for analytics and future ML or rule refinement.

## Related Code

- **Action candidate schema:** `sanity/schemas/actionCandidate.ts`
- **Sanity helpers:** `createOperatorFeedback`, `fetchActionCandidateById`, `updateActionCandidate`, `fetchSignalsForActionCandidate`, `fetchPatternByType`, `upsertMoltPattern`, `fetchLatestMoltbotConfig`, `updateMoltbotConfig`, `createLearningRecord`, `createUserPatternRecord` in `src/lib/sanity.ts`
- **Types:** `OperatorFeedback`, `OperatorFeedbackType`, `ActionCandidate`, `SignalEvent` in `shared/types.ts`
