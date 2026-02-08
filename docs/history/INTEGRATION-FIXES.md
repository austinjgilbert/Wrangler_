# Critical Integration Fixes Required

## Executive Summary

**Status**: ⚠️ **CRITICAL GAP IDENTIFIED**

The deduplication services are production-ready but **NOT INTEGRATED** into `index.js`. This means:
- ❌ Accounts are NOT being deduplicated
- ❌ Master recall set is NOT being built
- ❌ Duplicate accounts will be created

## Required Changes

### Change 1: Add Imports at Top of index.js

Add after line 4:
```javascript
// Import deduplication services
import { 
  findOrCreateMasterAccount,
  getMasterAccount,
  generateAccountKey as generateAccountKeyService,
  normalizeDomain,
} from './services/sanity-account.js';

import {
  storeAccountPackWithDeduplication,
  storeBriefWithDeduplication,
} from './services/sanity-storage.js';
```

### Change 2: Replace storeAccountPack Function (Line 6977)

**REPLACE ENTIRE FUNCTION** with:
```javascript
/**
 * Store account pack with deduplication
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key (optional, will be generated if not provided)
 * @param {string} canonicalUrl - Canonical URL
 * @param {string} type - Data type (scan, linkedin, evidence, brief)
 * @param {object} data - Data to store
 * @param {object} meta - Metadata
 * @returns {Promise<{success: boolean, id: string, isNew: boolean, accountKey: string, accountId: string, merged: boolean}>}
 */
async function storeAccountPack(client, accountKey, canonicalUrl, type, data, meta = {}) {
  const companyName = meta.companyName || null;
  const scanData = type === 'scan' ? data : null;
  
  const result = await storeAccountPackWithDeduplication(
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
  
  return {
    success: result.success,
    id: result.packId,
    isNew: result.isNew,
    accountKey: result.accountKey,
    accountId: result.accountId,
    merged: result.merged || false,
  };
}
```

### Change 3: Replace upsertAccountSummary Function (Line 7056)

**REPLACE ENTIRE FUNCTION** with:
```javascript
/**
 * Store/update account summary with deduplication
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key (optional, will be generated)
 * @param {string} canonicalUrl - Canonical URL
 * @param {string} companyName - Company name
 * @param {object} scanData - Scan data
 * @returns {Promise<{success: boolean, id: string, accountKey: string, isNew: boolean, merged: boolean}>}
 */
async function upsertAccountSummary(client, accountKey, canonicalUrl, companyName, scanData) {
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
    merged: result.merged || false,
  };
}
```

### Change 4: Update handleStore Brief Handler (Line 7606)

**REPLACE** the brief handling section (lines 7606-7679) with:
```javascript
// Special handler for brief type - uses deduplication service
if (storeType === 'brief') {
  if (!body.data || typeof body.data !== 'object') {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'Brief data must be an object',
      { received: typeof body.data },
      400,
      requestId
    );
  }
  
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
  
  if (!result.success) {
    return createErrorResponse(
      'SANITY_ERROR',
      'Failed to store brief document',
      { error: result.error },
      500,
      requestId
    );
  }
  
  return createSuccessResponse({
    stored: true,
    id: result.briefId,
    packId: null, // Briefs don't use accountPack
    accountKey: result.accountKey,
    accountId: result.accountId,
    type: 'brief',
    canonicalUrl: canonicalUrl,
    updated: false, // Always new for timestamped IDs
  }, requestId);
}
```

### Change 5: Update Auto-Save in handleScan (Line 6486)

**FIND** the auto-save section and **UPDATE** to:
```javascript
// Auto-save to Sanity with deduplication
if (client) {
  try {
    const packResult = await storeAccountPack(
      client,
      null, // accountKey will be generated
      finalUrl,
      'scan',
      scanResult,
      { 
        requestId, 
        autoSaved: true,
        companyName: scanResult.businessUnits?.companyName 
      }
    );
    
    // Also ensure account summary is updated
    if (packResult.success) {
      await upsertAccountSummary(
        client,
        packResult.accountKey,
        finalUrl,
        scanResult.businessUnits?.companyName,
        scanResult
      );
    }
  } catch (storeError) {
    // Silently fail - don't break scan response if auto-save fails
  }
}
```

### Change 6: Update Auto-Save in handleExtract (Line 4202)

