# Sanity CMS Integration Setup

This document explains how to set up and use the Sanity CMS integration for storing all website scanner data.

## Overview

The website scanner worker now automatically stores all structured data in Sanity CMS:
- Website scans (tech stack, AI readiness, performance, etc.)
- LinkedIn profiles (work patterns, network, trajectory)
- Evidence packs (extracted content, signals, entities)
- Research briefs (generated reports)
- Company accounts (aggregated view of all data per company)

## Prerequisites

1. **Sanity Account**: Sign up at [sanity.io](https://www.sanity.io)
2. **Sanity Project**: Create a new project or use an existing one
3. **API Token**: Generate a token with write permissions

## Setup Steps

### 1. Create Sanity Project

```bash
# Install Sanity CLI (if not already installed)
npm install -g @sanity/cli

# Login to Sanity
sanity login

# Create a new project (or use existing)
sanity init
```

### 2. Get Your Project ID

1. Go to [sanity.io/manage](https://www.sanity.io/manage)
2. Select your project
3. Copy the **Project ID** (e.g., `abc123xyz`)

### 3. Generate API Token

1. In your Sanity project dashboard, go to **API** → **Tokens**
2. Click **Add API token**
3. Name it: `Website Scanner Worker`
4. Select **Editor** permissions (or **Admin** for full access)
5. Copy the token (you won't see it again!)

### 4. Configure Cloudflare Worker

Set the following secrets in your Cloudflare Worker:

```bash
# Required
wrangler secret put SANITY_PROJECT_ID
# Enter your project ID when prompted

wrangler secret put SANITY_API_TOKEN
# Enter your API token when prompted

# Optional (defaults shown)
wrangler secret put SANITY_DATASET
# Enter: production (or your dataset name)

wrangler secret put SANITY_API_VERSION
# Enter: 2024-01-01 (or latest version)
```

### 5. Deploy Worker

```bash
npm run deploy
```

## Document Types

The worker creates the following document types in Sanity:

### `websiteScan`
- Full website scan data
- Tech stack, AI readiness, performance, business scale
- Auto-created on `/scan` endpoint

### `linkedInProfile`
- LinkedIn profile data
- Work patterns, network, career trajectory
- Auto-created on `/linkedin-profile` endpoint

### `evidencePack`
- Extracted evidence from pages
- Excerpts, entities, signals, claims
- Auto-created on `/extract` endpoint

### `researchBrief`
- Generated research briefs
- Markdown content with citations
- Auto-created on `/brief` endpoint

### `companyAccount`
- Aggregated company view
- Links to all scans, profiles, briefs
- Auto-created/updated when scans are stored

## API Endpoints

### Store Data Manually

```bash
# Store a website scan
POST /store/scan
Body: { ...scan data from /scan endpoint ... }

# Store a LinkedIn profile
POST /store/linkedin
Body: { ...profile data from /linkedin-profile endpoint ... }

# Store an evidence pack
POST /store/evidence
Body: { ...evidence data from /extract endpoint ... }

# Store a research brief
POST /store/brief
Body: { ...brief data from /brief endpoint ... }
```

### Query Data

```bash
# Query companies (GET)
GET /query?type=companies&minScore=50&limit=10

# Search all documents (GET)
GET /query?type=search&q=example.com&types=websiteScan,linkedInProfile

# Custom GROQ query (POST)
POST /query
Body: {
  "query": "*[_type == 'websiteScan' && opportunityScore >= 70]",
  "filters": {}
}
```

### Update Data

```bash
# Update a document
PUT /update/{docId}
Body: { ...fields to update ... }
```

### Delete Data

```bash
# Delete a document
DELETE /delete/{docId}
```

## Auto-Storage

All endpoints automatically store data in Sanity if configured:

- `/scan` → stores `websiteScan` + updates `companyAccount`
- `/linkedin-profile` → stores `linkedInProfile`
- `/extract` → stores `evidencePack`
- `/brief` → stores `researchBrief`

Storage failures are **silent** - they won't break the API response.

## Sanity Studio (Optional)

To view and manage your data in Sanity Studio:

```bash
# In your Sanity project directory
sanity start
```

Then visit `http://localhost:3333` to see your data.

## GROQ Queries

You can query Sanity directly using GROQ (Graph-Relational Object Queries):

```groq
# Get all high-opportunity companies
*[_type == "companyAccount" && opportunityScore >= 70] | order(opportunityScore desc)

# Get all LinkedIn profiles scanned in the last 30 days
*[_type == "linkedInProfile" && scannedAt >= now()-60*60*24*30]

# Get all website scans with legacy systems
*[_type == "websiteScan" && technologyStack.legacySystems[0] != null]

# Search by domain
*[_type == "companyAccount" && domain match "*example.com*"]
```

## Indexing

Sanity automatically indexes all fields for fast search. You can:

1. Use the `/query` endpoint with search terms
2. Query directly via Sanity API
3. Use Sanity's built-in search in Studio

## Best Practices

1. **Use Company Accounts**: The `companyAccount` type aggregates all data per company
2. **Query by Scores**: Filter by `opportunityScore`, `aiReadinessScore`, etc.
3. **Tag Companies**: Add custom `tags` to `companyAccount` for filtering
4. **Monitor Storage**: Check Sanity dashboard for storage usage
5. **Backup Data**: Sanity provides automatic backups (check your plan)

## Troubleshooting

### "Sanity not configured" error
- Check that `SANITY_PROJECT_ID` and `SANITY_API_TOKEN` are set
- Verify secrets with: `wrangler secret list`

### Documents not appearing
- Check Sanity dashboard for API errors
- Verify token has write permissions
- Check dataset name matches your configuration

### Storage limits
- Free tier: 10GB storage, 5M API requests/month
- Upgrade plan if needed: [sanity.io/pricing](https://www.sanity.io/pricing)

## Next Steps

1. Set up Sanity Studio to view your data
2. Create custom queries for your use cases
3. Set up webhooks (if needed) for real-time updates
4. Configure backups and retention policies

For more information, see [Sanity Documentation](https://www.sanity.io/docs).

