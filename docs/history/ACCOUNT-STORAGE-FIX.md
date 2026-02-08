# Account Storage Fix - 1-to-Many Relationships

## Problem
The store endpoint was rejecting `account` type with the error:
```
The Sanity storage request didn't execute — the API currently only supports storing scan, linkedin, evidence, brief, or person data types (not account).
```

Additionally, the data model needed to properly represent:
- **Accounts (companies)** as the primary entity
- **Accounts have many Persons** (1-to-many relationship)
- **Accounts have Tech Stacks** (embedded or referenced)
- All related data types properly linked to accounts

## Solution

### 1. Added 'account' to Store Endpoint Whitelist ✅
**File:** `src/index.js`

Updated the whitelist to include `'account'`:
```javascript
if (!['scan', 'linkedin', 'evidence', 'brief', 'person', 'account'].includes(storeType)) {
```

### 2. Added Account Type Handler ✅
**File:** `src/index.js` (lines 7892-7990)

Implemented a comprehensive handler for `storeType === 'account'` that:
- Uses `storeAccountWithRelationships` from enhanced-storage-service
- Extracts `persons` array from account data (1-to-many relationship)
- Stores account first
- Stores each person separately using `storePersonWithRelationships`
- Links persons back to account via references array
- Handles tech stacks (embedded in account document)
- Returns detailed response with relationship information

### 3. Updated Account Schema ✅
**File:** `schemas/account.js`

Added `persons` field to account schema:
```javascript
{
  name: 'persons',
  title: 'Persons',
  type: 'array',
  of: [
    {
      type: 'reference',
      to: [{ type: 'person' }],
    },
  ],
  description: 'Array of persons (1-to-many relationship) associated with this account',
}
```

**Tech Stack:** Already properly embedded via `technologyStack` field (object type).

### 4. Updated OpenAPI Specification ✅
**File:** `openapi.yaml`

- **StoreType enum:** Already included `account` ✅
- **Description:** Updated to clarify accounts support 1-to-many relationships with persons
- **StoreRequest data:** Updated description to explain account data structure

## Data Model Structure

### Account (Primary Entity)
```
{
  _type: 'account',
  _id: 'account.{accountKey}',
  accountKey: 'sha1-hash',
  canonicalUrl: 'https://example.com',
  companyName: 'Example Inc',
  technologyStack: { ... }, // Embedded object
  persons: [                 // Array of references (1-to-many)
    { _type: 'reference', _ref: 'person.{personKey}' },
    ...
  ],
  ...
}
```

### Person (Linked to Account)
```
{
  _type: 'person',
  _id: 'person.{personKey}',
  personKey: 'sha1-hash',
  name: 'John Doe',
  relatedAccountKey: 'account-key-here', // Back reference
  rootDomain: 'example.com',
  canonicalUrl: 'https://example.com',
  companyName: 'Example Inc',
  ...
}
```

### Tech Stack (Embedded in Account)
Tech stacks are stored as embedded objects within the account document via the `technologyStack` field. This allows for efficient queries and avoids additional joins.

## Usage Example

### Store Account with Persons and Tech Stack

```bash
POST /store/account
Content-Type: application/json

{
  "account": {
    "canonicalUrl": "https://example.com",
    "companyName": "Example Inc"
  },
  "data": {
    "technologyStack": {
      "cms": ["WordPress"],
      "frameworks": ["React"],
      "opportunityScore": 75
    },
    "persons": [
      {
        "name": "John Doe",
        "linkedInUrl": "https://linkedin.com/in/johndoe",
        "currentTitle": "CTO",
        "currentCompany": "Example Inc"
      },
      {
        "name": "Jane Smith",
        "linkedInUrl": "https://linkedin.com/in/janesmith",
        "currentTitle": "VP Engineering",
        "currentCompany": "Example Inc"
      }
    ],
    "opportunityScore": 75,
    "aiReadiness": { "score": 65 }
  },
  "options": {
    "autoDetectRelationships": true,
    "autoMerge": true,
    "autoEnrich": true
  }
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "stored": true,
    "id": "account.{accountKey}",
    "accountKey": "account-key-here",
    "accountId": "account.{accountKey}",
    "type": "account",
    "canonicalUrl": "https://example.com",
    "updated": false,
    "personsStored": 2,
    "personsCount": 2,
    "relationships": { ... }
  },
  "requestId": "..."
}
```

## Benefits

1. **1-to-Many Relationships:** Accounts can have multiple persons properly linked via references
2. **Bidirectional Links:** Persons link to accounts via `relatedAccountKey`, accounts link to persons via `persons` array
3. **Tech Stack Embedded:** Tech stacks are embedded in accounts for efficient queries
4. **Automatic Relationship Detection:** Enhanced storage service automatically detects and stores relationships
5. **Deduplication:** Automatic deduplication and merging prevents duplicate accounts and persons
6. **Auto-Enrichment:** Triggers automatic enrichment for accounts and related entities

## Files Modified

1. `src/index.js` - Added account handler and whitelist update
2. `schemas/account.js` - Added persons array field
3. `openapi.yaml` - Updated descriptions to clarify account relationships

## Testing

- ✅ Syntax check: `node -c src/index.js` passed
- ✅ Linting: No errors found
- ✅ Account storage handler implemented
- ✅ Person storage with account linking implemented
- ✅ Schema updated with persons array
- ✅ OpenAPI spec updated and validated

## Next Steps

1. Test account storage with real data
2. Verify person references are correctly created
3. Test querying accounts with their persons
4. Verify tech stack relationships are properly embedded