**UPDATE** to use deduplication:
```javascript
// Auto-save to Sanity with deduplication
if (client) {
  try {
    const packResult = await storeAccountPack(
      client,
      null, // accountKey will be generated
      finalUrl,
      'evidence',
      evidencePack,
      { requestId, autoSaved: true }
    );
  } catch (storeError) {
    // Silently fail
  }
}
```

### Change 7: Update Auto-Save in handleLinkedInProfile (Line 5622)

**UPDATE** to use deduplication:
```javascript
// Auto-save to Sanity with deduplication
if (client) {
  try {
    const packResult = await storeAccountPack(
      client,
      null, // accountKey will be generated
      normalizedUrl,
      'linkedin',
      profileData,
      { 
        requestId, 
        autoSaved: true,
        companyName: profileData.companyName 
      }
    );
  } catch (storeError) {
    // Silently fail
  }
}
```

### Change 8: Update Auto-Save in handleBrief (Line 4764)

**UPDATE** to use deduplication:
```javascript
// Auto-save to Sanity with deduplication
if (client && seedUrl) {
  try {
    const packResult = await storeAccountPack(
      client,
      null, // accountKey will be generated
      seedUrl,
      'brief',
      briefData,
      { 
        requestId, 
        autoSaved: true,
        companyName: briefData.companyName 
      }
    );
  } catch (storeError) {
    // Silently fail
  }
}
```

### Change 9: Add Master Account Query Endpoint

**ADD** new handler function before `export default`:
```javascript
/**
 * Get master account with all related documents
 */
async function handleGetMasterAccount(request, requestId, env) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');
    const domain = url.searchParams.get('domain');
    
    if (!accountKey && !domain) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Either accountKey or domain parameter required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    let masterAccount;
    if (accountKey) {
      masterAccount = await getMasterAccount(groqQuery, client, accountKey);
    } else {
      // Find by domain first
      const normalizedDomain = normalizeDomain(domain);
      const account = await findAccountByDomain(groqQuery, client, normalizedDomain);
      if (account) {
        masterAccount = await getMasterAccount(groqQuery, client, account.accountKey);
      }
    }
    
    if (!masterAccount) {
      return createErrorResponse(
        'NOT_FOUND',
        'Account not found',
        { accountKey, domain },
        404,
        requestId
      );
    }
    
    return createSuccessResponse(masterAccount, requestId);
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to retrieve master account',
      { error: error.message },
      500,
      requestId
    );
  }
}
```

**ADD** route in main handler (around line 8112):
```javascript
} else if (url.pathname === '/account' || url.pathname.startsWith('/account/')) {
  if (request.method !== 'GET') {
    return createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'GET method required for /account',
      { method: request.method },
      405,
      requestId
    );
  }
  return await handleGetMasterAccount(request, requestId, env);
```

## Testing After Integration

### Test 1: Deduplication
```bash
# Store same company with different URLs
curl -X POST "https://your-worker.workers.dev/store/scan" \
  -H "Content-Type: application/json" \
  -d '{
    "account": {"canonicalUrl": "https://www.example.com"},
    "data": {"test": "data1"}
  }'

curl -X POST "https://your-worker.workers.dev/store/scan" \
  -H "Content-Type: application/json" \
  -d '{
    "account": {"canonicalUrl": "http://example.com"},
    "data": {"test": "data2"}
  }'

# Check response - should have merged: true
```

### Test 2: Master Account Retrieval
```bash
# Get by domain
curl "https://your-worker.workers.dev/account?domain=example.com"

# Should return complete account with all related documents
```

### Test 3: Auto-Save Deduplication
```bash
# Scan same URL twice
curl "https://your-worker.workers.dev/scan?url=https://www.example.com"
curl "https://your-worker.workers.dev/scan?url=http://example.com"

# Check Sanity - should have single account
```

## Verification Checklist

After making changes, verify:
- [ ] Imports added at top of file
- [ ] storeAccountPack function replaced
- [ ] upsertAccountSummary function replaced
- [ ] handleStore brief handler updated
- [ ] All 4 auto-save functions updated
- [ ] Master account endpoint added
- [ ] Route added to main handler
- [ ] Test deduplication works
- [ ] Test master account retrieval works
- [ ] No duplicate accounts in Sanity

## Estimated Time

- Integration: 30-45 minutes
- Testing: 30 minutes
- **Total: 1-1.5 hours**

## Risk Level

**HIGH** - Without these changes, the system will create duplicate accounts and not meet requirements.

