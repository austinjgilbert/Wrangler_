/**
 * Sanity Schema: enrich.proposal
 */

export default {
  name: 'enrich.proposal',
  title: 'Enrichment Proposal',
  type: 'document',
  fields: [
    {
      name: 'jobRef',
      title: 'Job Reference',
      type: 'reference',
      to: [{ type: 'enrich.job' }],
    },
    {
      name: 'entityRef',
      title: 'Entity Reference',
      type: 'reference',
      to: [{ type: 'account' }, { type: 'person' }, { type: 'technology' }],
    },
    { name: 'patches', title: 'Patches', type: 'array', of: [{ type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] }] },
    { name: 'confidence', title: 'Confidence', type: 'number' },
    { name: 'risk', title: 'Risk', type: 'string' },
    { name: 'traceId', title: 'Trace ID', type: 'string' },
    {
      name: 'evidence',
      title: 'Evidence',
      type: 'array',
      of: [{ type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] }],
    },
    { name: 'status', title: 'Status', type: 'string' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
  ],
};
