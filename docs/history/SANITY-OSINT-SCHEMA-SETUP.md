# Sanity OSINT Schema Setup Guide

## Overview

This guide explains how to set up Sanity Studio schemas for OSINT documents to ensure proper storage and querying.

## Schema Files Created

### Core OSINT Schemas
1. **`schemas/osint.js`** - OSINT Report schema
2. **`schemas/osintJob.js`** - OSINT Job tracking schema
3. **`schemas/account.js`** - Account schema (updated with OSINT references)
4. **`schemas/accountPack.js`** - Account Pack schema (full payload storage)

## Document Types

### 1. `osintReport`
Stores generated OSINT year-ahead intelligence reports.

**Document ID Format**: `osintReport.{accountKey}.{year}.{mode}`

**Key Fields**:
- `executiveSummary[]` - High-level overview
- `initiatives[]` - Ranked initiatives with scores, confidence, time horizons
- `risks[]` - Identified risks
- `hiringSignals[]` - Hiring indicators
- `digitalSignals[]` - Digital transformation signals
- `recommendedNextSteps[]` - Actionable recommendations
- `sources[]` - Source citations with scores

### 2. `osintJob`
Tracks OSINT pipeline job state and progress.

**Document ID Format**: `osintJob.{accountKey}.{year}.{mode}`

**Key Fields**:
- `status` - 'queued' | 'running' | 'complete' | 'failed'
- `stage` - Current pipeline stage (0-7)
- `progress` - Progress percentage (0-100)
- `reportRef` - Reference to generated `osintReport`

### 3. `account`
Company/account summary with OSINT references.

**Document ID Format**: `account.{accountKey}`

**Key Fields**:
- `latestOsintReportRef` - Reference to latest OSINT report
- `accountKey` - SHA-1 hash of canonical URL
- `canonicalUrl` - Normalized URL
- `rootDomain` - Root domain

### 4. `accountPack`
Full payload storage for all account data.

**Document ID Format**: `accountPack.{accountKey}.{isoDate}`

**Key Fields**:
- `payload` - Contains scan, discovery, crawl, evidence, brief, etc.
- `history[]` - History of scans (last 10)

## Setting Up in Sanity Studio

### Option 1: Import Schemas (Recommended)

1. **Copy schema files** to your Sanity Studio `schemas/` directory:
   ```bash
   cp schemas/osint.js /path/to/sanity-studio/schemas/
   cp schemas/osintJob.js /path/to/sanity-studio/schemas/
   cp schemas/account.js /path/to/sanity-studio/schemas/
   cp schemas/accountPack.js /path/to/sanity-studio/schemas/
   ```

2. **Update `sanity.config.ts`** to import the schemas:
   ```typescript
   import {defineConfig} from 'sanity'
   import {deskTool} from 'sanity/desk'
   
   import osintSchema from './schemas/osint'
   import osintJobSchema from './schemas/osintJob'
   import accountSchema from './schemas/account'
   import accountPackSchema from './schemas/accountPack'
   import briefSchema from './schemas/brief'
   
   export default defineConfig({
     name: 'default',
     title: 'Website Scanner CMS',
     projectId: 'your-project-id',
     dataset: 'production',
     plugins: [deskTool()],
     schema: {
       types: [
         osintSchema,
         osintJobSchema,
         accountSchema,
         accountPackSchema,
         briefSchema,
         // ... other schemas
       ],
     },
   })
   ```

### Option 2: Manual Schema Definition

If you prefer to define schemas manually in Sanity Studio:

1. Go to **Schema** → **Add schema type**
2. Create each document type with the fields defined in the schema files
3. Set appropriate field types and validation rules

## Document Relationships

### Account → OSINT Report
```
account.latestOsintReportRef → osintReport._id
```

### OSINT Job → OSINT Report
```
osintJob.reportRef → osintReport._id
```

### Account → Account Pack
```
account.sourceRefs.packId → accountPack._id
```

## Querying OSINT Data

### Get Latest OSINT Report for Account
```groq
*[_type == "osintReport" && accountKey == $accountKey && year == 2027][0]{
  ...,
  initiatives[]{
    ...,
    evidence[]
  }
}
```

### Get All OSINT Jobs for Account
```groq
*[_type == "osintJob" && accountKey == $accountKey] | order(requestedAt desc)
```

### Get Accounts with OSINT Reports
```groq
*[_type == "account" && defined(latestOsintReportRef)]{
  ...,
  "osintReport": *[_id == ^.latestOsintReportRef][0]
}
```

### Get Top Initiatives Across All Reports
```groq
*[_type == "osintReport" && year == 2027]{
  accountKey,
  companyName,
  initiatives[] | order(importanceScore desc)[0..2]
}
```

## Field Descriptions

### Initiative Object
```javascript
{
  title: "string",              // Initiative title
  importanceScore: 0-100,      // Importance score
  confidence: "low|medium|high", // Confidence level
  timeHorizon: "0-3mo|3-12mo|12mo+", // Time horizon
  whyItMatters: "string",      // Explanation
  evidence: [                   // Evidence citations
    {
      url: "string",
      title: "string",
      excerpt: "string",
      publishedAt: "datetime",
      sourceType: "first_party|third_party|search_result"
    }
  ]
}
```

### Source Object
```javascript
{
  url: "string",        // Source URL
  title: "string",      // Source title
  publishedAt: "datetime", // Publication date
  score: 0-100          // Ranking score
}
```

## Default Year

**Current Date**: January 5, 2026  
**Default Year Ahead**: 2027

The OSINT pipeline defaults to generating reports for the next year (current year + 1). This can be overridden by specifying the `year` parameter.

## Validation

All OSINT documents are created with:
- Deterministic `_id` based on `accountKey + year + mode`
- Proper field types and validation
- Read-only fields for generated data
- Editable fields for user annotations (e.g., `companyName`)

## Best Practices

1. **Don't edit generated fields**: Fields marked `readOnly: true` should not be manually edited
2. **Use references**: Use Sanity references for document relationships
3. **Query efficiently**: Use GROQ queries to fetch related documents
4. **Monitor job status**: Check `osintJob.status` before querying reports
5. **Handle missing data**: Always check if reports exist before accessing

## Troubleshooting

### Reports not appearing in Studio
- Check that schemas are imported in `sanity.config.ts`
- Verify document IDs match expected format
- Check Sanity dataset permissions

### Job status not updating
- Verify Durable Object is working
- Check queue consumer logs
- Ensure Sanity write permissions

### Missing references
- Verify `accountKey` matches across documents
- Check that referenced documents exist
- Use GROQ queries to find orphaned documents

