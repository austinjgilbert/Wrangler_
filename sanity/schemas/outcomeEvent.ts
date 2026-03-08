export default {
  name: 'outcomeEvent',
  title: 'Outcome Event',
  type: 'document',
  fields: [
    { name: 'outcomeEventId', title: 'Outcome Event ID', type: 'string' },
    { name: 'actionCandidateId', title: 'Action Candidate ID', type: 'string' },
    { name: 'gmailDraftId', title: 'Gmail Draft ID', type: 'string' },
    {
      name: 'eventType',
      title: 'Event Type',
      type: 'string',
      options: {
        list: ['drafted', 'sent', 'replied', 'meeting_booked', 'ignored', 'bounced', 'wrong_person', 'wrong_timing', 'bad_fit'],
      },
    },
    { name: 'outcomeLabel', title: 'Outcome Label', type: 'string' },
    { name: 'actor', title: 'Actor', type: 'string' },
    { name: 'observedAt', title: 'Observed At', type: 'datetime' },
    {
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      fields: [{ name: 'value', title: 'Value', type: 'text', hidden: true }],
    },
  ],
};
