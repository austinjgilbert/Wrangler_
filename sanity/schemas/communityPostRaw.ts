/**
 * Sanity Schema: communityPostRaw
 */

export default {
  name: 'communityPostRaw',
  title: 'Community Post (Raw)',
  type: 'document',
  fields: [
    {
      name: 'sourceRef',
      title: 'Source',
      type: 'reference',
      to: [{ type: 'communitySource' }],
    },
    { name: 'externalId', title: 'External ID', type: 'string' },
    { name: 'url', title: 'URL', type: 'url' },
    { name: 'author', title: 'Author', type: 'string' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'rawText', title: 'Raw Text', type: 'text' },
    { name: 'rawJson', title: 'Raw JSON', type: 'object', fields: [{ name: 'value', type: 'text', title: 'Value', hidden: true }] },
    { name: 'fetchedAt', title: 'Fetched At', type: 'datetime' },
  ],
};
