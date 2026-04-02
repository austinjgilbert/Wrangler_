# Chrome Inspector Sensor Fusion Architecture Review

**Project:** Prospect 360 (Sanity Content Lake, project ql62wkk2)
**Date:** 2026-04-01
**Scope:** Sensor fusion system for prospect intelligence and account enrichment
**Audience:** Engineering, product, operations

---

## 1. System Mission

Chrome Inspector is a **real-time prospect intelligence platform** that fuses signals from 10+ data sources (browser, CRM, intent, email, meetings, code) into a **canonical, searchable, actionable account and contact model**.

**Core mission for sensor fusion:**
- **Single source of truth:** Eliminate duplicate tracking across tools. One `account.id` or `contact.id` works everywhere.
- **Live enrichment:** As new signals arrive (LinkedIn page view, Slack mention, email received), profile updates propagate in <5 minutes.
- **Confidence-aware decisions:** Every field has a trust score. Automated actions (Slack alerts, Apollo searches) only fire when confidence is high.
- **Human-in-the-loop:** For conflicting signals or low-confidence gaps, route to human agent (Slack, Linear) before taking action.
- **Audit trail:** Every value, source, timestamp, and decision is logged and queryable.

**Key outcomes:**
1. Sales team runs one search ("Acme Inc, Series B, healthcare") and gets unified, current account data with contact list.
2. Slack notification triggers with high confidence: "New CTO at Acme (LinkedIn, <5 min old, Common Room confirms)."
3. LLM can safely call tools to fetch account data, assess gaps, propose enrichment actions, and ask for approval.
4. When sources conflict (Crunchbase says Series A, PitchBook says Series B), system flags as uncertain and queues for human review.

---

## 2. Source Inventory

### 2.1 Source Categories and Metadata

| **Source** | **Category** | **Update Freq** | **Latency** | **Trust Level** | **Canonical ID** | **Role** | **Failure Mode** |
|---|---|---|---|---|---|---|---|
| **Chrome Pages** | Real-time observation | Per click | <1s | Medium (user-curated) | URL fragment | Primary (discovery) | Page unreadable, stale cache |
| **Salesforce** | Authoritative CRM | Manual + sync | 1–24h | High (operator-controlled) | `sfdc_account_id` | Primary (official record) | Partial sync, stale records, missing fields |
| **LinkedIn** | Social signal | On-demand scrape | 10–60s | Medium (public data, may be outdated) | `linkedin_url` | Supportive (verification) | Rate-limited, page changes |
| **Crunchbase** | Reference data | Daily refresh | 1–2d | Medium (crowdsourced, lag) | `crunchbase_id` | Supportive (funding, metrics) | Outage, stale data, wrong entity |
| **Common Room** | Intent + community | Real-time feed | <30s | High (platform-native signals) | `cr_account_id` | Primary (intent + social) | Feed delays, missing orgs, API errors |
| **Company websites** | Authoritative source | Manual crawl | 1–7d | High (direct source) | `domain` | Supportive (official data) | Site down, page structure changes |
| **Slack** | Conversational signal | Real-time | <5s | Low (unstructured, noise) | Inferred (message context) | Supportive (context, alerts) | Missing context, ambiguous refs |
| **Gmail** | Email signal | Real-time | <5s | Medium (unstructured) | `from:` / `to:` | Supportive (relationship + timing) | Missing threads, encrypted, parsing errors |
| **Google Calendar** | Meeting context | Real-time | <1s | Medium (structured events) | Event ID | Supportive (relationship, timing) | Private events, no attendee details |
| **Linear** | Project/issue tracking | Real-time | <1s | High (internal source) | Issue ID | Supportive (context, usage) | Private repos, archived issues |
| **BigQuery** | Billing/usage | Daily | 24h | High (system truth) | Sanity project ID | Supportive (engagement) | Lag, query errors |
| **Google Drive** | Document sharing | Real-time | <5s | Low (unstructured) | File ID | Supportive (context, intent) | Permission errors, format varies |
| **Apollo** (MCP) | B2B enrichment | On-demand | 2–10s | Medium (3rd-party, sometimes stale) | `apollo_id` | Supportive (gap-fill) | Rate limit, API down, bad matches |
| **Sanity Content Lake** | Persistent store + index | Sub-second | <100ms | High (canonical) | `_id` | Central cache (read-through) | Out-of-sync with reality, lag |

### 2.2 Source Properties

**Authoritative Sources** (should drive canonical state):
- Salesforce (official CRM)
- Company websites (official record)
- Common Room (platform-native signals)
- Sanity Content Lake (when freshly synced)

**Supportive Sources** (validate, enrich, flag conflicts):
- LinkedIn, Crunchbase, Apollo (external reference)
- Slack, Gmail, Google Calendar (contextual signals)
- Linear, BigQuery (internal usage)

**Update Frequency Tiers:**
- **Real-time (<5s):** Chrome, Slack, Gmail, Google Calendar, Linear
- **High-frequency (30s–2m):** Common Room
- **Medium-frequency (1–24h):** Salesforce, Crunchbase
- **Low-frequency (1–7d):** Company websites, BigQuery

**Canonical ID Mapping:**
```
contact:
  - salesforce_contact_id (primary for Salesforce users)
  - linkedin_url (universal fallback)
  - email (if validated)
  - cr_contact_id (if Common Room has it)

account:
  - salesforce_account_id (primary for Salesforce users)
  - domain (universal fallback)
  - crunchbase_id (if known)
  - cr_account_id (if Common Room has it)
```

---

## 3. End-to-End Architecture

### 3.1 Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                             │
│  Chrome │ SFDC │ LinkedIn │ CR │ Email │ Calendar │ Linear │ BQ │
└────┬────┬──────┬──────────┬────┬───────┬──────────┬───────┬────┘
     │    │      │          │    │       │          │       │
     └────┼──────┼──────────┼────┼───────┼──────────┼───────┘
          │      │          │    │       │          │
     ┌────▼──────▼──────────▼────▼───────▼──────────▼────┐
     │      EVENT INGESTION LAYER (MCPs + Polling)      │
     │  - Chrome: on-click capture → emit page_viewed   │
     │  - SFDC: webhook + nightly sync → account_upserted│
     │  - CR: feed listener → signals_received          │
     │  - Gmail: push notification → email_received     │
     │  - Calendar: polling → meeting_scheduled         │
     │  - Others: scheduled tasks (1h, 24h)             │
     └────┬──────────────────────────────────────────────┘
          │
     ┌────▼─────────────────────────────────────────────────┐
     │    TRANSFORMATION & NORMALIZATION (Workers)          │
     │  - Parse page → extract account, contacts, fields   │
     │  - Normalize IDs, URIs, dates, phone, email         │
     │  - Score confidence (source, freshness, match)      │
     │  - Deduplicate within source                         │
     │  - Emit normalized_event with lineage               │
     └────┬──────────────────────────────────────────────────┘
          │
     ┌────▼────────────────────────────────────────────────────┐
     │     CONFLICT RESOLUTION & FUSION (Workers)              │
     │  - Fetch existing fused entity from Content Lake       │
     │  - Compare new signal vs current state                  │
     │  - Apply conflict rules (authoritative > supportive)   │
     │  - Compute consensus (if multi-source)                 │
     │  - Decay stale signals                                  │
     │  - Generate fusion_output (deltas, confidence)         │
     └────┬──────────────────────────────────────────────────┘
          │
     ┌────▼───────────────────────────────────────────────┐
     │   PERSISTENCE & INDEXING (Sanity + Durable Store)  │
     │  - Write account/contact docs to Content Lake      │
     │  - Store raw events in KV + R2 (audit log)         │
     │  - Index by domain, email, phone, name (GROQ)      │
     │  - Update Durable Object for live cache             │
     └────┬────────────────────────────────────────────────┘
          │
     ┌────▼─────────────────────────────────────────────┐
     │  LIVE DELIVERY & ACTION (Listeners + Functions)   │
     │  - Sanity Listener → watch for account changes   │
     │  - Notify Slack if confidence > threshold        │
     │  - Enqueue Linear task for human if uncertain    │
     │  - Trigger Apollo enrichment if gaps high        │
     └────┬───────────────────────────────────────────────┘
          │
     ┌────▼──────────────────────────────────────────────┐
     │  QUERY & ACTION (LLM Interface + UI)              │
     │  - GROQ queries for search/filter                 │
     │  - Tools for fetch, enrich, validate, act         │
     │  - Approval workflow for high-stakes actions      │
     │  - Audit trail (who, what, when, why)             │
     └────────────────────────────────────────────────────┘
