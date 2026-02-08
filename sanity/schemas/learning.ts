/**
 * Sanity Schema: learning
 */

export default {
  name: 'learning',
  title: 'Learning',
  type: 'document',
  fields: [
    { name: 'learningId', title: 'Learning ID', type: 'string' },
    { name: 'sessionRef', title: 'Session Ref', type: 'reference', to: [{ type: 'session' }] },
    { name: 'summary', title: 'Summary', type: 'text' },
    { name: 'tags', title: 'Tags', type: 'array', of: [{ type: 'string' }] },
    { name: 'confidence', title: 'Confidence', type: 'number' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
  ],
};
