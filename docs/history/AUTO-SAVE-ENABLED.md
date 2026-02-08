# ✅ Auto-Save to Sanity - ENABLED

## What Changed

The Worker now **automatically writes to Sanity** every time the GPT calls it, for all major endpoints.

## Endpoints with Auto-Save

### 1. `/scan` - Website Scanning
- **Auto-saves by default** ✅
- Stores: `accountPack` (full scan data) + `account` (summary)
- Can disable: Add `?store=false` to URL

### 2. `/extract` - Evidence Extraction
- **Auto-saves by default** ✅
- Stores: `accountPack` with type `evidence`
- Stores: Evidence pack data (excerpts, entities, signals, claims)

### 3. `/linkedin-profile` - LinkedIn Profile Scanning
- **Auto-saves by default** ✅
- Stores: `accountPack` with type `linkedin`
- Stores: Full profile data (work patterns, network, trajectory)

### 4. `/brief` - Research Brief Generation
- **Auto-saves by default** ✅
- Stores: `accountPack` with type `brief`
- Stores: Brief markdown + evidence

## How It Works

1. **Every GPT query** → Worker processes request
2. **After processing** → Automatically stores to Sanity
3. **Response includes** → `stored: { accountKey, packId }` field
4. **If Sanity not configured** → Silently continues (doesn't break response)

## Disabling Auto-Save

If you need to disable auto-save for a specific request:

```bash
# For /scan endpoint
curl "https://YOUR_WORKER_URL/scan?url=https://example.com&store=false"
```

**Note**: Other endpoints (`/extract`, `/linkedin-profile`, `/brief`) don't have a disable option - they always auto-save if Sanity is configured.

## Requirements

For auto-save to work:
- ✅ Sanity secrets must be configured:
  ```bash
  wrangler secret put SANITY_PROJECT_ID
  wrangler secret put SANITY_API_TOKEN
  ```
- ✅ API token must have "Editor" or "Admin" permissions

## What Gets Stored

### accountPack Document
- Full payload (scan, evidence, linkedin, or brief data)
- Account key (SHA-1 hash of canonical URL)
- History array (last 10 scans for type='scan')
- Metadata (requestId, autoSaved flag)

### account Document (for /scan only)
- Summary with scores (opportunity, AI readiness, performance)
- Technology stack signals
- Company name and domain
- Last scanned timestamp

## Verification

### Check Response
Every response now includes a `stored` field if auto-save succeeded:
```json
{
  "ok": true,
  "data": {
    /* ... scan/extract/linkedin/brief data ... */,
    "stored": {
      "accountKey": "abc123...",
      "packId": "accountPack-abc123..."
    }
  }
}
```

### Check Sanity Studio
1. Go to https://www.sanity.io/manage
2. Open your project → Open Studio
3. Check Content → You'll see new documents appearing automatically

### Query Stored Data
```bash
# Get all stored companies
curl "https://YOUR_WORKER_URL/query?type=companies&limit=10"

# Search stored data
curl "https://YOUR_WORKER_URL/query?type=search&q=WordPress"
```

## Benefits

✅ **No manual steps** - Everything is stored automatically  
✅ **Complete history** - All GPT queries are preserved  
✅ **Searchable** - Query stored data anytime  
✅ **Account aggregation** - Multiple scans for same company are linked  
✅ **Non-breaking** - If Sanity fails, operations continue normally

## Next Steps

1. **Deploy the updated Worker**:
   ```bash
   cd /Users/austin.gilbert/website-scanner-worker
   wrangler deploy
   ```

2. **Verify Sanity secrets are set**:
   ```bash
   wrangler secret list
   ```

3. **Test with GPT**:
   - Ask GPT to scan a website
   - Check response for `stored` field
   - Verify in Sanity Studio

## Summary

🎉 **All GPT queries now automatically store to Sanity!**

No need to add `store=true` - it happens automatically. Every scan, extract, LinkedIn profile, and brief is preserved in your Sanity database.