```

### 3.2 Component Definitions

**Event Ingestion Layer:**
- **Chrome MCP:** User clicks page → `page_viewed` event with URL, title, DOM snapshot
- **Salesforce Webhook + Sync:** Account/contact upsert → `account_upserted` or `contact_upserted`
- **Common Room Feed Listener:** New signal (hiring, funding, mention) → `signal_received`
- **Gmail Push:** New email → `email_received` (subject, from, to, date, snippet)
- **Google Calendar Polling (hourly):** New meeting → `meeting_scheduled`
- **Polling Workers (hourly, daily):** Crunchbase, LinkedIn, Apollo, BQ → `source_synced`

**Transformation & Normalization:**
- **Page Classifier Worker:** Parses Chrome page via scan_page.py → `page_type`, `parsed_fields`
- **ID Normalizer:** Converts URLs, emails, phone, names to canonical forms
- **Confidence Scorer:** Assigns score based on source tier, freshness, match quality
- **Event Emitter:** Writes `normalized_event` to event bus (Cloudflare Durable Object queue)

**Fusion Logic Worker:**
- Fetches current fused entity from Sanity Content Lake
- Compares incoming signal vs stored state
- Applies conflict rules and confidence thresholds
- Writes fusion output (deltas, merge decisions, uncertainty flags)

**Persistence & Indexing:**
- **Sanity Content Lake:** Account and Contact documents (authoritative schema)
- **Durable Object Cache:** Live in-memory copy of hot accounts (millisecond reads)
- **KV Store:** Raw events (audit trail, 30-day TTL)
- **R2 Bucket:** Long-term event archives (compliance, analysis)
- **GROQ Index:** Built-in full-text search over account/contact fields

**Live Delivery:**
- **Sanity Listener:** Watch for `account._type` changes, emit to webhook
- **Slack MCP:** Send notification if confidence score > threshold
- **Linear MCP:** Create task for manual review if uncertain
- **Apollo MCP:** Trigger enrichment job if gaps identified

**Query & Action Interface:**
- **GROQ Tools for LLM:** `search_accounts(query, filters)`, `get_account(id)`, `list_contacts(account_id)`
- **Action Tools:** `validate_contact(id)`, `enrich_account(id)`, `flag_for_review(id)`
- **Approval Workflow:** High-risk actions require Slack confirmation before execution

---

## 4. Fusion Logic

### 4.1 Normalization Pipeline

**Input:** Raw event from any source (Chrome page, Slack message, Crunchbase API response)

**Step 1: Parse and Extract**
```
Input: {
  source: "crunchbase",
  raw_data: {
    name: "Acme, Inc.",
    founded: "2015-03-15",
    funding_stage: "Series B",
    hq_city: "San Francisco, CA"
  }
}

Output: {
  entity_type: "account",
  fields: {
    legal_name: "Acme, Inc.",
    founded_date: "2015-03-15",
    stage: "series_b",
    hq_location: "San Francisco, CA"
  }
}
```

**Step 2: Canonical ID Assignment**
```
Input: account with domain "acme.com" and crunchbase_id "acme-inc-sf"

Output: {
  canonical_id: "acme-com",  // domain-based
  aliases: {
    crunchbase: "acme-inc-sf",
    linkedin: "https://linkedin.com/company/acme-inc-sf"
  }
}
```

**Step 3: Confidence Scoring**
```
Source tier: Crunchbase = 0.65 (supportive, crowdsourced)
Freshness: Updated 30 days ago = 0.8 decay
Match quality: Exact domain match = 1.0

Confidence = 0.65 * 0.8 * 1.0 = 0.52 (medium confidence)
```

### 4.2 Conflict Resolution Rules

**Rule 1: Authoritative Wins**
```
Current state: {
  stage: "Series A",
  source: "salesforce",
  confidence: 0.95,
  updated: "2026-03-15"
}

Incoming signal: {
  stage: "Series B",
  source: "crunchbase",
  confidence: 0.65,
  updated: "2026-04-01"
}

Decision: Keep "Series A" from Salesforce (authoritative).
Flag as "conflicting_sources" and enqueue for human review.
```

**Rule 2: Newer Replaces Older (Same Tier)**
```
Current: {
  headcount: 50,
  source: "linkedin",
  updated: "2026-02-01"
}

Incoming: {
  headcount: 75,
  source: "linkedin",
  updated: "2026-04-01"
}

Decision: Replace with new value (same source, newer timestamp).
Confidence: 0.78 (slightly decayed from 0.8 due to 2-month diff).
```

**Rule 3: Multi-Source Consensus**
```
Field: "stage"

Sources:
  - crunchbase: "Series B" (confidence 0.65)
  - pitchbook: "Series B" (confidence 0.70)
  - linkedin: "Series C" (confidence 0.60)

Consensus: "Series B" (2 sources, higher avg confidence 0.675)
Uncertain: true (3rd source disagrees)
Confidence: 0.67 (average of agreeing sources)
```

**Rule 4: Freshness Decay**
```
Value age = 90 days
Half-life = 30 days
Decay = 0.5 ^ (90 / 30) = 0.5 ^ 3 = 0.125

Original confidence: 0.85
Decayed confidence: 0.85 * 0.125 = 0.106 (low, triggers refresh)
```

### 4.3 Confidence Scoring Model

```
confidence(field_value) =
  source_credibility *
  freshness_decay *
  match_quality *
  consensus_boost

Where:

source_credibility:
  - Authoritative (SFDC, company site): 0.90–1.0
  - Primary (Common Room, LinkedIn): 0.70–0.85
  - Supportive (Crunchbase, Apollo): 0.50–0.70
  - Contextual (Slack, email): 0.20–0.50

freshness_decay:
  - <1 hour old: 1.0
  - 1–24 hours: 0.95–0.99
  - 1–7 days: 0.85–0.95
  - 7–30 days: 0.50–0.85
  - 30+ days: <0.50

match_quality:
  - Exact match (same ID): 1.0
  - High confidence match (domain, email): 0.95
  - Medium match (name fuzzy): 0.75
  - Low match (inferred): 0.50
  - Conflict: 0.0

consensus_boost:
  - Single source: 1.0x
  - 2 agreeing sources: 1.1x
  - 3+ agreeing sources: 1.2x (capped at 0.99)
