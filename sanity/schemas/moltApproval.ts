/**
 * Sanity Schema: molt.approval
 */

export default {
  name: 'molt.approval',
  title: 'Molt Approval',
  type: 'document',
  fields: [
    { name: 'actionType', title: 'Action Type', type: 'string' },
    { name: 'riskLevel', title: 'Risk Level', type: 'string' },
    { name: 'preview', title: 'Preview', type: 'text' },
    { name: 'actionPayload', title: 'Action Payload', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    {
      name: 'status',
      title: 'Status',
      type: 'string',
      options: { list: ['pending', 'approved', 'rejected'] },
    },
    {
      name: 'relatedEntities',
      title: 'Related Entities',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'account' }, { type: 'person' }] }],
    },
    {
      name: 'createdFromEvent',
      title: 'Created From Event',
      type: 'reference',
      to: [{ type: 'molt.event' }],
    },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'resolvedAt', title: 'Resolved At', type: 'datetime' },
    { name: 'audit', title: 'Audit', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
  ],
};
