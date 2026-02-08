Example response payload + coaching output

Response payload:
```
{
  "sessionId": "call.session.1712345678",
  "tasksCreated": 3,
  "followupDraftId": "call.followupDraft.call.session.1712345678",
  "coachingId": "call.coaching.call.session.1712345678"
}
```

Sample coaching output (format):
```
{
  "scorecard": {
    "agenda/control": 2,
    "discovery depth": 2,
    "quantification": 2,
    "decision process": 2,
    "next steps": 2,
    "clarity": 2,
    "objection handling": 2,
    "talk ratio estimate": 2
  },
  "criticalFeedback": [
    "agenda/control: weak. Evidence \"Let's jump in\" (00:01).",
    "quantification: weak. Evidence \"We want to move faster\" (00:12).",
    "talk ratio: you talked too much (72%). Evidence \"I think we can\" (00:03)."
  ],
  "topMistakes": [
    "You failed to control agenda early. Evidence \"Let's jump in\" (00:01).",
    "You did not quantify impact. Evidence \"We want to move faster\" (00:12).",
    "You let decision process stay vague. Evidence \"We can loop in finance\" (00:18)."
  ],
  "missedQuestions": [
    "What is the cost of this problem per month in dollars or hours?",
    "Who signs off on budget and what is the approval path?",
    "What is the deadline that makes this urgent now?"
  ],
  "rewrites": [
    { "timestamp": "00:12", "original": "We want to move faster", "betterLine": "Can you quantify the cost of this problem in dollars or hours?" },
    { "timestamp": "00:18", "original": "We can loop in finance", "betterLine": "Who approves this and what steps are required to get a yes?" }
  ],
  "missedOpportunities": [
    "decision process: you did not drive this hard enough. Evidence \"We can loop in finance\" (00:18)."
  ],
  "nextCallFocus": "Drive quantification and decision process earlier.",
  "drills": [
    {
      "focus": "talk ratio",
      "correctedScript": "Ask one question, then pause for 8 seconds before speaking.",
      "repetitionPlan": "3 reps of 5-minute discovery roleplay.",
      "constraint": "Austin speaks less than 40% of time on next call."
    },
    {
      "focus": "quantification",
      "correctedScript": "What is the monthly cost of this problem in dollars or hours?",
      "repetitionPlan": "Write 5 quantified questions and practice out loud.",
      "constraint": "Ask at least 2 quantified questions next call."
    }
  ],
  "transcriptEvidence": [
    { "category": "agenda/control", "timestamp": "00:01", "speaker": "Austin", "quote": "Let's jump in" }
  ]
}
```
