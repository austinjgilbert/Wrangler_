# GPT OSINT Integration - Update Guide

## Overview

The OSINT (Open Source Intelligence) year-ahead company intelligence pipeline has been fully integrated into the Website Scanner GPT. This guide explains what's new and how to update your GPT.

## What's New

### 🆕 OSINT Year-Ahead Intelligence
Your GPT can now generate comprehensive year-ahead company intelligence reports that include:
- **Executive Summary**: High-level overview of company direction
- **Initiatives**: Ranked list of company initiatives with:
  - Importance scores (0-100)
  - Confidence levels (low/medium/high)
  - Time horizons (0-3mo, 3-12mo, 12mo+)
  - Evidence citations
- **Risks**: Identified challenges and concerns
- **Hiring Signals**: Job postings and recruitment indicators
- **Digital Signals**: Technology transformation indicators
- **Recommended Next Steps**: Actionable recommendations

### New Actions Available
1. **`queueOsintJob`** - Queue an OSINT job for a company
2. **`getOsintStatus`** - Check job status and progress
3. **`getOsintReport`** - Retrieve generated OSINT report
4. **`runOsintSync`** - Run OSINT synchronously (admin/debug)

## How to Update Your GPT

### Step 1: Update Instructions
1. Open your Custom GPT in ChatGPT
2. Go to **Configure** → **Instructions**
3. **Delete** existing instructions
4. **Copy and paste** the entire contents of `gpt-instructions.md`
5. **Save**

The updated instructions now include:
- OSINT endpoint documentation
- When to use OSINT vs other tools
- How to interpret OSINT reports
- Example prompts for OSINT

### Step 2: Update Actions (OpenAPI Schema)
1. In **Configure** → **Actions**
2. **Delete** existing action (if any)
3. Click **Create new action**
4. **Upload** the updated `openapi.yaml` file
5. **Save**

The OpenAPI schema now includes:
- 4 new OSINT endpoints
- 8 new OSINT schemas
- Updated to OpenAPI 3.1.0

### Step 3: Verify Base URL
Ensure the base URL is correct:
```
https://website-scanner.austin-gilbert.workers.dev
```

## Example Prompts

### Basic OSINT Request
**User**: "Generate year-ahead intelligence for example.com"

**GPT Action Flow**:
1. Calls `queueOsintJob` with `url: "https://example.com"`
2. Polls `getOsintStatus` until status is "complete"
3. Calls `getOsintReport` to retrieve the report
4. Presents the findings in a structured format

### Specific Year Request
**User**: "What are example.com's plans for 2027?"

**GPT Action Flow**:
1. Calls `queueOsintJob` with `url: "https://example.com"` and `year: 2027`
2. Waits for completion
3. Presents initiatives and strategic direction

### Check Existing Report
**User**: "Get OSINT report for example.com"

**GPT Action Flow**:
1. First tries `getOsintReport` (may return 404 if not exists)
2. If not found, calls `queueOsintJob`
3. Polls status and retrieves report when ready

## Understanding OSINT Reports

### Initiative Scores
- **0-30**: Low importance (may be filtered out)
- **31-60**: Medium importance
- **61-80**: High importance
- **81-100**: Critical importance

### Confidence Levels
- **Low**: Single source or weak evidence
- **Medium**: Multiple sources or first-party evidence
- **High**: Multiple first-party sources or 5+ corroborating sources

### Time Horizons
- **0-3mo**: Immediate/urgent initiatives
- **3-12mo**: Short to medium-term (most common for year-ahead)
- **12mo+**: Long-term strategic initiatives

## Integration with Other Tools

### OSINT + Scan
**User**: "Scan example.com and generate year-ahead intelligence"

**GPT Flow**:
1. Calls `scanHomepage` for tech stack analysis
2. Calls `queueOsintJob` for strategic intelligence
3. Combines both insights for comprehensive analysis

### OSINT + Research
**User**: "Research example.com comprehensively"

**GPT Flow**:
1. Calls `scanHomepage` for tech stack
2. Calls `queueOsintJob` for year-ahead intelligence
3. Calls `generateBrief` for research brief
4. Synthesizes all information

## Best Practices for GPT

### When to Use OSINT
- ✅ Strategic planning questions
- ✅ Competitive intelligence
- ✅ Sales preparation
- ✅ Identifying opportunities
- ✅ Understanding company direction
- ✅ Year-ahead planning

### When NOT to Use OSINT
- ❌ Simple tech stack questions (use `scanHomepage`)
- ❌ Quick website checks (use `scanHomepage`)
- ❌ Real-time data (OSINT is async, takes 2-5 minutes)

### Response Format
When presenting OSINT reports, GPT should:
1. **Summarize** the executive summary
2. **Highlight** top 3-5 initiatives with scores
3. **Explain** confidence levels and time horizons
4. **List** key risks and signals
5. **Suggest** next steps based on recommendations

## Default Year

**Current Date**: January 5, 2026  
**Default Year**: 2027 (current year + 1)

The GPT will automatically use 2027 as the default year for OSINT reports. Users can specify a different year if needed.

## Error Handling

### Job Queued
If a job is already queued or in progress:
- Inform user that job is processing
- Offer to check status
- Suggest waiting a few minutes

### Job Failed
If a job fails:
- Explain the error (if available)
- Offer to retry
- Suggest alternative approaches (manual research, web search)

### Report Not Found
If report doesn't exist:
- Automatically queue a new job
- Inform user of processing time (2-5 minutes)
- Offer to check back later

## Sanity Storage

OSINT reports are automatically stored in Sanity CMS:
- **Document Type**: `osintReport`
- **Document ID**: `osintReport.{accountKey}.{year}.{mode}`
- **Linked to**: `account` document via `latestOsintReportRef`

The GPT can query stored reports using:
- `queryData` with GROQ queries
- Direct document references
- Account-based queries

## Testing Your Updated GPT

### Test 1: Basic OSINT
```
"Generate year-ahead intelligence for stripe.com"
```
Expected: GPT queues job, waits, returns report

### Test 2: Status Check
```
"Check OSINT status for accountKey abc123"
```
Expected: GPT calls `getOsintStatus` and reports progress

### Test 3: Report Retrieval
```
"Get OSINT report for example.com"
```
Expected: GPT retrieves existing report or queues new one

### Test 4: Combined Analysis
```
"Scan example.com and get year-ahead intelligence"
```
Expected: GPT performs both scan and OSINT, combines results

## Troubleshooting

### GPT Not Calling OSINT Actions
- Verify OpenAPI schema uploaded correctly
- Check that action names match (queueOsintJob, getOsintStatus, etc.)
- Ensure base URL is correct

### Jobs Not Completing
- Check Worker logs: `wrangler tail`
- Verify queue exists: `wrangler queues list`
- Check Sanity credentials

### Reports Not Appearing
- Verify Sanity schemas are set up
- Check document IDs match expected format
- Query Sanity directly to verify storage

## Next Steps

1. **Update GPT** following steps above
2. **Test** with example companies
3. **Refine** instructions based on GPT responses
4. **Monitor** job completion rates
5. **Iterate** on report presentation format

---

**Last Updated**: January 5, 2026  
**OSINT Module Version**: 1.1.0  
**Status**: ✅ Fully Integrated

