Example payloads (MoltBot OS v1)

Calls ingest:
```
POST /calls/ingest
{
  "transcript": "00:01 Austin: Let's jump in... 00:12 Prospect: We want to move faster.",
  "meetingType": "discovery",
  "accountHint": "Ubiquiti",
  "peopleHints": ["Jane Doe"],
  "objectives": ["Qualify pain", "Confirm decision process"]
}
```

Molt log:
```
POST /molt/log
{
  "text": "Logged: sent LinkedIn message to Jane at Ubiquiti about CMS modernization",
  "channel": "linkedin",
  "entityHints": ["Jane Doe", "Ubiquiti"],
  "outcome": "pending"
}
```

Enrich run:
```
POST /enrich/run
{}
```

Network daily run:
```
POST /network/dailyRun
{}
```

Draft email follow-up from transcript (skills chain):
```
POST /molt/run
{
  "requestText": "Draft email follow-up from this audio: https://example.com/call.wav",
  "mode": "draft",
  "entityHints": ["Ubiquiti", "Jane Doe"],
  "requireApproval": false
}
```

Tool chain (example plan):
```
whisperTranscribe.transcribe -> call.coach -> gmail.draft
```
