Example flow (DQ -> Enrich -> Apply)

1) Scan finds 3 gaps
```
POST /dq/scan
-> { findingsCount: 3, topFindings: ["Account missing domain", "Person missing LinkedIn URL", "Technology missing detection signals"] }
```

2) Queue enrichment jobs
```
POST /dq/enrich/queue
{
  "findings": [
    { "_id": "dq.finding.account.1", "entityType": "account", "entityId": "account.123", "severity": "high", "summary": "Account missing domain", "details": { "field": "domain" } },
    { "_id": "dq.finding.person.2", "entityType": "person", "entityId": "person.456", "severity": "med", "summary": "Person missing LinkedIn URL", "details": { "field": "linkedinUrl" } },
    { "_id": "dq.finding.tech.3", "entityType": "technology", "entityId": "technology.789", "severity": "med", "summary": "Technology missing detection signals", "details": { "field": "detectionSignals" } }
  ]
}
```

3) Run enrichment
```
POST /dq/enrich/run
-> { applied: ["enrich.proposal.enrich.job.account.123"], pending: ["enrich.proposal.enrich.job.person.456"] }
```

4) Apply risky proposal (manual approval)
```
POST /dq/enrich/apply
{ "proposalId": "enrich.proposal.enrich.job.person.456" }
```

Pattern insight example:
```
{
  "topTech": [["React", 12], ["Cloudflare", 8]],
  "topRoles": [["engineering", 15], ["product", 9]],
  "insights": [
    "Top technologies: React (12), Cloudflare (8)",
    "Top roles: engineering (15), product (9)"
  ]
}
```
