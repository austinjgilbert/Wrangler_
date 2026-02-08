/**
 * Sanity Schema: communitySource
 */

export default {
  name: 'communitySource',
  title: 'Community Source',
  type: 'document',
  fields: [
    { name: 'name', title: 'Name', type: 'string' },
    { name: 'type', title: 'Type', type: 'string' },
    { name: 'baseUrl', title: 'Base URL', type: 'url' },
    { name: 'topics', title: 'Topics/Submolts', type: 'array', of: [{ type: 'string' }] },
  ],
};