```

### 4.4 Consensus Formation

For fields with multi-source input:

**High Consensus (all sources agree):**
```
Decision: Accept with high confidence
Confidence: min(1.0, avg_confidence * 1.2)
Store as: fused_value (certain: true)
```

**Medium Consensus (2+ sources agree, minority disagree):**
```
Decision: Accept majority value, flag minority
Confidence: avg_confidence (no boost)
Store as: fused_value (uncertain: true, conflicting_values: [...])
Action: Enqueue for manual review in Linear
```

**No Consensus (sources evenly split or all conflict):**
```
Decision: Keep existing value or mark unknown
Confidence: 0.0 (undecidable)
Store as: unknown (conflicting_values: [...], requires_human_decision)
Action: Enqueue for manual review in Linear
```

### 4.5 Uncertain vs Confirmed Values

**Confirmed (certain: true)**
- Used for automated actions (Slack notifications, API responses)
- Must have confidence > 0.75 AND agree across 2+ sources OR come from authoritative single source
- Can trigger downstream LLM actions

**Uncertain (uncertain: true)**
- Stored but not used for automated actions
- Flagged to humans for review (Linear task)
- LLM can read but must ask user before acting
- Examples: conflicting stage values, inferred contact phone, unverified email

**Example:**

```json
{
  "account": {
    "id": "acme-com",
    "stage": {
      "value": "Series B",
      "certain": true,
      "confidence": 0.82,
      "sources": ["crunchbase", "pitchbook"],
      "updated": "2026-04-01T10:23:00Z"
    },
    "headcount": {
      "value": 150,
      "certain": false,
      "uncertain": true,
      "confidence": 0.58,
      "conflicting_values": [
        {"value": 150, "source": "linkedin", "confidence": 0.70},
        {"value": 120, "source": "crunchbase", "confidence": 0.65},
        {"value": 200, "source": "apollo", "confidence": 0.45}
      ],
      "updated": "2026-04-01T09:15:00Z"
    }
  }
}
```

---

## 5. State Model

### 5.1 Data Layer Tiers

**Tier 1: Raw Events (KV + R2)**
- Source: All inbound signals
- TTL: 30 days (KV), indefinite (R2)
- Immutable, append-only
- Purpose: Audit trail, replay, forensics

```json
{
  "event_id": "evt_1234567890",
  "timestamp": "2026-04-01T10:23:45.123Z",
  "source": "chrome",
  "source_type": "page_viewed",
  "user_id": "user_123",
  "raw_payload": { ... },
  "ingestion_timestamp": "2026-04-01T10:24:00.000Z"
}
```

**Tier 2: Processed Observations (KV Cache)**
- Source: Transformation workers
- TTL: 7 days
- Normalized, scored, deduplicated
- Purpose: Efficient re-processing, gap-fill

```json
{
  "observation_id": "obs_1234567890",
  "event_id": "evt_1234567890",
  "timestamp": "2026-04-01T10:23:45.123Z",
  "source": "chrome",
  "entity_type": "account",
  "canonical_id": "acme-com",
  "fields": {
    "legal_name": "Acme, Inc.",
    "domain": "acme.com"
  },
  "confidence": 0.85,
  "match_id": "account_abc123"
}
```

**Tier 3: Fused Entities (Sanity Content Lake)**
- Source: Fusion workers + user edits
- TTL: Indefinite (versioned)
- Single source of truth for account/contact
- Purpose: Query, index, deliver

```json
{
  "_type": "account",
  "_id": "account_acme-com",
  "canonical_id": "acme-com",
  "legal_name": "Acme, Inc.",
  "stage": {
    "value": "Series B",
    "certain": true,
    "confidence": 0.82,
    "sources": [...]
  },
  "fields": { ... },
  "metadata": {
    "created": "2026-03-01T00:00:00Z",
    "updated": "2026-04-01T10:24:00Z",
    "last_enriched": "2026-04-01T10:24:00Z",
    "fusion_version": 15,
    "requires_review": false
  }
}
```

**Tier 4: Live Cache (Durable Object)**
- Source: Sanity Content Lake (mirror)
- TTL: 5 minutes (refresh on write)
- Hot accounts (100–1000 most active)
- Purpose: Sub-100ms reads for UI, LLM

```
Durable Object state:
{
  "acme-com": { ...account doc from Sanity... },
  "techcorp-io": { ...account doc from Sanity... }
}
```

**Tier 5: Audit Trail (R2 + KV)**
- Source: All state changes
- TTL: 7 years (compliance)
- Immutable log
- Purpose: Explain decisions, trace lineage, debug

```json
{
  "audit_id": "audit_1234567890",
  "timestamp": "2026-04-01T10:24:00Z",
  "entity_id": "account_acme-com",
  "entity_type": "account",
  "change": {
    "field": "stage",
    "old_value": "Series A",
    "new_value": "Series B",
    "old_confidence": 0.95,
    "new_confidence": 0.82,
    "decision": "multi_source_consensus",
    "sources": ["crunchbase", "pitchbook"],
    "triggered_by": "fusion_worker_v2"
  },
  "actor": "fusion_system",
  "approval_required": false,
  "actions_triggered": []
}
```

### 5.2 Where Data Lives

| **Data** | **Primary Store** | **Secondary Cache** | **Index** | **TTL** |
|---|---|---|---|---|
| Account/Contact docs | Sanity Content Lake | Durable Object | GROQ + full-text | Indefinite |
| Raw events | KV (30d) + R2 (7y) | — | — | 30d / 7y |
| Processed observations | KV | — | — | 7d |
| Live state snapshot | Durable Object | Sanity (read-through) | In-memory | 5m |
| Audit trail | KV (30d) + R2 (7y) | — | — | 30d / 7y |
| Searchable index | Sanity GROQ index | — | Full-text, facets | Real-time |

### 5.3 Timeline and Snapshot Model

**Timeline:**
```json
{
  "account": {
    "id": "acme-com",
    "timeline": [
      {
        "date": "2026-03-01",
        "stage": "Series A",
        "headcount": 50,
        "snapshot_id": "snap_1"
      },
      {
        "date": "2026-03-15",
        "stage": "Series A",
        "headcount": 60,
        "snapshot_id": "snap_2"
      },
      {
        "date": "2026-04-01",
        "stage": "Series B",
        "headcount": 150,
        "snapshot_id": "snap_3"
      }
    ]
  }
}
```

**Snapshots (stored in Sanity as sub-documents):**
```json
{
  "_type": "account_snapshot",
  "_id": "snap_acme-com_2026-04-01",
  "account_id": "account_acme-com",
  "date": "2026-04-01T00:00:00Z",
  "fields": { ...all account fields as of this date... },
  "sources": { ...which sources contributed to each field... }
}
```

---

## 6. Pipeline Walkthroughs

### 6.1 Normal Update Flow

**Scenario:** User views Acme's LinkedIn page in Chrome. System detects new headcount.

```
1. INGEST
   Chrome MCP fires: page_viewed { url: "linkedin.com/company/acme", title: "Acme, Inc. | LinkedIn" }
   Event stored in KV: evt_001

2. TRANSFORM
   scan_page.py parses DOM:
     - legal_name: "Acme, Inc."
     - industry: "SaaS"
     - headcount: "201-500"
   Normalizer converts to canonical form:
     - headcount: 350 (midpoint)
     - source_credibility: 0.75 (LinkedIn, medium)
   Scores confidence: 0.72 (based on recency, source)
   Emits: normalized_event { entity: account, canonical_id: "acme-com", ... }

3. FUSION
   Fetches current account from Sanity:
     headcount: { value: 300, confidence: 0.85, source: "crunchbase", updated: "2026-03-15" }
   Compares: New (350, 0.72) vs Current (300, 0.85)
   Decision: Keep current (older source higher confidence)
   Stores in audit trail: "LinkedIn signal 350 discarded; Crunchbase 300 preferred (higher confidence)"
   Emits: fusion_output { decision: "keep_current", flag: "conflicting_sources" }

4. NOTIFY
   Slack listener fires but no action (under threshold)
   Linear task: NOT created (single, non-authoritative source)

5. STORE
   No change to Sanity (fusion decided to keep current)
   KV event log updated with decision

```

### 6.2 Delayed Signal (Source Lag)

**Scenario:** Crunchbase reports Series C funding 3 days after public announcement. System already has Series B from Salesforce.

```
1. INGEST
   Crunchbase sync worker triggers (hourly):
     stage: "Series C", updated: "2026-03-29"
   Event stored: evt_002

2. TRANSFORM
   Normalizer:
     - stage: "series_c"
     - confidence: 0.65 (Crunchbase tier)
   Freshness decay: 3 days old at time of sync = 0.90
   Final confidence: 0.65 * 0.90 = 0.585

3. FUSION
   Fetches current account:
     stage: { value: "Series B", confidence: 0.95, source: "salesforce", updated: "2026-03-26" }
   Decision rule: Authoritative source (SFDC) wins over supportive (Crunchbase)
   BUT: Incoming is newer event date (29th vs 26th in SFDC)
   Action: Flag as conflicting, create Linear task: "Crunchbase reports Series C; SFDC says Series B. Verify with CEO."

4. NOTIFY
   Slack: NOT sent (conflicting, needs human review)
   Linear: Task created with priority High

5. STORE
   Sanity account updated:
     stage: { value: "Series B", certain: true, confidence: 0.95, ... }
     conflicting_signals: [
       { value: "Series C", source: "crunchbase", confidence: 0.585, ... }
     ]
     requires_review: true
   Audit trail records decision with rationale

