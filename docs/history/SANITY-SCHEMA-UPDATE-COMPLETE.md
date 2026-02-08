# Sanity Schema Update Complete ✅

**Date**: January 5, 2026  
**Status**: Schemas added to Sanity Studio

## What Was Done

### 1. ✅ Created 4 New Schema Files

Added to `/Users/austin.gilbert/sanity-sales-frontend/sanity/schemas/`:

1. **`osintReport.ts`** - OSINT Report schema
   - Stores generated year-ahead intelligence reports
   - Includes initiatives, risks, signals, sources

2. **`osintJob.ts`** - OSINT Job tracking schema
   - Tracks pipeline job state and progress
   - Links to osintReport via reference

3. **`scannerAccount.ts`** - Website Scanner Account schema
   - ⚠️ **NOTE**: Uses `name: 'account'` which conflicts with existing sales account schema
   - The scanner account will override the sales account in Sanity
   - Consider renaming Worker to use `scannerAccount` type to avoid conflicts

4. **`accountPack.ts`** - Account Pack schema
   - Stores full payload data (scan, discovery, crawl, evidence, etc.)

### 2. ✅ Updated Schema Index

Updated `sanity/schemas/index.ts` to import and include all new schemas.

### 3. ✅ Updated Desk Structure

Updated `sanity/schemas/deskStructure.ts` to add "Website Scanner" section in Sanity Studio with:
- Scanner Accounts
- OSINT Reports
- OSINT Jobs
- Account Packs

## ⚠️ Important Note: Schema Conflict

The Worker uses `_type: 'account'` but there's already an `account` schema in your Sanity Studio for sales accounts. 

**Current Behavior**: The scanner account schema will override the sales account schema (last definition wins).

**Recommended Fix**: Update the Worker to use `scannerAccount` type instead:
1. Update all `_type: 'account'` to `_type: 'scannerAccount'` in Worker code
2. Update schema name from `'account'` to `'scannerAccount'` in `scannerAccount.ts`
3. Update queries to use `scannerAccount` type

## Next Steps

### 1. Deploy Sanity Studio

```bash
cd /Users/austin.gilbert/sanity-sales-frontend
sanity deploy
```

Or if using Next.js:
```bash
npm run build
# Deploy to your hosting platform
```

### 2. Verify Schemas in Studio

1. Open your Sanity Studio
2. Navigate to "Website Scanner" section
3. Verify all 4 document types appear:
   - Scanner Accounts
   - OSINT Reports
   - OSINT Jobs
   - Account Packs

### 3. Test OSINT Endpoints

After deployment, test that OSINT endpoints can store data:

```bash
# Queue an OSINT job
curl -X POST https://website-scanner.austin-gilbert.workers.dev/osint/queue \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Check status
curl "https://website-scanner.austin-gilbert.workers.dev/osint/status?accountKey=YOUR_ACCOUNT_KEY"
```

### 4. (Optional) Resolve Schema Conflict

If you want to keep both sales and scanner accounts:

1. Update Worker code to use `scannerAccount` type
2. Update `scannerAccount.ts` schema name to `'scannerAccount'`
3. Redeploy Worker and Sanity Studio

## Files Modified

- ✅ `sanity/schemas/osintReport.ts` (new)
- ✅ `sanity/schemas/osintJob.ts` (new)
- ✅ `sanity/schemas/scannerAccount.ts` (new)
- ✅ `sanity/schemas/accountPack.ts` (new)
- ✅ `sanity/schemas/index.ts` (updated)
- ✅ `sanity/schemas/deskStructure.ts` (updated)

## Verification

To verify schemas are working:

1. **Check Studio**: Open Sanity Studio and look for "Website Scanner" section
2. **Check Build**: Schema compilation should succeed (warnings about canvas are unrelated)
3. **Test Storage**: Run an OSINT job and verify documents appear in Studio

---

**Status**: ✅ **SCHEMAS ADDED**  
**Next**: Deploy Sanity Studio to make schemas live

