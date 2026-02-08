/**
 * Sanity Schema: draftAction
 */

export default {
  name: 'draftAction',
  title: 'Draft Action',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'payload', title: 'Payload', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    { name: 'status', title: 'Status', type: 'string' },
  ],
};
