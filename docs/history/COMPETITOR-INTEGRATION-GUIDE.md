# Competitor Research Integration Guide

## Overview

This guide explains how to integrate the competitor research system into your Worker to automatically discover, research, and compare competitors for prospecting opportunities.

## Integration Steps

### Step 1: Add Competitor Routes

**Location**: `src/index.js` - Main router (around line 8112)

**Add routes**:

```javascript
import {
  handleResearchCompetitors,
  handleGetCompetitorResearch,
  handleGetProspectingOpportunities,
} from './handlers/competitors.js';

// In main router:
} else if (url.pathname.startsWith('/competitors/')) {
  if (url.pathname === '/competitors/research') {
    if (request.method === 'POST') {
      return await handleResearchCompetitors(
        request,
        requestId,
        env,
        groqQuery,
        upsertDocument,
        patchDocument,
        assertSanityConfigured,
        null // getAccountData function if needed
      );
    } else if (request.method === 'GET') {
      return await handleGetCompetitorResearch(
        request,
        requestId,
        env,
        groqQuery,
        assertSanityConfigured
      );
    } else {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'GET or POST required', {}, 405, requestId);
    }
  } else if (url.pathname === '/competitors/opportunities') {
    if (request.method !== 'GET') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'GET required', {}, 405, requestId);
    }
    return await handleGetProspectingOpportunities(
      request,
      requestId,
      env,
      groqQuery,
      assertSanityConfigured
    );
  }
```

### Step 2: Auto-Research After Enrichment

**Location**: `src/index.js` - After enrichment completes

**Add after account enrichment**:

```javascript
import { researchCompetitors } from './services/competitor-research.js';

// After account enrichment completes
if (accountResearchSet && accountResearchSet.status === 'complete') {
  try {
    // Research competitors in background
    await researchCompetitors(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      accountKey,
      account,
      accountResearchSet,
      { competitorLimit: 10 }
    );
    // Competitor research queued and executing
  } catch (compError) {
    // Don't break if competitor research fails
  }
}
```

### Step 3: Add Competitor Research to Account Queries

**Location**: Account query handler

**Add competitor research to account response**:

```javascript
import { getCompetitorResearch, identifyProspectingOpportunities, buildIndustryProfile } from './services/competitor-research.js';

// When returning account data
const competitorResearch = await getCompetitorResearch(groqQuery, client, accountKey);
const opportunities = competitorResearch ? identifyProspectingOpportunities(competitorResearch) : [];
const industryProfile = competitorResearch ? buildIndustryProfile(competitorResearch) : null;

return createSuccessResponse({
  account: account,
  researchSet: accountResearchSet,
  competitorResearch: competitorResearch,
  opportunities: opportunities,
  industryProfile: industryProfile,
}, requestId);
```

## Usage Examples

### Research Competitors
```bash
curl -X POST "https://your-worker.workers.dev/competitors/research" \
  -H "Content-Type: application/json" \
  -d '{
    "accountKey": "abc123",
    "options": {
      "competitorLimit": 10
    }
  }'
```

### Get Competitor Research
```bash
curl "https://your-worker.workers.dev/competitors/research?accountKey=abc123"
```

### Get Prospecting Opportunities
```bash
curl "https://your-worker.workers.dev/competitors/opportunities?accountKey=abc123"
```

## Competitor Discovery Flow

1. **Target Account**: Account with complete research set
2. **Discovery**: 5 strategies find competitor candidates
3. **Enrichment**: Each competitor gets full research pipeline
4. **Comparison**: Comparative analysis across all dimensions
5. **Opportunities**: Prospecting opportunities identified
6. **Industry Profile**: Industry/niche profile built

## Discovery Strategies

### 1. Technology Stack
- Matches accounts with similar CMS, frameworks, legacy systems
- Score based on number of common technologies
- High confidence for tech stack matches

### 2. Industry/Sector
- Matches accounts in same industry or sector
- Medium confidence
- Good for industry-specific prospecting

