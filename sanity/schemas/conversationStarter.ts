/**
 * Sanity Schema: conversationStarter
 */

export default {
  name: 'conversationStarter',
  title: 'Conversation Starter',
  type: 'document',
  fields: [
    {
      name: 'personRef',
      title: 'Person',
      type: 'reference',
      to: [{ type: 'networkPerson' }],
    },
    { name: 'whyNow', title: 'Why Now', type: 'text' },
    {
      name: 'messageOptions',
      title: 'Message Options',
      type: 'array',
      of: [{ type: 'string' }],
    },
    { name: 'suggestedAction', title: 'Suggested Action', type: 'string' },
    { name: 'confidenceScore', title: 'Confidence Score', type: 'number' },
    { name: 'expiresAt', title: 'Expires At', type: 'datetime' },
    {
      name: 'relatedSignals',
      title: 'Related Signals',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'signal' }] }],
    },
  ],
};
