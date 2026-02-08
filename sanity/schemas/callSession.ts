/**
 * Sanity Schema: call.session
 */

export default {
  name: 'call.session',
  title: 'Call Session',
  type: 'document',
  fields: [
    {
      name: 'accountRef',
      title: 'Account',
      type: 'reference',
      to: [{ type: 'account' }],
    },
    {
      name: 'peopleRefs',
      title: 'People',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'person' }] }],
    },
    { name: 'date', title: 'Date', type: 'datetime' },
    { name: 'source', title: 'Source', type: 'string' },
    { name: 'transcriptRaw', title: 'Transcript Raw', type: 'text' },
    { name: 'transcriptClean', title: 'Transcript Clean', type: 'text' },
    { name: 'meetingType', title: 'Meeting Type', type: 'string' },
    {
      name: 'objectives',
      title: 'Objectives',
      type: 'array',
      of: [{ type: 'string' }],
    },
    { name: 'outcome', title: 'Outcome', type: 'string' },
  ],
};