### 3. Business Model
- Matches accounts with similar business scale
- Medium confidence
- Useful for size-based targeting

### 4. Geography
- Matches accounts in same regions
- Lower confidence
- Good for regional prospecting

### 5. Market Positioning
- Matches accounts with similar opportunity scores
- Medium confidence
- Finds companies at similar stage

## Comparative Analysis Output

### Technology Comparison
```javascript
{
  accountTech: { cms: [...], frameworks: [...] },
  competitorTech: { cms: [...], frameworks: [...] },
  gaps: ['Technology competitors use'],
  advantages: ['Technology account uses'],
  modernizationOpportunities: [...],
}
```

### Positioning Comparison
```javascript
{
  accountPositioning: { valueProposition: '...', marketPosition: '...' },
  competitorPositionings: [...],
  positioningGaps: [...],
  uniquePositioning: [...],
}
```

### Market Comparison
```javascript
{
  accountPosition: 'challenger',
  competitorPositions: [...],
  relativePosition: 'behind', // ahead, at_parity, behind
}
```

### Performance Comparison
```javascript
{
  accountScore: 75,
  averageCompetitorScore: 82,
  relativePerformance: -7,
  performanceRank: 3,
}
```

## Opportunity Types

### Technology Gap
- Account lacks technologies competitors use
- High priority
- Prospecting angle: Help adopt competitor technologies

### Modernization
- Account uses legacy while competitors modernized
- High priority
- Prospecting angle: Help modernize to compete

### Performance
- Account performance below competitors
- Medium priority
- Prospecting angle: Improve performance to competitive levels

### Industry Trend
- Competitors adopting industry trends
- Medium priority
- Prospecting angle: Help adopt industry trends

### Market Expansion
- Account behind in market position
- Medium priority
- Prospecting angle: Help expand market presence

## Industry Profile

```javascript
{
  industry: 'SaaS',
  niche: 'technology_sector',
  competitorCount: 5,
  commonTechnologies: ['WordPress', 'React'],
  dominantBusinessScale: 'enterprise',
  marketPositionDistribution: {
    market_leader: 2,
    challenger: 2,
    established: 1,
  },
  averageTechStackSize: 4.2,
  industryTrends: ['React', 'Headless CMS'],
}
```

## Prospecting Strategy

### 1. Identify Target Account
- Account with complete research set
- High opportunity score
- Clear pain points

### 2. Research Competitors
- Discover 5-10 competitors
- Enrich each competitor
- Build comparative analysis

### 3. Identify Opportunities
- Technology gaps
- Modernization needs
- Performance improvements
- Industry trends

### 4. Build Industry Profile
- Understand competitive landscape
- Identify common patterns
- Find industry trends

### 5. Prospecting Approach
- Use opportunity-specific angles
- Reference competitor examples
- Highlight industry trends
- Address specific gaps

## Benefits

1. **Complete Competitive Intelligence**: Full research on all competitors
2. **Data-Driven Prospecting**: Clear opportunities with angles
3. **Industry Understanding**: Know the competitive landscape
4. **Comparative Insights**: Understand relative position
5. **Targeted Approach**: Specific prospecting angles per opportunity

## Storage

### Competitor Research Document
- Type: `competitorResearch`
- Stored in: Sanity
- Linked to: `accountPack.payload.competitorResearch`

### Structure
```javascript
{
  _type: 'competitorResearch',
  accountKey: 'abc123',
  competitors: [...],
  comparison: {...},
  opportunities: [...],
  insights: [...],
}
```

## Monitoring

### Track Competitor Research
- Jobs queued
- Competitors discovered
- Enrichments completed
- Opportunities identified

### Metrics
- Average competitors per account
- Discovery strategy effectiveness
- Opportunity identification rate
- Industry profile accuracy

---

**The competitor research system is ready to provide complete competitive intelligence for prospecting!**

