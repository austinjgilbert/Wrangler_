/**
 * Sanity Schema: call.followupDraft
 */

export default {
  name: 'call.followupDraft',
  title: 'Call Follow-up Draft',
  type: 'document',
  fields: [
    {
      name: 'sessionRef',
      title: 'Session',
      type: 'reference',
      to: [{ type: 'call.session' }],
    },
    { name: 'channel', title: 'Channel', type: 'string' },
    { name: 'subject', title: 'Subject', type: 'string' },
    { name: 'body', title: 'Body', type: 'text' },
  ],
};
