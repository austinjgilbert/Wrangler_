/**
 * Sanity Schema: touch
 */

export default {
  name: 'touch',
  title: 'Touch',
  type: 'document',
  fields: [
    {
      name: 'personRef',
      title: 'Person',
      type: 'reference',
      to: [{ type: 'networkPerson' }],
    },
    { name: 'date', title: 'Date', type: 'datetime' },
    { name: 'channel', title: 'Channel', type: 'string' },
    { name: 'whatSent', title: 'What Sent', type: 'text' },
    { name: 'outcome', title: 'Outcome', type: 'string' },
    { name: 'learnings', title: 'Learnings', type: 'text' },
  ],
};
