# Intelligence Memory System - Implementation Complete ✅

## Overview

This implementation transforms the Sanity schema from a static repository into a **living intelligence graph** that learns from every user-GPT interaction. The system captures Q&A exchanges, derives learnings, and enables GPT to reference past conversations with "we said this last time" functionality.

## 🎯 Core Features

1. **Interaction Logging**: Captures every Q&A exchange between user and GPT (WRANGLER)
2. **Session Management**: Groups interactions into continuous conversations
3. **Learning Derivation**: Extracts insights and takeaways from interactions
4. **Context Retrieval**: Enables GPT to recall past conversations and learnings
5. **Automatic Linking**: Links interactions to accounts, briefs, persons, and evidence

## 📊 New Content Types

### 1. `interaction` (NEW)
Captures every Q&A exchange between user and GPT.

**Schema**: `schemas/interaction.js`
**Storage**: `src/services/interaction-storage.js`

**Key Fields**:
- `sessionId` (reference to session)
- `userPrompt` (text) - what the user asked
- `gptResponse` (text) - WRANGLER's full reply
- `timestamp` (datetime)
- `referencedAccounts` (array of references)
- `referencedBriefs` (array of references)
- `referencedPeople` (array of references)
- `referencedEvidence` (array of references)
- `contextTags` (array of strings)
- `importance` (0-1 scale)
- `followUpNeeded` (boolean)
- `derivedInsight` (boolean)

### 2. `session` (NEW)
Groups multiple interactions into one continuous conversation.

**Schema**: `schemas/session.js`
**Storage**: `src/services/interaction-storage.js`

**Key Fields**:
- `sessionId` (string, unique)
- `title` (string)
- `startedAt` (datetime)
- `lastUpdatedAt` (datetime)
- `participants` (array of strings)
- `accountsInContext` (array of references)
- `briefsInContext` (array of references)
- `summary` (text)
- `learnings` (array of text)
- `followUps` (array of text)
- `interactionCount` (number)

### 3. `learning` (NEW)
Captures explicit or inferred takeaways from previous interactions.

**Schema**: `schemas/learning.js`
**Storage**: `src/services/interaction-storage.js`

**Key Fields**:
- `learningId` (string, unique)
- `title` (string)
- `summary` (text)
- `derivedFrom` (array of references to interactions)
- `applicableToAccounts` (array of references)
- `applicableToBriefs` (array of references)
- `relevanceScore` (0-1 scale, >0.7 for auto-retrieval)
- `contextTags` (array of strings)
- `memoryPhrase` (string) - key phrase for recall
- `referenceCount` (number)

## 🔧 Services & Handlers

### Storage Services

1. **`src/services/interaction-storage.js`**
   - `getOrCreateSession()` - Get or create session for interactions
   - `storeInteraction()` - Store Q&A exchange with automatic linking
   - `deriveLearning()` - Extract learning from interactions

2. **`src/services/context-retrieval.js`**
   - `getRecentInteractions()` - Get recent interactions about a topic/account
   - `getUnresolvedFollowUps()` - Get unresolved follow-ups
   - `getRelevantLearnings()` - Get learnings related to accounts/briefs
   - `getMostRecentConversation()` - Get most recent conversation about a brand
   - `getSessionWithInteractions()` - Get session with all interactions
   - `buildContextSummary()` - Build formatted context string for GPT prompts

3. **`src/utils/ids.js`**
   - `generateSessionId()` - Generate unique session ID (UUID-style)
   - `generateInteractionId()` - Generate unique interaction ID
   - `generateLearningId()` - Generate unique learning ID

### Endpoint Handlers

1. **`POST /store/interaction`** - Store Q&A exchange
   - Body: `{ account: {...}, data: { sessionId, userPrompt, gptResponse, ... } }`
   - Auto-detects follow-ups and derived insights
   - Links to accounts, briefs, persons, evidence
   - Updates session interaction count

2. **`POST /store/session`** - Create or get session
   - Body: `{ account: {...}, data: { sessionId?, title?, participants?, ... } }`
   - Creates new session or returns existing one
   - Updates `lastUpdatedAt` automatically

3. **`POST /store/learning`** - Derive learning from interactions
   - Body: `{ account: {...}, data: { title, summary, derivedFrom, ... } }`
   - Creates learning document with references
   - Links to accounts and briefs

4. **`GET /context`** or **`POST /context`** - Retrieve context/memory for GPT
   - GET: Query params (`?accountKey=...&domain=...&type=summary`)
   - POST: Body with filters
   - Returns: `{ summary, interactions, learnings, followUps }`

## 📋 Usage Examples

### 1. Store Interaction (Q&A Exchange)

```bash
POST /store/interaction
Content-Type: application/json

{
  "account": {
    "canonicalUrl": "https://example.com",
    "companyName": "Example Inc"
  },
  "data": {
    "sessionId": "uuid-here",
    "userPrompt": "What did we find about Fleet Feet's content reuse pain point?",
    "gptResponse": "Last time, we identified content reuse as a pain point for Fleet Feet's local franchise model. They struggle with maintaining consistent messaging across locations...",
    "referencedAccounts": ["account-key-here"],
    "contextTags": ["FY26", "Commerce Vertical", "Content Management"],
    "importance": 0.8
  }
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "stored": true,
    "id": "interaction-id",
    "interactionId": "interaction-id",
    "sessionId": "uuid-here",
    "type": "interaction",
    "followUpNeeded": false,
    "derivedInsight": true
  }
}
```

### 2. Retrieve Context for GPT

