# Codebase Review & Alignment with New GPT Instructions

**Date**: January 10, 2026  
**Status**: Review Complete - Alignment Issues Identified

## ✅ System Health Check

### Syntax & Errors
- ✅ **No syntax errors** - All files compile successfully
- ✅ **No linting errors** - All code passes linting
- ✅ **Error handling** - Try-catch blocks properly implemented
- ✅ **Import paths** - All imports resolve correctly

### Critical Issues Found: **NONE**
- No breaking errors
- No silent failures
- Services are functional

---

## ⚠️ Alignment Issues with New GPT Instructions

### 1. **Opportunity Confidence Score** (High Priority)

**Current State:**
- Uses `opportunityScore` (0-100) ✅
- Returns multiple scores (opportunity, aiReadiness, performance, businessScale) ❌
- No confidence markers (🟢/🟡) ❌
- No "What would change this score?" prompt ❌

**Location:** 
- `src/index.js:2404` - `opportunityScore` calculation
- `src/services/person-intelligence-service.js:867-872` - Multiple scores returned

**Required Fix:**
- Make `opportunityScore` the PRIMARY score (rename to `opportunityConfidence`)
- Add confidence marker based on evidence strength:
  - 🟢 High-confidence (>=70 with strong evidence)
  - 🟡 Informed speculation (<70 or weaker evidence)
- Add `whatWouldChangeScore` field to all score outputs
- Secondary scores (AI readiness, performance, business scale) should be supporting narrative, not primary

**Example Fix:**
```javascript
const opportunityConfidence = {
  score: scanResult.opportunityScore,
  confidence: scanResult.opportunityScore >= 70 && strongEvidence ? 'high' : 'medium',
  marker: scanResult.opportunityScore >= 70 && strongEvidence ? '🟢' : '🟡',
  whatWouldChangeScore: generateWhatWouldChangeScore(scanResult, execClaims),
  supportingScores: {
    aiReadiness: scanResult.aiReadinessScore,
    performance: scanResult.performanceScore,
    businessScale: scanResult.businessScaleScore,
  }
};
```

---

### 2. **Evidence → Insight → Assumption Structure** (High Priority)

**Current State:**
- Executive summaries just list facts ❌
- Brief generation doesn't separate evidence from inference ❌
- No explicit "assumed" section ❌

**Location:**
- `src/services/person-intelligence-service.js:837-864` - `synthesizePersonBrief()`
- `src/index.js:4519-4617` - `generateBrief()`

**Required Fix:**
Restructure brief output to include:
```javascript
{
  evidenceInsights: [
    {
      observed: "Found legacy CMS (AEM) in tech stack",
      interpreted: "High maintenance costs and limited flexibility",
      assumed: "Migrating to headless would reduce TCO by 40-60%"
    }
  ]
}
```

---

### 3. **Persona Lens** (High Priority - Missing)

**Current State:**
- No persona selection logic ❌
- ROI plays use generic "who" (CTO/Technology Leadership, Executive Team) ❌
- No single persona framing ❌

**Location:**
- `src/services/person-intelligence-service.js:924-962` - `extractTopRoiPlays()`

**Required Fix:**
Add persona detection and selection:
```javascript
function selectPrimaryPersona(scanResult, execClaims, inferredFunction) {
  // Detect from tech stack, job postings, inferred function
  const personas = ['Engineering', 'Marketing', 'Digital', 'Product', 'IT', 'Security'];
  // Return single primary persona
  // Frame with: one pain, one gain, one metric
}
```

Update ROI plays to use single persona:
```javascript
{
  what: 'Legacy System Modernization',
  why: 'Currently using AEM - high maintenance costs',
  who: 'CTO', // Single specific persona, not "CTO/Technology Leadership"
  personaLens: {
    primaryPersona: 'Engineering',
    pain: 'Developer-dependent deployments create bottlenecks',
    gain: 'Reduce deployment time by 80%',
    metric: 'Time-to-market for content updates'
  }
}
```

---

### 4. **Executive Summary Format** (Medium Priority)

**Current State:**
- Format exists (2-4 bullets) ✅
- But not always "plain language, business-relevant, no jargon" ❌
- Example: "High opportunity score (75) indicates significant modernization potential" - too technical ❌

**Location:**
- `src/services/person-intelligence-service.js:841-864`

**Required Fix:**
Refactor to plain language:
```javascript
// Before:
"High opportunity score (75) indicates significant modernization potential."

// After:
"Modernizing their CMS would reduce costs by 40% and speed up content delivery."
```

---

### 5. **ROI Plays Structure** (Medium Priority)

