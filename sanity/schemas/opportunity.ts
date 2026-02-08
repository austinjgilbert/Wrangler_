/**
 * Sanity Schema: opportunity
 */

export default {
  name: 'opportunity',
  title: 'Opportunity',
  type: 'document',
  fields: [
    {
      name: 'briefRef',
      title: 'Brief Reference',
      type: 'reference',
      to: [{ type: 'opportunityBrief' }],
    },
    {
      name: 'type',
      title: 'Type',
      type: 'string',
      options: { list: ['sales-play', 'automation', 'content', 'consulting', 'product'] },
    },
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'description', title: 'Description', type: 'text' },
    { name: 'whyNow', title: 'Why Now', type: 'text' },
    { name: 'confidence', title: 'Confidence', type: 'number' },
    {
      name: 'evidenceLinks',
      title: 'Evidence Links',
      type: 'array',
      of: [{ type: 'url' }],
    },
  ],
};
