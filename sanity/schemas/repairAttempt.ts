export default {
  name: 'repairAttempt',
  title: 'Repair Attempt',
  type: 'document',
  fields: [
    { name: 'attemptId', title: 'Attempt ID', type: 'string' },
    { name: 'incidentId', title: 'Incident ID', type: 'string' },
    { name: 'scenarioId', title: 'Scenario ID', type: 'string' },
    { name: 'strategy', title: 'Strategy', type: 'string' },
    { name: 'tier', title: 'Tier', type: 'string', options: { list: ['detect', 'repair', 'escalate'] } },
    { name: 'outcome', title: 'Outcome', type: 'string', options: { list: ['succeeded', 'failed', 'skipped', 'approval_required'] } },
    { name: 'startedAt', title: 'Started At', type: 'datetime' },
    { name: 'completedAt', title: 'Completed At', type: 'datetime' },
    { name: 'notes', title: 'Notes', type: 'array', of: [{ type: 'string' }] },
    { name: 'details', title: 'Details', type: 'object', fields: [{ name: 'value', title: 'Value', type: 'text', hidden: true }] },
  ],
};
