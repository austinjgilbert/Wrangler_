# Intelligence Memory System - Usage Examples

## Overview

The Intelligence Memory System enables GPT (WRANGLER) to reference past conversations, learnings, and context when generating briefs and responses. This creates a "we said this last time" functionality that makes interactions more context-aware and valuable over time.

## Core Concepts

### 1. Interaction
A single Q&A exchange between the user and GPT. Captures:
- User prompt
- GPT response
- Timestamp
- Referenced entities (accounts, briefs, people, evidence)
- Context tags
- Follow-up needs

### 2. Session
Groups multiple interactions into one continuous conversation. Allows GPT to:
- Rehydrate context over time
- Track conversation threads
- Build knowledge incrementally

### 3. Learning
Derived insights and takeaways from interactions. Used for:
- "We said this last time" memory recall
- Pattern recognition
- Strategic decision-making

## Basic Usage

### 1. Store an Interaction

```bash
POST /store/interaction
Content-Type: application/json

{
  "data": {
    "userPrompt": "Generate a person brief for John Doe at Acme Corp",
    "gptResponse": "Here's the brief for John Doe...",
    "sessionId": "session-123",  # Optional, will create if not provided
    "referencedAccounts": ["account-abc123"],
    "referencedBriefs": ["brief-xyz789"],
    "contextTags": ["Acme Corp", "Q1 FY26"],
    "importance": 0.8,
    "followUpNeeded": false
  }
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "stored": true,
    "id": "interaction.abc123",
    "interactionId": "interaction-abc123",
    "sessionId": "session-123",
    "type": "interaction"
  },
  "requestId": "req-xyz"
}
```

### 2. Get or Create a Session

```bash
POST /store/session
Content-Type: application/json

{
  "data": {
    "sessionId": "session-123",  # Optional, will generate UUID if not provided
    "title": "Acme Corp Account Research",
    "participants": ["user", "WRANGLER"],
    "accountsInContext": ["account-abc123"],
    "summary": "Researching Acme Corp and key executives"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "stored": true,
    "id": "session.session-123",
    "sessionId": "session-123",
    "type": "session",
    "isNew": true,
    "interactionCount": 0
  },
  "requestId": "req-xyz"
}
```

### 3. Derive a Learning

```bash
POST /store/learning
Content-Type: application/json

{
  "data": {
    "title": "Acme Corp prefers modern tech stack",
    "summary": "Based on our conversation, Acme Corp shows strong preference for modern, cloud-native solutions over legacy systems.",
    "derivedFrom": ["interaction.abc123", "interaction.def456"],
    "applicableToAccounts": ["account-abc123"],
    "relevanceScore": 0.9,
    "contextTags": ["Acme Corp", "Tech Stack", "Q1 FY26"],
    "memoryPhrase": "Acme prefers modern tech"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "stored": true,
    "id": "learning.xyz789",
    "learningId": "learning-xyz789",
    "type": "learning"
  },
  "requestId": "req-xyz"
}
```

## Context Retrieval

### 1. Get Context Summary

Retrieve a formatted summary of past context for an account:

```bash
GET /query?type=context&contextType=summary&accountKey=account-abc123
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "summary": "## Previous Learnings:\n- Acme Corp prefers modern tech stack: Based on our conversation...\n\n## Recent Context:\n[2024-01-15] User: Generate brief for John Doe...\nWRANGLER: Here's the brief...",
    "filters": {
      "accountKey": "account-abc123"
    },
    "type": "context"
  },
  "requestId": "req-xyz"
}
```

### 2. Get Recent Interactions

```bash
GET /query?type=context&contextType=interactions&accountKey=account-abc123&contextLimit=5
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "interactions": [
      {
        "interactionId": "interaction-abc123",
        "userPrompt": "Generate brief for John Doe",
        "gptResponse": "Here's the brief...",
        "timestamp": "2024-01-15T10:30:00Z",
        "contextTags": ["Acme Corp", "Q1 FY26"]
      }
    ],
    "count": 1,
    "filters": {
      "accountKey": "account-abc123"
    },
    "type": "context"
  },
  "requestId": "req-xyz"
}
```

### 3. Get Relevant Learnings

