export default {
  name: 'draftPolicyVersion',
  title: 'Draft Policy Version',
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
    { name: 'toneRules', title: 'Tone Rules', type: 'array', of: [{ type: 'string' }] },
    { name: 'operatingRules', title: 'Operating Rules', type: 'array', of: [{ type: 'string' }] },
    { name: 'systemPrompt', title: 'System Prompt', type: 'text' },
  ],
};