```

### 6.3 Conflicting Sources, High Stakes

**Scenario:** Salesforce lists wrong CTO contact; LinkedIn shows different person; Common Room confirms LinkedIn.

```
1. INGEST
   - Salesforce webhook: contact_upserted { name: "John Smith", role: "CTO", account_id: "sfdc_123" }
   - LinkedIn scrape (1 hour later): contact { name: "Jane Doe", role: "CTO", company: "Acme" }
   - Common Room feed: hiring_change { role: "CTO", name: "Jane Doe", account_id: "cr_456" }

2. TRANSFORM
   All three normalized to canonical contact_type with scores:
     - Salesforce: confidence 0.90 (authoritative)
     - LinkedIn: confidence 0.75 (public)
     - Common Room: confidence 0.80 (primary signal)

3. FUSION
   Conflict detected: name disagreement (John vs Jane)
   Multi-source consensus rule:
     - LinkedIn + Common Room agree on Jane (0.75 + 0.80 = 1.55 / 2 = 0.775)
     - Salesforce alone on John (0.90)

   Decision matrix:
     - Authoritative (SFDC) vs Consensus (CR + LinkedIn): Consensus wins (2 sources, one primary)
     - BUT: Salesforce is official system, so don't overwrite

   Action: Keep both, flag as conflicting, high priority
     cto_contact: { value: "Jane Doe", certain: false, uncertain: true, ... }
     conflicting_contact: { name: "John Smith", source: "salesforce", confidence: 0.90 }

4. NOTIFY
   Slack: HIGH PRIORITY
     "⚠️ CTO conflict at Acme Inc: Salesforce has John Smith; LinkedIn + Common Room report Jane Doe (confident). Manual review required."
   Linear: Task created: "CTO mismatch — verify with account owner. Contact Acme directly if possible."

5. STORE
   Sanity contact doc for Jane Doe created (or updated):
     {
       "_type": "contact",
       "name": "Jane Doe",
       "role": "CTO",
       "account_id": "account_acme-com",
       "certain": false,
       "conflicting_values": [
         { name: "John Smith", source: "salesforce", ... }
       ],
       "requires_review": true,
       "review_reason": "source_conflict_high_stakes"
     }
   Audit trail: Decision, sources, rationale

```

### 6.4 Source Outage

**Scenario:** Salesforce API down for 4 hours. New account created in SFDC but Chrome Inspector doesn't see it.

```
1. INGEST (0:00)
   Scheduled SFDC sync job fails (timeout)
   Retry policy: exponential backoff (1m, 5m, 15m, 1h)

2. TRANSFORM
   No events generated
   Circuit breaker: SFDC marked as degraded after 3 consecutive failures
   Fallback: Use stale Salesforce cache (up to 24h old)

3. FUSION
   When new signal arrives from Chrome (user visits LinkedIn page):
     - Try to match to SFDC (authoritative)
     - Fall back to supportive sources (LinkedIn, Common Room)
     - Create new account with MEDIUM confidence (no SFDC validation)

4. NOTIFY
   Slack ops channel: "Salesforce sync failed 3 times. Falling back to secondary sources. Action: Check SFDC API health."

5. RECOVERY
   At 4:00 (outage resolves):
   - Sync job succeeds
   - New account found in SFDC
   - Reconciliation: Compare SFDC version vs in-memory fused version
   - If versions differ: Merge, favor SFDC as authoritative, update Sanity
   - Send Slack notification: "SFDC recovered. Account reconciliation complete."

6. STORE
   Account created earlier from secondary sources is enriched with SFDC data
   Confidence upgraded from 0.65 to 0.95
   Audit trail notes fallback and recovery

```

### 6.5 Stale Fallback and Recovery

**Scenario:** Crunchbase sync hasn't run in 24+ hours. User searches for "Acme Series funding". System uses cached data but flags age.

```
1. QUERY
   User asks (via LLM): "Is Acme in Series B?"
   LLM tool: search_accounts(filter: {name: "Acme"})

2. FETCH
   Durable Object returns cached account:
     stage: "Series B", updated: "2026-03-15" (17 days old)
   Freshness decay: 0.5 ^ (17 / 30) = 0.64
   Effective confidence: 0.85 * 0.64 = 0.54 (medium, borderline)

3. RESPONSE
   LLM tool response:
     {
       "value": "Series B",
       "confidence": 0.54,
       "fresh": false,
       "stale_since_days": 17,
       "recommendation": "Refresh from Crunchbase or call company to confirm"
     }

4. ACTION
   LLM decides: Confidence too low for automated action
   Proposes to user: "Shall I refresh Acme's funding stage from Crunchbase?"
   User approves.

5. REFRESH
   Apollo enrichment worker triggered:
     - Calls Crunchbase API
     - Gets updated stage: "Series C" (announced 2026-03-29)
     - Confidence: 0.65 * 0.95 (1-day-old) = 0.618

   Conflict detected: Existing "Series B" vs new "Series C"
   Decision: Crunchbase newer, flag for review
   Update Sanity account

6. STORE
   Account updated:
     stage: { value: "Series C", certain: false, uncertain: true, ... }
     conflicting_signals: [{ value: "Series B", source: "crunchbase", ... }]
     requires_review: true

```

### 6.6 Re-sync and Recovery

**Scenario:** Sanity Content Lake corrupted (e.g., a contact doc lost). System detects during audit check and re-syncs from raw events.

```
1. DETECTION
   Nightly audit job compares:
     - Sanity entity count vs KV raw event count
     - Detects missing contact doc for "jane-doe-acme-cto"

2. RECOVERY
   Recovery worker triggered:
     - Fetches all raw events for contact (events: evt_001, evt_003, evt_005)
     - Re-processes each through normalization + fusion
     - Applies current fusion rules
     - Generates contact doc from scratch

3. RE-FUSION
   Events replayed in order (by timestamp):
     evt_001 (Chrome): "Jane Doe, CTO, Acme" (confidence 0.75)
     evt_003 (SFDC): "Jane Doe, CTO, account_sfdc_123" (confidence 0.90)
     evt_005 (CR): "Jane Doe hired as CTO" (confidence 0.80)

   Fused result: Jane Doe, CTO at Acme, certain=true, confidence=0.86

4. NOTIFY
   Slack ops: "Data recovery complete. Re-synced 1 missing contact from 3 raw events."
   Linear: Task created to investigate why contact was lost

5. STORE
   Contact doc recreated in Sanity
   Timestamp: Original created date (from evt_001)
   Updated: Recovery timestamp
   Audit trail: "Recovered from raw events, re-fused with current logic"

```

---

## 7. Search and Indexing Strategy

### 7.1 Indexing Model

**Primary Index: Sanity GROQ**
- Full-text search over all account and contact fields
- Faceted search: stage, industry, location, size
- Real-time (updates propagate <100ms)
- Free-form queries ("B2B SaaS in SF with Series B funding")

**Secondary Indexes:**
- **Domain index:** account._id (canonical_id), aliases.domain
- **Email index:** contact.email, contact.emails (array)
- **Phone index:** contact.phone (normalized)
- **Name index:** account.legal_name, contact.name (fuzzy matching)
- **Time index:** updated, created (for "recently added" queries)

### 7.2 Query Examples

**Find all Series B SaaS companies in California:**
```groq
*[_type == "account" && stage.value == "series_b" && industry == "SaaS" && hq_location match "California"] {
  _id,
  legal_name,
  stage,
  founded_date,
  headcount
}
```

**Find contacts at Acme Inc with titles containing "Sales":**
```groq
*[_type == "contact" && account_id == "account_acme-com" && title match "*Sales*"] {
  _id,
  name,
  title,
  email,
  phone
}
```

**Find accounts with conflicting data (requires manual review):**
```groq
*[_type == "account" && requires_review == true] | order(updated desc) {
  _id,
  legal_name,
  requires_review,
  conflicting_signals,
  metadata
}
```

**Time-series: Headcount growth over 90 days:**
```groq
*[_type == "account_snapshot" && account_id == "account_acme-com" && date > now() - 90d] | order(date asc) {
  date,
  headcount: headcount.value,
  source: headcount.sources
}
```

### 7.3 Live Indexing

**On-Write Indexing:**
- When account/contact doc written to Sanity, GROQ index updated automatically
- Sanity Listener triggers webhook → update secondary indexes (KV, Durable Object)
- Latency: <100ms

**Bulk Re-Indexing:**
- Nightly job (UTC 2:00 AM) scans all accounts and contacts
- Recomputes searchable fields (e.g., full names, normalized phones)
- Detects orphaned docs (contacts with missing account_id)
- Takes ~5 minutes for 10,000 accounts

---

## 8. LLM Interface Design

### 8.1 Tools Available to LLM

**Query Tools:**

```typescript
interface SearchAccountsInput {
  query?: string;           // Free-text search
  filters?: {
    stage?: string[];      // ["series_b", "series_c"]
    industry?: string[];
    location?: string[];
    min_headcount?: number;
    max_headcount?: number;
  };
  limit?: number;           // Max results (default 10)
}

