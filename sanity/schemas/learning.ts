/**
 * Sanity Schema: learning
 */

export default {
  name: 'learning',
  title: 'Learning',
  type: 'document',
  fields: [
    { name: 'learningId', title: 'Learning ID', type: 'string' },
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'sessionRef', title: 'Session Ref', type: 'reference', to: [{ type: 'session' }] },
    { name: 'summary', title: 'Summary', type: 'text' },
    {
      name: 'derivedFrom',
      title: 'Derived From',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'interaction' }] }],
    },
    {
      name: 'applicableToAccounts',
      title: 'Applicable Accounts',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'account' }] }],
    },
    {
      name: 'applicableToBriefs',
      title: 'Applicable Briefs',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'molt.strategyBrief' }] }],
    },
    { name: 'patternType', title: 'Pattern Type', type: 'string' },
    { name: 'memoryPhrase', title: 'Memory Phrase', type: 'string' },
    { name: 'relevanceScore', title: 'Relevance Score', type: 'number' },
    {
      name: 'contextTags',
      title: 'Context Tags',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'recommendedActions',
      title: 'Recommended Actions',
      type: 'array',
      of: [{ type: 'string' }],
    },
    { name: 'tags', title: 'Tags', type: 'array', of: [{ type: 'string' }] },
    { name: 'confidence', title: 'Confidence', type: 'number' },
    { name: 'lastReferencedAt', title: 'Last Referenced At', type: 'datetime' },
    { name: 'referenceCount', title: 'Reference Count', type: 'number' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
  ],
};