```bash
GET /query?type=context&contextType=learnings&accountKey=account-abc123&minRelevanceScore=0.7&contextLimit=10
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "learnings": [
      {
        "learningId": "learning-xyz789",
        "title": "Acme Corp prefers modern tech stack",
        "summary": "Based on our conversation...",
        "relevanceScore": 0.9,
        "memoryPhrase": "Acme prefers modern tech"
      }
    ],
    "count": 1,
    "filters": {
      "accountKey": "account-abc123"
    },
    "type": "context"
  },
  "requestId": "req-xyz"
}
```

### 4. Get Unresolved Follow-ups

```bash
GET /query?type=context&contextType=followUps&accountKey=account-abc123
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "followUps": [
      {
        "interactionId": "interaction-def456",
        "userPrompt": "Follow up on Acme Corp next quarter",
        "followUpNotes": "Need to check Q2 FY26 plans",
        "timestamp": "2024-01-20T14:00:00Z"
      }
    ],
    "count": 1,
    "filters": {
      "accountKey": "account-abc123"
    },
    "type": "context"
  },
  "requestId": "req-xyz"
}
```

## Integration Examples

### Example 1: Person Brief with Context

When generating a person brief, the system automatically retrieves context:

```bash
POST /person/brief
Content-Type: application/json

{
  "name": "John Doe",
  "companyName": "Acme Corp",
  "profileUrl": "https://linkedin.com/in/johndoe"
}
```

**What Happens:**
1. System resolves company domain from "Acme Corp"
2. Retrieves context for the account (previous interactions, learnings, follow-ups)
3. Includes context in brief generation
4. Brief output includes `previousContext` and `previousInteractions` fields

**Response (includes context):**
```json
{
  "ok": true,
  "data": {
    "personBrief": {
      "executiveSummary": ["John Doe (CTO at Acme Corp)..."],
      "opportunityConfidence": {
        "score": 75,
        "confidenceMarker": "🟢",
        "whatWouldChangeScore": "If Acme Corp modernizes their legacy systems..."
      },
      "previousContext": "## Previous Learnings:\n- Acme Corp prefers modern tech stack...",
      "previousInteractions": [
        {
          "timestamp": "2024-01-15T10:30:00Z",
          "userPrompt": "Generate brief for John Doe",
          "gptResponse": "Here's the brief for John Doe at Acme Corp..."
        }
      ]
    }
  },
  "requestId": "req-xyz"
}
```

### Example 2: Auto-Logging Interaction

Use the auto-logging helper to automatically log interactions:

```javascript
import { autoLogInteraction } from './utils/auto-logging.js';

// After GPT generates a response
const result = await autoLogInteraction(
  userPrompt,
  gptResponse,
  {
    requestId: 'req-123',
    accounts: [accountId],
    briefs: [briefId],
    persons: [personId],
    contextTags: ['Acme Corp', 'Q1 FY26'],
    importance: 0.8,
    followUpNeeded: false,
  },
  groqQuery,
  upsertDocument,
  patchDocument,
  client
);

if (result.success) {
  console.log(`Interaction logged: ${result.interactionId}`);
  console.log(`Session: ${result.sessionId}`);
}
```

### Example 3: Retrieve Context Before Response

Use context retrieval to get previous context before generating a response:

```javascript
import { retrieveContextForGPT } from './utils/auto-logging.js';

// Before generating GPT response
const contextResult = await retrieveContextForGPT(
  {
    accountKey: 'account-abc123',
    domain: 'acmecorp.com',
    contextTags: ['Acme Corp', 'Q1 FY26'],
    minRelevanceScore: 0.7,
  },
  groqQuery,
  client
);

if (contextResult.success && contextResult.summary) {
  // Include context in GPT prompt
  const enhancedPrompt = `
    ${contextResult.summary}
    
    ${userPrompt}
  `;
  
  // Generate GPT response with context
  const gptResponse = await generateGPTResponse(enhancedPrompt);
}
```

### Example 4: Building a Session Thread

Create a session and add multiple interactions:

