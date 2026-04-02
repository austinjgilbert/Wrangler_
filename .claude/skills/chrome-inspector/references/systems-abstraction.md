# Chrome Inspector → Prospect 360: Systems Abstraction

## 1. Capability Inventory

### 1a. What Exists Today

**13 files, ~8,630 lines, ~260KB of reference code on disk:**

| Asset | Type | Lines | Reusable Pattern |
|-------|------|-------|------------------|
| `SKILL.md` | Skill instructions | 1,168 | Skill authoring pattern — 18-part structured skill with commands, config, error handling, profile mgmt |
| `scan_page.py` | Python extraction pipeline | 1,182 | **Page intelligence pattern** — URL classification → DOM extraction → field normalization → gap analysis |
| `fusion_engine.py` | Python fusion engine | 923 | **Multi-source consensus pattern** — trust tiers, confidence scoring, conflict resolution, field-level fusion |
| `ingestion_adapters.py` | Source normalization | 1,116 | **Adapter pattern** — 8 source-specific transformers that normalize any MCP output into a standard signal schema |
| `entity_resolver.py` | Entity resolution | 679 | **Entity matching pattern** — multi-strategy resolution (domain, email, name, SF ID), dedup detection, account-contact linkage |
| `llm_query_tools.py` | GROQ query tools | 691 | **LLM query interface pattern** — 10 intent-driven query templates with parameter injection, tool registry, dispatcher |
| `notification_pipeline.py` | Slack notifications | 603 | **Event notification pattern** — 7 event types, config-driven filtering, mrkdwn formatting, draft vs direct routing |
| `e2e_test.py` | Integration test | 440 | **Pipeline test pattern** — 7-source simulation through full pipeline with 8 validation phases |
| `integrations.ts` | MCP integration mappings | 561 | **Integration registry pattern** — Sanity/CommonRoom/Slack tool signatures, field mappings, error handling |
| `page-classifier.ts` | URL classification rules | 132 | **Rule-based classification pattern** — URL regex + content signals → page type |
| `account-schema.ts` | Sanity schema types | 233 | **Confidence-wrapped schema pattern** — every field in `confidenceField` wrapper with source tracking |
| `profile-store.ts` | Local JSON storage | 176 | **Local state pattern** — file-based profile cache with merge logic |
| `phase7-sensor-fusion-architecture.md` | Architecture doc | 1,894 | **Architecture decision record** — 14-section system design with rollout plan |

**4 Sanity documents in `ql62wkk2/production`:**

| Document | Type | State |
|----------|------|-------|
| `2c89fc5f` | `account` (Rapid7) | Fusion-ready with confidenceField model, 3 sources, headcount conflict flagged |
| `d77beb69` | `contact` (Corey Thomas) | Fusion-ready with low-confidence email, account linkage |
| `66ae6b5f` | `companyProfile` (Rapid7) | Legacy Phase 5 format — superseded |
| `e3d4d2dd` | `personProfile` (Jane Doe) | Legacy Phase 5 format — superseded |

**Connected MCPs (live):**

| MCP | Capability | Used By |
|-----|-----------|---------|
| Sanity Content Lake | Document CRUD, GROQ queries, schema deploy | Entity storage, query tools |
| Slack (Salesforce) | Search, send, draft, read channels/threads | Notification pipeline, slack signal ingestion |
| Common Room | Account research, contact research, signals | Enrichment adapter |
| Apollo | Lead enrichment, prospecting | Contact enrichment adapter |
| Gmail | Search, read, draft | Email signal adapter |
| Google Calendar | List events, create events | Meeting signal adapter |
| Google Drive | Search, fetch documents | Document signal adapter (unused) |
| Chrome (Claude in Chrome) | Page reading, navigation, JS execution | Page scanning pipeline |
| Chrome (Control Chrome) | Tab management, page content, JS execution | Direct browser control |
| BigQuery | SQL queries, table info | Revenue/usage data (Tier 1 source) |
| Linear | Issues, projects, documents | Activity signals |

### 1b. What Is Implied but Not Yet Built

| Capability | Status | Where It Lives Conceptually |
|-----------|--------|----------------------------|
| Live Chrome tab → auto-scan pipeline | Designed, not wired | SKILL.md Part 1-4 describe it; scan_page.py implements extraction |
| Scheduled enrichment jobs | Designed in architecture doc | phase7 §9 (Workers/Agents/Jobs) |
| Confidence decay cron | Formula exists in fusion_engine.py | Needs a scheduled task to recalculate |
| Multi-entity batch processing | e2e_test does it in-memory | No persistent orchestration |
| Human review queue UI | `needsReview` flag exists on documents | No Studio tool or dashboard |
| Source health monitoring | Trust tiers defined | No health checks on MCP availability |
| Enrichment routing (which source fills which gap) | Gap analysis exists in scan_page.py | No automatic enrichment dispatch |
| Training data capture | Not yet designed | This document designs it |

### 1c. Reusable Patterns Already Proven

These patterns worked and should be extracted into general-purpose abstractions:

