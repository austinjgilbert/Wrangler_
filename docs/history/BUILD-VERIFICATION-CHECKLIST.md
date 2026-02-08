# Build Verification Checklist - Senior Advisor Review

## Core Requirements Analysis

### ✅ Requirement 1: Account Deduplication
**Need**: Accounts stored in Sanity must be de-duplicated
**Status**: ⚠️ **PARTIALLY IMPLEMENTED**
- ✅ Deduplication service created (`sanity-account.js`)
- ✅ Storage wrapper created (`sanity-storage.js`)
- ❌ **NOT INTEGRATED** into `index.js`
- ❌ `storeAccountPack` still uses old logic (no deduplication)
- ❌ `upsertAccountSummary` still uses old logic (no deduplication)

### ✅ Requirement 2: Master Recall Set
**Need**: Building a master recall set of data
**Status**: ⚠️ **PARTIALLY IMPLEMENTED**
- ✅ Master account structure defined
- ✅ `getMasterAccount()` function created
- ❌ **NOT USED** in query endpoints
- ❌ No endpoint to retrieve master account with all related data

## Critical Integration Gaps

### Gap 1: storeAccountPack Not Using Deduplication
**Current Code** (index.js:6977):
```javascript
async function storeAccountPack(client, accountKey, canonicalUrl, type, data, meta = {}) {
  // OLD LOGIC - No deduplication
  const packId = `accountPack-${accountKey}`;
  // ... creates/updates without checking for domain duplicates
}
```

**Required Fix**:
```javascript
import { storeAccountPackWithDeduplication } from './services/sanity-storage.js';

async function storeAccountPack(client, accountKey, canonicalUrl, type, data, meta = {}) {
  const companyName = meta.companyName || null;
  const scanData = type === 'scan' ? data : null;
  
  return await storeAccountPackWithDeduplication(
    groqQuery,
    upsertDocument,
    patchDocument,
    getDocument,
    mutate,
    client,
    canonicalUrl,  // Note: accountKey is generated inside
    type,
    data,
    companyName,
    scanData,
    meta
  );
}
```

### Gap 2: upsertAccountSummary Not Using Deduplication
**Current Code** (index.js:7056):
```javascript
async function upsertAccountSummary(client, accountKey, canonicalUrl, companyName, scanData) {
  // OLD LOGIC - No deduplication
  const accountId = `account-${accountKey}`;
  // ... creates account without checking for domain duplicates
}
```

**Required Fix**:
```javascript
import { findOrCreateMasterAccount } from './services/sanity-account.js';

async function upsertAccountSummary(client, accountKey, canonicalUrl, companyName, scanData) {
  // accountKey parameter is now optional - generated inside
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

### Gap 3: handleStore Not Using Deduplication for Briefs
**Current Code** (index.js:7606):
```javascript
if (storeType === 'brief') {
  // ... creates brief without using deduplication service
}
```

**Required Fix**:
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
  // ... return response
}
```

### Gap 4: Auto-Save Functions Not Using Deduplication
**Locations**:
- `handleScan` (index.js:6486)
- `handleExtract` (index.js:4202)
- `handleLinkedInProfile` (index.js:5622)
- `handleBrief` (index.js:4764)

**All need to use**: `storeAccountPackWithDeduplication` instead of `storeAccountPack`

### Gap 5: Missing Master Account Query Endpoint
**Need**: Endpoint to retrieve master account with all related data
**Status**: ❌ **NOT IMPLEMENTED**

**Required**:
```javascript
// GET /account/{accountKey} or GET /account?domain=example.com
async function handleGetMasterAccount(request, requestId, env) {
  // Use getMasterAccount() to return complete account with all related docs
}
```

## Build Step Verification

### Step 1: Service Layer ✅
- ✅ `sanity-account.js` - Complete with deduplication
- ✅ `sanity-storage.js` - Complete with wrappers
- ✅ Error handling - Comprehensive
- ✅ Type safety - JSDoc complete

### Step 2: Utility Layer ✅
- ✅ All utilities created and tested
- ✅ Consistent APIs
- ✅ Proper error handling

### Step 3: Integration ❌ **CRITICAL GAP**
- ❌ Services not imported in `index.js`
- ❌ Functions not updated to use new services
- ❌ Auto-save not using deduplication
- ❌ Manual store endpoints not using deduplication

### Step 4: Query Layer ⚠️ **PARTIAL**
- ✅ Basic query functions exist
- ❌ No master account query endpoint
- ❌ Query functions don't use `getMasterAccount()`

### Step 5: Testing ❌
- ❌ No integration tests
- ❌ No deduplication tests
- ❌ No master account retrieval tests

## Expert Recommendations

### Priority 1: CRITICAL - Integrate Deduplication (Immediate)

1. **Update storeAccountPack** (5 min)
   - Import service
   - Replace function body
   - Update return value handling

2. **Update upsertAccountSummary** (5 min)
   - Import service
   - Replace function body
   - Update return value handling

3. **Update handleStore** (10 min)
   - Import service for brief storage
   - Update brief handling
   - Test brief storage

4. **Update Auto-Save Functions** (20 min)
   - Update all 4 auto-save locations
   - Ensure companyName extracted correctly
   - Test each endpoint

### Priority 2: HIGH - Master Account Query (1 hour)

1. **Create Master Account Endpoint**
   - `GET /account/{accountKey}` - Get by key
   - `GET /account?domain=example.com` - Get by domain
   - Use `getMasterAccount()` service
   - Return complete account with all related docs

2. **Update Query Endpoints**
   - Use `getMasterAccount()` in existing queries
   - Return master account structure

### Priority 3: MEDIUM - Testing & Validation (2 hours)

1. **Integration Tests**
   - Test deduplication with duplicate URLs
   - Test master account retrieval
   - Test data merging

2. **Edge Cases**
   - Test with existing accounts
   - Test with partial data
   - Test error scenarios

### Priority 4: LOW - Optimization (Future)

1. **Performance**
   - Cache domain lookups
   - Optimize queries

2. **Monitoring**
   - Add logging for deduplication
   - Track merge operations

## Verification Test Plan

### Test 1: Deduplication
```bash
# Store same company with different URLs
curl -X POST "/store/scan" -d '{
  "account": {"canonicalUrl": "https://www.example.com"},
  "data": {"test": "data1"}
}'

curl -X POST "/store/scan" -d '{
  "account": {"canonicalUrl": "http://example.com"},
  "data": {"test": "data2"}
}'

# Expected: Single account, merged data, merged: true
```

### Test 2: Master Account Retrieval
```bash
# Get master account
curl "/account?domain=example.com"

# Expected: Complete account with accountPack, briefs, linkedin, evidence
```

### Test 3: Auto-Save Deduplication
```bash
# Scan same URL twice
curl "/scan?url=https://www.example.com"
curl "/scan?url=http://example.com"

# Expected: Single account, merged scan history
```

## Success Criteria

✅ **Deduplication Working**
- Same domain = single account
- Data merged correctly
- No duplicate accounts in Sanity

✅ **Master Recall Set**
- All related documents linked
- Single query returns complete account
- Data integrity maintained

✅ **Integration Complete**
- All functions use new services
- No old logic remaining
- All endpoints tested

## Current Status: ⚠️ **READY FOR INTEGRATION**

The services are production-ready, but integration is required to meet requirements.