```javascript
// Step 1: Create session
const sessionResult = await storeData('session', {
  title: 'Acme Corp Account Research',
  accountsInContext: ['account-abc123'],
});

const sessionId = sessionResult.data.sessionId;

// Step 2: Add interactions to session
for (const interaction of interactions) {
  await storeData('interaction', {
    ...interaction,
    sessionId, // Link to session
  });
}

// Step 3: Retrieve full session with interactions
const session = await queryData({
  type: 'context',
  sessionId,
  contextType: 'all',
});
```

## Advanced Usage

### Filtering by Context Tags

Use context tags to organize interactions and learnings:

```bash
GET /query?type=context&tags=Acme Corp,Q1 FY26,Tech Stack&contextType=summary
```

This retrieves context for all interactions/learnings tagged with "Acme Corp", "Q1 FY26", or "Tech Stack".

### Domain-Based Context Retrieval

Retrieve context for all accounts matching a domain:

```bash
GET /query?type=context&domain=acmecorp.com&contextType=summary
```

This finds all accounts with `domain` or `rootDomain` matching "acmecorp.com" and retrieves their context.

### Relevance Scoring

Filter learnings by relevance score:

```bash
GET /query?type=context&contextType=learnings&minRelevanceScore=0.8&contextLimit=5
```

This returns only highly relevant learnings (score >= 0.8), limited to 5 results.

## Best Practices

### 1. Always Use Context Tags
Tag interactions and learnings with relevant keywords:
- Company names
- Time periods (e.g., "Q1 FY26")
- Topics (e.g., "Tech Stack", "AI Readiness")
- Personas (e.g., "Engineering", "Marketing")

### 2. Set Appropriate Importance Levels
Use `importance` field (0-1) to weight interactions:
- `0.9-1.0`: Critical decisions, strategic insights
- `0.7-0.9`: Important learnings, key conversations
- `0.5-0.7`: Standard interactions
- `0.0-0.5`: Low-priority, routine interactions

### 3. Mark Follow-ups Explicitly
Use `followUpNeeded` and `followUpNotes` for actionable items:
```json
{
  "followUpNeeded": true,
  "followUpNotes": "Check Q2 FY26 plans for Acme Corp modernization initiative"
}
```

### 4. Derive Learnings Regularly
After significant conversations, derive learnings:
```bash
POST /store/learning
{
  "data": {
    "title": "Key Insight Summary",
    "summary": "Detailed summary of what we learned",
    "derivedFrom": ["interaction-1", "interaction-2"],
    "applicableToAccounts": ["account-abc123"],
    "relevanceScore": 0.9
  }
}
```

### 5. Use Session Grouping
Group related interactions into sessions:
- One session per account research thread
- One session per strategic initiative
- One session per time period (e.g., monthly reviews)

## "We Said This Last Time" Usage

The intelligence memory system enables GPT to reference past decisions:

**Example GPT Response:**
```
Based on our previous conversation about Acme Corp (see interaction from Jan 15),
we noted that they prefer modern tech stacks over legacy systems. 

Given this context, I recommend focusing on their cloud-native transformation
initiative rather than legacy modernization, which aligns with their stated
preferences.

Last time, we said: "Acme Corp's CTO John Doe emphasized the importance of
modern, scalable infrastructure for their growth plans."
```

**How It Works:**
1. Brief generation automatically retrieves context
2. Context is included in brief output (`previousContext`, `previousInteractions`)
3. GPT can reference this context when processing the brief
4. Enables consistent, context-aware responses

## Troubleshooting

### Context Not Found
If context retrieval returns empty:
- Check that interactions/learnings exist for the account
- Verify `accountKey` or `domain` matches stored documents
- Check `contextTags` match stored tags
- Verify `minRelevanceScore` isn't too high

### Session Not Created
If session creation fails:
- Check that `sessionId` is valid (UUID format)
- Verify Sanity is configured correctly
- Check that session document doesn't already exist

### Learning Not Retrieved
If learnings aren't returned:
- Check `relevanceScore` is high enough (>= `minRelevanceScore`)
- Verify `applicableToAccounts` or `applicableToBriefs` match query
- Check `contextTags` match stored tags

## See Also

- [Intelligence Memory System Architecture](../INTELLIGENCE-MEMORY-SYSTEM.md)
- [Sanity Setup Guide](../SANITY-SETUP.md)
- [API Documentation](./api/)
- [GPT Instructions](../gpt-instructions.md)