1. **Signal normalization**: Raw MCP output → standard `{source, timestamp, entity_type, entity_hint, fields}` format. Works across 8+ sources.
2. **Confidence-wrapped fields**: Every field as `{_type, value, confidence, certain, source, sources[], updated, conflictingValues[]}`. Works in Sanity schemaless mode.
3. **Multi-strategy entity resolution**: Domain > SF ID > email > name+company > name+domain > new. Deterministic IDs for idempotent upserts.
4. **Trust-tiered conflict resolution**: 4-tier source hierarchy with field-level authority overrides. Produces deterministic outcomes.
5. **Self-testing reference files**: Every .py file includes a `_self_test()` that validates its own logic. Acts as living documentation.
6. **Outputs-dir file transfer**: Sandbox → `mnt/outputs/` → `mdfind` → `cp` to Mac target. Reliable across sessions.

---

## 2. Reusable Skill Map

### Skill 1: `prospect-scan`

**Mission:** Scan any web page and extract structured account/contact intelligence.

**Trigger conditions:** User is on a company/person page in Chrome. User says "scan this", "who is this", "what company is this", or uses `/chrome-inspector scan`.

**Inputs:**
- Active Chrome tab URL (from `tabs_context_mcp` or `get_current_tab`)
- Optional: existing account/contact document from Sanity (for delta detection)

