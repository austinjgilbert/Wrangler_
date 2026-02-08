/**
 * Sanity Schema: dq.finding
 */

export default {
  name: 'dq.finding',
  title: 'DQ Finding',
  type: 'document',
  fields: [
    { name: 'ruleId', title: 'Rule ID', type: 'string' },
    { name: 'entityType', title: 'Entity Type', type: 'string' },
    { name: 'entityId', title: 'Entity ID', type: 'string' },
    { name: 'severity', title: 'Severity', type: 'string' },
    { name: 'summary', title: 'Summary', type: 'text' },
    { name: 'details', title: 'Details', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
  ],
};
