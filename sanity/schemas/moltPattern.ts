/**
 * Sanity Schema: molt.pattern
 */

export default {
  name: 'molt.pattern',
  title: 'Molt Pattern',
  type: 'document',
  fields: [
    { name: 'patternType', title: 'Pattern Type', type: 'string' },
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
