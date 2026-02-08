/**
 * Sanity Schema: company
 */

export default {
  name: 'company',
  title: 'Company',
  type: 'document',
  fields: [
    { name: 'name', title: 'Name', type: 'string' },
    { name: 'domain', title: 'Domain', type: 'string' },
    {
      name: 'newsroomRssUrls',
      title: 'Newsroom RSS URLs',
      type: 'array',
      of: [{ type: 'url' }],
    },
    {
      name: 'careersUrls',
      title: 'Careers URLs',
      type: 'array',
      of: [{ type: 'url' }],
    },
    { name: 'tags', title: 'Tags', type: 'array', of: [{ type: 'string' }] },
  ],
};
