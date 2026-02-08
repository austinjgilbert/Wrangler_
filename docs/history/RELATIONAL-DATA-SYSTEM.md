# Relational Data System - Complete Implementation

## 🎯 Overview

The website scanner now automatically stores all search results and information with rich relationships between accounts (companies), people, tech opportunities, competitors, and similar entities. The system automatically deduplicates, merges, and enriches data as it's collected.

## ✅ Features Implemented

### 1. **Automatic Relationship Detection**

Every time an account is scanned, the system automatically detects:

- **Competitors**: Companies in the same industry with similar characteristics
- **Similar Industry**: Companies in the same industry
- **Similar Opportunity Score**: Companies with similar opportunity scores (within ±10 points)
- **Similar Tech Journey**: Companies with similar technology stacks (legacy systems, frameworks, CMS)
- **Related People**: LinkedIn profiles linked to the account (employees)
- **Tech Opportunities**: Extracted from migration opportunities and ROI insights

### 2. **Automatic Deduplication & Merging**

#### Accounts (Companies)
- Deduplicates by domain (www.example.com = example.com)
- Deduplicates by company name
- Automatically merges duplicate accounts intelligently:
  - Keeps most recent/best data
  - Merges tech stacks (combines arrays, keeps unique values)
  - Keeps higher opportunity scores
  - Merges business units and scale data
  - Tracks which accounts were merged

#### People (LinkedIn Profiles)
- Deduplicates by LinkedIn URL
- Deduplicates by name + company combination
- Automatically merges duplicate people:
  - Merges experience arrays (avoids duplicates)
  - Keeps most complete profile data
  - Updates current company/title from most recent data
  - Tracks merge history

### 3. **Relationship Storage**

All relationships are stored in a dedicated `relationship` document type:

```javascript
{
  _type: 'relationship',
  _id: 'relationship.account.{accountKey}',
  sourceType: 'account',
  sourceKey: 'account-key-here',
  relationships: {
    competitors: [...],
    similarIndustry: [...],
    similarOpportunity: [...],
    similarTech: [...],
    relatedPeople: [...],
    techOpportunities: [...],
  },
  detectedAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
}
```

### 4. **Enhanced Storage Service**

All storage operations now use the enhanced storage service that automatically:
1. Checks for duplicates
2. Merges if duplicates found
3. Detects relationships
4. Stores relationships
5. Links people to accounts
6. Triggers auto-enrichment

## 📊 Data Models

### Account Schema (Enhanced)
```javascript
{
  _type: 'account',
  _id: 'account.{accountKey}',
  accountKey: 'sha1-hash',
  canonicalUrl: 'https://example.com',
  rootDomain: 'example.com',
  companyName: 'Example Inc',
  technologyStack: {...},
  opportunityScore: 75,
  relationships: {
    competitorCount: 5,
    similarIndustryCount: 12,
    similarOpportunityCount: 8,
    similarTechCount: 10,
    relatedPeopleCount: 3,
    techOpportunityCount: 4,
    lastDetectedAt: '2024-01-15T10:30:00Z',
  },
  // ... other fields
}
```

### Person Schema (New)
```javascript
{
  _type: 'person',
  _id: 'person.{personKey}',
  personKey: 'sha1-hash',
  name: 'John Doe',
  linkedInUrl: 'https://linkedin.com/in/johndoe',
  currentCompany: 'Example Inc',
  currentTitle: 'CTO',
  experience: [...],
  education: [...],
  skills: [...],
  workPatterns: {...},
  trajectory: {...},
  relatedAccountKey: 'account-key-if-linked',
  // ... other fields
}
```

### Relationship Schema (New)
```javascript
{
  _type: 'relationship',
  _id: 'relationship.account.{accountKey}',
  sourceType: 'account', // or 'person'
  sourceKey: 'account-key-or-person-key',
  relationships: {
    competitors: [
      {
        accountKey: 'competitor-key',
        companyName: 'Competitor Inc',
        canonicalUrl: 'https://competitor.com',
        similarityScore: 0.85,
        relationshipType: 'competitor',
      },
      // ...
    ],
    similarTech: [
      {
        accountKey: 'similar-tech-key',
        companyName: 'Similar Tech Co',
        similarityScore: 0.72,
        relationshipType: 'similar_tech',
      },
      // ...
    ],
    relatedPeople: [
      {
        personKey: 'person-key',
        name: 'Jane Doe',
        currentCompany: 'Example Inc',
        relationshipType: 'employee',
      },
      // ...
    ],
    // ... other relationship types
  },
}
```

## 🔄 Automatic Processes

### On Account Scan (`/scan`)
1. ✅ Check for duplicate account (by domain/name)
2. ✅ Merge if duplicate found
3. ✅ Store account with all scan data
4. ✅ Detect relationships (competitors, similar, etc.)
5. ✅ Store relationship document
6. ✅ Link related people if found
7. ✅ Trigger auto-enrichment (background)

