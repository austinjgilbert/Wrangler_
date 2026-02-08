# Learning System Quick Start

## What It Does

The learning system makes your GPT smarter with every interaction by:
1. **Learning** from every user query and action
2. **Matching** patterns to find what worked before
3. **Suggesting** next actions based on history
4. **Anticipating** what users need before they ask
5. **Improving** over time through feedback

## How It Works

### 1. Pattern Extraction
Every query is analyzed to extract:
- **Intent**: What user wants (scan, research, compare, etc.)
- **Entities**: Companies, technologies mentioned
- **Context**: Account being researched

### 2. Pattern Matching
Current patterns are matched against historical interactions:
- Similar intents
- Same entities
- Same account context
- Recent patterns weighted higher

### 3. Smart Suggestions
Based on patterns, system suggests:
- Next likely action
- Research priorities
- Account-specific insights
- Follow-up actions

### 4. Anticipation
For each account, system anticipates:
- What user likely needs next
- Research priorities
- Improvement opportunities
- Action recommendations

### 5. Self-Improvement
System learns from:
- User feedback (positive/negative)
- Action outcomes (success/failure)
- Pattern accuracy
- Response times

## Quick Integration

### Minimal Integration (5 minutes)

Add to any handler after successful operation:

```javascript
import { extractQueryPatterns } from './services/learning-service.js';
import { storeInteraction } from './services/learning-storage.js';

// After successful operation
if (client && accountKey) {
  try {
    await storeInteraction(
      groqQuery,
      upsertDocument,
      client,
      {
        query: userQuery || 'operation',
        accountKey: accountKey,
        action: 'scan', // or 'extract', 'brief', etc.
        outcome: 'success',
      }
    );
  } catch (e) {
    // Don't break operation
  }
}
```

### Full Integration (30 minutes)

1. Add learning to all handlers
2. Add suggestions to responses
3. Add anticipation to account queries
4. Add learning routes

See `LEARNING-INTEGRATION-GUIDE.md` for details.

## Example Usage

### Store Interaction
```bash
curl -X POST "/learn/interaction" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Scan example.com",
    "accountKey": "abc123",
    "action": "scan",
    "outcome": "success"
  }'
```

### Get Suggestions
```bash
curl -X POST "/learn/suggest" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What should I research next?",
    "accountKey": "abc123"
  }'
```

### Anticipate Needs
```bash
curl -X POST "/learn/anticipate" \
  -H "Content-Type: application/json" \
  -d '{
    "accountKey": "abc123",
    "account": { ... }
  }'
```

## Expected Results

### Week 1
- System learns basic patterns
- Suggestions start appearing
- Pattern matching begins

### Month 1
- Suggestions become accurate
- Anticipation improves
- Response times optimize

### Month 3+
- Highly accurate suggestions
- Strong anticipation
- Optimized patterns
- Account-specific intelligence

## Key Benefits

1. **Faster**: System learns fastest patterns
2. **Smarter**: Better suggestions over time
3. **Anticipatory**: Predicts user needs
4. **Account-Specific**: Learns per-account patterns
5. **Self-Improving**: Gets better automatically

