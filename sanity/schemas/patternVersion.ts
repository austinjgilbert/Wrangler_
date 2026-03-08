export default {
  name: 'patternVersion',
  title: 'Pattern Version',
  type: 'document',
  fields: [
    { name: 'versionId', title: 'Version ID', type: 'string' },
    { name: 'patternKey', title: 'Pattern Key', type: 'string' },
    { name: 'changedBy', title: 'Changed By', type: 'string' },
    { name: 'changedAt', title: 'Changed At', type: 'datetime' },
    { name: 'reason', title: 'Reason', type: 'text' },
    { name: 'previousVersion', title: 'Previous Version', type: 'string' },
    { name: 'expectedImpact', title: 'Expected Impact', type: 'text' },
    {
      name: 'activationStatus',
      title: 'Activation Status',
      type: 'string',
      options: { list: ['draft', 'active', 'inactive', 'retired'] },
    },
    {
      name: 'lifecycleState',
      title: 'Lifecycle State',
      type: 'string',
      options: { list: ['active', 'monitoring', 'inactive', 'retired', 'quarantined'] },
    },
    {
      name: 'conditions',
      title: 'Conditions',
      type: 'object',
      fields: [{ name: 'value', title: 'Value', type: 'text', hidden: true }],
    },
    { name: 'recommendedMoves', title: 'Recommended Moves', type: 'array', of: [{ type: 'string' }] },
  ],
};
