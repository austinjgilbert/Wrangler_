# New Features Summary

## 🎉 Recently Added Functionality

### 1. Account Comparison (`/analytics/compare`)
Compare multiple accounts side-by-side to identify patterns and differences.

**Endpoint:** `POST /analytics/compare`

**Features:**
- Compare tech stacks across accounts
- Compare opportunity scores and ROI insights
- Identify common patterns (legacy CMS usage, system duplication, etc.)
- Find key differences between accounts
- Support for comparing by accountKeys, URLs, or domains

**Use Cases:**
- Compare prospects in your pipeline
- Identify common pain points across accounts
- Prioritize accounts based on comparison metrics

**Example Request:**
```json
{
  "accountKeys": ["abc123...", "def456..."],
  "urls": ["https://example.com"],
  "domains": ["competitor.com"]
}
```

---

### 2. Trend Analysis (`/analytics/trends`)
Track changes over time for accounts stored in Sanity.

**Endpoint:** `GET /analytics/trends?accountKey=...&days=90`

**Features:**
- Historical opportunity score tracking
- Tech stack evolution over time
- Trend direction detection (increasing/decreasing/stable)
- Volatility analysis
- Configurable time period (1-365 days)

**Use Cases:**
- Monitor account evolution
- Identify accounts with improving opportunity scores
- Track tech stack modernization progress

**Example Response:**
```json
{
  "ok": true,
  "trends": {
    "dataPoints": [...],
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-04-01T00:00:00Z"
  },
  "analysis": {
    "direction": "increasing",
    "volatility": 5.2,
    "averageScore": 65,
    "currentScore": 72,
    "change": 7
  }
}
```

---

### 3. Analytics Dashboard (`/analytics/dashboard`)
Get aggregate metrics across all accounts for high-level insights.

**Endpoint:** `GET /analytics/dashboard?limit=100`

**Features:**
- Total accounts count
- Average opportunity score
- Tech stack distribution (most common legacy systems)
- ROI category distribution
- Opportunity score distribution (high/medium/low)
- Top accounts by opportunity score
- Top tech stacks and ROI categories

**Use Cases:**
- Portfolio-level insights
- Identify common tech stacks in your pipeline
- Track overall opportunity trends

**Example Response:**
```json
{
  "ok": true,
  "dashboard": {
    "statistics": {
      "totalAccounts": 150,
      "averageOpportunityScore": 58,
      "opportunityScoreDistribution": {
        "high": 45,
        "medium": 80,
        "low": 25
      }
    },
    "topAccounts": [...],
    "topTechStacks": [
      { "tech": "Adobe Experience Manager", "count": 32 },
      ...
    ],
    "topROICategories": [...]
  }
}
```

---

### 4. Account Export (`/analytics/export`)
Export account data in multiple formats for external analysis.

**Endpoint:** `GET /analytics/export?accountKey=...&format=json|csv&includeHistory=true`

**Features:**
- Export in JSON or CSV format
- Optional historical data inclusion
- Downloadable file with proper headers
- Complete account data export

**Use Cases:**
- Export for CRM import
- External analysis in spreadsheets
- Data backup and archiving

---

### 5. Webhook Support (`/webhooks/*`)
Register webhooks to receive notifications when async jobs complete.

**Endpoints:**
- `POST /webhooks/register` - Register a webhook
- `GET /webhooks/list` - List registered webhooks
- `DELETE /webhooks/delete/{webhookId}` - Delete a webhook

**Features:**
- Event-based notifications (osint.complete, enrichment.complete, etc.)
- Optional account filtering (global or account-specific)
- Webhook signature verification (HMAC SHA-256)
- Delivery statistics tracking
- Automatic retry on failure (with exponential backoff)
- 10-second timeout per delivery

**Supported Events:**
- `osint.complete` - OSINT pipeline completed successfully
- `osint.failed` - OSINT pipeline failed
- `enrichment.complete` - Enrichment job completed
- `enrichment.failed` - Enrichment job failed
- `scan.complete` - Website scan completed
- `research.complete` - Research orchestration completed
- `competitor.complete` - Competitor research completed

**Webhook Payload Structure:**
```json
{
  "event": "osint.complete",
  "timestamp": "2024-01-15T10:30:00Z",
  "webhookId": "webhook-123...",
  "data": {
    "accountKey": "abc123...",
    "companyName": "Example Inc",
    "canonicalUrl": "https://example.com",
    "reportId": "report-456...",
    "status": "complete",
    "completedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Security:**
- Optional HMAC SHA-256 signature in `X-Webhook-Signature` header
- Verify signature using your registered secret

**Example Registration:**
```json
{
  "url": "https://your-app.com/webhooks/osint",
  "events": ["osint.complete", "osint.failed"],
  "secret": "your-secret-key",
  "accountKey": "abc123..." // Optional: null for all accounts
}
```

---

## Integration Points

### Webhook Delivery
Webhooks are automatically delivered when:
- OSINT pipeline completes (via `/osint/run` or queue consumer)
- Enrichment stages complete (via `/enrich/execute`)
- Other async jobs complete

### Sanity Storage
- Webhooks are stored as `webhook` documents in Sanity
- Delivery statistics are tracked per webhook
- Historical trends are calculated from account `_updatedAt` timestamps

---

## Usage Examples

### Compare Two Prospects
```bash
curl -X POST https://your-worker.workers.dev/analytics/compare \
  -H "Content-Type: application/json" \
  -d '{
    "accountKeys": ["key1", "key2"]
  }'
```

### Track Account Trends
```bash
curl "https://your-worker.workers.dev/analytics/trends?accountKey=abc123&days=180"
```

### Get Dashboard Insights
```bash
curl "https://your-worker.workers.dev/analytics/dashboard?limit=200"
```

### Register Webhook
```bash
curl -X POST https://your-worker.workers.dev/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/osint",
    "events": ["osint.complete", "enrichment.complete"],
    "secret": "your-secret-here"
  }'
```

### Export Account Data
```bash
curl "https://your-worker.workers.dev/analytics/export?accountKey=abc123&format=json&includeHistory=true" \
  -o account-data.json
```

---

## Next Steps

1. **Update OpenAPI Schema**: The schema has been updated with all new endpoints
2. **Test Webhooks**: Register a test webhook and trigger an OSINT job
3. **Build Dashboards**: Use the analytics dashboard data to build visualizations
4. **Monitor Trends**: Set up periodic trend analysis for key accounts

---

**All features are production-ready and integrated with existing functionality!** 🚀

