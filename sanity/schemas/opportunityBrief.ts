/**
 * Sanity Schema: opportunityBrief
 */

export default {
  name: 'opportunityBrief',
  title: 'Opportunity Brief',
  type: 'document',
  fields: [
    { name: 'date', title: 'Date', type: 'datetime' },
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'markdown', title: 'Markdown', type: 'text' },
    {
      name: 'sources',
      title: 'Sources',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'communityPostSanitized' }] }],
    },
    {
      name: 'topThemes',
      title: 'Top Themes',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'recommendedActions',
      title: 'Recommended Actions',
      type: 'array',
      of: [{ type: 'string' }],
    },
  ],
};
