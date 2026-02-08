# Account Deduplication Implementation Guide

## Overview

This guide explains how to integrate the account deduplication system into the existing Worker code.

## Changes Required

### 1. Update `storeAccountPack` Function

Replace the existing `storeAccountPack` function with a call to `storeAccountPackWithDeduplication`:

**Before:**
```javascript
async function storeAccountPack(client, accountKey, canonicalUrl, type, data, meta = {}) {
  // ... existing code
}
```

**After:**
```javascript
import { storeAccountPackWithDeduplication } from './services/sanity-storage.js';

async function storeAccountPack(client, accountKey, canonicalUrl, type, data, meta = {}) {
  // Get company name and scan data from context if available
  const companyName = meta.companyName || null;
  const scanData = type === 'scan' ? data : null;
  
  return await storeAccountPackWithDeduplication(
    groqQuery,
    upsertDocument,
    patchDocument,
    getDocument,
    mutate,
    client,
    canonicalUrl,
    type,
    data,
    companyName,
    scanData,
    meta
  );
}
```

### 2. Update `upsertAccountSummary` Function

Replace with a call to `findOrCreateMasterAccount`:

**Before:**
```javascript
async function upsertAccountSummary(client, accountKey, canonicalUrl, companyName, scanData) {
  // ... existing code
}
```

**After:**
```javascript
import { findOrCreateMasterAccount } from './services/sanity-account.js';

async function upsertAccountSummary(client, accountKey, canonicalUrl, companyName, scanData) {
  // Note: accountKey is now generated inside findOrCreateMasterAccount
  // This function signature can be simplified
  const result = await findOrCreateMasterAccount(
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
    canonicalUrl,
    companyName,
    scanData
  );
  
  return {
    success: true,
    id: result.accountId,
    accountKey: result.accountKey,
    isNew: result.isNew,
    merged: result.merged,
  };
}
```

### 3. Update `handleStore` Function

Update to use deduplication for brief storage:

**Current:**
```javascript
if (storeType === 'brief') {
  // ... existing brief storage code
}
```

**Updated:**
```javascript
import { storeBriefWithDeduplication } from './services/sanity-storage.js';

if (storeType === 'brief') {
  const result = await storeBriefWithDeduplication(
    groqQuery,
    upsertDocument,
    patchDocument,
    getDocument,
    client,
    canonicalUrl,
    body.data,
    body.account.companyName
  );
  
  return createSuccessResponse({
    stored: result.success,
    id: result.briefId,
    packId: null, // Briefs don't use accountPack
    accountKey: result.accountKey,
    accountId: result.accountId,
    type: 'brief',
    canonicalUrl: canonicalUrl,
    updated: !result.isNew,
  }, requestId);
}
```

### 4. Update Auto-Save Functions

Update all auto-save functions to use deduplication:

**In `handleScan`:**
```javascript
// After scan completes
const accountKey = await generateAccountKey(finalUrl);
if (accountKey && client) {
  const packResult = await storeAccountPackWithDeduplication(
    groqQuery,
    upsertDocument,
    patchDocument,
    getDocument,
    mutate,
    client,
    finalUrl,
    'scan',
    scanResult,
    null, // companyName - extract from scanResult if available
    scanResult, // scanData
    { requestId }
  );
  
  // Also update account summary
  await findOrCreateMasterAccount(
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
    finalUrl,
    scanResult.businessUnits?.companyName,
    scanResult
  );
}
```

## Testing

### Test Deduplication

```bash
# Test 1: Same domain, different URLs
curl -X POST "/store/scan" -d '{
  "account": {"canonicalUrl": "https://www.example.com"},
  "data": {"test": "data1"}
}'

curl -X POST "/store/scan" -d '{
  "account": {"canonicalUrl": "http://example.com"},
  "data": {"test": "data2"}
}'

# Should result in:
# - Single account record
# - Single accountPack with merged data
# - merged: true in response

# Test 2: Query by domain
curl "/query?type=companies&domain=example.com"

# Should return single account
```

### Verify Deduplication

```javascript
// Query all accounts
const accounts = await groqQuery(client, '*[_type == "account"]');

// Check for duplicates
const byDomain = {};
accounts.forEach(acc => {
  const domain = normalizeDomain(acc.canonicalUrl || acc.domain);
  if (!byDomain[domain]) byDomain[domain] = [];
  byDomain[domain].push(acc);
});

// Find duplicates
const duplicates = Object.entries(byDomain)
  .filter(([domain, accounts]) => accounts.length > 1);

console.log('Duplicates found:', duplicates);
```

## Migration Script

For existing accounts, run a migration to deduplicate:

```javascript
// scripts/migrate-deduplicate-accounts.js
import { findOrCreateMasterAccount, normalizeDomain } from '../src/services/sanity-account.js';

async function migrateAccounts(client) {
  const accounts = await groqQuery(client, '*[_type == "account"]');
  const byDomain = {};
  
  // Group by domain
  accounts.forEach(acc => {
    const domain = normalizeDomain(acc.canonicalUrl || acc.domain);
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(acc);
  });
  
  // Merge duplicates
  for (const [domain, duplicates] of Object.entries(byDomain)) {
    if (duplicates.length > 1) {
      const master = duplicates[0];
      const toMerge = duplicates.slice(1);
      
      console.log(`Merging ${toMerge.length} accounts for domain: ${domain}`);
      
      // Update all related documents to use master accountKey
      for (const duplicate of toMerge) {
        // Find all documents with duplicate accountKey
        const relatedDocs = await groqQuery(
          client,
          `*[accountKey == "${duplicate.accountKey}"]`
        );
        
        // Update to use master accountKey
        for (const doc of relatedDocs) {
          await patchDocument(client, doc._id, {
            set: {
              accountKey: master.accountKey,
              updatedAt: new Date().toISOString(),
            },
          });
        }
        
        // Delete duplicate account
        await deleteDocument(client, duplicate._id);
      }
    }
  }
}
```

## Benefits

1. **No Duplicates**: Single account per company/domain
2. **Data Integrity**: All related documents link to same account
3. **Automatic Merging**: New data merges into existing accounts
4. **Consistent Keys**: Account keys are normalized and consistent
5. **Easy Queries**: Query by domain or accountKey reliably

## Next Steps

1. ✅ Create deduplication service
2. ✅ Create storage service wrapper
3. ⏳ Update existing functions to use new services
4. ⏳ Test deduplication
5. ⏳ Run migration for existing accounts
6. ⏳ Monitor for any edge cases

