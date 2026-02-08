# Batch Scanning & Stack Ranking

The worker now supports batch scanning of multiple accounts with automatic stack ranking.

## 🆕 New Endpoint: `/scan-batch`

Scan up to 20 websites at once and get stack-ranked results.

### Usage

**Comma-separated URLs:**
```bash
curl "https://website-scanner.austin-gilbert.workers.dev/scan-batch?urls=https://example.com,https://example2.com,https://example3.com"
```

**JSON Array (URL-encoded):**
```bash
curl "https://website-scanner.austin-gilbert.workers.dev/scan-batch?urls=%5B%22https%3A%2F%2Fexample.com%22%2C%22https%3A%2F%2Fexample2.com%22%5D"
```

### Response Structure

```json
{
  "summary": {
    "totalScanned": 10,
    "successful": 9,
    "failed": 1,
    "topAIReady": [
      {
        "url": "https://example.com",
        "aiReadinessScore": 75,
        "aiReadinessLevel": "High",
        "opportunityScore": 30
      }
    ],
    "topOpportunities": [
      {
        "url": "https://example2.com",
        "opportunityScore": 80,
        "legacySystems": ["Adobe Experience Manager (AEM)"]
      }
    ]
  },
  "results": [
    {
      "url": "https://example.com",
      "rank": 1,
      "aiReadiness": { ... },
      "opportunityScore": 30,
      "technologyStack": { ... },
      "businessUnits": { ... },
      "digitalGoals": { ... },
      "fullData": { ... }
    }
  ],
  "failed": [
    {
      "url": "https://blocked-site.com",
      "error": "Failed to fetch URL"
    }
  ],
  "scannedAt": "2024-01-15T10:30:00.000Z"
}
```

## 🏆 Stack Ranking

Results are automatically ranked by:
1. **Primary**: AI Readiness Score (highest first)
2. **Secondary**: Opportunity Score (highest first)

This helps you:
- Identify the most AI-ready prospects
- Prioritize high-opportunity accounts
- Focus on accounts with both AI readiness and migration potential

## 🔬 Deep Dive Analysis

Each result includes:
- **Summary data**: Key metrics for quick comparison
- **fullData**: Complete scan data for detailed analysis

When you want to deep dive into a specific account, use the `fullData` object which contains all the detailed information from a single scan.

## 💡 Use Cases

### 1. Account List Prioritization
```
Scan these accounts: [list of 10-20 URLs]
→ Get stack-ranked results
→ Focus on top 5 by AI Readiness
```

### 2. Competitive Analysis
```
Scan competitor websites
→ Compare AI readiness scores
→ Identify market opportunities
```

### 3. Territory Planning
```
Scan all accounts in a territory
→ Rank by AI readiness
→ Prioritize outreach
```

### 4. Quarterly Reviews
```
Scan key accounts quarterly
→ Track AI readiness over time
→ Identify improvement trends
```

## 📊 Enhanced AI Readiness

The AI Readiness Score now includes:

### Justifications
Detailed explanations for each scoring factor:
- Current score vs. maximum
- Gap analysis
- Why this factor matters
- Impact on AI readiness

### Mismatches
Identified issues that impact AI readiness:
- Type of mismatch
- Specific issue
- Impact explanation
- Recommendation

### Education
- **whatItMeans**: What the score means for the organization
- **keyGaps**: Summary of key gaps
- **nextSteps**: Recommended actions

## 🎯 GPT Integration

Your GPT can now:
- Scan multiple accounts at once
- Present stack-ranked results
- Deep dive into specific accounts when asked
- Explain AI readiness scores with justifications

### Example GPT Prompts

**Batch Scan:**
```
Scan these accounts: https://example.com, https://example2.com, https://example3.com
```

**Stack Ranking:**
```
Rank these accounts by AI readiness: [list]
```

**Deep Dive:**
```
Deep dive into https://example.com from the batch results
```

## ⚠️ Limitations

- Maximum 20 URLs per batch
- Scans run in parallel (may hit rate limits on some sites)
- Failed scans are reported but don't block successful ones
- Processing time increases with number of URLs

## 🚀 Best Practices

1. **Start Small**: Test with 3-5 URLs first
2. **Monitor Failures**: Check the `failed` array for issues
3. **Use Stack Ranking**: Focus on top-ranked accounts
4. **Deep Dive Selectively**: Use fullData for accounts you're pursuing
5. **Track Over Time**: Re-scan quarterly to track improvements

---

**Last Updated**: 2024-01-15

