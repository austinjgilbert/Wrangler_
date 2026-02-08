# Sanity Two-Way Sync Documentation

## Overview

The Website Scanner Worker now supports full two-way sync with Sanity CMS. All scan results, LinkedIn profiles, evidence packs, and research briefs can be stored, queried, updated, and deleted in Sanity.

## Document Models

### Account (Summary)
- **Type**: `account`
- **ID**: `account-{accountKey}`
- **Purpose**: Searchable summary for quick queries and ranking
- **Fields**:
  - `accountKey` (SHA-1 hash of canonical URL)
  - `canonicalUrl`, `domain`, `companyName`
  - `technologyStack`, `opportunityScore`, `aiReadiness`, `performance`, `businessScale`
  - `signals[]` (flattened tech stack indicators)
  - `lastScannedAt`
  - `sourceRefs.packId` (reference to full data)

### Account Pack (Full Data)
- **Type**: `accountPack`
- **ID**: `accountPack-{accountKey}`
- **Purpose**: Complete payload storage with history
- **Fields**:
  - `accountKey`, `canonicalUrl`, `domain`
  - `payload`: `{ scan?, linkedin?, evidence?, brief?, verify? }`
  - `history[]` (last 10 scans for type='scan')
  - `createdAt`, `updatedAt`
  - `meta` (metadata)

## Environment Variables

```bash
# Required
SANITY_PROJECT_ID=your-project-id
SANITY_API_TOKEN=your-api-token

# Optional
SANITY_DATASET=production  # defaults to "production"
SANITY_API_VERSION=2023-10-01  # defaults to "2023-10-01"
ADMIN_TOKEN=your-admin-token  # optional, for write operation protection
```

Set secrets:
```bash
wrangler secret put SANITY_PROJECT_ID
wrangler secret put SANITY_API_TOKEN
wrangler secret put SANITY_DATASET  # optional
wrangler secret put SANITY_API_VERSION  # optional
wrangler secret put ADMIN_TOKEN  # optional
```

## Endpoints

### POST /store/{type}

Store scan results, LinkedIn profiles, evidence packs, or research briefs.

**Types**: `scan`, `linkedin`, `evidence`, `brief`

**Request Body**:
```json
{
  "account": {
    "canonicalUrl": "https://example.com",
    "companyName": "Example Corp"  // optional
  },
  "data": { /* scan/linkedin/evidence/brief data */ },
  "meta": { /* optional metadata */ }
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "stored": true,
    "accountKey": "abc123...",
    "accountId": "account-abc123...",
    "packId": "accountPack-abc123...",
    "type": "scan"
  },
  "requestId": "..."
}
```

**Example**:
```bash
curl -X POST https://your-worker.workers.dev/store/scan \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: your-admin-token" \
  -d '{
    "account": {
      "canonicalUrl": "https://example.com",
      "companyName": "Example Corp"
    },
    "data": { /* scan result */ }
  }'
```

### GET /query

Query stored companies or search documents.

**Query Parameters**:
- `type=companies`: Query account summaries
  - `minScore`: Minimum opportunity score
  - `limit`: Result limit
- `type=search`: Search across document types
  - `q`: Search term (required)
  - `types`: Comma-separated types (e.g., `account,accountPack`)

**Examples**:
```bash
# Get top companies by opportunity score
curl "https://your-worker.workers.dev/query?type=companies&minScore=30&limit=20"

# Search for companies
curl "https://your-worker.workers.dev/query?type=search&q=headless%20CMS&types=account"
```

### POST /query

Execute custom GROQ queries.

**Request Body**:
```json
{
  "query": "*[_type == 'account' && opportunityScore >= 50]",
  "params": { /* optional query parameters */ }
}
```

**Example**:
```bash
curl -X POST https://your-worker.workers.dev/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "*[_type == \"account\"] | order(opportunityScore desc) [0...10]"
  }'
```

### PUT /update/{docId}

Update a document with patch operations.

**Request Body**:
```json
{
  "set": { "notes": "Updated notes" },
  "unset": ["oldField"],
  "inc": { "viewCount": 1 },
  "append": {
    "path": "tags",
    "items": ["new-tag"]
  }
}
```

**Example**:
```bash
curl -X PUT https://your-worker.workers.dev/update/account-abc123 \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: your-admin-token" \
  -d '{
    "set": { "notes": "High priority account" }
  }'
```

### DELETE /delete/{docId}

Delete a document. Use `?cascade=true` to delete account + accountPack together.

**Example**:
```bash
# Delete single document
curl -X DELETE https://your-worker.workers.dev/delete/account-abc123 \
  -H "X-Admin-Token: your-admin-token"

# Cascade delete (account + accountPack)
curl -X DELETE "https://your-worker.workers.dev/delete/account-abc123?cascade=true" \
  -H "X-Admin-Token: your-admin-token"
```

## Auto-Save to /scan

The `/scan` endpoint can automatically save results to Sanity when `store=true` is provided.

**Query Parameter or Header**:
- Query: `?store=true`
- Header: `x-store: true`

**Example**:
```bash
curl "https://your-worker.workers.dev/scan?url=https://example.com&store=true"
```

The response will include a `stored` field if auto-save succeeded:
```json
{
  "ok": true,
  "data": {
    /* scan result */,
    "stored": {
      "accountKey": "abc123...",
      "packId": "accountPack-abc123..."
    }
  }
}
```

## Security

### ADMIN_TOKEN Guard

If `ADMIN_TOKEN` is set in environment variables, write operations (`POST /store/*`, `PUT /update/*`, `DELETE /delete/*`) require authentication.

**Headers** (either one):
- `X-Admin-Token: your-admin-token`
- `Authorization: Bearer your-admin-token`

If `ADMIN_TOKEN` is not set, the guard is skipped (no authentication required).

## Account Key Generation

Account keys are generated from canonical URLs:
1. Normalize URL (force https, lowercase, strip trailing slash)
2. SHA-1 hash (first 16 chars) or fallback to simple hash
3. Used as unique identifier for account grouping

Example:
- URL: `https://www.Example.com/` → normalized: `https://example.com/`
- Account key: `a1b2c3d4e5f6g7h8`

## Best Practices

1. **Always provide canonicalUrl**: Use the final resolved URL (after redirects)
2. **Use store=true for scans**: Automatically persist scan results
3. **Query companies for ranking**: Use `GET /query?type=companies&minScore=X` to find high-opportunity accounts
4. **Cascade delete carefully**: Only use `?cascade=true` when you want to remove all data for an account
5. **Set ADMIN_TOKEN in production**: Protect write operations in production environments

## Error Handling

All endpoints return structured error responses:
```json
{
  "ok": false,
  "error": {
    "code": "SANITY_ERROR",
    "message": "Failed to store data in Sanity",
    "details": { /* additional context */ }
  },
  "requestId": "..."
}
```

Common error codes:
- `CONFIG_ERROR`: Sanity not configured
- `VALIDATION_ERROR`: Invalid request data
- `SANITY_ERROR`: Sanity API error
- `UNAUTHORIZED`: Admin token missing/invalid
- `INTERNAL_ERROR`: Unexpected error

