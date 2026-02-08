/**
 * Sanity Schema: interaction
 */

export default {
  name: 'interaction',
  title: 'Interaction',
  type: 'document',
  fields: [
    { name: 'interactionId', title: 'Interaction ID', type: 'string' },
    { name: 'sessionId', title: 'Session Ref', type: 'reference', to: [{ type: 'session' }] },
    { name: 'userPrompt', title: 'User Prompt', type: 'text' },
    { name: 'gptResponse', title: 'GPT Response', type: 'text' },
    { name: 'timestamp', title: 'Timestamp', type: 'datetime' },
    { name: 'referencedAccounts', title: 'Referenced Accounts', type: 'array', of: [{ type: 'reference', to: [{ type: 'account' }] }] },
    { name: 'referencedBriefs', title: 'Referenced Briefs', type: 'array', of: [{ type: 'reference', to: [{ type: 'molt.strategyBrief' }] }] },
    { name: 'referencedPeople', title: 'Referenced People', type: 'array', of: [{ type: 'reference', to: [{ type: 'person' }] }] },
    { name: 'referencedEvidence', title: 'Referenced Evidence', type: 'array', of: [{ type: 'reference', to: [{ type: 'crawl.snapshot' }] }] },
    { name: 'contextTags', title: 'Context Tags', type: 'array', of: [{ type: 'string' }] },
    { name: 'importance', title: 'Importance', type: 'number' },
    { name: 'followUpNeeded', title: 'Follow Up Needed', type: 'boolean' },
    { name: 'followUpNotes', title: 'Follow Up Notes', type: 'text' },
    { name: 'derivedInsight', title: 'Derived Insight', type: 'boolean' },
    { name: 'linkedInteractions', title: 'Linked Interactions', type: 'array', of: [{ type: 'reference', to: [{ type: 'interaction' }] }] },
    { name: 'requestId', title: 'Request ID', type: 'string' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
  ],
};
