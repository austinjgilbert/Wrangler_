/**
 * Sanity Schema: call.insight
 */

export default {
  name: 'call.insight',
  title: 'Call Insight',
  type: 'document',
  fields: [
    {
      name: 'sessionRef',
      title: 'Session',
      type: 'reference',
      to: [{ type: 'call.session' }],
    },
    { name: 'summary', title: 'Summary', type: 'text' },
    { name: 'crmNotes', title: 'CRM Notes', type: 'text' },
    { name: 'pains', title: 'Pains', type: 'array', of: [{ type: 'string' }] },
    { name: 'goals', title: 'Goals', type: 'array', of: [{ type: 'string' }] },
    { name: 'objections', title: 'Objections', type: 'array', of: [{ type: 'string' }] },
    { name: 'stakeholders', title: 'Stakeholders', type: 'array', of: [{ type: 'string' }] },
    { name: 'decisionProcess', title: 'Decision Process', type: 'text' },
    { name: 'risks', title: 'Risks', type: 'array', of: [{ type: 'string' }] },
    { name: 'unknowns', title: 'Unknowns', type: 'array', of: [{ type: 'string' }] },
  ],
};
