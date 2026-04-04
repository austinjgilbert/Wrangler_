# Wrangler_ Sanity Production Dataset — Data Coverage Audit

**Date:** 2026-04-03  
**Project:** `nlqb7zmk` / dataset `production`  
**Total documents:** 1,821 (excluding system docs)

---

## Dataset Overview — Document Type Distribution

| Document Type | Count | % of Total |
|---|---:|---:|
| userPattern | 405 | 22.2% |
| accountPack | 317 | 17.4% |
| usageLog | 317 | 17.4% |
| userInteraction | 223 | 12.2% |
| interaction | 210 | 11.5% |
| **actionCandidate** | **129** | **7.1%** |
| technology | 107 | 5.9% |
| **person** | **76** | **4.2%** |
| competitorResearch | 20 | 1.1% |
| accountPlanContextDraft | 12 | 0.7% |
| **account** | **3** | **0.2%** |
| brief | 1 | 0.05% |
| gmailDraft | 1 | 0.05% |
| **signal** | **0** | **0.0%** |

> **Key observation:** The four document types the card protocol depends on (account, person, signal, actionCandidate) represent only **208 of 1,821 documents (11.4%)**. The dataset is dominated by operational/logging types (userPattern, usageLog, userInteraction = 52%).

---

## 1. Account Coverage

**Total accounts: 3**

| Field | Has Field | Coverage | Notes |
|---|---:|---:|---|
| name | 3 | **100.0%** | ✅ Always present |
| companyName | 3 | **100.0%** | ✅ Always present |
| domain | 3 | **100.0%** | ✅ Always present |
| profileCompleteness.score | 3 | **100.0%** | ✅ Always present |
| classification.aiReadinessTier | 3 | **100.0%** | ✅ Always present |
| opportunityScore | 2 | **66.7%** | ⚠️ 1 account missing |
| industry | 2 | **66.7%** | ⚠️ 1 account missing |
| technologyStack | 2 | **66.7%** | ⚠️ 1 account missing |
| benchmarks.estimatedEmployees | 0 | **0.0%** | 🔴 **Never populated** |

### ⚠️ Critical: Only 3 accounts exist

The entire dataset has only **3 account documents**. This is an extremely small number — the card protocol's account cards will have very limited data to work with. Any retrieval query for accounts will return a near-empty result set.

### Sample Account Data (top 2 by opportunityScore)

```json
[
  {
    "name": "bfc8ce1478c83c2e",
    "companyName": "bfc8ce1478c83c2e",
    "domain": "app.nooks.in",
    "opportunityScore": 0,
    "industry": "Unknown",
    "profileScore": 61,
    "techStackKeys": true,
    "employeeEst": null,
    "aiTier": "early"
  },
  {
    "name": "Nooks",
    "companyName": "Nooks",
    "domain": "api.nooks.in",
    "opportunityScore": 0,
    "industry": "Unknown",
    "profileScore": 37,
    "techStackKeys": true,
    "employeeEst": null,
    "aiTier": "early"
  }
]
```

**Observations on sample data:**
- One account has a **hash as its name** (`bfc8ce1478c83c2e`) — not a real company name
- Both accounts have `opportunityScore: 0` — the scoring pipeline may not be running
- Both have `industry: "Unknown"` — industry classification isn't working
- Both have `employeeEst: null` — employee estimation never populated
- Both are classified as `aiTier: "early"` — no differentiation
- `profileScore` ranges from 37–61, suggesting partial enrichment

---

## 2. Person Coverage

**Total persons: 76**

| Field | Has Field | Coverage | Notes |
|---|---:|---:|---|
| name | 76 | **100.0%** | ✅ Always present |
| seniorityLevel | 73 | **96.1%** | ✅ Nearly always present |
| currentCompany | 35 | **46.1%** | ⚠️ Less than half |
| linkedinUrl | 24 | **31.6%** | ⚠️ Only ~1/3 |
| currentTitle | 10 | **13.2%** | 🔴 Very sparse |
| about | 0 | **0.0%** | 🔴 **Never populated** |
| relationshipStrength | 0 | **0.0%** | 🔴 **Never populated** |

### Analysis

- **`name`** and **`seniorityLevel`** are well-populated — these are reliable for card rendering
- **`currentCompany`** is missing for 54% of persons — company association cards will be incomplete
- **`linkedinUrl`** is only 31.6% — LinkedIn profile links will be absent for most people
- **`currentTitle`** at 13.2% is critically low — person cards that show job titles will be mostly empty
- **`about`** (0%) and **`relationshipStrength`** (0%) are **completely unpopulated** — any card protocol fields depending on these will always be null

---

## 3. Signal Coverage

**Total signals: 0**

