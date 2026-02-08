/**
 * Sanity Schema: session
 */

export default {
  name: 'session',
  title: 'Session',
  type: 'document',
  fields: [
    { name: 'sessionId', title: 'Session ID', type: 'string' },
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'participants', title: 'Participants', type: 'array', of: [{ type: 'string' }] },
    { name: 'accountsInContext', title: 'Accounts In Context', type: 'array', of: [{ type: 'reference', to: [{ type: 'account' }] }] },
    { name: 'briefsInContext', title: 'Briefs In Context', type: 'array', of: [{ type: 'reference', to: [{ type: 'molt.strategyBrief' }] }] },
    { name: 'learnings', title: 'Learnings', type: 'array', of: [{ type: 'reference', to: [{ type: 'learning' }] }] },
    { name: 'followUps', title: 'Follow Ups', type: 'array', of: [{ type: 'string' }] },
    { name: 'interactionCount', title: 'Interaction Count', type: 'number' },
    { name: 'startedAt', title: 'Started At', type: 'datetime' },
    { name: 'lastUpdatedAt', title: 'Last Updated At', type: 'datetime' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
  ],
};