interface SearchAccountsOutput {
  results: Account[];
  total_count: number;
  query_time_ms: number;
  note?: string;            // e.g., "Results stale (last updated 2d ago)"
}
```

**Get Account Details:**

```typescript
interface GetAccountInput {
  account_id: string;      // Or: domain, crunchbase_id
}

interface GetAccountOutput {
  account: Account;
  confidence_summary: {
    high_confidence_fields: string[];
    uncertain_fields: string[];
    requires_review: boolean;
  };
  recent_signals: SignalEvent[];  // Last 5 updates
  suggested_actions: string[];    // e.g., "Validate headcount with Apollo"
}
```

**List Contacts:**

```typescript
interface ListContactsInput {
  account_id: string;
  role_filter?: string;      // e.g., "CTO", "VP Sales"
}

interface ListContactsOutput {
  contacts: Contact[];
  total_count: number;
  confidence_metrics: {
    count_high_confidence: number;
    count_uncertain: number;
    count_missing_email: number;
  };
}
```

**Validate and Enrich:**

```typescript
interface EnrichAccountInput {
  account_id: string;
  sources?: string[];        // e.g., ["apollo", "crunchbase"]
  fields?: string[];         // e.g., ["headcount", "funding_date"]
}

interface EnrichAccountOutput {
  account: Account;
  enrichment_results: {
    field: string;
    old_value: any;
    new_value: any;
    source: string;
    confidence: number;
  }[];
  changes_flagged_for_review: string[];
}
```

### 8.2 Trust Handling and Uncertainty

**High-Confidence Data (automated):**
```typescript
// LLM can use directly in reasoning or actions
if (account.stage.confident && account.stage.confidence > 0.80) {
  // Safe to include in Slack alert or API response
  notify_slack(`${account.legal_name} is Series B (high confidence)`);
}
```

**Uncertain Data (requires user approval):**
```typescript
// LLM must ask before acting
if (account.headcount.uncertain) {
  ask_user(`Headcount is uncertain (conflicting sources). Approve enrich?`);
}
```

**Stale Data (refresh recommended):**
```typescript
// LLM suggests refresh but can read
if (is_stale(account.updated, days: 30)) {
  suggest(`This data is 30+ days old. Shall I refresh?`);
}
```

### 8.3 Citation and Tracing

Every response includes lineage:

```typescript
interface FieldWithLineage {
  value: any;
  source: string;
  confidence: number;
  updated: ISO8601;
  lineage: {
    raw_events: string[];    // evt_001, evt_003
    fusion_decisions: string[];  // Conflict resolved via rule X
  };
}
```

**Example LLM Response:**

```
Account: Acme Inc
Stage: Series B
  - Source: Salesforce (2026-03-26)
  - Confidence: 0.95 (authoritative)
  - Lineage: SFDC webhook → normalization → fusion (rule: authoritative wins)

Headcount: 150 (UNCERTAIN)
  - LinkedIn: 150 (confidence 0.70, 2d old)
  - Crunchbase: 120 (confidence 0.65, 7d old)
  - Apollo: 200 (confidence 0.45, 3d old)
  - Conflict: No consensus. Recommend human review.

---
**Recommended next action:** Validate headcount by calling Acme directly or via Apollo's verification service. Shall I enqueue?
```

### 8.4 Action Boundaries

**Automatic (no approval needed):**
- Read queries (search, get, list)
- Enrichment proposals (show gaps)
- Slack notifications (already under confidence threshold)

**Requires User Approval:**
- Mark as high-confidence (override system)
- Create or update contact (could be wrong person)
- Delete or merge entities (irreversible)
- Trigger external action (Apollo, email outreach)
- Overwrite Salesforce data (authoritative source)

**Prohibited (even with approval):**
- Modify Salesforce directly (use their UI)
- Send email/message on behalf of user (privacy)
- Auto-delete entities (compliance)

---

## 9. Workers, Agents, and Jobs

### 9.1 Worker Types

**Synchronous Workers** (sub-500ms):
- Page classifier (scan_page.py → account extraction)
- ID normalizer (URL → canonical form)
- Confidence scorer (signal → score)
- GROQ query executor (search)

**Asynchronous Workers** (1s–5min):
- Transformation pipeline (parse, normalize, score)
- Fusion logic (conflict resolution, consensus)
- Enrichment (Apollo, Crunchbase calls)
- Slack notification (send messages)

**Scheduled Jobs:**
- Salesforce sync (hourly, ~1min)
- Crunchbase sync (daily, ~5min)
- BigQuery sync (daily, ~2min)
- Bulk re-indexing (nightly, ~5min)
- Audit and reconciliation (nightly, ~10min)
- Recovery and repair (as-needed, triggered by alerts)

### 9.2 Architecture (Cloudflare Stack)

```
┌──────────────────────────────────────────────────────────┐
│                  HTTP Endpoints (Workers)                │
│  POST /api/ingest → queues event to Durable Object      │
│  GET  /api/search → queries Sanity, returns cached      │
│  POST /api/enrich → triggers async enrichment           │
│  GET  /api/account/:id → fetches from cache or Sanity  │
└──────────────────────────────────────────────────────────┘
          │
          ├─ DurableObject (stateful)
          │  ├─ Queue: Incoming events (FIFO)
          │  ├─ Cache: Hot accounts (in-memory)
          │  └─ State: Circuit breakers, rate limits
          │
          ├─ Queue/Batch Workers (async processing)
          │  ├─ Transformer (parse, normalize, score)
          │  ├─ Fusion logic (conflict, consensus)
          │  ├─ Enrichment (Apollo, Crunchbase calls)
          │  └─ Slack notifier (send messages)
          │
          ├─ Scheduled Workers (cron)
          │  ├─ SFDC sync (hourly)
          │  ├─ Crunchbase sync (daily)
          │  ├─ BigQuery sync (daily)
          │  ├─ Re-index (nightly)
          │  └─ Audit & repair (nightly)
          │
          └─ Storage
             ├─ Sanity Content Lake (authoritative)
             ├─ KV Store (events, cache, 30d)
             ├─ R2 Bucket (archives, 7y)
             └─ Durable Object State (hot cache)
```

### 9.3 Job Definitions

**SFDC Sync Job:**
```
Schedule: 0 * * * * (hourly)
Worker: sfdc-sync
Steps:
  1. Fetch accounts/contacts modified in last 70 minutes
  2. Normalize IDs, dates, phone, email
  3. Score confidence (0.95 for SFDC)
  4. Emit to Durable Object queue
Timeout: 60s
Retry: exponential backoff (1m, 5m, 15m, 1h)
Circuit breaker: 3 failures → fallback to cache
Alert: ops channel on failure
```

**Transformation Job (async):**
```
Trigger: Event arrives in Durable Object queue
Worker: event-transformer
Steps:
  1. Parse event (type dispatch: page_viewed, signal_received, etc.)
  2. Extract entities (account, contact, relationship)
  3. Normalize fields (domain, email, phone)
  4. Deduplicate within source
  5. Score confidence
  6. Emit normalized_event
Timeout: 10s per event
Dead-letter queue: Send failures to R2 + alert ops
```

**Fusion Job (async):**
```
Trigger: normalized_event arrives
Worker: fusion-engine
Steps:
  1. Fetch current fused entity from Sanity (or cache)
  2. Load conflict resolution rules
  3. Compare new signal vs current state
  4. Apply authoritative/consensus rules
  5. Decide: accept, reject, flag, merge
  6. Generate audit trail entry
  7. Write fusion_output
