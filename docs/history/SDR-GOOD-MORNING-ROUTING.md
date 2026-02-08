# SDR Good Morning Routing System

## Overview

The Good Morning Routing system transforms your day into a ranked execution plan based on signals, recency, and conversion patterns from your Sanity data. It provides daily prioritization, accountability tracking, and pattern learning.

## Features

✅ **Daily Prioritization**: Automatically ranks accounts based on intent, proximity, freshness, fit, and conversation leverage  
✅ **Call Lists**: Generates prioritized call queues with talk tracks and objection handling  
✅ **LinkedIn Queue**: Creates personalized LinkedIn action queues  
✅ **Email Queue**: Suggests email follow-ups when appropriate  
✅ **Accountability Tracking**: Logs daily plans and tracks completion  
✅ **Assumption Refresh**: Identifies stale data and triggers refreshes  
✅ **Pattern Learning**: Tracks what works for continuous improvement

## Endpoint

**POST** `/sdr/good-morning` (or `/accountability/good-morning`)

### Request Body

```json
{
  "daysBack": 30,           // Look back window for accounts (1-365, default 30)
  "minCallScore": 6,        // Minimum priority score for calls (0-12, default 6)
  "maxCalls": 25,           // Max calls in queue (1-50, default 25)
  "maxLinkedIn": 15,        // Max LinkedIn actions (1-30, default 15)
  "maxEmails": 10,          // Max emails (1-20, default 10)
  "assumeRefresh": false,   // Force assumption refresh check
  "log": true               // Write to daily log
}
```

### Response Structure

```json
{
  "ok": true,
  "data": {
    "date": "2025-01-11",
    "winCondition": "Connect with 2+ high-intent accounts and book 1 meeting",
    "top10Accounts": [...],
    "callList": [...],
    "linkedInQueue": [...],
    "emailQueue": [...],
    "schedule": {...},
    "assumptionRefresh": {...},
    "stats": {...}
  },
  "requestId": "..."
}
```

## Scoring Model

Priority Score = Intent (0-3) + Proximity (0-3) + Freshness (0-2) + Fit (0-2) + Conversation-Leverage (0-2)

### Intent Score (0-3)
- **3**: Strong recent PQA/pricing/demo/enterprise docs
- **2**: Strong product usage/GitHub/integrations/migration content
- **1**: ICP fit but cold
- **0**: No signal

### Proximity Score (0-3)
- **3**: Economic buyer or technical owner (C-level, VP, Director, Head of)
- **2**: Influencer/implementer (Manager, Senior, Architect)
- **1**: Peripheral (Analyst, Coordinator)
- **0**: Unknown

### Freshness Score (0-2)
- **2**: Activity last 7 days
- **1**: Last 30 days
- **0**: Older

### Fit Score (0-2)
- **2**: Strong ICP match (size/use-case/stack)
- **1**: Partial match
- **0**: Weak/unknown

### Conversation-Leverage Score (0-2)
- **2**: Multiple contacts, warm intro path, active thread, internal champion
- **1**: Some leverage
- **0**: None

## Daily Workflow

### Morning (Run Good Morning Routing)
1. Call endpoint: `POST /sdr/good-morning`
2. Review top 10 accounts and why they're prioritized
3. Review call list with talk tracks
4. Review LinkedIn queue with personalization angles
5. Review email queue (if any)
6. Set up schedule blocks
7. Commit to win condition

### Throughout the Day
- Execute calls from prioritized list
- Complete LinkedIn actions
- Send emails from queue
- Take notes on what works/doesn't work
- Track objections and language patterns

### End of Day (4:30 PM)
- Fill in EOD checklist in daily log
- Record:
  - Calls placed, connects, conversations
  - Meetings booked
  - LI actions done
  - Emails sent
  - What worked / what didn't
  - Objections / language patterns

## Log Files

### `logs/daily_sdr_log.md`
Daily log entries with:
- Win condition
- Planned counts
- Top accounts
- EOD results

### `logs/assumptions_refresh.md`
Accounts flagged for refresh with:
- Stale assumptions
- Refresh actions needed
- Results

### `logs/patterns_weekly.md` (optional)
Weekly pattern analysis:
- Conversion patterns
- Best performing signals/personas
- Language patterns that work

## Integration with Existing Data

The system uses your existing Sanity data:
- **Accounts**: `opportunityScore`, `aiReadiness`, `signals`, `lastScannedAt`, `technologyStack`
- **Persons**: `currentTitle`, `seniority`, `function`, `execClaimsUsed`, `teamMap`, `linkedInUrl`
- **Briefs**: Executive intelligence from person briefs
- **OSINT Reports**: Year-ahead intelligence and initiatives

## Example Usage

```bash
curl -X POST https://website-scanner.austin-gilbert.workers.dev/sdr/good-morning \
  -H "Content-Type: application/json" \
  -d '{
    "daysBack": 30,
    "minCallScore": 6,
    "maxCalls": 25,
    "maxLinkedIn": 15,
    "log": true
  }'
```

## Accountability Features

1. **Win Condition**: Sets measurable daily outcome
2. **Timeboxed Schedule**: Prevents avoidance and multitasking
3. **EOD Check-in**: Forces reflection and pattern capture
4. **Pattern Memory**: Learns which signals + personas convert best

## Assumption Refresh

Every 3 workdays (or on demand), the system:
- Identifies 5-10 accounts with potentially stale assumptions
- Flags for refresh:
  - Tech stack signals
  - Org structure changes
  - Intent activity
  - Decision maker updates

## Next Steps

1. **Deploy**: `wrangler deploy`
2. **Test**: Run good morning routing endpoint
3. **Integrate**: Connect to your morning routine
4. **Iterate**: Adjust scoring model based on results

---

**Status**: ✅ Ready for deployment

