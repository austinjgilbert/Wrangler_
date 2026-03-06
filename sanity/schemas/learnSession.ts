/**
 * Learn Session
 *
 * Captures a guided "show me the app/site" walkthrough from the extension.
 * The goal is to infer page structure, field mappings, duplicate candidates,
 * and a consensus model that downstream enrichment can trust.
 */
export default {
  name: 'learnSession',
  title: 'Learn Session',
  type: 'document',
  fields: [
    { name: 'sessionId', title: 'Session ID', type: 'string' },
    { name: 'status', title: 'Status', type: 'string' },
    { name: 'label', title: 'Label', type: 'string' },
    { name: 'source', title: 'Primary Source', type: 'string' },
    { name: 'host', title: 'Host', type: 'string' },
    { name: 'accountKey', title: 'Account Key', type: 'string' },
    { name: 'accountDomain', title: 'Account Domain', type: 'string' },
    { name: 'observationCount', title: 'Observation Count', type: 'number' },
    {
      name: 'pagePatterns',
      title: 'Page Patterns',
      type: 'array',
      of: [{
        type: 'object',
        fields: [
          { name: 'pathTemplate', title: 'Path Template', type: 'string' },
          { name: 'source', title: 'Source', type: 'string' },
          { name: 'title', title: 'Title', type: 'string' },
          { name: 'mappedFields', title: 'Mapped Fields', type: 'array', of: [{ type: 'string' }] },
          { name: 'entityHints', title: 'Entity Hints', type: 'array', of: [{ type: 'string' }] },
          { name: 'seenCount', title: 'Seen Count', type: 'number' },
          { name: 'lastSeenAt', title: 'Last Seen At', type: 'datetime' },
        ],
      }],
    },
    {
      name: 'consensusModel',
      title: 'Consensus Model',
      type: 'object',
      fields: [
        { name: 'companyNames', title: 'Company Names', type: 'array', of: [{ type: 'string' }] },
        { name: 'people', title: 'People', type: 'array', of: [{ type: 'string' }] },
        { name: 'technologies', title: 'Technologies', type: 'array', of: [{ type: 'string' }] },
        { name: 'contacts', title: 'Contacts', type: 'array', of: [{ type: 'string' }] },
        { name: 'signals', title: 'Signals', type: 'array', of: [{ type: 'string' }] },
        { name: 'fieldCoverage', title: 'Field Coverage', type: 'array', of: [{ type: 'string' }] },
      ],
    },
    {
      name: 'assumptions',
      title: 'Assumptions',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'validationFindings',
      title: 'Validation Findings',
      type: 'array',
      of: [{ type: 'string' }],
    },
    { name: 'startedAt', title: 'Started At', type: 'datetime' },
    { name: 'lastObservedAt', title: 'Last Observed At', type: 'datetime' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
  ],
  preview: {
    select: {
      title: 'label',
      subtitle: 'host',
    },
  },
};
