/**
 * Sanity Schema: molt.job
 */

export default {
  name: 'molt.job',
  title: 'Molt Job',
  type: 'document',
  fields: [
    { name: 'jobType', title: 'Job Type', type: 'string' },
    {
      name: 'status',
      title: 'Status',
      type: 'string',
      options: { list: ['queued', 'running', 'done', 'failed'] },
    },
    { name: 'priority', title: 'Priority', type: 'number' },
    { name: 'attempts', title: 'Attempts', type: 'number' },
    { name: 'traceId', title: 'Trace ID', type: 'string' },
    { name: 'idempotencyKey', title: 'Idempotency Key', type: 'string' },
    {
      name: 'createdFromEvent',
      title: 'Created From Event',
      type: 'reference',
      to: [{ type: 'molt.event' }],
    },
    {
      name: 'inputRefs',
      title: 'Input Refs',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'account' }, { type: 'person' }] }],
    },
    {
      name: 'outputRefs',
      title: 'Output Refs',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'account' }, { type: 'person' }, { type: 'molt.event' }, { type: 'enrich.job' }, { type: 'molt.strategyBrief' }] }],
    },
    { name: 'error', title: 'Error', type: 'string' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
  ],
};
