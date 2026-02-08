/**
 * Sanity Schema: molt.notification
 */

export default {
  name: 'molt.notification',
  title: 'Molt Notification',
  type: 'document',
  fields: [
    { name: 'type', title: 'Type', type: 'string' },
    { name: 'message', title: 'Message', type: 'string' },
    { name: 'payload', title: 'Payload', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    { name: 'channel', title: 'Channel', type: 'string' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
  ],
};