| Field | Has Field | Coverage | Notes |
|---|---:|---:|---|
| summary | 0 | N/A | 🔴 No signals exist |
| signalType | 0 | N/A | 🔴 No signals exist |
| account | 0 | N/A | 🔴 No signals exist |
| timestamp | 0 | N/A | 🔴 No signals exist |
| recentSignals (since 2026-03-28) | 0 | N/A | 🔴 No signals exist |

### ⚠️ Critical: Zero signal documents

The `signal` document type has **zero documents**. This means:
- Signal-based cards will never render
- Any "recent activity" or "what's happening" features will be empty
- The retrieval layer's signal queries will always return empty arrays
- Time-based filtering (recent signals) is moot

This is the most significant gap in the dataset. The signal pipeline appears to have never written to production, or signals are stored under a different type (possibly `interaction` with 210 docs, or `userInteraction` with 223 docs).

---

## 4. Action Candidate Coverage

**Total action candidates: 129**

| Field | Has Field | Coverage | Notes |
|---|---:|---:|---|
| recommendedNextStep | 129 | **100.0%** | ✅ Always present |
| whyNow | 129 | **100.0%** | ✅ Always present |
| urgency | 129 | **100.0%** | ✅ Always present |
| opportunityScore | 129 | **100.0%** | ✅ Always present |
| account | 129 | **100.0%** | ✅ Always present |

### ✅ Action Candidates are fully populated

This is the **best-populated document type** in the dataset. Every single action candidate has all expected fields at 100% coverage. The action card protocol can rely on these fields being present.

---

## Summary: Card Protocol Field Reliability

### Fields that WILL work (>90% coverage)
| Type | Field | Coverage |
|---|---|---:|
| account | name, companyName, domain, profileCompleteness, classification | 100% |
| person | name | 100% |
| person | seniorityLevel | 96% |
| actionCandidate | ALL fields | 100% |

### Fields that are UNRELIABLE (10–90% coverage)
| Type | Field | Coverage |
|---|---|---:|
| account | opportunityScore, industry, technologyStack | 67% |
| person | currentCompany | 46% |
| person | linkedinUrl | 32% |
| person | currentTitle | 13% |

### Fields that will ALWAYS be empty (0% coverage)
| Type | Field | Coverage |
|---|---|---:|
| account | benchmarks.estimatedEmployees | **0%** |
| person | about | **0%** |
| person | relationshipStrength | **0%** |
| signal | ALL fields | **0% (type doesn't exist)** |

### Document types that DON'T EXIST
| Type | Expected By | Status |
|---|---|---|
| signal | Card protocol, retrieval layer | **⚠️ ZERO documents** |

---

## Recommendations

1. **Signal pipeline is broken or not deployed** — The complete absence of `signal` documents is the #1 issue. Check if signals are being written to a different type (e.g., `interaction` has 210 docs) or if the pipeline hasn't been connected to production.

2. **Account data is minimal** — Only 3 accounts exist. The `accountPack` type (317 docs) may contain the enriched account data that should be surfaced. Consider whether the card protocol should query `accountPack` instead of or in addition to `account`.

3. **Person enrichment gaps** — `currentTitle` (13%), `about` (0%), and `relationshipStrength` (0%) need enrichment pipelines. The LinkedIn scraper may need to populate `about` and `currentTitle`.

4. **Employee estimates never populated** — `benchmarks.estimatedEmployees` is 0% across all accounts. Either remove from card protocol or connect an enrichment source.

5. **Action candidates are solid** — The 129 action candidates are fully populated and can be relied upon. This should be the primary card type for the MVP.

6. **Investigate related types** — The dataset has 210 `interaction` docs, 223 `userInteraction` docs, and 107 `technology` docs that may contain data the card protocol could use but isn't querying.

---

## Raw Query Results

### Account Query Response
```json
{
  "total": 3,
  "hasName": 3,
  "hasCompanyName": 3,
  "hasDomain": 3,
  "hasOpportunityScore": 2,
  "hasIndustry": 2,
  "hasProfileCompleteness": 3,
  "hasTechStack": 2,
  "hasEmployeeEstimate": 0,
  "hasClassification": 3
}
```

### Person Query Response
```json
{
  "total": 76,
  "hasName": 76,
  "hasTitle": 10,
  "hasCompany": 35,
  "hasLinkedin": 24,
  "hasAbout": 0,
  "hasSeniority": 73,
  "hasRelationshipStrength": 0
}
```

### Signal Query Response
```json
{
  "total": 0,
  "hasSummary": 0,
  "hasSignalType": 0,
  "hasAccount": 0,
  "hasTimestamp": 0,
  "recentSignals": 0
}
```

### Action Candidate Query Response
```json
{
  "total": 129,
  "hasRecommendedNextStep": 129,
  "hasWhyNow": 129,
  "hasUrgency": 129,
  "hasOpportunityScore": 129,
  "hasAccount": 129
}
```