Timeout: 5s
Dead-letter queue: R2 + alert
```

**Enrichment Job (async):**
```
Trigger: Account flagged for enrichment (gap > threshold)
Worker: enricher
Steps:
  1. Identify gaps (missing fields)
  2. Call Apollo API with account info
  3. Parse response, normalize
  4. Score confidence (0.50–0.70 for Apollo)
  5. Compare vs existing (conflict resolution)
  6. Write updates to Sanity
Timeout: 10s
Rate limit: 10 calls/min per account (avoid rate-limiting)
Alert: on missed call
```

**Slack Notifier Job (async):**
```
Trigger: Account update with confidence > threshold
Worker: slack-notifier
Steps:
  1. Format message (account, change, confidence)
  2. Attach confidence metadata
  3. Fetch channel from config (org.slack_channel_updates)
  4. Send message via Slack MCP
Timeout: 5s
Retry: 3 retries on failure
```

### 9.4 Long-Running Agents

**Account Reconciliation Agent** (daily, ~10 min):
```
Goal: Ensure Sanity state matches authoritative sources
Steps:
  1. Fetch all accounts from Sanity
  2. For each, check if SFDC or Common Room has newer version
  3. Detect conflicts (same ID, different data)
  4. Merge or flag for human review
  5. Report: N accounts synced, M conflicts, P errors
Alert: ops on failures > 10%
```

**Data Quality Agent** (nightly, ~5 min):
```
Goal: Identify stale, uncertain, missing data
Steps:
  1. Find accounts with stale data (updated > 30d ago)
  2. Find contacts without email or phone
  3. Find high-uncertainty fields (confidence < 0.50)
  4. Create Linear tasks for each
  5. Report: N stale, M incomplete, P uncertain
Alert: Slack #data-quality
```

**Repair Agent** (on-demand or scheduled):
```
Goal: Re-sync from raw events, rebuild corrupted entities
Trigger: Manual request (ops) or automated (audit failure)
Steps:
  1. Identify entity to repair (e.g., contact_abc123)
  2. Find all raw events for that entity
  3. Replay through transformation + fusion
  4. Regenerate Sanity doc
  5. Verify consistency
  6. Report: success or failure reason
Alert: ops on completion
```

---

## 10. Latency and Performance Model

### 10.1 Latency Budgets (End-to-End)

**Query (user searches for account):**
```
Component                  | Budget | Notes
---------------------------|--------|-------
Durable Object cache hit    | 50ms   | Hot accounts in memory
Sanity GROQ query (cold)    | 200ms  | Cold account, fetch from API
Network round-trip          | 50ms   | Cloudflare → Sanity
Parse/format response       | 50ms   | JSON serialization
LLM tool execution          | 350ms  | Total query latency
```

**Ingest (event arrives from Chrome):**
```
Component                  | Budget | Notes
---------------------------|--------|-------
Event ingestion (KV write)  | 10ms   | Write raw event
Queue entry (Durable Obj)   | 20ms   | Enqueue for processing
Transformation              | 100ms  | Parse, normalize, score
Fusion logic                | 200ms  | Conflict resolution
Sanity write                | 200ms  | Write fused entity
Cache invalidation          | 50ms   | Update Durable Object
Total (user sees update)    | 580ms  | From click to Sanity
```

**Notification (Slack alert):**
```
Component                  | Budget | Notes
---------------------------|--------|-------
Ingest → Fusion            | 580ms  | (from above)
Confidence check            | 10ms   | Is confidence > threshold?
Slack API call              | 200ms  | Send notification
User receives alert         | ~2s    | Client polling
```

**Enrichment (Apollo call):**
```
Component                  | Budget | Notes
---------------------------|--------|-------
Enrichment trigger          | 0ms    | Queued by fusion worker
Apollo API call             | 5s     | 3rd-party latency
Response parsing            | 100ms  | Normalize fields
Conflict resolution         | 200ms  | Compare with existing
Sanity write                | 200ms  | Update entity
Total (user sees enrichment)| ~5.5s  | If async job enqueued
```

### 10.2 Throughput and Scaling

**Event Throughput:**
- **Peak:** 1,000 events/min (e.g., bulk SFDC sync + Chrome clicks + email stream)
- **Per-worker:** 100 events/sec with auto-scaling
- **Queue:** Durable Object handles bursts up to 10,000 queued events

**Query Throughput:**
- **Sanity GROQ:** 100 queries/sec (free tier, single dataset)
- **Durable Object cache:** 10,000 reads/sec (in-memory)
- **LLM tool calls:** 10 concurrent, 100 total/min (rate-limited by safety approval)

**Storage:**
- **Sanity Content Lake:** 100GB (accounts, contacts, snapshots)
- **KV (30-day events):** 50GB (rolling window)
- **R2 (7-year archives):** 500GB
- **Durable Object state:** 10GB (hot cache, 1,000 accounts)

### 10.3 Scaling Strategy

**Horizontal Scaling:**
- Cloudflare Workers: Auto-scale (regional edge deployment)
- Durable Object: Partition by account shard (e.g., first 3 chars of domain)
- KV Store: Distributed globally

**Caching:**
- Hot accounts (100–1,000) in Durable Object (5min TTL)
- Warm accounts cached in KV (same-region, 30min TTL)
- Cold accounts fetched from Sanity on-demand

**Rate Limiting:**
- Apollo: 10 calls/min per account (avoid rate-limiting)
- Slack: 100 messages/min (per channel)
- Crunchbase: 100 calls/min (API limit)

---

## 11. Failure and Safety Review

### 11.1 Failure Modes and Safeguards

**Split-Brain (Sanity ≠ Durable Object):**

*Cause:* Durable Object cache stale, Sanity updated after cache write
*Symptom:* User sees old data in UI, gets old values in LLM tools
*Safeguard:*
- Cache TTL: 5 minutes (force refresh)
- Sanity Listener: Invalidate cache on update
- Periodic sync: Every 1 hour, compare cache vs Sanity
- If diverged > 10 fields: Alert ops, force refresh

**Duplicates (Same Account, Two Docs):**

*Cause:* ID collision (domain mapped to 2 canonical IDs), import error
*Symptom:* Search returns duplicate results, updates split across docs
*Safeguard:*
- ID collision detection: Nightly job compares domain, email, phone across all accounts
- On detection: Flag for human review (which is authoritative?)
- Merge workflow: Copy fields from dup to primary, delete dup, audit log

**Out-of-Order Events:**

*Cause:* Async processing delays (worker timeout, retry), source clock skew
*Symptom:* Old signal overwrites newer signal (sequence broken)
*Safeguard:*
- Timestamp validation: Reject events more than 7 days old-future
- Version check: Only accept updates with version > current
- Idempotency: If same event (event_id) seen twice, ignore second

**Inconsistent IDs (Contact Email Mismatch):**

*Cause:* Source provides conflicting IDs (email_1@acme.com vs email_2@acme.com, both labeled primary)
*Symptom:* Contact records split, mail routing broken
*Safeguard:*
- Email validation: Check domain match (email @acme.com for contact at Acme Inc)
- Confidence penalization: Email not in account domain = -0.2 confidence
- Merge candidates: Query contacts with similar name + company, flag for review

**Stale Cache, Live Entity Changed:**

*Cause:* Durable Object cache not refreshed, Sanity updated
*Symptom:* LLM tool returns stale data
*Safeguard:*
- Cache versioning: Store Sanity doc version number in cache
- On read: Check if Sanity version > cache version, refresh if needed
- Timeout: If Sanity fetch fails, return stale with warning

**Consensus Failure (All Sources Conflict):**

*Cause:* 3+ sources all report different values (Series A, B, C)
*Symptom:* Cannot decide which to trust
*Safeguard:*
- Fallback: Keep existing value (don't flip on tie)
- Flag: Mark uncertain=true, confidence=0
- Alert: Linear task for human decision
- LLM block: Cannot use in automated actions, must ask user

**Hallucinated LLM Action:**

*Cause:* LLM generates action not in tool set, calls invalid account_id
*Symptom:* Tool call fails, or worse, executes on wrong entity
*Safeguard:*
- Tool validation: Only expose safe tools (read, propose, ask approval)
- Input validation: account_id must exist in Sanity (verify before call)
- Approval workflow: High-risk actions require user checkbox ("I confirm...")
- Rate limit: Max 10 tool calls per user per minute
- Audit log: Every tool call logged with LLM decision trace

**Unsafe Action (Overwrite Salesforce):**

*Cause:* User or LLM tries to push Apollo data back to SFDC
*Symptom:* SFDC record corrupted with unverified data
*Safeguard:*
- Prohibited actions: No direct writes to SFDC (use their API)
- Direction: Only pull from SFDC, never push
- LLM tool: No tool for writing to SFDC
- Manual override: Requires ops approval + clear warning

### 11.2 Retry and Circuit Breaker Strategy

**Retry Policy (Exponential Backoff):**
```
Attempt 1: Immediate
Attempt 2: +5 seconds
Attempt 3: +15 seconds
Attempt 4: +45 seconds
Attempt 5: +2 minutes
→ Give up after 5 attempts (~3 min), log to R2, alert ops
```

**Circuit Breaker:**
```
State: Closed (normal) → Open (error) → Half-Open (recovery)

