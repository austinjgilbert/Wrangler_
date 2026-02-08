# Seamless Integration Checklist - Intelligence Memory System

## ✅ Completed
- [x] Created interaction, session, learning schemas
- [x] Created storage services
- [x] Created context retrieval service
- [x] Updated store endpoint handlers
- [x] Added /context endpoint routing
- [x] Updated StoreType enum in OpenAPI

## 🔧 Still Needed for Seamless Integration

### 1. Update Sanity Schema Documentation ⚠️
**File**: `sanity-schemas.js`

Add schemas for the new types:
```javascript
// Interaction Document Schema
export const interactionSchema = {
  _type: 'interaction',
  _id: 'interaction.{interactionId}',
  interactionId: 'string',
  sessionId: 'reference',
  userPrompt: 'text',
  gptResponse: 'text',
  timestamp: 'datetime',
  referencedAccounts: 'array',
  referencedBriefs: 'array',
  referencedPeople: 'array',
  referencedEvidence: 'array',
  contextTags: 'array',
  importance: 'number',
  followUpNeeded: 'boolean',
  derivedInsight: 'boolean',
  // ... other fields
};

// Session Document Schema
export const sessionSchema = {
  _type: 'session',
  _id: 'session.{sessionId}',
  sessionId: 'string',
  title: 'string',
  startedAt: 'datetime',
  lastUpdatedAt: 'datetime',
  participants: 'array',
  accountsInContext: 'array',
  briefsInContext: 'array',
  summary: 'text',
  learnings: 'array',
  followUps: 'array',
  interactionCount: 'number',
  // ... other fields
};

// Learning Document Schema
export const learningSchema = {
  _type: 'learning',
  _id: 'learning.{learningId}',
  learningId: 'string',
  title: 'string',
  summary: 'text',
  derivedFrom: 'array',
  applicableToAccounts: 'array',
  applicableToBriefs: 'array',
  relevanceScore: 'number',
  contextTags: 'array',
  memoryPhrase: 'string',
  // ... other fields
};
```

### 2. Update GPT Instructions 📝
**File**: `gpt-instructions.md`

Add section about intelligence memory system:
```markdown
⸻

Intelligence Memory System (NEW)

The system now captures every Q&A exchange and enables "we said this last time" functionality.

**Context Retrieval**:
- Use `getContext` or `retrieveContext` to get past conversations about an account
- Automatically includes learnings with relevanceScore >= 0.7
- Returns formatted context summary for inclusion in prompts

**Interaction Logging**:
- All GPT responses should be logged via `storeInteraction`
- Include sessionId, userPrompt, gptResponse, and referenced entities
- System auto-detects follow-ups and derived insights

**Memory Recall**:
- When user asks about a topic, check for past learnings first
- Reference format: "Last time, we identified [memoryPhrase]..."
- Use contextTags to filter relevant learnings

**Example Usage**:
1. User asks: "What did we find about Fleet Feet?"
2. GPT calls: `getContext(accountKey: "fleet-feet", type: "summary")`
3. GPT responds: "Last time, we identified content reuse as a pain point for Fleet Feet's local franchise model..."
4. GPT logs: `storeInteraction({ sessionId, userPrompt, gptResponse, referencedAccounts: [...] })`
```

### 3. Add /context Endpoint to OpenAPI ⚠️
**File**: `openapi.yaml`

**Note**: This will push total operations to 31 (limit is 30). Options:
- Keep as-is (essential feature)
- Consolidate into /query as a query type
- Remove unused endpoint

Add endpoint definition:
```yaml
  /context:
    get:
      operationId: getContext
      summary: Retrieve context and memory for GPT
      description: |
        Retrieves past conversations, learnings, and context for GPT memory.
        Enables "we said this last time" functionality.
      tags: [Sanity]
      parameters:
        - name: accountKey
          in: query
          required: false
          schema:
            type: string
        - name: domain
          in: query
          required: false
          schema:
            type: string
        - name: type
          in: query
          required: false
          schema:
            type: string
            enum: [summary, interactions, learnings, followUps]
            default: summary
        - name: limit
          in: query
          required: false
          schema:
            type: integer
            default: 10
      responses:
        "200":
          description: Context retrieved successfully
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ContextResponse"
        "400":
          description: Bad request
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
    post:
      operationId: getContextPost
      summary: Retrieve context with filters (POST)
      description: Same as GET but with body filters
      tags: [Sanity]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ContextRequest"
      responses:
        "200":
          description: Context retrieved successfully
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ContextResponse"
```

Add schemas:
```yaml
    ContextRequest:
      type: object
      properties:
        accountKey:
          type: string
        domain:
          type: string
        accountId:
          type: string
        briefId:
          type: string
        sessionId:
          type: string
        contextTags:
          type: array
          items:
            type: string
        type:
          type: string
          enum: [summary, interactions, learnings, followUps, all]
          default: all
        limit:
          type: integer
          default: 10
        minRelevanceScore:
          type: number
          default: 0.7
        summary:
          type: boolean
          default: false

    ContextResponse:
      type: object
      required: [ok, data, requestId]
      properties:
        ok:
          type: boolean
          enum: [true]
        data:
          type: object
          properties:
            summary:
              type: string
            interactions:
              type: array
              items:
                type: object
            learnings:
              type: array
              items:
                type: object
            followUps:
              type: array
              items:
                type: object
            counts:
              type: object
              properties:
                interactions:
                  type: integer
                learnings:
                  type: integer
                followUps:
                  type: integer
            filters:
              type: object
        requestId:
          $ref: "#/components/schemas/RequestId"
```