```bash
GET /context?accountKey=account-key-here&type=summary&limit=10
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "summary": "## Previous Learnings:\n- Content reuse pain point: Fleet Feet struggles with...\n\n## Unresolved Follow-Ups:\n- Review content management strategy...\n\n## Recent Context:\n[2024-01-15] User: What did we find...\nWRANGLER: Last time, we identified...",
    "filters": {
      "accountKey": "account-key-here"
    }
  }
}
```

### 3. Store Session

```bash
POST /store/session
Content-Type: application/json

{
  "account": {
    "canonicalUrl": "https://example.com"
  },
  "data": {
    "sessionId": "uuid-here",
    "title": "FY26 Commerce Vertical Research",
    "participants": ["user", "WRANGLER"],
    "accountsInContext": ["account-key-here"],
    "briefsInContext": ["brief-id-here"]
  }
}
```

### 4. Derive Learning

```bash
POST /store/learning
Content-Type: application/json

{
  "account": {
    "canonicalUrl": "https://example.com"
  },
  "data": {
    "title": "Content Reuse Pain Point",
    "summary": "Fleet Feet struggles with content reuse across local franchises. This is a key opportunity for CMS modernization.",
    "derivedFrom": ["interaction-id-1", "interaction-id-2"],
    "applicableToAccounts": ["account-key-here"],
    "relevanceScore": 0.9,
    "contextTags": ["FY26", "Commerce Vertical", "Content Management"],
    "memoryPhrase": "content reuse pain point"
  }
}
```

## 🧠 GPT Integration

### Example: "We said this last time"

When GPT generates responses, it can query for past learnings:

```javascript
// In GPT prompt/context
const context = await buildContextSummary(groqQuery, client, {
  accountKey: 'account-key-here',
  contextTags: ['FY26', 'Commerce Vertical'],
  minRelevanceScore: 0.7
});

// GPT can now reference:
"Last time, we identified content reuse as a pain point for Fleet Feet's local franchise model. This aligns with your current question about their CMS strategy..."
```

### Automatic Interaction Logging

To automatically log every GPT interaction, wrap GPT calls:

```javascript
async function storeConversation(userPrompt, gptResponse, context) {
  const { storeInteraction } = await import('./services/interaction-storage.js');
  
  await storeInteraction(
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
    {
      sessionId: context.sessionId,
      userPrompt,
      gptResponse,
      referencedAccounts: context.accounts,
      referencedBriefs: context.briefs,
      contextTags: context.tags,
    },
    {}
  );
}
```

## 📈 Data Model Hierarchy

```
session
 ├── interaction (user ↔ GPT turns)
 │    ├── evidence (facts referenced)
 │    ├── account (topics discussed)
 │    ├── brief (insight referenced)
 │    └── person (people discussed)
 ├── learning (derived takeaways)
 └── summary (session-level synthesis)
```

## 🔍 Query Examples (GROQ)

### Find most recent conversation about a brand

```groq
*[_type == "interaction" && references(*[_type == "account" && domain == "lovesac.com"]._id)] | order(timestamp desc)[0]
```

### Pull all learnings related to Commerce Vertical

```groq
*[_type == "learning" && "commerce" in contextTags] | order(createdAt desc)
```

### Retrieve unresolved follow-ups

```groq
*[_type == "interaction" && followUpNeeded == true] | order(timestamp desc)
```

### Get learnings with high relevance for an account

```groq
*[_type == "learning" && references($accountId) && relevanceScore >= 0.7] | order(relevanceScore desc, createdAt desc)[0...5]
```

## ⚠️ OpenAPI Operation Limit Note

**Current Status**: 30 operations (ChatGPT Actions limit: 30)

**New Endpoint Added**: `/context` (GET/POST)

**Total After Implementation**: 31 operations ⚠️

**Options**:
1. **Keep as-is**: The `/context` endpoint is essential for intelligence memory system
2. **Consolidate**: Merge `/context` into `/query` endpoint as a query type
3. **Remove unused**: Remove any unused endpoints to stay under limit
4. **Prioritize**: The intelligence memory system may be more valuable than other endpoints

## ✅ Implementation Checklist

- [x] Created `interaction` schema
- [x] Created `session` schema
- [x] Created `learning` schema
- [x] Created `interaction-storage.js` service
- [x] Created `context-retrieval.js` service
- [x] Created `ids.js` utility
- [x] Updated store endpoint to support `interaction`, `session`, `learning`
- [x] Added `/context` endpoint handler
- [x] Added routing for `/context` endpoint
- [x] Updated `StoreType` enum in OpenAPI spec
- [x] All syntax checks passed
- [x] No linting errors

## 🚀 Next Steps

1. **Update OpenAPI Spec**: Add `/context` endpoint definition (will push to 31 operations)
2. **Add Schemas**: Add `Interaction`, `Session`, `Learning` schemas to OpenAPI
3. **Test Integration**: Test automatic interaction logging with GPT
4. **Test Context Retrieval**: Test context retrieval for GPT prompts
5. **Monitor Performance**: Monitor interaction storage performance
6. **Optimize Queries**: Optimize GROQ queries for context retrieval

## 📝 Notes

- All interactions are automatically linked to accounts, briefs, persons, and evidence
- Follow-ups are auto-detected from GPT responses (contains "follow up", "revisit", etc.)
- Derived insights are auto-detected from GPT responses (contains "insight", "conclusion", etc.)
- Learnings with `relevanceScore >= 0.7` are automatically included in context retrieval
- Sessions are automatically updated with interaction counts and last updated timestamps

---

**Status**: ✅ Implementation Complete - Ready for Testing
