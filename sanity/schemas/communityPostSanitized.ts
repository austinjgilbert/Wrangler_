/**
 * Sanity Schema: communityPostSanitized
 */

export default {
  name: 'communityPostSanitized',
  title: 'Community Post (Sanitized)',
  type: 'document',
  fields: [
    {
      name: 'rawRef',
      title: 'Raw Reference',
      type: 'reference',
      to: [{ type: 'communityPostRaw' }],
    },
    { name: 'sanitizedSummary', title: 'Sanitized Summary', type: 'text' },
    {
      name: 'extractedTopics',
      title: 'Extracted Topics',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'extractedLinks',
      title: 'Extracted Links',
      type: 'array',
      of: [{ type: 'url' }],
    },
    {
      name: 'riskLevel',
      title: 'Risk Level',
      type: 'string',
      options: { list: ['low', 'med', 'high'] },
    },
    {
      name: 'riskReasons',
      title: 'Risk Reasons',
      type: 'array',
      of: [{ type: 'string' }],
    },
  ],
};