**Outputs:**
- Classified page type (linkedin_company, crunchbase_org, etc.)
- Extracted fields dict
- Gap analysis (what's missing, what source could fill it)
- Signal in standard format ready for fusion

**Internal steps:**
1. Get active tab URL and page content (`get_page_text` or `read_page`)
2. Classify page type (page-classifier.ts rules)
3. Extract fields based on page type (scan_page.py extraction maps)
4. Normalize extracted values (domain, phone, headcount normalizers)
5. Detect gaps (compare extracted fields against ideal field set)
6. Resolve entity (check Sanity for existing match)
7. Return signal + gap report

**Tools used:** Chrome MCP (read_page, get_page_text), Sanity MCP (query_documents)

**Deterministic vs model-driven:**
- URL classification: deterministic (regex rules)
- Field extraction: model-driven (LLM reads page content, guided by extraction maps)
- Gap analysis: deterministic (set difference against ideal fields)

**Data to capture:**
- Page URL, classified type, extraction success/failure per field
- Time to extract, fields found vs expected
- False positives (extracted garbage) — for extraction prompt improvement

---

### Skill 2: `multi-source-fuse`

**Mission:** Combine signals from 2+ sources into a single high-confidence entity document.

**Trigger conditions:** New signal arrives for an entity that already has data from other sources. User says "enrich", "merge", "fuse", or a scan completes with existing entity match.

**Inputs:**
- 1+ signals in standard format `{source, timestamp, entity_type, entity_hint, fields}`
- Optional: existing Sanity document (for incremental fusion)

**Outputs:**
- Fused document with confidence-wrapped fields
- Conflict report (fields flagged for review)
- Source attribution (which source contributed what)
- Notification events (new_account, conflict, field_update)

**Internal steps:**
1. Normalize all field values (domain, email, phone, headcount)
2. For each field across all signals:
   a. Score confidence: `base_trust × freshness × authority_bonus × corroboration_bonus`
   b. If field exists on current doc: run conflict resolution
   c. If new field: accept with scored confidence
3. Build source array with extraction timestamps
4. Calculate metadata (fusionVersion, requiresReview, reviewReason)
5. Generate signal summary (high/uncertain/stale fields)
6. Return fused document

**Tools used:** None (pure computation). Sanity MCP for read/write of result.

**Deterministic vs model-driven:**
- Confidence scoring: deterministic (formula)
- Conflict resolution: deterministic (rules 1-5)
- Value normalization: mostly deterministic (regex), headcount parsing has heuristics

**Data to capture:**
- Pre-fusion and post-fusion confidence per field
- Conflict resolutions (what was flagged, what was auto-resolved)
- Human review outcomes (when user resolves a flag, capture their decision)

---

### Skill 3: `entity-resolve`

**Mission:** Given a signal or search query, find the matching entity in Sanity or determine it's new.

**Trigger conditions:** Any new signal needs to be matched to existing data. User asks "do we know this company?" or a scan produces an entity hint.

**Inputs:**
- Entity hint: `{domain?, name?, email?, company?, salesforceId?}`
- Entity type: "account" or "contact"

**Outputs:**
- Resolution result: `{match_type, confidence, sanity_id, entity_id, matched_on}`
- For contacts: account linkage result

**Internal steps:**
1. Build prioritized GROQ queries from entity hints
2. Execute queries against Sanity in priority order (domain first, then SF ID, then name)
3. First match wins — return with match_type and confidence
4. If no match: generate deterministic ID, return as "new"
5. For contacts: attempt account linkage via email domain or company name

**Tools used:** Sanity MCP (query_documents)

**Deterministic vs model-driven:**
- Query building: deterministic
- Match evaluation: deterministic (exact match on indexed fields)
- Fuzzy name matching: model-driven (future enhancement)

**Data to capture:**
- Resolution outcomes (hit/miss/ambiguous per strategy)
- False matches (entity resolved to wrong doc)
- Resolution latency per strategy

---

### Skill 4: `gap-enrich`

**Mission:** Detect missing data on an entity and automatically route to the best source to fill it.

**Trigger conditions:** After a scan or fusion reveals gaps. User says "enrich this" or "fill the gaps".

**Inputs:**
- Entity document (or signal) with known fields
- Gap list (fields that are missing or low-confidence)

**Outputs:**
- Enrichment plan: which source to query for which fields
- Enrichment results: signals from each source
- Updated entity after fusion

**Internal steps:**
1. Compute gap set: ideal fields minus known fields
2. For each gap, consult FIELD_AUTHORITY to determine best source
3. Prioritize by: gap importance × source availability × source cost
4. For each source-gap pair:
   a. If source is an MCP tool: call it (Apollo enrich, Common Room research, etc.)
   b. If source is a web page: generate scan URL (linkedin.com/company/{name})
   c. If source is unavailable: skip, log, suggest manual
5. Collect signals from all sources
6. Fuse into existing entity
7. Return enrichment report

**Tools used:** Apollo MCP, Common Room MCP, Chrome MCP (for web-based enrichment), Sanity MCP

**Deterministic vs model-driven:**
- Gap detection: deterministic
- Source routing: deterministic (FIELD_AUTHORITY table)
- Enrichment call construction: model-driven (building API params from entity context)
- Enrichment result parsing: model-driven (adapter handles normalization)

**Data to capture:**
- Gap fill rate per source (what % of gaps did Apollo fill vs Common Room vs LinkedIn scan)
- Enrichment latency per source
- Field accuracy (did the enriched value match other sources?)

---

### Skill 5: `prospect-query`

**Mission:** Answer natural language questions about accounts, contacts, and pipeline using GROQ queries against the Content Lake.

**Trigger conditions:** User asks about accounts ("who do we know at..."), pipeline ("how many accounts..."), contacts ("who is..."), or activity ("what's the latest with...").

**Inputs:**
- Natural language question
- Optional: entity context (domain, name)

**Outputs:**
- Query result formatted for conversation
- Source attribution
- Confidence context (which fields are uncertain)

**Internal steps:**
1. Classify intent (search, detail, contacts_at, review_queue, stale, activity, stats)
2. Select query template from TOOL_REGISTRY
3. Inject parameters
4. Execute GROQ via Sanity MCP
5. Format result for conversation, highlighting low-confidence fields

**Tools used:** Sanity MCP (query_documents)

**Deterministic vs model-driven:**
- Intent classification: model-driven
- Query selection: deterministic (registry lookup)
- Result formatting: model-driven (conversational presentation)

**Data to capture:**
- Query intent classifications (for training a classifier)
- Query success (did the result answer the question?)
- User follow-up queries (indicates incomplete first result)

---

### Skill 6: `notify-dispatch`

**Mission:** Format and route notifications to Slack when significant events occur.

**Trigger conditions:** After fusion produces a new entity, field update, or conflict. After enrichment completes. After batch operation finishes.

**Inputs:**
- Event type (new_account, conflict, field_update, enrichment, scan, batch)
- Event data (entity details, field changes, conflict info)

**Outputs:**
- Slack message (mrkdwn formatted) sent via draft or direct

**Internal steps:**
1. Check config: is notification enabled for this event type?
2. Select formatter from NOTIFICATION_REGISTRY
3. Build mrkdwn message with entity context, confidence indicators, action suggestions
4. Route to channel (config default, DM, or override)
5. Send via `slack_send_message_draft` or `slack_send_message`

**Tools used:** Slack MCP

**Deterministic vs model-driven:**
- Event filtering: deterministic (config)
- Message formatting: deterministic (templates with variable injection)
- Channel routing: deterministic (config)

**Data to capture:**
- Notification delivery success/failure
- User response to notifications (did they act on it?)
- Notification volume per event type (for tuning thresholds)

---

### Skill 7: `confidence-decay`

**Mission:** Periodically recalculate confidence scores on all entities to reflect data staleness.

**Trigger conditions:** Scheduled (daily or weekly). Triggered after user asks "what's stale?"

**Inputs:**
- All entities in Sanity with confidence fields
- Current timestamp

**Outputs:**
- Updated confidence scores on stale fields
- List of entities that dropped below thresholds
- Notification: "X accounts have stale data"

**Internal steps:**
1. Query all accounts with `_updatedAt` older than threshold
2. For each entity, for each confidence field:
   a. Calculate days since `updated` timestamp
   b. Apply freshness decay: `confidence × 2^(-days / half_life)`
   c. If new confidence < threshold: mark field as stale
3. Batch-update entities in Sanity
4. Notify if significant changes occurred

**Tools used:** Sanity MCP (query + patch), Scheduled Tasks MCP

**Data to capture:**
- Decay events (which fields decayed, by how much)
- Re-enrichment triggers (did decay cause a gap that got filled?)

---

## 3. Tooling Upgrade Plan

### 3a. Tool Abstractions

**Signal Bus** — The missing middleware between MCPs and the fusion engine.

```
┌────────────┐     ┌──────────┐     ┌──────────────┐     ┌────────┐
│ Chrome MCP │────▶│ Adapter  │────▶│ Signal Bus   │────▶│ Fusion │
│ Apollo MCP │────▶│ Layer    │     │              │     │ Engine │
│ CR MCP     │────▶│ (ingest) │     │ - validate   │     │        │
│ SF MCP     │────▶│          │     │ - route      │     │ - score│
│ Slack MCP  │────▶│          │     │ - deduplicate│     │ - fuse │
│ Gmail MCP  │────▶│          │     │ - log        │     │ - store│
│ Calendar   │────▶│          │     │              │     │        │
└────────────┘     └──────────┘     └──────────────┘     └────────┘
```

Currently this is all in-memory during a single conversation. The upgrade:
1. Signals get a `_signalId` (hash of source + entity_hint + timestamp)
2. Signal dedup check before processing (don't re-fuse identical data)
3. Signal logging to a Sanity document type `signal` for audit trail
4. Async signal processing via Scheduled Tasks for batch operations

**Entity Graph Manager** — Extends entity_resolver.py into a persistent graph.

Currently entity resolution is stateless (local index per conversation). The upgrade:
1. Resolution results cached in Sanity as `entityResolution` documents
2. Account-contact linkages stored as Sanity references (already partially done)
3. Duplicate detection results stored for human review
4. Cross-entity signals: "Corey Thomas left Rapid7" updates both entities

**Source Health Monitor** — Tracks MCP availability and response quality.

No observability exists today. The upgrade:
1. Before calling any MCP tool, check last-known status
2. After each call, log: success/failure, latency, fields returned
3. If a source fails repeatedly, temporarily lower its trust tier
4. Surface source health in `/chrome-inspector status`

### 3b. Internal Interfaces

**Standard Signal Schema** (already defined, needs enforcement):
```typescript
interface Signal {
  _signalId: string;          // Deterministic hash
  source: string;             // From SOURCE_TRUST keys
  timestamp: string;          // ISO 8601 UTC
  entity_type: "account" | "contact";
  entity_hint: {
    domain?: string;
    name?: string;
    email?: string;
    company?: string;
    salesforceId?: string;
  };
  fields: Record<string, any>; // Flat key-value, pre-normalization
  raw?: any;                   // Original MCP response for debugging
}
```

**Standard Resolution Result:**
```typescript
interface ResolutionResult {
  match_type: "domain" | "salesforce_id" | "email" | "name_exact" | "name_fuzzy" | "new";
  confidence: number;
  sanity_id: string | null;
  entity_id: string;           // Deterministic
  matched_on: Record<string, string>;
  alternatives?: ResolutionResult[]; // Other possible matches
}
```

**Standard Fusion Result:**
```typescript
interface FusionResult {
  document: SanityDocument;     // Ready for upsert
  changes: FieldChange[];       // What changed
  conflicts: ConflictReport[];  // What was flagged
  notifications: NotificationEvent[];  // What to alert on
}
```

### 3c. Worker/Agent/Job Design

**Workers** (stateless, single-task):

| Worker | Input | Output | Trigger |
|--------|-------|--------|---------|
| `scan-worker` | Chrome tab URL | Signal | User command |
| `enrich-worker` | Entity + gap list | Signal[] | After scan, or manual |
| `fuse-worker` | Signal[] + existing doc | Fused document | After any signal arrives |
| `notify-worker` | Notification event | Slack message | After fusion |
| `decay-worker` | Entity | Updated confidences | Scheduled |

**Agents** (stateful, multi-step reasoning):

| Agent | Mission | Context Needed |
|-------|---------|----------------|
| `enrichment-agent` | Given an entity with gaps, decide which sources to try, in what order, handle failures, maximize fill rate | Entity doc, gap list, source health status |
| `review-agent` | Present conflicts to user, collect decisions, apply resolutions | Entity doc, conflict details, FIELD_AUTHORITY |
| `pipeline-agent` | Orchestrate full scan→resolve→fuse→enrich→notify flow | All of the above |

**Jobs** (scheduled or event-driven):

| Job | Schedule | Action |
|-----|----------|--------|
| `daily-decay` | Every 24h | Run confidence decay on all entities |
| `weekly-stale-report` | Monday 9am | Query stale accounts, send digest to Slack |
| `enrichment-sweep` | Every 6h | Find entities with >3 gaps, attempt enrichment |
| `source-health-check` | Every 1h | Ping each MCP, log status |

### 3d. Logging and Observability

**Event log schema** (Sanity document type `fusionEvent`):
```json
{
  "_type": "fusionEvent",
  "eventType": "scan | resolve | fuse | enrich | conflict | decay | notify",
  "entityId": "account-rapid7com",
  "entityType": "account",
  "source": "linkedin",
  "timestamp": "2026-04-01T10:00:00Z",
  "duration_ms": 1200,
  "fields_affected": ["headcount", "industry"],
  "confidence_before": 0.70,
  "confidence_after": 0.85,
  "resolution": "accept | reject | flag",
  "error": null,
  "metadata": {}
}
```

This log type enables:
- Audit trail for every field change
- Performance tracking per source
- Conflict resolution history
- Training data for confidence model improvements

---

## 4. Workflow Library

### Workflow 1: Single Page Scan

```
TRIGGER: User says "scan this" or "/chrome-inspector scan"
 │
 ├─ 1. Get active Chrome tab URL + page content
 │     FALLBACK: If Chrome MCP disconnected → tell user, suggest manual URL input
 │
 ├─ 2. Classify page type
 │     DETERMINISTIC: URL regex rules → page_type
 │     FALLBACK: Unknown page type → attempt generic extraction, lower confidence
 │
 ├─ 3. Extract fields
 │     MODEL-DRIVEN: LLM reads page content guided by extraction map for page_type
 │     FALLBACK: Extraction fails → return partial results with gaps noted
 │
 ├─ 4. Normalize + create signal
 │     DETERMINISTIC: Run normalizers on all fields
 │
 ├─ 5. Resolve entity
 │     SANITY QUERY: domain match → SF ID → name match → new
 │     FALLBACK: Sanity unreachable → store signal locally, retry later
 │
 ├─ 6. Fuse with existing (or create new)
 │     DETERMINISTIC: Fusion engine
 │
 ├─ 7. Push to Sanity
 │     FALLBACK: Push fails → store locally, queue for retry
 │
 ├─ 8. Generate notifications
 │     DETERMINISTIC: Event → format → route
 │
 └─ 9. Report to user
       Show: entity summary, confidence highlights, gaps, conflicts, suggested next actions
```

**Stored artifacts:** Signal doc, fused entity doc, fusion event log, notification
**Evaluation criteria:** Fields extracted vs expected for page type, extraction accuracy, resolution correctness
**Human in the loop:** Review conflicts, confirm new entity creation (optional — can be auto)

---

### Workflow 2: Multi-Source Enrichment

```
TRIGGER: After scan reveals gaps, or user says "enrich {domain}"
 │
 ├─ 1. Load existing entity from Sanity
 │
 ├─ 2. Compute gap set (missing or low-confidence fields)
 │     DETERMINISTIC: Set difference against ideal field set
 │
 ├─ 3. Build enrichment plan
 │     For each gap, consult FIELD_AUTHORITY:
 │       headcount missing → try LinkedIn scan, then Apollo, then Crunchbase
 │       email missing → try Apollo, then Common Room
 │       revenue missing → try BigQuery, then Crunchbase
 │     FALLBACK: If primary source unavailable → try next in priority list
 │
 ├─ 4. Execute enrichment calls (parallel where possible)
 │     Each returns a signal in standard format
 │     FALLBACK: Source timeout → skip, note in enrichment report
 │
 ├─ 5. Fuse all new signals with existing entity
 │
 ├─ 6. Push updated entity to Sanity
 │
 ├─ 7. Generate enrichment notification
 │
 └─ 8. Report: fields filled, gaps remaining, conflicts detected
```

**Stored artifacts:** Enrichment plan, signals per source, fused entity, enrichment report
**Evaluation criteria:** Gap fill rate, fields added, confidence improvement
**Human in the loop:** Approve enrichment plan (optional), resolve conflicts

---

### Workflow 3: Conflict Resolution

```
TRIGGER: Fusion flags a conflict (needsReview = true), or user says "review conflicts"
 │
 ├─ 1. Query accounts where metadata.requiresReview == true
 │
 ├─ 2. For each entity with conflicts:
 │     a. Present conflicting values with source, confidence, recency
 │     b. Show FIELD_AUTHORITY recommendation
 │     c. Ask user to pick winner, or confirm auto-resolution
 │
 ├─ 3. Apply resolution:
 │     - User picks a value → set as primary, boost confidence, clear conflict
 │     - User says "keep flagged" → no change
 │     - User provides new value → set with source="manual", confidence=1.0
 │
 ├─ 4. Log resolution decision (for training data)
 │
 └─ 5. Update entity in Sanity, clear needsReview if all conflicts resolved
```

**Stored artifacts:** Resolution decisions (field, old_values, winning_value, reason, user_id)
**This is prime training data** — every human resolution teaches the system which source to trust for which fields.

---

### Workflow 4: Pipeline Status Dashboard

```
TRIGGER: User says "status", "how's the pipeline?", or scheduled weekly digest
 │
 ├─ 1. Run pipeline_stats GROQ query
 │
 ├─ 2. Run source health check (ping each MCP)
 │
 ├─ 3. Compute:
 │     - Total entities, by type
 │     - Average confidence across all accounts
 │     - Entities needing review
 │     - Stale entities (not updated in 30+ days)
 │     - Source availability status
 │     - Enrichment fill rate (fields filled / fields attempted, trailing 7 days)
 │
 ├─ 4. Format as conversational summary or Slack digest
 │
 └─ 5. Suggest actions: "5 accounts need review", "Apollo hasn't responded in 2 hours"
```

---

### Workflow 5: Batch Account Processing

```
TRIGGER: User provides a list of domains/companies, or "scan my pipeline"
 │
 ├─ 1. Parse input list (domains, company names, or Salesforce account query)
 │
 ├─ 2. For each entity:
 │     a. Resolve against Sanity (existing or new?)
 │     b. If new: create stub with name/domain
 │     c. Build enrichment plan
 │
 ├─ 3. Execute enrichment in batches (respect rate limits)
 │     PARALLEL: Up to 3 concurrent source calls
 │     FALLBACK: Source rate-limited → queue remaining, continue with available
 │
 ├─ 4. Fuse results per entity
 │
 ├─ 5. Push all to Sanity
 │
 ├─ 6. Generate batch summary notification
 │
 └─ 7. Report: processed/succeeded/failed, new accounts, conflicts, duration
```

---

## 5. Imperfect-Information Strategy

### 5a. Missing Data

| Situation | Behavior | Confidence Impact |
|-----------|----------|-------------------|
| Field not available from any source | Leave absent (don't invent) | N/A — field doesn't exist |
| Field available from only 1 source | Accept with source's base confidence (no corroboration bonus) | Lower than multi-source |
| Field available but stale (>90 days) | Keep with decayed confidence | Reduced by freshness formula |
| Field format unrecognizable | Store raw, flag as uncertain | 0.3 × base confidence |
| Source MCP unavailable | Skip, try next source in priority | No change to existing data |

**Principle:** Absence of data is not the same as negative data. If we don't have headcount, we don't say headcount is 0 — we say we don't know.

### 5b. Source Conflicts

**Already solved by conflict resolution rules (§14d of SKILL.md).** Summary:

1. Agreement → boost both
2. Authoritative source wins over non-authoritative
3. Significant confidence gap (>0.15) → higher wins
4. Close confidence → FLAG for human review

**Extension for edge cases:**

| Edge Case | Resolution |
|-----------|-----------|
| 3+ sources disagree | Group by value, pick group with highest aggregate confidence |
| All sources low-confidence | Accept most recent, flag for review |
| Authoritative source provides garbage value | Accept but reduce its confidence for this field; log anomaly |
| Value changed between scans of same source | Accept newer, log the change for trend detection |

### 5c. Tool Failures

| Failure | Handling |
|---------|----------|
| Chrome MCP disconnected | Fall back to manual URL input, or skip scan and work from Sanity data |
| Sanity MCP timeout | Queue operations locally, retry with exponential backoff (1s, 2s, 4s, max 30s) |
| Apollo returns empty | Skip, try Common Room or LinkedIn scan |
| Slack send fails | Queue notification, retry once, then log failure and continue |
| GROQ query returns empty | Broaden search (exact match → wildcard), then report "no results" |
| Rate limit hit | Backoff, queue remaining work, notify user of delay |

### 5d. Incomplete State

| Situation | Strategy |
|-----------|----------|
| Entity partially fused (some fields present, others pending) | Serve what we have with confidence indicators. Don't block on completeness. |
| Context window exhaustion | Summarize state, save progress to Sanity, resume in new conversation (this already happened and the compaction summary pattern worked). |
| Previous session's work inaccessible | Re-query Sanity for current state — it's the source of truth, not the conversation |
| Ambiguous user intent | Use the best-match query tool, present results, ask for refinement only if results are empty |

### 5e. Assumption Framework

When the system must make an assumption:

1. **State the assumption** in the enrichment report or notification
2. **Score it** with reduced confidence (0.5 × what a confirmed value would get)
3. **Tag it** with `source: "inferred"` so it's always distinguishable
4. **Expire it** faster (Tier 4 half-life = 3 days)
5. **Replace it** eagerly — any real source data overwrites an inference

Example: If a contact's company is "Rapid7" but we can't confirm their domain, we assume `rapid7.com` with `source: "inferred"`, `confidence: 0.25`. First real signal replaces it.

---

## 6. Data Capture and Tuning Plan

### 6a. What to Log

| Event | Data Points | Storage |
|-------|------------|---------|
| Every scan | URL, page_type, fields extracted, fields expected, extraction time, gaps | `fusionEvent` in Sanity |
| Every fusion | Pre/post confidence per field, conflict resolutions, sources involved | `fusionEvent` in Sanity |
| Every enrichment | Source called, fields added/updated, fill rate, latency | `fusionEvent` in Sanity |
| Every conflict resolution | Field, conflicting values, winning value, resolution method, user decision (if human) | `fusionEvent` in Sanity |
| Every notification | Event type, channel, delivery success, user response | `fusionEvent` in Sanity |
| Every entity resolution | Strategy used, match confidence, hit/miss, false match correction | `fusionEvent` in Sanity |
| Source health | MCP name, success/failure, latency, error message | `sourceHealth` in Sanity |

### 6b. What to Score

| Metric | How to Measure | What It Tells Us |
|--------|---------------|------------------|
| **Extraction accuracy** | Compare extracted values against authoritative source values | Are our page extraction prompts working? |
| **Resolution accuracy** | Track false matches (user corrects a wrong match) | Is entity resolution too aggressive or too conservative? |
| **Conflict resolution quality** | Compare auto-resolutions against later human corrections | Should we adjust confidence thresholds? |
| **Gap fill rate** | Fields filled / fields attempted per source | Which sources are most valuable? |
| **Source reliability** | Success rate × average fields returned per call | Should we adjust trust tiers? |
| **Confidence calibration** | For fields marked "certain" (confidence > 0.85), what % are actually correct when verified? | Is our confidence model well-calibrated? |
| **Time to complete profile** | From first signal to 80%+ fields filled | Is the system getting faster? |

### 6c. What Becomes Training Data

| Data | Training Application |
|------|---------------------|
| Human conflict resolutions | Fine-tune conflict resolution rules. If users consistently override a source for a field, adjust FIELD_AUTHORITY. |
| Extraction results per page type | Improve extraction prompts. If linkedin_company pages consistently miss `headquarters`, improve the extraction template. |
| Entity resolution corrections | Improve matching heuristics. If domain match produces false positives for certain TLDs, add exceptions. |
| Query intent classifications | Train a lightweight intent classifier to replace the keyword-based dispatcher in llm_query_tools.py. |
| Notification engagement | Tune notification thresholds. If users ignore low-confidence-change notifications, raise the threshold. |
| Source fill rates over time | Auto-adjust enrichment routing. If Apollo stops returning phone numbers, route phone enrichment to Salesforce instead. |

### 6d. Self-Improvement Loops

**Loop 1: Confidence Calibration**
```
Every 30 days:
  1. Sample 20 fields marked "certain" (confidence > 0.85)
  2. Verify against authoritative source
  3. If <80% correct → confidence model is over-confident → reduce base_confidence by 0.05
  4. If >95% correct → model is under-confident → increase base_confidence by 0.02
```

**Loop 2: Source Trust Adjustment**
```
Every 7 days:
  1. For each source, compute: success_rate × avg_fields × avg_confidence
  2. If score drops >20% from baseline → flag source health issue
  3. If score is consistently low for 3 weeks → suggest tier demotion
```

**Loop 3: Extraction Prompt Improvement**
```
Every 50 scans of a page_type:
  1. Compute extraction accuracy per field
  2. If a field drops below 70% accuracy → flag for prompt revision
  3. Store the 5 worst extraction examples for prompt engineering review
```

**Loop 4: Skill Evolution**
```
Every 100 skill invocations:
  1. Compute: avg time, success rate, user satisfaction (follow-up queries as proxy)
  2. If success rate < 80% → generate improvement ticket
  3. If avg time > 30s → identify bottleneck step
  4. Store top-5 failure cases as regression tests
```

---

## 7. Recommended Build Order

### Phase A: Foundation Lock (Week 1)
**Highest leverage — makes everything else possible**

1. **Deploy `fusionEvent` schema to Sanity** — enables all logging and measurement
2. **Create the scheduled decay job** — uses Scheduled Tasks MCP, keeps confidence fresh
3. **Wire the live scan pipeline** — connect Chrome MCP → adapter → resolve → fuse → Sanity (the core loop that everything else extends)

### Phase B: Enrichment Automation (Week 2)
**Second-highest leverage — fills gaps automatically**

4. **Build gap-enrich skill** — the enrichment agent that routes gaps to sources
5. **Wire Apollo + Common Room enrichment** — the two richest contact/account sources
6. **Build enrichment routing table** — FIELD_AUTHORITY-driven source selection with fallbacks

### Phase C: Observability (Week 3)
**Enables self-improvement — can't improve what you can't measure**

7. **Deploy fusionEvent logging** — every scan/fuse/enrich writes an event
8. **Build source health monitor** — ping MCPs, track reliability
9. **Build pipeline status dashboard** — GROQ aggregation over fusionEvents

### Phase D: Workflow Packaging (Week 4)
**Makes skills invokable and composable**

10. **Package `prospect-scan` as a formal skill** — with SKILL.md trigger, references, self-test
11. **Package `multi-source-fuse` as a skill** — pure logic, no external deps
12. **Package `gap-enrich` as a skill** — orchestration with fallbacks
13. **Package `prospect-query` as a skill** — LLM query interface
14. **Wire notification dispatch into all workflows**

### Phase E: Self-Improvement (Week 5-6)
**Compound returns — system gets better with use**

15. **Build confidence calibration loop** — monthly sampling and adjustment
16. **Build extraction accuracy tracking** — per-page-type metrics
17. **Build conflict resolution training capture** — every human decision is training data
18. **Build source trust auto-adjustment** — weekly rebalancing based on fill rates
19. **Create regression test suite from captured failures**

### Phase F: Scale (Week 7+)
**Handle volume**

20. **Batch processing workflow** — process account lists in parallel
21. **Scheduled enrichment sweeps** — nightly gap detection and auto-enrichment
22. **Cross-entity signal propagation** — "person left company" updates both entities
23. **Review queue UI** — Sanity Studio tool for conflict resolution

---

## 8. Final System Model

### The Capability Stack

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACE                         │
│  Commands: scan, enrich, view, search, status, review    │
│  Channels: Cowork, Slack notifications, GROQ queries     │
└────────┬────────────────────────────────────────┬────────┘
         │                                        │
┌────────▼────────────────────────────────────────▼────────┐
│                    SKILL LAYER                            │
│  prospect-scan │ multi-source-fuse │ gap-enrich │        │
│  entity-resolve │ prospect-query │ notify-dispatch │     │
│  confidence-decay                                        │
└────────┬────────────────────────────────────────┬────────┘
         │                                        │
┌────────▼────────────────────────────────────────▼────────┐
│                  WORKFLOW ENGINE                          │
│  Single Scan │ Multi-Source Enrichment │ Batch Process │  │
│  Conflict Resolution │ Pipeline Status │ Decay Sweep │   │
│  Decision points, fallbacks, retry logic                 │
└────────┬────────────────────────────────────────┬────────┘
         │                                        │
┌────────▼────────────────────────────────────────▼────────┐
│                    TOOL LAYER                             │
│  Signal Bus │ Entity Graph │ Source Monitor │ Event Log │ │
│  Confidence Scorer │ Conflict Resolver │ Normalizers │   │
│  Query Templates │ Notification Formatters               │
└────────┬────────────────────────────────────────┬────────┘
         │                                        │
┌────────▼────────────────────────────────────────▼────────┐
│                  INTEGRATION LAYER                        │
│  Ingestion Adapters (8 sources)                          │
│  Chrome │ Apollo │ Common Room │ Salesforce │ Slack │    │
│  Gmail │ Calendar │ BigQuery │ Linear │ Google Drive     │
└────────┬────────────────────────────────────────┬────────┘
         │                                        │
┌────────▼────────────────────────────────────────▼────────┐
│                  PERSISTENCE LAYER                        │
│  Sanity Content Lake (ql62wkk2/production)               │
│  account │ contact │ fusionEvent │ sourceHealth │        │
│  All documents carry confidence, source, freshness       │
└────────┬────────────────────────────────────────┬────────┘
         │                                        │
┌────────▼────────────────────────────────────────▼────────┐
│                SELF-IMPROVEMENT LAYER                     │
│  Confidence Calibration Loop (monthly)                   │
│  Source Trust Adjustment (weekly)                         │
│  Extraction Accuracy Tracking (per 50 scans)            │
│  Conflict Resolution Training Capture (every resolution) │
│  Skill Performance Scoring (per 100 invocations)        │
│                                                          │
│  Every interaction makes the system smarter.             │
└──────────────────────────────────────────────────────────┘
```

### How It Compounds

**Day 1:** You scan a LinkedIn page. System extracts 8 fields at 0.80 confidence.

**Day 7:** Same account gets Apollo enrichment. 12 fields now, 5 corroborated across sources. Average confidence rises to 0.88.

**Day 30:** Salesforce data syncs. Authoritative fields lock in at 0.95+. Conflicts auto-resolved. 15 fields, 3 sources.

**Day 60:** Confidence decay flags stale fields. Auto-enrichment sweep refreshes them. System maintains data quality without human intervention.

**Day 90:** 50 accounts in the pipeline. Confidence calibration loop discovers Apollo phone numbers are 92% accurate — boosts Apollo's phone trust. Common Room engagement scores correlate 0.78 with deal closure — system surfaces high-engagement accounts proactively.

**Day 180:** Conflict resolution training data shows that for headcount, LinkedIn > Salesforce 73% of the time when humans review. System auto-adjusts FIELD_AUTHORITY to reflect this. Resolution accuracy improves by 15%.

**The flywheel:** More data → better confidence calibration → fewer false conflicts → less human review → more automation → more data.

### Key Design Principles

1. **Confidence over certainty.** Every field has a number, never just "true" or "false."
2. **Source-aware, not source-dependent.** No single source failure breaks the system.
3. **Fail forward.** Partial data is better than no data. Missing fields are gaps to fill, not errors to stop on.
4. **Humans resolve ambiguity, machines handle volume.** Conflicts go to humans. Clear cases are automated.
5. **Every interaction is training data.** Human decisions, source outcomes, and resolution results all feed back into the system.
6. **Deterministic where possible, model-driven where necessary.** Confidence math is a formula. Page extraction is an LLM. Know which is which.
7. **Idempotent operations.** Same signal processed twice produces the same result. Deterministic IDs prevent duplicates.
8. **Observable by default.** If it happened, there's a fusionEvent log entry.

---

*Total system: 7 skills, 5 workflows, 12 reference files, 10 MCP integrations, 4 self-improvement loops, 1 Content Lake. Designed to compound with use.*
