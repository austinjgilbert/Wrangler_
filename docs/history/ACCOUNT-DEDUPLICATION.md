# Account Deduplication System

## Overview

The account deduplication system ensures that:
1. **Single Master Account**: One account record per company/domain
2. **Domain-Based Deduplication**: `www.example.com` = `example.com` = `https://example.com`
3. **Data Merging**: New data is merged into existing accounts rather than creating duplicates
4. **Consistent Linking**: All related documents (accountPack, brief, linkedin, etc.) link to the same master account

## How It Works

### 1. Account Key Generation

Accounts are identified by an `accountKey` generated from the normalized canonical URL:

```javascript
// Normalization process:
// 1. Convert to lowercase
// 2. Force HTTPS
// 3. Remove www. prefix
// 4. Remove trailing slash
// 5. Generate SHA-1 hash (first 32 chars)

// Examples:
// https://www.example.com → https://example.com → accountKey: abc123...
// http://example.com/ → https://example.com → accountKey: abc123... (same)
// https://example.com/about → https://example.com/about → accountKey: def456... (different)
```

### 2. Domain-Based Lookup

If an account with the same `accountKey` isn't found, the system searches by normalized domain:

```javascript
// Domain normalization:
// www.example.com → example.com
// example.com → example.com
// https://example.com → example.com

// If domain match found:
// - Use existing accountKey (for consistency)
// - Merge new data into existing account
// - Update canonicalUrl if more canonical version provided
```

### 3. Master Account Structure

Each account has:
- **accountKey**: Unique identifier (SHA-1 hash of normalized URL)
- **canonicalUrl**: Primary URL (most canonical version)
- **domain**: Normalized domain (for deduplication)
- **companyName**: Company name (merged from multiple sources)
- **technologyStack**: Tech stack data
- **aiReadiness**: AI readiness score
- **opportunityScore**: Opportunity score
- **signals**: Array of detected signals (deduplicated)
- **lastScannedAt**: Last scan timestamp

### 4. Related Documents

All related documents link to the master account via `accountKey`:

- **accountPack**: Full payload data (`accountPack-{accountKey}`)
- **brief**: Research briefs (`brief-{accountKey}-{timestamp}`)
- **linkedin**: LinkedIn profile data
- **evidence**: Evidence packs

## Usage

### Finding or Creating Master Account

```javascript
import { findOrCreateMasterAccount } from './services/sanity-account.js';

const result = await findOrCreateMasterAccount(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  'https://www.example.com',
  'Example Inc',
  scanData
);

// Returns:
// {
//   accountKey: 'abc123...',
//   accountId: 'account-abc123...',
//   isNew: false,
//   merged: true,  // true if found by domain and merged
//   existingKey: 'old123...'  // if accountKey was updated
// }
```

### Getting Master Account with All Data

```javascript
import { getMasterAccount } from './services/sanity-account.js';

const master = await getMasterAccount(groqQuery, client, accountKey);

// Returns:
// {
//   account: { ... },
//   accountPack: { ... },
//   briefs: [ ... ],
//   linkedin: { ... },
//   evidence: { ... },
//   totalDocuments: 5
// }
```

## Deduplication Rules

1. **Same Domain = Same Account**
   - `www.example.com` and `example.com` → same account
   - `http://example.com` and `https://example.com` → same account

2. **Different Paths = Different Account Keys**
   - `example.com` and `example.com/about` → different accountKeys
   - (This allows subdomain tracking if needed)

3. **Data Merging Strategy**
   - New data only overwrites if existing is null/empty
   - Signals are merged and deduplicated
   - Most recent scan data is preserved in history

4. **Account Key Consistency**
   - If domain match found but accountKey differs, update to new accountKey
   - All related documents use the same accountKey

## Implementation Status

✅ **Completed:**
- Domain normalization
- Account key generation (32-char SHA-1)
- Domain-based lookup
- Data merging logic
- Master account structure

🔄 **To Do:**
- Update `storeAccountPack` to use `findOrCreateMasterAccount`
- Update `handleStore` to use deduplication
- Update auto-save functions to use deduplication
- Add migration script for existing duplicate accounts

## Migration

For existing accounts with duplicates:

```javascript
// 1. Find all accounts
const accounts = await groqQuery(client, '*[_type == "account"]');

// 2. Group by domain
const byDomain = {};
accounts.forEach(acc => {
  const domain = normalizeDomain(acc.canonicalUrl || acc.domain);
  if (!byDomain[domain]) byDomain[domain] = [];
  byDomain[domain].push(acc);
});

// 3. Merge duplicates
for (const [domain, duplicates] of Object.entries(byDomain)) {
  if (duplicates.length > 1) {
    // Keep first, merge others
    const master = duplicates[0];
    const toMerge = duplicates.slice(1);
    // ... merge logic
  }
}
```

## Testing

Test deduplication with:

```bash
# Store same company with different URLs
curl -X POST "/store/scan" -d '{
  "account": {"canonicalUrl": "https://www.example.com"},
  "data": {...}
}'

curl -X POST "/store/scan" -d '{
  "account": {"canonicalUrl": "http://example.com"},
  "data": {...}
}'

# Should result in single account with merged data
```

