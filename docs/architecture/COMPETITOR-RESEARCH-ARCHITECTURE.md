# Competitor Research & Comparative Analysis Architecture

## Overview

A comprehensive competitor research system that:
1. Discovers direct competitors using multiple strategies
2. Enriches each competitor with full research pipeline
3. Performs comparative analysis
4. Identifies prospecting opportunities
5. Builds industry/niche profiles

## Key Features

### ✅ Multi-Strategy Competitor Discovery
- **Technology-based**: Find companies using similar tech stack
- **Industry-based**: Match by industry/sector
- **Business model**: Match by business scale
- **Geographic**: Match by region
- **Positioning**: Match by market position/opportunity score

### ✅ Complete Competitor Research
- Each competitor gets full enrichment pipeline
- Same research set as target account
- Background execution (non-blocking)

### ✅ Comparative Analysis
- Technology stack comparison
- Market positioning comparison
- Business model comparison
- Performance comparison
- Gap identification

### ✅ Opportunity Identification
- Technology gaps
- Modernization opportunities
- Performance improvements
- Industry trends
- Market expansion

### ✅ Industry/Niche Profiling
- Common technologies
- Dominant business scales
- Market position distribution
- Industry trends

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Target Account                              │
│  - Account data                                          │
│  - Complete research set                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Competitor Discovery                             │
│  Strategy 1: Technology stack                            │
│  Strategy 2: Industry/sector                             │
│  Strategy 3: Business model                               │
│  Strategy 4: Geography                                   │
│  Strategy 5: Market positioning                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Competitor Enrichment                            │
│  - Queue enrichment for each competitor                  │
│  - Full research pipeline                                │
│  - Background execution                                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Comparative Analysis                             │
│  - Technology comparison                                 │
│  - Positioning comparison                                │
│  - Market comparison                                     │
│  - Business model comparison                             │
│  - Performance comparison                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Opportunity Identification                       │
│  - Technology gaps                                       │
│  - Modernization needs                                   │
│  - Performance improvements                             │
│  - Industry trends                                       │
│  - Market expansion                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Industry/Niche Profile                           │
│  - Common technologies                                   │
│  - Dominant scales                                       │
│  - Market positions                                      │
│  - Trends                                                │
└─────────────────────────────────────────────────────────┘
```

## Competitor Discovery Strategies

### Strategy 1: Technology Stack
**Query**: Find accounts with similar CMS, frameworks, or legacy systems

**Match Criteria**:
- At least one common technology
- Score based on number of common technologies

**Example**:
```javascript
{
  domain: 'competitor.com',
  matchScore: 0.75,
  matchReasons: ['technology: WordPress, React'],
  technologyStack: { cms: ['WordPress'], frameworks: ['React'] },
}
```

### Strategy 2: Industry/Sector
**Query**: Find accounts in same industry or sector

**Match Criteria**:
- Matching industry or sector
- Score: 0.5 (medium confidence)

**Example**:
```javascript
{
  domain: 'competitor.com',
  matchScore: 0.5,
  matchReasons: ['industry: SaaS'],
}
```

### Strategy 3: Business Model
**Query**: Find accounts with similar business scale

**Match Criteria**:
- Matching business scale (enterprise, mid-market, small)
- Score: 0.4 (medium confidence)

**Example**:
```javascript
{
  domain: 'competitor.com',
  matchScore: 0.4,
  matchReasons: ['business_scale: enterprise'],
}
```

### Strategy 4: Geography
**Query**: Find accounts in same regions

**Match Criteria**:
- Matching geographic regions
- Score: 0.3 (lower confidence)

**Example**:
```javascript
{
  domain: 'competitor.com',
  matchScore: 0.3,
  matchReasons: ['geography: North America, Europe'],
}
```

### Strategy 5: Market Positioning
**Query**: Find accounts with similar opportunity scores

**Match Criteria**:
- Opportunity score within ±20 points
- Score: 0.35 (medium confidence)

**Example**:
```javascript
{
  domain: 'competitor.com',
  matchScore: 0.35,
  matchReasons: ['positioning: similar opportunity score'],
}
```

## Comparative Analysis

### Technology Comparison
```javascript
{
  accountTech: {
    cms: ['WordPress'],
    frameworks: ['React'],
    legacySystems: ['PHP 7.0'],
  },
  competitorTech: {
    cms: ['WordPress', 'Drupal'],
    frameworks: ['React', 'Vue'],
    legacySystems: [],
  },
  gaps: ['Drupal', 'Vue'], // Tech competitors use
  advantages: [], // Tech account uses
  modernizationOpportunities: [
    {
      type: 'modernization',
      message: 'Competitors use modern frameworks while account uses legacy',
      impact: 'high',
    },
  ],
}
```

### Positioning Comparison
```javascript
{
  accountPositioning: {
    valueProposition: '...',
    targetAudience: 'enterprise_b2b',
    keyMessages: ['...'],
    marketPosition: 'challenger',
  },
  competitorPositionings: [
    {
      valueProposition: '...',
      targetAudience: 'enterprise_b2b',
      marketPosition: 'market_leader',
    },
  ],
  positioningGaps: [...],
  uniquePositioning: [...],
}
```

### Market Comparison
```javascript
{
  accountPosition: 'challenger',
  competitorPositions: [
    { domain: 'competitor1.com', position: 'market_leader' },
    { domain: 'competitor2.com', position: 'challenger' },
  ],
  relativePosition: 'behind', // ahead, at_parity, behind
}
```

### Performance Comparison
```javascript
{
  accountScore: 75,
  averageCompetitorScore: 82,
  relativePerformance: -7, // Account is 7 points below average
  performanceRank: 3, // Ranked 3rd out of 4
}
```

## Opportunity Identification

### Technology Gap Opportunity
```javascript
{
  type: 'technology_gap',
  title: 'Technology Gap Opportunity',
  description: 'Account lacks technologies used by competitors: Drupal, Vue',
  impact: 'medium',
  priority: 'high',
  recommendation: 'Evaluate and adopt competitor technologies',
  prospectingAngle: 'Help account modernize to match competitors',
}
```

### Modernization Opportunity
```javascript
{
  type: 'modernization',
  title: 'Modernization Opportunity',
  description: 'Competitors use modern tech while account uses legacy systems',
  impact: 'high',
  priority: 'high',
  recommendation: 'Migrate from legacy to modern stack',
  prospectingAngle: 'Help account compete with modernized competitors',
}
```

### Performance Opportunity
```javascript
{
  type: 'performance',
  title: 'Performance Improvement Opportunity',
  description: 'Account performance (75) below competitors (82)',
  impact: 'high',
  priority: 'medium',
  recommendation: 'Improve website performance',
  prospectingAngle: 'Help account improve performance to competitive levels',
}
```

## Industry/Niche Profile

```javascript
{
  industry: 'SaaS',
  niche: 'technology_sector',
  competitorCount: 5,
  commonTechnologies: ['WordPress', 'React', 'Node.js'],
  dominantBusinessScale: 'enterprise',
  marketPositionDistribution: {
    market_leader: 2,
    challenger: 2,
    established: 1,
  },
  averageTechStackSize: 4.2,
  industryTrends: ['React', 'Node.js', 'Headless CMS'],
}
```

## API Endpoints

### POST /competitors/research
Research competitors for account

**Request**:
```json
{
  "accountKey": "abc123",
  "options": {
    "competitorLimit": 10
  }
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "research": {
      "competitorResearchId": "...",
      "competitors": [...],
      "comparison": {...},
      "opportunities": [...],
      "insights": [...],
    }
  }
}
```

### GET /competitors/research?accountKey=...
Get competitor research

**Response**:
```json
{
  "ok": true,
  "data": {
    "research": {...},
    "opportunities": [...],
    "industryProfile": {...},
  }
}
```

### GET /competitors/opportunities?accountKey=...
Get prospecting opportunities

**Response**:
```json
{
  "ok": true,
  "data": {
    "opportunities": [...],
    "industryProfile": {...},
    "competitorCount": 5,
    "highPriorityCount": 2,
  }
}
```

## Data Storage

### Competitor Research Document
```javascript
{
  _type: 'competitorResearch',
  _id: 'competitorResearch-abc123-1234567890',
  accountKey: 'abc123',
  accountDomain: 'example.com',
  competitors: [
    {
      domain: 'competitor1.com',
      accountKey: 'def456',
      matchScore: 0.75,
      matchReasons: ['technology: WordPress, React'],
      enriched: true,
    },
  ],
  comparison: {...},
  opportunities: [...],
  insights: [...],
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:10:00Z',
}
```

### Stored in accountPack
```javascript
{
  payload: {
    competitorResearch: {...},
  },
}
```

## Benefits

1. **Complete Competitor Intelligence**: Full research on all competitors
2. **Comparative Insights**: Understand relative position
3. **Opportunity Identification**: Clear prospecting angles
4. **Industry Understanding**: Know the competitive landscape
5. **Prospecting Strategy**: Data-driven approach to similar accounts

## Integration

### Auto-Research on Account Enrichment
```javascript
// After account enrichment completes
if (accountResearchSet && accountResearchSet.status === 'complete') {
  await researchCompetitors(
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
    accountKey,
    account,
    accountResearchSet
  );
}
```

### Recall Competitor Research
```javascript
// In account query
const competitorResearch = await getCompetitorResearch(groqQuery, client, accountKey);
const opportunities = identifyProspectingOpportunities(competitorResearch);
```

---

**The competitor research system provides complete competitive intelligence for prospecting!**

