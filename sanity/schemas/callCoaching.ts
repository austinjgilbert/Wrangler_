/**
 * Sanity Schema: call.coaching
 */

export default {
  name: 'call.coaching',
  title: 'Call Coaching',
  type: 'document',
  fields: [
    {
      name: 'sessionRef',
      title: 'Session',
      type: 'reference',
      to: [{ type: 'call.session' }],
    },
    { name: 'scorecard', title: 'Scorecard', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    { name: 'criticalFeedback', title: 'Critical Feedback', type: 'array', of: [{ type: 'string' }] },
    { name: 'missedOpportunities', title: 'Missed Opportunities', type: 'array', of: [{ type: 'string' }] },
    { name: 'topMistakes', title: 'Top Mistakes', type: 'array', of: [{ type: 'string' }] },
    { name: 'missedQuestions', title: 'Missed Questions', type: 'array', of: [{ type: 'string' }] },
    { name: 'rewrites', title: 'Rewrites', type: 'array', of: [{ type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] }] },
    { name: 'nextCallFocus', title: 'Next Call Focus', type: 'string' },
    { name: 'drills', title: 'Drills', type: 'array', of: [{ type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] }] },
    { name: 'transcriptEvidence', title: 'Transcript Evidence', type: 'array', of: [{ type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] }] },
  ],
};
