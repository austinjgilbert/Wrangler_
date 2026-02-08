# Learning & Pattern Matching System Architecture

## Overview

A self-improving system that learns from every user interaction to become smarter, faster, and more anticipatory for account research.

## Core Principles

1. **Learn from Every Interaction**: Every query, action, and outcome is stored and analyzed
2. **Pattern Recognition**: Identify patterns in user behavior and account research
3. **Anticipation**: Predict what users need before they ask
4. **Self-Improvement**: System gets better with each interaction
5. **Speed Optimization**: Learn which actions are most effective and optimize

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Interaction                      │
│  (Query, Action, Account Context)                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Pattern Extraction Layer                    │
│  - Extract query patterns (intent, entities, context)   │
│  - Identify action patterns                             │
│  - Extract account context                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Pattern Matching Layer                      │
│  - Match against historical patterns                    │
│  - Score similarity                                     │
│  - Find successful patterns                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│            Suggestion & Anticipation Layer               │
│  - Generate suggestions based on patterns                │
│  - Anticipate user needs                                │
│  - Recommend next actions                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Learning Storage Layer                      │
│  - Store interactions in Sanity                         │
│  - Build knowledge base                                 │
│  - Track feedback                                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Feedback Loop                               │
│  - User feedback (positive/negative)                    │
│  - Outcome tracking                                     │
│  - Pattern confidence adjustment                        │
└─────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Pattern Extraction (`learning-service.js`)

**Functions**:
- `extractQueryPatterns()` - Extract intent, entities, context from queries
- Identifies: intent, entities, technology mentions, account context, actions

**Example**:
```javascript
const patterns = extractQueryPatterns(
  "Scan example.com and find migration opportunities",
  { account: { domain: "example.com" } }
);
// Returns: {
//   intent: "scan",
//   entities: [{ type: "company", value: "example.com" }],
//   patterns: [
//     { type: "intent", value: "scan", confidence: 0.8 },
//     { type: "action", value: "scan", confidence: 0.8 },
//     { type: "account_context", value: "example.com", confidence: 1.0 }
//   ]
// }
```

### 2. Pattern Matching (`learning-service.js`)

**Functions**:
- `matchHistoricalPatterns()` - Match current patterns against history
- Scores similarity based on: intent, entities, account context, technology mentions
- Applies time decay (recent patterns weighted higher)

**Scoring**:
- Intent match: +0.3
- Entity match: +0.2 per entity
- Account context match: +0.2
- Technology match: +0.15 per tech
- Time decay: Recent interactions weighted higher

### 3. Suggestion Generation (`learning-service.js`)

**Functions**:
- `generateSuggestions()` - Generate suggestions based on patterns
- `anticipateUserNeeds()` - Anticipate what user needs next
- `getSmartSuggestions()` - Use knowledge base for smart suggestions

**Suggestion Types**:
1. **Next Action** - Based on historical patterns
2. **Research Suggestion** - Based on account context
3. **Improvement Suggestion** - Based on account scores
4. **Follow-up** - Based on intent patterns
5. **Deep Dive** - Based on entity mentions

### 4. Learning Storage (`learning-storage.js`)

**Functions**:
- `storeInteraction()` - Store user interaction
- `getInteractionHistory()` - Retrieve interaction history
- `getAccountPatternKnowledge()` - Get knowledge base for account
- `storeFeedback()` - Store user feedback
- `getLearningInsights()` - Get aggregated insights

**Data Stored**:
- Query text and patterns
- Actions taken
- Outcomes (success/failure)
- Response times
- User feedback
- Account context

### 5. Feedback Loop

**Process**:
1. User performs action
2. System stores interaction
3. User provides feedback (implicit or explicit)
4. System adjusts pattern confidence
5. Future suggestions improve

**Feedback Types**:
- **Explicit**: User clicks "helpful" or "not helpful"
- **Implicit**: User follows suggestion (positive) or ignores (negative)
- **Outcome**: Action success/failure

## Data Model

### User Interaction Document
```javascript
{
  _type: 'userInteraction',
  accountKey: 'abc123...',
  accountDomain: 'example.com',
  query: 'Scan example.com',
  patterns: {
    intent: 'scan',
    entities: [...],
    patterns: [...]
  },
  action: 'scan',
  nextAction: 'generate_brief',
  outcome: 'success',
  feedback: 'positive',
  responseTime: 1234, // ms
  timestamp: '2025-01-01T12:00:00Z',
  userId: 'user123',
  sessionId: 'session456',
  metadata: {}
}
```

### Learning Feedback Document
```javascript
{
  _type: 'learningFeedback',
  interactionId: 'interaction-123',
  accountKey: 'abc123...',
  positive: true,
  outcome: 'success',
  suggestion: 'Generate research brief',
  userComment: 'Very helpful!',
  timestamp: '2025-01-01T12:05:00Z'
}
```