Thresholds:
  - Error rate > 50% for 30 seconds → Open (block requests)
  - Errors > 5 consecutive → Open immediately

Recovery:
  - Every 60 seconds: Try 1 request (Half-Open)
  - If succeeds: Close circuit
  - If fails: Reopen, double wait time (max 10 min)

Fallback:
  - SFDC sync down: Use cache (up to 24h old)
  - Sanity down: Use Durable Object (in-memory copy)
  - Apollo down: Skip enrichment, continue with existing data
```

### 11.3 Human Override Workflow

**Approval Gate:**
```
LLM proposes action → User sees confirmation box → User clicks "Approve" → Action executes

Required for:
  - Create/update/delete contact (could be wrong person)
  - Overwrite conflicting field (loses data)
  - Push to external API (Apollo, Slack outreach)
  - Merge two accounts (permanent change)

Approval includes:
  - What: Specific action (e.g., "Update Acme headcount to 200")
  - Why: Reasoning (e.g., "Apollo reports 200; Crunchbase 180; confidence 0.65")
  - Sources: Which signals changed (e.g., "apollo_enrichment_2026-04-01")
  - Impact: What changes (e.g., "Updates field headcount only")
```

---

## 12. Observability and Auditability

### 12.1 Logging and Metrics

**Event Logging (JSON, to R2 + KV):**
```json
{
  "timestamp": "2026-04-01T10:23:45.123Z",
  "event_id": "evt_1234567890",
  "event_type": "page_viewed",
  "source": "chrome",
  "entity_type": "account",
  "canonical_id": "acme-com",
  "user_id": "user_123",
  "request_id": "req_xyz123",
  "latency_ms": 45,
  "status": "success|error|warning",
  "error_message": "...",
  "tags": { "source": "chrome", "region": "us-west" }
}
```

**Fusion Decision Logging:**
```json
{
  "timestamp": "2026-04-01T10:24:00.000Z",
  "fusion_id": "fusion_1234567890",
  "entity_id": "account_acme-com",
  "field": "stage",
  "decision": "accept|reject|flag|merge",
  "decision_reason": "authoritative_source_wins|consensus|conflict",
  "old_value": "Series A",
  "old_confidence": 0.95,
  "old_source": "salesforce",
  "new_value": "Series B",
  "new_confidence": 0.82,
  "new_sources": ["crunchbase", "pitchbook"],
  "conflict_detected": true,
  "actions_triggered": ["linear_task_created", "slack_notification_sent"]
}
```

**Metrics (Cloudflare Analytics):**
- Event ingestion rate (events/min)
- Transformation latency (p50, p99)
- Fusion decision latency (p50, p99)
- Cache hit rate (%)
- Sanity API error rate (%)
- Approvals granted/denied (count)
- Manual reviews created (count)

### 12.2 Tracing and Lineage

**End-to-End Request Trace:**
```
request_id: req_xyz123
├─ Chrome MCP: page_viewed (2026-04-01T10:23:00Z)
├─ Ingestion: evt_1234567890 created (10:23:05Z)
├─ Transformation: normalized_event (10:23:10Z, confidence 0.72)
├─ Fusion: fusion_1234567890 (10:24:00Z, decision: flag)
├─ Sanity write: account_acme-com updated (10:24:05Z)
├─ Slack notification: sent (10:24:10Z)
└─ Total latency: 70 seconds

Lineage graph:
  evt_1234567890 → normalized_event → fusion_1234567890 → account_acme-com → slack_msg_456
```

**Replay Capability:**
```
Given event_id evt_1234567890:
  1. Fetch raw event from R2
  2. Re-run through transformer (same code version or specified)
  3. Re-run through fusion (same rules)
  4. Compare result vs what was actually written
  → Detect if logic changed, or if processing was different at time
```

### 12.3 Audit Trail

**Immutable Audit Log (R2, searchable):**
```json
{
  "audit_id": "audit_1234567890",
  "timestamp": "2026-04-01T10:24:00Z",
  "entity_type": "account",
  "entity_id": "account_acme-com",
  "action": "field_updated",
  "field": "stage",
  "old_value": "Series A",
  "new_value": "Series B",
  "old_confidence": 0.95,
  "new_confidence": 0.82,
  "actor": "fusion_system",
  "decision_rule": "multi_source_consensus",
  "sources": ["crunchbase", "pitchbook"],
  "approval_required": false,
  "approval_granted": null,
  "approver": null,
  "lineage": {
    "event_ids": ["evt_1234567890", "evt_1234567891"],
    "fusion_ids": ["fusion_1234567890"],
    "request_ids": ["req_xyz123"]
  }
}
```

**Query Audit Trail:**
```json
{
  "audit_id": "audit_query_1234567890",
  "timestamp": "2026-04-01T10:25:00Z",
  "action": "search",
  "query": "Series B SaaS in California",
  "actor": "llm_agent",
  "actor_type": "ai",
  "results_count": 12,
  "filters_applied": { "stage": "series_b", "industry": "SaaS", "location": "California" },
  "rows_returned": 12,
  "lineage": {
    "groq_query": "*[_type == 'account' && stage == 'series_b' && ...]"
  }
}
```

---

## 13. Gaps and Unknowns

### 13.1 Unresolved Questions

1. **ID Matching Confidence:** How confident must ID match be to merge accounts? (e.g., domain match vs email match)
   - **Current:** Domain > 0.95, Email > 0.90
   - **Risk:** Might miss legitimate matches (Acme Inc vs ACME Technologies)
   - **TODO:** Define fuzzy matching rules, test on 1,000 accounts

2. **Conflict Resolution Tiebreaker:** When 3+ sources conflict equally, how decide?
   - **Current:** Keep existing, flag for human
   - **Risk:** May age-out newer correct data
   - **TODO:** Define 2nd-order heuristics (e.g., source historical accuracy)

3. **Freshness Decay Model:** Half-life = 30 days. Is this too fast for stable fields (e.g., founders)?
   - **Current:** 0.5 ^ (age / 30)
   - **Risk:** Over-decay stable data, under-decay transient data (title, location)
   - **TODO:** Implement per-field decay curves

4. **Common Room Deduplication:** If CR reports same hiring 3 times (across different feeds), count as 1?
   - **Current:** Dedupe within CR source only
   - **Risk:** Duplicate signals inflate confidence
   - **TODO:** Cross-feed deduplication in CR signal processor

5. **LLM Hallucination Detection:** How detect if LLM generates tool calls for non-existent accounts?
   - **Current:** Validate account_id exists before execution
   - **Risk:** LLM might keep asking for same account
   - **TODO:** Add feedback loop (tell LLM "account not found")

### 13.2 Operational Assumptions

1. **Sanity Content Lake always eventually consistent** — Assume writes succeed within 2 minutes
2. **Salesforce sync lags ≤4 hours** — If longer, treat as outage
3. **Chrome page reads are accurate** — No validation that extracted data is real
4. **Email parsing is lossy** — Assume 5% of emails fail to parse, discard
5. **Common Room feed is real-time** — Assume <30s latency from event to API

### 13.3 Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Sanity outage (48h+) | Critical | Fallback to Durable Object cache + R2 replay |
| Salesforce data corruption | High | Weekly audit job compares canonical IDs |
| LLM calls wrong account | High | Validate account_id before action + approval gate |
| All sources disagree (consensus fail) | Medium | Flag for human review, keep existing value |
| ID collision (2 docs, same account) | Medium | Nightly dedup job, merge or alert |
| Email parser fails (5%) | Low | Log failures, manual review queue |

---

## 14. Final Recommended Architecture

### 14.1 Technology Stack

**Data Layer:**
- **Authoritative Store:** Sanity Content Lake (managed, GROQ querying, built-in index)
- **Event Store:** R2 (immutable, unlimited, 7-year retention)
- **Session/Event Cache:** KV Store (30-day rolling, <10ms latency)
- **Live Cache:** Durable Object (in-memory, 5min TTL, stateful)
- **Audit Trail:** R2 + KV queryable index

**Processing Layer:**
- **Event Ingestion:** Cloudflare Workers (HTTP endpoints)
- **Async Processing:** Queue Workers + Durable Object state queue
- **Scheduled Jobs:** Cron Triggers (hourly SFDC, daily Crunchbase, nightly audit)
- **LLM Tools:** Worker endpoints + GROQ query layer

**Integration Layer:**
- **Chrome:** Chrome MCP (built-in, extensible)
- **Salesforce:** REST API + Webhooks (via Worker)
- **Common Room:** MCP (real-time feed)
- **Slack:** MCP (notifications, chat interface)
- **Apollo:** MCP (enrichment on-demand)
- **Google (Gmail, Calendar, Drive, BigQuery):** MCPs (async signals)
- **Linear:** MCP (task creation, issue tracking)

### 14.2 Recommended Data Model

**Account Document (Sanity):**
```typescript
interface Account {
  _type: "account";
  _id: string;                   // e.g., "account_acme-com"
  canonical_id: string;          // e.g., "acme-com" (domain-based)

