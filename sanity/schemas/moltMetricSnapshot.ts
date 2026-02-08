/**
 * Sanity Schema: molt.metricSnapshot
 */

export default {
  name: 'molt.metricSnapshot',
  title: 'Molt Metric Snapshot',
  type: 'document',
  fields: [
    { name: 'dateRange', title: 'Date Range', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    { name: 'aggregates', title: 'Aggregates', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    { name: 'generatedAt', title: 'Generated At', type: 'datetime' },
  ],
};