### 4. Create Auto-Logging Helper Function 🔄
**File**: `src/utils/auto-logging.js` (NEW)

Create a helper to automatically log GPT interactions:
```javascript
/**
 * Auto-logging helper for GPT interactions
 * Wraps GPT responses to automatically log interactions
 */

export async function autoLogInteraction(
  userPrompt,
  gptResponse,
  context,
  groqQuery,
  upsertDocument,
  patchDocument,
  client
) {
  const { storeInteraction } = await import('../services/interaction-storage.js');
  
  try {
    // Extract referenced entities from context
    const referencedAccounts = context.accounts?.map(a => 
      typeof a === 'string' ? a : a._id || a.accountKey
    ) || [];
    const referencedBriefs = context.briefs?.map(b => 
      typeof b === 'string' ? b : b._id
    ) || [];
    const referencedPeople = context.persons?.map(p => 
      typeof p === 'string' ? p : p._id
    ) || [];
    const referencedEvidence = context.evidence?.map(e => 
      typeof e === 'string' ? e : e._id
    ) || [];

    // Get or create session
    const sessionId = context.sessionId || null;

    // Store interaction
    const result = await storeInteraction(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      {
        sessionId,
        userPrompt,
        gptResponse,
        timestamp: new Date().toISOString(),
        referencedAccounts,
        referencedBriefs,
        referencedPeople,
        referencedEvidence,
        contextTags: context.tags || [],
        importance: context.importance || 0.5,
        requestId: context.requestId,
      },
      {}
    );

    return result;
  } catch (error) {
    // Don't break GPT response if logging fails
    console.error('Auto-logging failed:', error);
    return { success: false, error: error.message };
  }
}
```

### 5. Update GPT Instructions with Context Usage 📚
**File**: `gpt-instructions.md`

Add to "Tools / Actions" section:
```markdown
	•	getContext / retrieveContext
Retrieve past conversations and learnings about an account or topic.
Use before responding to enable "we said this last time" functionality.
Returns formatted context summary with learnings, follow-ups, and recent interactions.
Auto-saves context retrieval as interaction.
```

### 6. Add Context Retrieval to Brief Generation 🔗
**File**: `src/services/person-intelligence-service.js`

Before generating briefs, retrieve context:
```javascript
// At start of generatePersonBriefInternal or synthesizePersonBrief
const { buildContextSummary } = await import('./context-retrieval.js');

// Get context for account
const context = await buildContextSummary(
  context.groqQuery,
  context.client,
  {
    accountKey: accountKey,
    domain: extractDomain(canonicalUrl),
    contextTags: ['person-intelligence', 'brief'],
    minRelevanceScore: 0.7,
  }
);

// Include in GPT prompt
const enhancedPrompt = `${basePrompt}\n\n## Previous Context:\n${context}`;
```

### 7. Update Sanity Studio Setup Script 📦
**File**: `init-sanity-studio.sh` or `setup-sanity-studio.sh`

Add new schemas to copy:
```bash
# Copy new schemas
cp schemas/interaction.js "$STUDIO_DIR/schemas/"
cp schemas/session.js "$STUDIO_DIR/schemas/"
cp schemas/learning.js "$STUDIO_DIR/schemas/"

# Update schemas/index.js to include new schemas
```

### 8. Create Integration Example 📖
**File**: `INTELLIGENCE-MEMORY-INTEGRATION-EXAMPLE.md` (NEW)

Show how to integrate in a GPT wrapper:
```javascript
// Example: GPT wrapper with auto-logging
async function gptWithMemory(userPrompt, context) {
  // 1. Retrieve past context
  const pastContext = await getContext({
    accountKey: context.accountKey,
    domain: context.domain,
    type: 'summary',
  });

  // 2. Build enhanced prompt
  const enhancedPrompt = `
${userPrompt}

## Previous Context:
${pastContext.summary}
`;

  // 3. Call GPT
  const gptResponse = await callGPT(enhancedPrompt);

  // 4. Auto-log interaction
  await autoLogInteraction(
    userPrompt,
    gptResponse,
    {
      ...context,
      accounts: context.accounts || [],
      briefs: context.briefs || [],
      tags: context.tags || [],
    },
    groqQuery,
    upsertDocument,
    patchDocument,
    client
  );

  // 5. Return response
  return gptResponse;
}
```

### 9. Update Documentation 📄
**Files**: Various .md files

- Update `README.md` with intelligence memory system
- Update `SANITY-SETUP.md` with new schemas
- Update `QUICK-START.md` with context retrieval examples

### 10. Add Error Handling 🛡️
**Files**: All interaction storage functions

Ensure all functions handle errors gracefully:
- Don't break main functionality if logging fails
- Log errors but continue execution
- Return success even if non-critical operations fail

## Priority Order

1. **High Priority** (Essential for functionality):
   - ✅ Update Sanity schema documentation
   - ✅ Add /context endpoint to OpenAPI (or consolidate)
   - ✅ Create auto-logging helper
   - ✅ Update GPT instructions

2. **Medium Priority** (Improves experience):
   - Add context retrieval to brief generation
   - Update Sanity Studio setup scripts
   - Create integration examples

3. **Low Priority** (Nice to have):
   - Update all documentation
   - Add comprehensive error handling
   - Create testing examples

## Testing Checklist

After updates:
- [ ] Test interaction storage
- [ ] Test session management
- [ ] Test context retrieval
- [ ] Test auto-logging helper
- [ ] Test GPT integration
- [ ] Verify OpenAPI spec validates
- [ ] Test Sanity Studio with new schemas

---

**Status**: Ready for implementation
**Estimated Time**: 2-3 hours for all updates
