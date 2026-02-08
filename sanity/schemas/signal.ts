/**
 * Sanity Schema: signal
 */

export default {
  name: 'signal',
  title: 'Signal',
  type: 'document',
  fields: [
    { name: 'type', title: 'Type', type: 'string' },
    {
      name: 'companyRef',
      title: 'Company',
      type: 'reference',
      to: [{ type: 'company' }],
    },
    {
      name: 'personRefs',
      title: 'People',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'networkPerson' }] }],
    },
    { name: 'sourceUrl', title: 'Source URL', type: 'url' },
    { name: 'date', title: 'Date', type: 'datetime' },
    { name: 'summary', title: 'Summary', type: 'text' },
    { name: 'keywords', title: 'Keywords', type: 'array', of: [{ type: 'string' }] },
    {
      name: 'citations',
      title: 'Citations',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'url', title: 'URL', type: 'url' },
            { name: 'title', title: 'Title', type: 'string' },
            { name: 'source', title: 'Source', type: 'string' },
          ],
        },
      ],
    },
  ],
};
