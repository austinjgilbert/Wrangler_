# User Pattern Metadata System

## Overview

The User Pattern Metadata system learns from all users' behavior patterns, approaches, and thinking to provide insights into what works. It operates as a background metadata layer that can be queried to understand how other users approach similar problems.

## Features

✅ **Pattern Learning**: Automatically tracks user actions, approaches, and outcomes  
✅ **Anonymized Insights**: Returns anonymized patterns from other users  
✅ **Thinking Patterns**: Captures how users think about problems  
✅ **Successful Approaches**: Identifies what approaches work best  
✅ **Tool Usage**: Shows which tools/endpoints other users use  
✅ **Sequence Patterns**: Reveals common action sequences that work  
✅ **Background Operation**: Runs silently without disrupting workflows

## Endpoints

### 1. Store User Pattern
**POST** `/user-patterns/store`

Store a user pattern for learning.

**Request Body**:
```json
{
  "userId": "user-123",
  "userSegment": "sdr",
  "action": "good-morning-routing",
  "approach": "focused on high-intent accounts",
  "context": {
    "accountKey": "abc123",
    "intent": "daily-planning"
  },
  "outcome": "success",
  "timeSpent": 1500,
  "toolsUsed": ["/sdr/good-morning"],
  "sequence": ["good-morning-routing"],
  "thinking": "Prioritized accounts with strong intent signals"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "stored": true,
    "patternId": "userPattern-1234567890-abc123"
  }
}
```

### 2. Query User Patterns
**GET** `/user-patterns/query`

Query anonymized patterns from other users.

**Query Parameters**:
- `type`: Type of query (`patterns`, `thinking`, `approaches`, `tools`, `sequences`)
- `action`: Filter by action (e.g., `good-morning-routing`, `scan`, `research`)
- `userSegment`: Filter by segment (`sdr`, `ae`, `manager`, `analyst`, `executive`)
- `outcome`: Filter by outcome (`success`, `partial`, `failure`)
- `limit`: Maximum results (default: 10, max: 100)

**Example Queries**:

1. **Get patterns for an action**:
   ```
   GET /user-patterns/query?action=good-morning-routing&outcome=success&limit=10
   ```

2. **Get thinking patterns**:
   ```
   GET /user-patterns/query?type=thinking&action=good-morning-routing&limit=5
   ```

3. **Get successful approaches**:
   ```
   GET /user-patterns/query?type=approaches&action=good-morning-routing&userSegment=sdr&limit=10
   ```

4. **Get tool usage patterns**:
   ```
   GET /user-patterns/query?type=tools&action=good-morning-routing&limit=10
   ```

5. **Get sequence patterns**:
   ```
   GET /user-patterns/query?type=sequences&startingAction=scan&outcome=success&limit=10
   ```

## Automatic Pattern Tracking

The system automatically tracks patterns when:
- SDR Good Morning Routing is used (if `trackPattern: true`)
- Other endpoints can integrate pattern tracking

**Example**: When you call `/sdr/good-morning`, it automatically stores:
- Action: `good-morning-routing`
- Approach: Your parameters (daysBack, minScore, etc.)
- Outcome: Success if qualified accounts found
- Time spent: Request duration
- Tools used: `/sdr/good-morning`
- Thinking: Inferred from your usage

## What You Can Learn

### 1. How Other Users Think
Query thinking patterns to see how other users approach similar problems:
```bash
curl "$BASE_URL/user-patterns/query?type=thinking&action=good-morning-routing"
```

Returns:
- Common thinking themes
- Approaches other users take
- Context where thinking patterns apply

### 2. Successful Approaches
See what approaches work best for other users:
```bash
curl "$BASE_URL/user-patterns/query?type=approaches&action=good-morning-routing&userSegment=sdr"
```

Returns:
- Most common successful approaches
- Average time spent
- Tools used
- Contexts where approaches work

### 3. Tool Usage Patterns
Learn which tools other users use for similar tasks:
```bash
curl "$BASE_URL/user-patterns/query?type=tools&action=good-morning-routing"
```

Returns:
- Most used tools
- Success rates per tool
- Contexts where tools are used

### 4. Sequence Patterns
Discover common action sequences that work:
```bash
curl "$BASE_URL/user-patterns/query?type=sequences&startingAction=scan&outcome=success"
```

Returns:
- Common sequences
- Success rates
- Average time spent

## Integration

### Automatic Tracking in SDR Routing

The SDR Good Morning Routing endpoint automatically tracks patterns when `trackPattern: true` (default):

```json
{
  "daysBack": 30,
  "minCallScore": 6,
  "trackPattern": true,
  "userId": "user-123",
  "userSegment": "sdr"
}
```

### Manual Pattern Tracking

Store patterns from any endpoint:

```javascript
// After a successful action
await fetch('/user-patterns/store', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user-123',
    userSegment: 'sdr',
    action: 'scan',
    approach: 'focused on tech stack detection',
    outcome: 'success',
    timeSpent: 2000,
    toolsUsed: ['/scan'],
    thinking: 'Wanted to understand their current stack before outreach'
  })
});
```

## Data Model

### User Pattern Document
Stored in Sanity as `userPattern` type:

```javascript
{
  _type: 'userPattern',
  userId: 'user-123', // Anonymized
  userSegment: 'sdr',
  timestamp: '2025-01-11T10:00:00Z',
  action: 'good-morning-routing',
  approach: 'daysBack=30, minScore=6',
  context: {
    accountKey: 'abc123',
    intent: 'daily-planning'
  },
  outcome: 'success',
  timeSpent: 1500,
  toolsUsed: ['/sdr/good-morning'],
  sequence: ['good-morning-routing'],
  thinking: 'Prioritized accounts with strong intent signals',
  metadata: {}
}
```

## Privacy & Anonymization

- **User IDs**: Stored but anonymized in queries
- **No PII**: No personal information stored
- **Aggregated**: Patterns are aggregated and anonymized
- **Opt-in**: Pattern tracking is opt-in per request

## Use Cases

### 1. Learn from Top Performers
```bash
# See what top SDRs do differently
curl "$BASE_URL/user-patterns/query?type=approaches&userSegment=sdr&outcome=success&limit=20"
```

### 2. Discover Best Practices
```bash
# Find most successful approaches
curl "$BASE_URL/user-patterns/query?type=approaches&action=good-morning-routing&outcome=success"
```

### 3. Understand Tool Usage
```bash
# See which tools work best
curl "$BASE_URL/user-patterns/query?type=tools&action=good-morning-routing"
```

### 4. Learn Thinking Patterns
```bash
# Understand how others think
curl "$BASE_URL/user-patterns/query?type=thinking&action=good-morning-routing"
```

## Example Workflow

1. **Morning**: Run good morning routing (automatically tracks pattern)
2. **During Day**: Query patterns to see what other users do
3. **End of Day**: Store outcome pattern with results
4. **Next Day**: Learn from patterns to improve approach

## Testing

Run the test script:
```bash
./scripts/test-sdr-and-patterns.sh
```

This tests:
- SDR Good Morning Routing
- Store user pattern
- Query patterns
- Query thinking patterns
- Query successful approaches

---

**Status**: ✅ Ready for deployment

The system learns from all users while maintaining privacy and providing actionable insights.