**Current State:**
- Structure exists (what/why/who) ✅
- But "who" is generic/multiple ❌
- Missing persona lens (one pain, one gain, one metric) ❌

**Location:**
- `src/services/person-intelligence-service.js:924-962`

**Required Fix:**
Enhance to include persona lens:
```javascript
{
  what: 'Legacy System Modernization',
  why: 'Currently using AEM - high maintenance costs and limited flexibility',
  who: 'CTO', // Single specific persona
  personaLens: {
    primaryPersona: 'Engineering',
    pain: 'Developer-dependent deployments create bottlenecks',
    gain: 'Reduce deployment time by 80%',
    metric: 'Time-to-market for content updates'
  }
}
```

---

### 6. **"So What?" / Next-Step Questions** (Medium Priority)

**Current State:**
- Questions exist ✅
- But generic/pitch-focused ❌
- Example: "What specific strategic challenges is [name] facing that we could help address?" - too pitchy ❌

**Location:**
- `src/services/person-intelligence-service.js:894`

**Required Fix:**
Reframe to advance conversation, not pitch:
```javascript
// Before:
"What specific strategic challenges is [name] facing that we could help address?"

// After:
"What's driving their current initiative to modernize content delivery?"
// or
"How are they managing content across their current stack of AEM and Drupal?"
```

---

### 7. **Confidence Markers** (Low Priority - Formatting)

**Current State:**
- No 🟢/🟡 markers in outputs ❌
- Confidence exists as string ('high'/'medium'/'low') but not formatted ❌

**Location:**
- All scoring functions

**Required Fix:**
Add confidence markers to response formatting:
```javascript
const confidenceMarker = confidence === 'high' ? '🟢' : '🟡';
```

---

## 🔧 Files Requiring Updates

### High Priority
1. **`src/services/person-intelligence-service.js`**
   - Add Opportunity Confidence with markers
   - Add Evidence → Insight → Assumption structure
   - Add Persona Lens selection
   - Refine executive summaries
   - Improve ROI plays structure
   - Enhance next-step questions

2. **`src/index.js`** (Scan Response Formatting)
   - Add Opportunity Confidence markers
   - Add "What would change this score?"
   - Prioritize opportunityScore over other scores

3. **`src/services/unified-orchestrator.js`**
   - Update to use new Opportunity Confidence format
   - Add persona lens to synthesis

### Medium Priority
4. **`src/index.js`** (Brief Generation)
   - Restructure to Evidence → Insight → Assumption format
   - Plain language executive summaries

5. **Response Schemas**
   - Update OpenAPI schemas to include new fields
   - Add personaLens, whatWouldChangeScore, evidenceInsights

---

## 📋 Implementation Plan

### Phase 1: Core Scoring (High Priority)
- [ ] Add Opportunity Confidence with markers (🟢/🟡)
- [ ] Add "What would change this score?" calculation
- [ ] Make opportunityScore primary, others supporting

### Phase 2: Output Structure (High Priority)
- [ ] Add Evidence → Insight → Assumption structure
- [ ] Add Persona Lens selection logic
- [ ] Refactor executive summaries to plain language

### Phase 3: Enhanced ROI Plays (Medium Priority)
- [ ] Add persona lens to ROI plays (one pain, one gain, one metric)
- [ ] Single specific persona (not generic/multiple)
- [ ] Improve next-step questions (advance conversation, not pitch)

### Phase 4: Formatting & Polish (Low Priority)
- [ ] Add confidence markers to all score outputs
- [ ] Update response schemas
- [ ] Test with real data

---

## ✅ What's Already Working Well

1. **Executive Summary Bounds**: Correctly limited to 2-4 bullets ✅
2. **ROI Plays Structure**: What/Why/Who exists ✅
3. **Score Calculation**: Opportunity score logic is sound ✅
4. **Error Handling**: Comprehensive try-catch blocks ✅
5. **Data Bounds**: Properly bounded (400 chars, max 3 ROI plays, etc.) ✅

---

## 🎯 Priority Summary

| Issue | Priority | Effort | Impact |
|-------|----------|--------|--------|
| Opportunity Confidence with markers | High | Medium | High |
| Evidence → Insight → Assumption | High | High | High |
| Persona Lens | High | Medium | High |
| Executive Summary plain language | Medium | Low | Medium |
| ROI Plays persona lens | Medium | Medium | Medium |
| Next-step questions | Medium | Low | Medium |
| Confidence markers formatting | Low | Low | Low |

---

**Status**: ✅ **REVIEW COMPLETE** - Codebase is functional but needs alignment updates with new GPT instructions.

**Recommendation**: Start with Phase 1 (Core Scoring) to align with new "Opportunity Confidence" framework, then proceed with Phase 2 (Output Structure).
