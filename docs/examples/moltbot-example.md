MoltBot Example (End-to-End)

## Authentication (ChatGPT / Custom GPTs)

When `MOLT_API_KEY` or `CHATGPT_API_KEY` is set in the worker, these endpoints require auth:

- `POST /molt/run` — run MoltBot
- `POST /molt/approve` — submit approval decision
- `POST /molt/log` — log event
- `POST /molt/jobs/run` — run jobs (e.g. cron)
- `POST /wrangler/ingest` — ingest ChatGPT Q&A (GPT worker)

Send the key in one of two ways:

- **Header:** `Authorization: Bearer <your-key>`
- **Header:** `X-API-Key: <your-key>`

Set the secret: `wrangler secret put MOLT_API_KEY` (then use that value in your Custom GPT or bridge). If neither secret is set, these routes are open (backward compatible).

---

Example Request:
```
POST /molt/run
Authorization: Bearer <MOLT_API_KEY>
Content-Type: application/json

{
  "requestText": "Research Ubiquiti's CMS stack, draft outreach, and enroll in a sequence for a Director of Engineering",
  "mode": "auto",
  "entityHints": ["Ubiquiti", "CMS", "Director of Engineering"]
}
```

Stored `moltbot.request` (shape):
```
{
  "_type": "moltbot.request",
  "_id": "moltbot.request.<traceId>",
  "requestText": "Research Ubiquiti's CMS stack, draft outreach, and enroll in a sequence for a Director of Engineering",
  "mode": "draft",
  "status": "queued",
  "entityHints": ["Ubiquiti", "CMS", "Director of Engineering"],
  "createdAt": "2026-02-02T12:00:00.000Z",
  "traceId": "<traceId>",
  "toolPlan": {
    "steps": [
      {
        "toolName": "research",
        "actionName": "research",
        "purpose": "Collect structured research for the request.",
        "expectedOutput": "researchBrief",
        "input": {
          "query": "Research Ubiquiti's CMS stack, draft outreach, and enroll in a sequence for a Director of Engineering",
          "constraints": ["focus on messaging inputs"],
          "outputFormat": "markdown"
        }
      },
      {
        "toolName": "outreach.createDraft",
        "actionName": "createDraft",
        "purpose": "Create draft outreach content.",
        "expectedOutput": "outreachDraft",
        "input": {
          "subject": "Draft outreach",
          "body": "Draft outreach content based on research."
        }
      },
      {
        "toolName": "outreach.enrollSequence",
        "actionName": "enrollSequence",
        "purpose": "Enroll contact in outreach sequence.",
        "expectedOutput": "sequenceEnrollment",
        "input": {
          "sequenceId": "seq_placeholder",
          "contactId": "contact_placeholder"
        }
      }
    ]
  }
}
```

Tool Call Payload:
```
{
  "traceId": "<traceId>",
  "input": {
    "query": "Research Ubiquiti's CMS stack, draft outreach, and enroll in a sequence for a Director of Engineering",
    "constraints": ["focus on messaging inputs"],
    "outputFormat": "markdown"
  },
  "contextRefs": ["moltbot.artifact.<priorId>"]
}
```

Stored `moltbot.artifact` (markdown content + citations):
```
{
  "_type": "moltbot.artifact",
  "_id": "moltbot.artifact.<traceId>",
  "artifactType": "outreachDraft",
  "content": "# Outreach Draft\n\nHi <Name>, ...\n\n## Draft Actions\n- [outreach.createDraft] createDraft -> {\"subject\":\"Draft outreach\",\"body\":\"Draft outreach content based on research.\"}",
  "citations": [
    {
      "url": "https://www.ui.com/",
      "title": "Ubiquiti",
      "source": "website"
    }
  ],
  "createdFrom": { "_type": "reference", "_ref": "moltbot.request.<traceId>" },
  "nextActions": ["Confirm target persona details"],
  "createdAt": "2026-02-02T12:00:30.000Z"
}
```

Approval + Notification (enroll requires approval):
```
{
  "_type": "moltbot.approval",
  "_id": "moltbot.approval.<traceId>",
  "actionType": "proposed_action",
  "riskLevel": "dangerous",
  "preview": "[outreach.enrollSequence] enrollSequence -> {\"sequenceId\":\"seq_placeholder\",\"contactId\":\"contact_placeholder\"}",
  "status": "pending"
}
```

Notify payload (Slack-ready):
```
{
  "type": "approval_required",
  "message": "MoltBot approval required",
  "payload": {
    "approvalId": "moltbot.approval.<traceId>",
    "requestId": "moltbot.request.<traceId>",
    "preview": "[outreach.enrollSequence] enrollSequence -> {\"sequenceId\":\"seq_placeholder\",\"contactId\":\"contact_placeholder\"}"
  }
}
```
