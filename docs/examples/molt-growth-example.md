Example flow: log -> jobs -> suggestions

Input:
```
POST /molt/log
{
  "text": "Logged: sent LinkedIn message to Jane at Ubiquiti about CMS modernization",
  "channel": "linkedin",
  "entityHints": ["Jane Doe", "Ubiquiti"],
  "outcome": "pending"
}
```

Response:
```
{
  "eventId": "molt.event.1712345678.ab12",
  "jobsQueued": ["molt.job.enrich.account.ubi", "molt.job.pattern.molt.event.1712345678.ab12"],
  "nextSuggestions": [
    "Best persona: engineering (42% reply rate)",
    "Best message length: short"
  ]
}
```