### On LinkedIn Profile Scan (`/linkedin-profile`)
1. ✅ Generate person key from LinkedIn URL
2. ✅ Check for duplicate person (by URL/name+company)
3. ✅ Merge if duplicate found
4. ✅ Store person document
5. ✅ Link person to account (if company detected)
6. ✅ Update account relationships if person is employee

### On Search (`/search`)
1. ✅ Extract domain from search result URL
2. ✅ Find related account by domain
3. ✅ Store search result with `relatedAccountKey`
4. ✅ Results can be queried by account relationship

### On Extract (`/extract`)
1. ✅ Extract domain from evidence URL
2. ✅ Find related account by domain
3. ✅ Store evidence with `relatedAccountKey`
4. ✅ Evidence linked to accounts for easy querying

## 🔍 Relationship Detection Logic

### Competitor Detection
- Same industry match
- Similar opportunity score (within range)
- Tech stack overlap
- Similarity score > 0.3 required

### Similar Industry
- Industry field matches
- Ordered by update date (most recent first)

### Similar Opportunity
- Opportunity score within ±10 points
- Ordered by closest score match

### Similar Tech Journey
- Shares legacy systems
- Shares modern frameworks
- Shares CMS systems
- Similarity score > 0.3 required

### Related People
- Experience includes company name/domain
- Current company matches
- Linked to account via `relatedAccountKey`

## 📈 Querying Relationships

### Get Account with Relationships
```groq
*[_type == "account" && accountKey == $accountKey][0]{
  ...,
  "relationships": *[_type == "relationship" && sourceKey == $accountKey][0]
}
```

### Find Competitors
```groq
*[_type == "relationship" && sourceKey == $accountKey][0].relationships.competitors[].accountKey
```

### Find People at Company
```groq
*[_type == "person" && relatedAccountKey == $accountKey]
```

### Find Similar Tech Companies
```groq
*[_type == "relationship" && sourceKey == $accountKey][0].relationships.similarTech[].accountKey
```

## 🔧 Services

### `relationship-service.js`
- `detectAccountRelationships()` - Detects all relationship types
- `storeAccountRelationships()` - Stores relationship document
- Relationship scoring algorithms

### `deduplication-service.js`
- `checkAndMergeAccount()` - Checks and merges duplicate accounts
- `checkAndMergePerson()` - Checks and merges duplicate people
- Intelligent merge strategies

### `enhanced-storage-service.js`
- `storeAccountWithRelationships()` - Main entry point for account storage
- `storePersonWithRelationships()` - Main entry point for person storage
- `storeSearchResultWithRelationships()` - Stores search results linked to accounts
- `storeEvidenceWithRelationships()` - Stores evidence linked to accounts

## 🎯 Use Cases

### 1. Competitive Intelligence
```javascript
// Scan competitor websites
// System automatically detects they're competitors
// Store competitor relationships
// Query: "Show me all competitors of Example Inc"
```

### 2. Industry Analysis
```javascript
// Scan multiple companies in an industry
// System automatically groups by similar industry
// Find companies with similar tech journeys
// Identify migration patterns
```

### 3. Talent Intelligence
```javascript
// Scan LinkedIn profiles
// System links people to companies
// Track career trajectories
// Find people at target accounts
```

### 4. Account Enrichment
```javascript
// Scan an account
// System automatically finds:
//   - Competitors
//   - Similar companies
//   - Related people
//   - Tech opportunities
// All stored and queryable
```

## 🚀 Next Steps

1. **Update Sanity Studio Schemas**
   - Add `person.js` schema
   - Add `relationship.js` schema
   - Update `account.js` schema with relationships field

2. **Query Interface**
   - Build relationship visualization
   - Create relationship explorer UI
   - Add relationship queries to API

3. **Auto-Enrichment Pipeline**
   - Enhance auto-enrichment triggers
   - Queue enrichment jobs on relationship detection
   - Background relationship updates

## 📝 Schema Files Created

- ✅ `schemas/person.js` - Person/LinkedIn profile schema
- ✅ `schemas/relationship.js` - Relationship linking schema
- ✅ Enhanced account storage in `src/services/enhanced-storage-service.js`
- ✅ Relationship detection in `src/services/relationship-service.js`
- ✅ Deduplication in `src/services/deduplication-service.js`

## ✅ Integration Points

- ✅ `/scan` endpoint - Uses enhanced storage
- ✅ `/linkedin-profile` endpoint - Uses enhanced person storage
- ✅ Account storage - Automatic relationship detection
- ✅ Person storage - Automatic account linking
- ✅ All storage - Automatic deduplication and merging

---

**The system now automatically builds a rich relational graph of all scanned accounts, people, and their relationships!** 🎉

