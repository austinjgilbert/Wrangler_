/**
 * Sanity Schema: enrich.job
 */

export default {
  name: 'enrich.job',
  title: 'Enrichment Job',
  type: 'document',
  fields: [
    {
      name: 'findingRef',
      title: 'Finding Reference',
      type: 'reference',
      to: [{ type: 'dq.finding' }],
    },
    { name: 'entityType', title: 'Entity Type', type: 'string' },
    { name: 'entityId', title: 'Entity ID', type: 'string' },
    { name: 'goal', title: 'Goal', type: 'string' },
    { name: 'scope', title: 'Scope', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    { name: 'priority', title: 'Priority', type: 'number' },
    { name: 'status', title: 'Status', type: 'string' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
  ],
};
