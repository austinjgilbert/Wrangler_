export default {
  name: 'autonomyPolicy',
  title: 'Autonomy Policy',
  type: 'document',
  fields: [
    { name: 'policyId', title: 'Policy ID', type: 'string' },
    { name: 'version', title: 'Version', type: 'string' },
    { name: 'allowedRepairs', title: 'Allowed Repairs', type: 'array', of: [{ type: 'string' }] },
    { name: 'approvalRequiredActions', title: 'Approval Required Actions', type: 'array', of: [{ type: 'string' }] },
    { name: 'monitorOnlyActions', title: 'Monitor Only Actions', type: 'array', of: [{ type: 'string' }] },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
  ],
};
