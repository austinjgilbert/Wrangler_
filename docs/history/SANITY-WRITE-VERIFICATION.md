# Sanity Write Operations - Verification

## ✅ Yes, the code DOES write to Sanity

### How It Works

1. **Sanity Mutate API**: Uses Sanity's `/data/mutate/{dataset}` endpoint
2. **Account-Based Model**: Stores data in two document types:
   - `accountPack`: Full payload storage
   - `account`: Searchable summary

### Write Operations

#### 1. Auto-Save (from `/scan` endpoint)
**Trigger**: Add `?store=true` to scan URL or `x-store: true` header

**What it writes**:
- `accountPack` document with full scan data
- `account` document with summary (scores, signals, metadata)

**Code location**: `src/index.js` lines 6386-6426

#### 2. Manual Store (from `/store/{type}` endpoint)
**Trigger**: `POST /store/{type}` with body:
```json
{
  "account": { "canonicalUrl": "https://example.com" },
  "data": { /* scan/linkedin/evidence/brief data */ }
}
```

**What it writes**:
- `accountPack` document
- `account` document (if type is 'scan')

**Code location**: `src/index.js` lines 7453-7488

#### 3. Update (from `/update/{docId}` endpoint)
**Trigger**: `PUT /update/{docId}` with patch operations

**What it writes**:
- Updates existing documents using Sanity patch mutations

**Code location**: `src/index.js` lines 6838-6843

### Sanity API Calls

The code makes these Sanity API calls:

1. **`mutate()`** - Main write function (line 6774)
   - Calls: `POST https://{projectId}.api.sanity.io/v{version}/data/mutate/{dataset}`
   - Uses: `createIfNotExists`, `patch`, `delete` mutations

2. **`storeAccountPack()`** - Stores full payload (line 6860)
   - Creates/updates `accountPack` document
   - Appends to history array

3. **`upsertAccountSummary()`** - Stores summary (line 6927)
   - Creates/updates `account` document
   - Extracts signals, scores, metadata

### Requirements for Writing

✅ **Sanity must be configured**:
- `SANITY_PROJECT_ID` secret set
- `SANITY_API_TOKEN` secret set
- Token must have "Editor" or "Admin" permissions

### Verification

To verify writes are working:

1. **Check Sanity Studio**:
   - Go to https://www.sanity.io/manage
   - Open your project → Open Studio
   - Check Content → Look for `account` and `accountPack` documents

2. **Test with curl**:
   ```bash
   # Scan with auto-save
   curl "https://YOUR_WORKER_URL/scan?url=https://example.com&store=true"
   
   # Check response for "stored" field
   ```

3. **Query stored data**:
   ```bash
   curl "https://YOUR_WORKER_URL/query?type=companies&limit=5"
   ```

### What Gets Written

**accountPack document**:
- `_type`: "accountPack"
- `accountKey`: SHA-1 hash of canonical URL
- `canonicalUrl`: Normalized URL
- `domain`: Extracted domain
- `payload`: { scan?, linkedin?, evidence?, brief? }
- `history[]`: Array of previous scans (last 10)
- `createdAt`, `updatedAt`: Timestamps
- `meta`: Metadata

**account document**:
- `_type`: "account"
- `accountKey`: SHA-1 hash of canonical URL
- `canonicalUrl`: Normalized URL
- `domain`: Extracted domain
- `companyName`: Company name (if available)
- `technologyStack`: Tech stack data
- `opportunityScore`: Calculated score
- `aiReadiness`: { score }
- `performance`: { performanceScore }
- `businessScale`: { businessScale }
- `signals[]`: Array of tech stack signals
- `lastScannedAt`: Timestamp
- `sourceRefs`: { packId }

### Error Handling

If Sanity is not configured:
- Returns error: "Sanity not configured"
- Does NOT write to Sanity
- Scan/other operations continue normally

If write fails:
- Auto-save: Silently fails (doesn't break scan response)
- Manual store: Returns error response
- Update: Returns error response

### Summary

✅ **YES, the code writes to Sanity** when:
1. Sanity secrets are configured
2. `store=true` parameter is provided (for auto-save)
3. `/store/{type}` endpoint is called (for manual store)
4. `/update/{docId}` endpoint is called (for updates)

The writes use Sanity's official Data API with proper mutations.
