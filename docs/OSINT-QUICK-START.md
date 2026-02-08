# OSINT Pipeline Quick Start Guide

## Overview

The OSINT (Open Source Intelligence) pipeline automatically generates year-ahead company intelligence reports. It runs asynchronously via Cloudflare Queues and produces comprehensive reports about a company's upcoming initiatives, risks, and opportunities.

## Quick Start

### 1. Queue a Job

```bash
curl -X POST "https://your-worker.workers.dev/osint/queue" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "companyName": "Example Inc",
    "year": 2026
  }'
```

Response:
```json
{
  "ok": true,
  "data": {
    "jobId": "osintJob.abc123.2026.year_ahead",
    "accountKey": "abc123",
    "queued": true,
    "year": 2026,
    "mode": "year_ahead"
  },
  "requestId": "..."
}
```

### 2. Check Status

```bash
curl "https://your-worker.workers.dev/osint/status?accountKey=abc123&year=2026"
```

Response:
```json
{
  "ok": true,
  "data": {
    "status": "running",
    "stage": 3,
    "progress": 50,
    "startedAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:31:00Z"
  }
}
```

### 3. Get Report (when complete)

```bash
curl "https://your-worker.workers.dev/osint/report?accountKey=abc123&year=2026"
```

## Pipeline Stages

The pipeline runs through 8 stages:

1. **Load Account** - Load or create account in Sanity
2. **Discover Pages** - Find key pages on company website
3. **Search Web** - Search for company news, roadmaps, initiatives
4. **Select Sources** - Rank and select top sources
5. **Extract Evidence** - Extract structured data from sources
6. **Verify Claims** - Optional verification (currently skipped)
7. **Synthesize Report** - Generate year-ahead intelligence report
8. **Store Results** - Save to Sanity

## Report Structure

```json
{
  "executiveSummary": [
    "Company has 5 key initiatives planned for 2026.",
    "Digital transformation initiative (3-12mo timeline, high confidence)"
  ],
  "initiatives": [
    {
      "title": "Cloud migration project",
      "importanceScore": 85,
      "confidence": "high",
      "timeHorizon": "3-12mo",
      "whyItMatters": "Strategic initiative indicating technology priorities.",
      "evidence": [
        {
          "url": "https://example.com/news/cloud-migration",
          "title": "Company Announces Cloud Migration",
          "excerpt": "...",
          "publishedAt": "2024-01-10",
          "sourceType": "first_party"
        }
      ]
    }
  ],
  "risks": [
    "Legacy system migration challenges",
    "Data security concerns during transition"
  ],
  "hiringSignals": [
    "Active hiring page detected",
    "Hiring mentioned: Cloud Engineer positions"
  ],
  "digitalSignals": [
    "digital transformation: https://example.com/strategy",
    "cloud migration: https://example.com/news"
  ],
  "recommendedNextSteps": [
    "Engage immediately on: Cloud migration project",
    "Schedule discovery call to understand priorities"
  ],
  "sources": [
    {
      "url": "https://example.com/news",
      "title": "Company News",
      "publishedAt": "2024-01-10",
      "score": 95
    }
  ]
}
```

## Configuration Options

### Queue Request

- `url` (required) - Company website URL
- `companyName` (optional) - Company name for better search results
- `mode` (optional) - Default: `"year_ahead"`
- `year` (optional) - Target year (default: current year + 1)
- `recencyDays` (optional) - How many days back to search (default: 365)
- `force` (optional) - Force re-run even if report exists (default: false)

### Environment Variables

- `OSINT_DEFAULT_RECENCY_DAYS` - Default recency window (default: 365)
- `OSINT_MAX_SOURCES` - Max sources to rank (default: 25)
- `OSINT_MAX_EXTRACT` - Max sources to extract (default: 15)

## Idempotency

Jobs are idempotent per `accountKey + mode + year`. If a complete report exists:
- `/osint/queue` returns existing job info
- Use `force: true` to regenerate

## Error Handling

If a job fails:
- Check `/osint/status` for error message
- Error stored in `osintJob.error` field
- Queue will retry failed jobs automatically

## Best Practices

1. **Use company name** - Provides better search results
2. **Set appropriate year** - Default is next year, adjust as needed
3. **Monitor status** - Poll `/osint/status` until complete
4. **Cache reports** - Reports are stored in Sanity, query directly if needed
5. **Handle failures** - Check error field and retry if needed

## Integration Example

```javascript
// Queue job
const queueResponse = await fetch('https://your-worker.workers.dev/osint/queue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com',
    companyName: 'Example Inc',
    year: 2026
  })
});

const { data } = await queueResponse.json();
const { accountKey } = data;

// Poll for completion
let status = 'queued';
while (status !== 'complete' && status !== 'failed') {
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
  
  const statusResponse = await fetch(
    `https://your-worker.workers.dev/osint/status?accountKey=${accountKey}&year=2026`
  );
  const statusData = await statusResponse.json();
  status = statusData.data.status;
  
  console.log(`Status: ${status}, Progress: ${statusData.data.progress}%`);
}

// Get report
if (status === 'complete') {
  const reportResponse = await fetch(
    `https://your-worker.workers.dev/osint/report?accountKey=${accountKey}&year=2026`
  );
  const report = await reportResponse.json();
  console.log('Report:', report.data.report);
}
```

## Troubleshooting

### Job stuck in "queued"
- Check queue exists: `wrangler queues list`
- Check worker logs: `wrangler tail`
- Verify queue binding in `wrangler.toml`

### Job fails
- Check error message in `/osint/status`
- Verify Sanity credentials
- Check handler functions are accessible
- Review worker logs for details

### No results in report
- Company may have limited public information
- Try adjusting `recencyDays`
- Check if company website is accessible
- Verify search queries are working