  // Core fields
  legal_name: Field<string>;
  domain: Field<string>;
  founded_date: Field<string>;
  industry: Field<string>;
  stage: Field<string>;          // "seed" | "series_a" | ...
  headcount: Field<number>;
  hq_location: Field<string>;

  // Multi-valued
  contact_ids: string[];         // Array of contact._id references
  funding_rounds: Round[];

  // Metadata
  metadata: {
    created: ISO8601;
    updated: ISO8601;
    last_enriched: ISO8601;
    fusion_version: number;
    requires_review: boolean;
    review_reason?: string;
  };

  // Confidence and sources
  conflicting_signals?: Signal[];
  signal_summary: {
    high_confidence_fields: string[];
    uncertain_fields: string[];
    stale_fields: string[];
  };
}

interface Field<T> {
  value: T;
  certain: boolean;
  uncertain?: boolean;
  confidence: number;            // 0.0–1.0
  source: string;                // "salesforce", "crunchbase", etc.
  sources?: string[];            // Multi-source field
  updated: ISO8601;
  freshness_decayed: number;     // For UI display
  conflicting_values?: {
    value: T;
    source: string;
    confidence: number;
  }[];
}
```

**Contact Document:**
```typescript
interface Contact {
  _type: "contact";
  _id: string;                   // "contact_jane-doe-acme-com"
  canonical_id: string;          // "jane-doe@acme-com"

  // Core
  name: Field<string>;
  title: Field<string>;
  email: Field<string>;
  phone: Field<string>;
  linkedin_url: Field<string>;

  // Relationship
  account_id: string;            // Reference to Account._id

  // Metadata
  metadata: {
    created: ISO8601;
    updated: ISO8601;
    requires_review: boolean;
  };
}
```

### 14.3 Event Flow (High Level)

```
1. SOURCE INGESTION
   Chrome MCP → page_viewed event
   Salesforce Webhook → account_upserted event
   Common Room MCP → signal_received event

2. TRANSFORMATION (Worker)
   Parse event → Extract account/contact
   Normalize fields (domain, email, phone)
   Score confidence
   → Emit normalized_event to Durable Object queue

3. FUSION (Worker)
   Fetch current account from Sanity/cache
   Apply conflict resolution rules
   Decide: accept, reject, flag
   → Emit fusion_output + audit trail

4. PERSISTENCE
   Write account/contact to Sanity
   Update Durable Object cache
   Write audit trail to R2

5. NOTIFICATIONS
   Sanity Listener → watch account changes
   Check confidence threshold
   If above: Notify Slack (or Linear if uncertain)

6. QUERY/ACTION
   LLM calls search_accounts() → GROQ query → Sanity
   LLM calls enrich_account() → trigger Apollo → update Sanity
   LLM proposes action → user approves → execute → audit log
```

### 14.4 Safeguards and Guardrails

| Safeguard | Mechanism | Threshold |
|-----------|-----------|-----------|
| Cache invalidation | TTL 5 minutes | Sanity > Durable Object by >5 fields |
| Duplicate detection | Nightly dedup job | Domain/email collision |
| Consensus failure | Flag + Linear task | All sources conflict |
| Stale data | Freshness decay | >30 days old |
| Uncertain confidence | Flag + ask user | <0.75 confidence |
| Split-brain (cache divergence) | Sync job + alert | >10 field differences |
| Outage fallback | Circuit breaker | 3 consecutive errors |
| LLM hallucination | Input validation | account_id must exist |
| Unsafe action | Prohibited list | No SFDC write-back |
| Rate limiting | Bucket + reject | 100 events/sec per source |

### 14.5 Deployment and Rollout

**Phase 1 (Weeks 1–2): Foundation**
- Deploy Sanity Content Lake schema (Account, Contact, Snapshot)
- Deploy Durable Object (cache + queue)
- Deploy HTTP endpoints (ingest, search)
- Test with Chrome MCP manually

**Phase 2 (Weeks 3–4): Integrations**
- Deploy Salesforce sync worker (hourly)
- Deploy transformation pipeline
- Deploy fusion logic
- Test with 100 SFDC accounts

**Phase 3 (Weeks 5–6): Notifications and Enrichment**
- Deploy Slack notifications
- Deploy Linear task creation
- Deploy Apollo enrichment
- Test with full feed (1,000 events/day)

**Phase 4 (Weeks 7–8): LLM Interface and UI**
- Deploy GROQ tools for LLM
- Deploy approval workflow
- Deploy observability (logging, metrics)
- User testing with sales team

**Phase 5 (Weeks 9–10): Scale and Stabilize**
- Monitor CPU, memory, latency
- Auto-scale workers
- Fix performance bottlenecks
- Deploy audit trail and replay

### 14.6 SLOs and Success Criteria

| Metric | Target | Alert Threshold |
|--------|--------|---|
| Ingest latency (p99) | <1s | >2s |
| Query latency (p99) | <500ms | >1s |
| Fusion latency (p99) | <1s | >2s |
| Cache hit rate | >80% | <70% |
| SFDC sync success rate | >99% | <95% |
| Data freshness (hot accounts) | <5 min | >30 min |
| Duplicate detection (nightly) | 0 undetected dupes | >5 |
| Manual review queue (uncertain fields) | <50 items/week | >100 |
| Approval latency (avg) | <1h | >4h |
| Availability (uptime) | >99.5% | <99% |

---

## Conclusion

This architecture provides Chrome Inspector with a **production-grade sensor fusion system** that:

1. **Unifies 10+ data sources** into a canonical account/contact model
2. **Handles conflicts** explicitly via rule-based fusion and human escalation
3. **Tracks confidence** at field-level to guide automated actions
4. **Enables live updates** with <5 minute propagation to Slack, LLM, UI
5. **Audits all decisions** for compliance and forensics
6. **Safeguards against hallucination and data corruption** via approval gates and consistency checks
7. **Scales horizontally** across Cloudflare's global edge
8. **Integrates tightly with Sanity** as the canonical store

The system is operationally credible, with clear failure modes, recovery procedures, and observability. It prioritizes safety (human-in-the-loop for uncertain/high-risk decisions) while remaining fast for known-good signals.

**Next steps:** Implement Phase 1 foundation, validate with internal team, then scale to production.
