/**
 * Sanity Schema: dq.rule
 */

export default {
  name: 'dq.rule',
  title: 'DQ Rule',
  type: 'document',
  fields: [
    { name: 'ruleId', title: 'Rule ID', type: 'string' },
    { name: 'description', title: 'Description', type: 'text' },
    { name: 'severity', title: 'Severity', type: 'string' },
  ],
};
