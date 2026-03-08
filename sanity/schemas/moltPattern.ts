/**
 * Sanity Schema: molt.pattern
 */

export default {
  name: 'molt.pattern',
  title: 'Molt Pattern',
  type: 'document',
  fields: [
    { name: 'patternType', title: 'Pattern Type', type: 'string' },
    {
      name: 'lifecycleState',
      title: 'Lifecycle State',
      type: 'string',
      options: { list: ['active', 'monitoring', 'inactive', 'retired', 'quarantined'] },
    },
    { name: 'owner', title: 'Owner', type: 'string' },
    { name: 'lastSuccessfulMatchDate', title: 'Last Successful Match Date', type: 'datetime' },
    { name: 'matchFrequency', title: 'Match Frequency', type: 'number' },
    { name: 'conversionAssociation', title: 'Conversion Association', type: 'number' },
    { name: 'retirementReason', title: 'Retirement Reason', type: 'text' },
    { name: 'observedAt', title: 'Observed At', type: 'datetime' },
    { name: 'lastValidatedAt', title: 'Last Validated At', type: 'datetime' },
    { name: 'staleAfter', title: 'Stale After', type: 'datetime' },
    { name: 'refreshPriority', title: 'Refresh Priority', type: 'number' },
    { name: 'summary', title: 'Summary', type: 'text' },
    { name: 'conditions', title: 'Conditions', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    {
      name: 'recommendedMoves',
      title: 'Recommended Moves',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'evidenceInteractions',
      title: 'Evidence Interactions',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'interaction' }] }],
    },
    {
      name: 'evidenceEvents',
      title: 'Evidence Events',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'molt.event' }] }],
    },
    { name: 'successStats', title: 'Success Stats', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
    { name: 'lastUpdated', title: 'Last Updated', type: 'datetime' },
  ],
};
