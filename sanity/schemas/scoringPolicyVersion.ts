export default {
  name: 'scoringPolicyVersion',
  title: 'Scoring Policy Version',
  type: 'document',
  fields: [
    { name: 'versionId', title: 'Version ID', type: 'string' },
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
      name: 'weights',
      title: 'Weights',
      type: 'object',
      fields: [{ name: 'value', title: 'Value', type: 'text', hidden: true }],
    },
    {
      name: 'thresholds',
      title: 'Thresholds',
      type: 'object',
      fields: [{ name: 'value', title: 'Value', type: 'text', hidden: true }],
    },
  ],
};
