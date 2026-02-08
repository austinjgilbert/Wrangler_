# LinkedIn Profile Analytics - Work Patterns & Career Trajectory

## Enhanced Features

The LinkedIn profile scanner now includes comprehensive analytics:

### 1. Work Pattern Analysis

Analyzes employment history to identify patterns:

- **Job Change Frequency**: How often the person changes roles
- **Average Tenure**: Average time spent in each role
- **Tenure Trend**: Whether tenure is increasing, decreasing, or stable
- **Role Progression**: Upward, lateral, or mixed career movement
- **Industry Stability**: Whether they stay in same industry or change
- **Career Stage**: Early, mid, senior, or executive level
- **Skill Evolution**: How skills have developed over time
- **Opportunities**: Identified growth opportunities
- **Risks**: Potential career risks or concerns

### 2. Network Relationship Mapping

Maps potential 2nd degree connections:

- **Direct Connections**: Number of 1st degree connections
- **Followers**: Number of followers
- **Shared Experiences**: Companies where they've worked (potential colleague connections)
- **Shared Education**: Schools attended (potential alumni connections)
- **Potential Connections**: Suggested 2nd degree connection paths
- **Network Strength**: Overall network strength (strong, moderate, weak)
- **Relationship Indicators**: Types of relationships available

### 3. Career Trajectory Analysis

Provides insights into career trends and opportunities:

- **Overall Trend**: Accelerating, stable, or declining career trajectory
- **Key Milestones**: Important career moments and transitions
- **Skill Growth**: How skills are expanding or deepening
- **Industry Position**: Leader, established, or emerging in their field
- **Market Value**: Estimated market value (high, medium, low)
- **Next Steps**: Recommended next career steps
- **Growth Opportunities**: Specific opportunities identified
- **Career Insights**: Key insights about their career path
- **Timeline**: Chronological career timeline

## Response Structure

```json
{
  "ok": true,
  "data": {
    // ... standard profile fields ...
    
    "workPatterns": {
      "jobChangeFrequency": 0.33,
      "averageTenure": 3.0,
      "tenureTrend": "increasing",
      "roleProgression": "upward",
      "industryStability": "stable",
      "careerStage": "senior",
      "skillEvolution": ["JavaScript", "Python", "React"],
      "opportunities": [
        "Strong upward trajectory with increasing tenure suggests readiness for next level"
      ],
      "risks": []
    },
    
    "network": {
      "directConnections": 500,
      "followers": 1000,
      "sharedExperiences": ["Company A", "Company B"],
      "sharedEducation": ["University X"],
      "potentialConnections": [
        {
          "type": "colleague",
          "description": "Former colleagues from Company A",
          "connectionPath": "1st degree → shared company → 2nd degree"
        }
      ],
      "networkStrength": "strong",
      "relationshipIndicators": [
        {
          "type": "shared_company",
          "value": "Worked at 2 company(ies)",
          "potentialConnections": "Potential connections through Company A, Company B"
        }
      ]
    },
    
    "trajectory": {
      "overallTrend": "accelerating",
      "keyMilestones": [
        {
          "type": "first_role",
          "description": "Started career as Software Engineer at Company A",
          "significance": "Career foundation"
        }
      ],
      "skillGrowth": "expanding",
      "industryPosition": "established",
      "marketValue": "high",
      "nextSteps": [
        "Consider exploring opportunities at next level"
      ],
      "growthOpportunities": [
        {
          "type": "promotion",
          "description": "Strong progression pattern suggests readiness for senior roles",
          "confidence": "high"
        }
      ],
      "careerInsights": [
        "Consistent upward progression demonstrates strong performance"
      ],
      "timeline": [
        {
          "role": "Software Engineer",
          "company": "Company A",
          "duration": "2020 - 2022",
          "position": 1,
          "level": "progression"
        }
      ]
    }
  }
}
```

## Use Cases

### 1. Career Coaching
- Show career trajectory trends
- Identify growth opportunities
- Highlight skill development areas
- Suggest next steps

### 2. Recruitment
- Understand career patterns
- Assess market value
- Identify career stage
- Evaluate fit for role

### 3. Networking
- Map 2nd degree connections
- Identify shared experiences
- Find connection paths
- Understand network strength

### 4. Business Development
- Understand decision-maker career stage
- Identify relationship opportunities
- Map network connections
- Find warm introduction paths

## Example Insights

### Work Pattern Insights
- "Average tenure of 3 years with increasing trend suggests strong commitment"
- "Upward role progression indicates high performance"
- "Career stage: Senior - ready for executive opportunities"

### Network Insights
- "Strong network (500+ connections) with shared experiences at Company A"
- "Potential 2nd degree connections through alumni network"
- "Network strength: Strong - well-connected in industry"

### Trajectory Insights
- "Overall trend: Accelerating - strong upward momentum"
- "Market value: High - senior level with expanding skills"
- "Growth opportunity: Ready for promotion to next level"

## Testing

```bash
curl -X POST http://localhost:8787/linkedin-profile \
  -H "Content-Type: application/json" \
  -d '{"profileUrl": "https://www.linkedin.com/in/username"}' \
  | jq '.data.workPatterns, .data.network, .data.trajectory'
```

---

**Status**: ✅ Analytics implemented  
**Features**: Work patterns, network mapping, career trajectory

