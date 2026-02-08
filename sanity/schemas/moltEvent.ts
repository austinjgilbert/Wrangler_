/**
 * Sanity Schema: molt.event
 */

export default {
  name: 'molt.event',
  title: 'Molt Event',
  type: 'document',
  fields: [
    { name: 'type', title: 'Type', type: 'string' },
    { name: 'actor', title: 'Actor', type: 'string' },
    { name: 'channel', title: 'Channel', type: 'string' },
    { name: 'timestamp', title: 'Timestamp', type: 'datetime' },
    { name: 'traceId', title: 'Trace ID', type: 'string' },
    { name: 'idempotencyKey', title: 'Idempotency Key', type: 'string' },
    {
      name: 'entities',
      title: 'Entities',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'entityType', title: 'Entity Type', type: 'string' },
            {
              name: 'entityRef',
              title: 'Entity Ref',
              type: 'reference',
              to: [{ type: 'account' }, { type: 'person' }],
            },
          ],
        },
      ],
    },
    { name: 'payload', title: 'Payload', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    { name: 'outcome', title: 'Outcome', type: 'string' },
    { name: 'tags', title: 'Tags', type: 'array', of: [{ type: 'string' }] },
  ],
};
