# Learning System Integration Guide

## Overview

This guide explains how to integrate the learning system into existing endpoints to enable self-improvement and pattern matching.

## Integration Strategy

### Phase 1: Auto-Learn from Interactions (Immediate)

Add learning to all existing endpoints so every interaction is captured.

### Phase 2: Provide Suggestions (Short-term)

Add suggestions to responses so users get proactive recommendations.

### Phase 3: Anticipation (Medium-term)

Add anticipation to account queries to predict user needs.

## Step-by-Step Integration

### Step 1: Add Learning to handleScan

**Location**: `src/index.js` - `handleScan` function

**Add after successful scan** (around line 6530):

```javascript
import { extractQueryPatterns } from './services/learning-service.js';
import { storeInteraction } from './services/learning-storage.js';

// In handleScan, after scan completes successfully:
if (client && finalUrl) {
  try {
    // Extract patterns from query (if available)
    const userQuery = url.searchParams.get('query') || `Scan ${finalUrl}`;
    const patterns = extractQueryPatterns(userQuery, {
      account: { domain: extractDomain(finalUrl), canonicalUrl: finalUrl },
    });
    
    // Store interaction for learning
    await storeInteraction(
      groqQuery,
      upsertDocument,
      client,
      {
        query: userQuery,
        accountKey: accountKey,
        accountDomain: extractDomain(finalUrl),
        patterns: patterns,
        action: 'scan',
        outcome: 'success',
        responseTime: Date.now() - startTime,
        metadata: {
          endpoint: '/scan',
          requestId: requestId,
        },
      }
    );
  } catch (learnError) {
    // Don't break scan if learning fails
  }
}
```

### Step 2: Add Learning to handleExtract

**Location**: `src/index.js` - `handleExtract` function

**Add after successful extract** (around line 4220):

```javascript
// After evidence pack created
if (client && finalUrl) {
  try {
    const body = await request.json();
    const userQuery = body.query || `Extract evidence from ${finalUrl}`;
    const patterns = extractQueryPatterns(userQuery, {
      account: { domain: extractDomain(finalUrl), canonicalUrl: finalUrl },
    });
    
    await storeInteraction(
      groqQuery,
      upsertDocument,
      client,
      {
        query: userQuery,
        accountKey: accountKey,
        accountDomain: extractDomain(finalUrl),
        patterns: patterns,
        action: 'extract',
        outcome: 'success',
        responseTime: Date.now() - startTime,
        metadata: {
          endpoint: '/extract',
          requestId: requestId,
        },
      }
    );
  } catch (learnError) {
    // Silently fail
  }
}
```

### Step 3: Add Suggestions to Responses

**Location**: All handler functions

**Add suggestions to success responses**:

```javascript
import { generateSuggestions } from './services/learning-service.js';
import { getInteractionHistory } from './services/learning-storage.js';

// In handleScan, before returning response:
let suggestions = [];
if (client && accountKey) {
  try {
    const history = await getInteractionHistory(groqQuery, client, {
      accountKey,
      limit: 20,
    });
    
    const patterns = extractQueryPatterns(`Scan ${finalUrl}`, {
      account: { domain: extractDomain(finalUrl) },
    });
    
    suggestions = await generateSuggestions(
      patterns,
      history,
      { account: result }
    );
  } catch (suggestError) {
    // Don't break response if suggestions fail
  }
}

// Add to response
return createSuccessResponse({
  ...result,
  suggestions: suggestions.slice(0, 3), // Top 3 suggestions
}, requestId);
```

### Step 4: Add Anticipation to Account Queries

**Location**: `handleQuery` or new `/account` endpoint

**Add anticipation when retrieving account**:

```javascript
import { anticipateUserNeeds } from './services/learning-service.js';
import { getInteractionHistory } from './services/learning-storage.js';

// When returning account data:
if (accountKey && client) {
  try {
    const userHistory = await getInteractionHistory(groqQuery, client, {
      accountKey,
      limit: 50,
    });
    
    const anticipations = anticipateUserNeeds(
      account,
      userHistory,
      { accountKey }
    );
    
    // Add to response
    return createSuccessResponse({
      account: account,
      anticipations: anticipations,
    }, requestId);
  } catch (anticipateError) {
    // Fall back to account only
  }
}
```

### Step 5: Add Learning Routes

**Location**: `src/index.js` - Main router (around line 8112)

**Add routes**:

```javascript
import {
  handleStoreInteraction,
  handleGetSuggestions,
  handleAnticipateNeeds,
  handleStoreFeedback,
  handleGetLearningInsights,
} from './handlers/learning.js';

// In main router:
} else if (url.pathname.startsWith('/learn/')) {
  if (url.pathname === '/learn/interaction') {
    if (request.method !== 'POST') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'POST required', {}, 405, requestId);
    }
    return await handleStoreInteraction(request, requestId, env);
  } else if (url.pathname === '/learn/suggest') {
    if (request.method !== 'POST') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'POST required', {}, 405, requestId);
    }
    return await handleGetSuggestions(request, requestId, env);
  } else if (url.pathname === '/learn/anticipate') {
    if (request.method !== 'POST') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'POST required', {}, 405, requestId);
    }
    return await handleAnticipateNeeds(request, requestId, env);
  } else if (url.pathname === '/learn/feedback') {
    if (request.method !== 'POST') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'POST required', {}, 405, requestId);
    }
    return await handleStoreFeedback(request, requestId, env);
  } else if (url.pathname === '/learn/insights') {
    if (request.method !== 'GET') {
      return createErrorResponse('METHOD_NOT_ALLOWED', 'GET required', {}, 405, requestId);
    }
    return await handleGetLearningInsights(request, requestId, env);
  }
```

### Step 6: Update Learning Handlers to Use Functions

**Fix**: Update `handlers/learning.js` to accept functions as parameters:

```javascript
// Update function signatures to accept required functions
export async function handleStoreInteraction(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  assertSanityConfigured
) {
  // ... implementation
}

// Or create a wrapper in index.js that passes functions
```

## Auto-Learning Pattern

### Pattern for All Handlers

```javascript
// 1. Track start time
const startTime = Date.now();

// 2. Perform operation
const result = await performOperation();

// 3. Store interaction for learning
if (client && result.success) {
  try {
    const patterns = extractQueryPatterns(userQuery, { account });
    await storeInteraction(
      groqQuery,
      upsertDocument,
      client,
      {
        query: userQuery,
        accountKey: accountKey,
        patterns: patterns,
        action: 'operation_name',
        outcome: 'success',
        responseTime: Date.now() - startTime,
      }
    );
  } catch (learnError) {
    // Don't break operation if learning fails
  }
}
```

## Suggestion Integration Pattern

### Pattern for Responses

```javascript
// 1. Get suggestions
let suggestions = [];
if (client && accountKey) {
  try {
    const history = await getInteractionHistory(groqQuery, client, {
      accountKey,
      limit: 20,
    });
    
    const patterns = extractQueryPatterns(userQuery, { account: result });
    suggestions = await generateSuggestions(patterns, history, { account: result });
  } catch (error) {
    // Silently fail
  }
}

// 2. Add to response
return createSuccessResponse({
  ...result,
  suggestions: suggestions.slice(0, 3),
}, requestId);
```

## Testing

### Test Pattern Extraction

```bash
curl -X POST "/learn/interaction" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Scan example.com and find migration opportunities",
    "accountKey": "abc123",
    "action": "scan"
  }'
```

### Test Suggestions

```bash
curl -X POST "/learn/suggest" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What should I research next?",
    "accountKey": "abc123"
  }'
```

### Test Anticipation

```bash
curl -X POST "/learn/anticipate" \
  -H "Content-Type: application/json" \
  -d '{
    "accountKey": "abc123",
    "account": { ... }
  }'
```

## Monitoring

### Track Learning Metrics

1. **Interaction Count**: Total interactions stored
2. **Pattern Matches**: Successful pattern matches
3. **Suggestion Accuracy**: % of suggestions followed
4. **Anticipation Accuracy**: % of anticipations correct
5. **Response Time**: Average response time (should decrease)

### View Insights

```bash
curl "/learn/insights?accountKey=abc123"
```

## Best Practices

1. **Don't Break Operations**: Learning failures should never break main operations
2. **Async Learning**: Store interactions asynchronously when possible
3. **Privacy**: Don't store sensitive user data
4. **Performance**: Cache pattern knowledge base
5. **Feedback Loop**: Always capture feedback when possible

## Expected Improvements Over Time

### Week 1
- System learns basic patterns
- Suggestions start appearing
- Pattern matching begins

### Month 1
- Suggestions become more accurate
- Anticipation improves
- Response times optimize

### Month 3
- Highly accurate suggestions
- Strong anticipation
- Optimized patterns
- Account-specific intelligence