## API Endpoints

### POST /learn/interaction
Store user interaction for learning

**Request**:
```json
{
  "query": "Scan example.com",
  "accountKey": "abc123...",
  "action": "scan",
  "outcome": "success",
  "responseTime": 1234
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "stored": true,
    "interactionId": "interaction-123",
    "patterns": { ... }
  }
}
```

### POST /learn/suggest
Get smart suggestions based on patterns

**Request**:
```json
{
  "query": "What should I research next?",
  "accountKey": "abc123...",
  "accountContext": {
    "account": { ... }
  }
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "suggestions": [
      {
        "type": "next_action",
        "action": "Generate research brief",
        "confidence": 0.85,
        "reason": "Based on 5 similar interactions"
      }
    ],
    "patterns": { ... },
    "confidence": 0.85
  }
}
```

### POST /learn/anticipate
Anticipate user needs for account

**Request**:
```json
{
  "accountKey": "abc123...",
  "account": { ... }
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "anticipations": {
      "likelyNextActions": [
        {
          "action": "Analyze migration opportunities",
          "confidence": 0.85,
          "reason": "Legacy systems detected"
        }
      ],
      "researchPriorities": [...],
      "insights": [...]
    }
  }
}
```

### POST /learn/feedback
Store user feedback

**Request**:
```json
{
  "interactionId": "interaction-123",
  "positive": true,
  "outcome": "success",
  "suggestion": "Generate research brief"
}
```

### GET /learn/insights
Get learning insights

**Query Params**:
- `accountKey` - Filter by account
- `userId` - Filter by user

**Response**:
```json
{
  "ok": true,
  "data": {
    "insights": {
      "totalInteractions": 1000,
      "uniqueAccounts": 50,
      "successRate": 0.85,
      "averageResponseTime": 1200,
      "topPatterns": [...],
      "improvementTrend": [...]
    }
  }
}
```

## Integration Points

### 1. Auto-Learn from All Endpoints

**In each handler** (scan, extract, brief, etc.):
```javascript
// After successful operation
const patterns = extractQueryPatterns(userQuery, { account });
await storeInteraction(
  groqQuery,
  upsertDocument,
  client,
  {
    query: userQuery,
    accountKey: accountKey,
    action: 'scan',
    outcome: 'success',
    responseTime: Date.now() - startTime,
  }
);
```

### 2. Provide Suggestions in Responses

**In response handlers**:
```javascript
// Get suggestions
const suggestions = await generateSuggestions(
  patterns,
  matchedHistory,
  accountContext
);

// Include in response
return createSuccessResponse({
  data: scanResult,
  suggestions: suggestions, // Add suggestions
}, requestId);
```

### 3. Anticipate Needs Before User Asks

**In account queries**:
```javascript
// When retrieving account
const anticipations = await anticipateUserNeeds(
  account,
  userHistory,
  { accountKey }
);

// Include in response
return createSuccessResponse({
  account: account,
  anticipations: anticipations, // What user likely needs next
}, requestId);
```

## Self-Improvement Mechanisms

### 1. Pattern Confidence Adjustment
- Positive feedback: Increase confidence (+0.1)
- Negative feedback: Decrease confidence (-0.1)
- Success outcome: Increase confidence
- Failure outcome: Decrease confidence

### 2. Speed Optimization
- Track response times for each action
- Identify fastest patterns
- Suggest faster alternatives
- Learn which actions are most effective

### 3. Pattern Refinement
- Identify successful patterns
- Identify failure patterns
- Refine pattern matching over time
- Build knowledge base of proven patterns

### 4. Anticipation Improvement
- Track which anticipations were correct
- Learn from user behavior
- Improve anticipation accuracy
- Build account-specific patterns

## Success Metrics

1. **Suggestion Accuracy**: % of suggestions user follows
2. **Anticipation Accuracy**: % of anticipations that match user needs
3. **Response Time**: Average response time (should decrease)
4. **Pattern Confidence**: Average pattern confidence (should increase)
5. **User Satisfaction**: Feedback scores (should improve)

## Future Enhancements

1. **Machine Learning**: Use ML models for pattern recognition
2. **Clustering**: Group similar accounts for pattern sharing
3. **Predictive Analytics**: Predict user needs before they ask
4. **A/B Testing**: Test different suggestion strategies
5. **Real-time Learning**: Update patterns in real-time

## Implementation Status

✅ **Completed**:
- Pattern extraction service
- Pattern matching service
- Suggestion generation
- Learning storage service
- API handlers

⏳ **To Do**:
- Integrate into existing endpoints
- Add auto-learning to all handlers
- Add suggestions to responses
- Add anticipation to account queries
- Test and refine

