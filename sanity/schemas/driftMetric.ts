export default {
  name: 'driftMetric',
  title: 'Drift Metric',
  type: 'document',
  fields: [
    { name: 'metricId', title: 'Metric ID', type: 'string' },
    {
      name: 'metricType',
      title: 'Metric Type',
      type: 'string',
      options: {
        list: [
          'action_acceptance_rate',
          'draft_edit_distance',
          'score_inflation',
          'stale_evidence_percentage',
          'duplicate_action_rate',
          'confidence_outcome_mismatch',
          'pattern_decay',
          'signal_to_action_conversion',
          'weak_draft_rate',
          'signal_source_reliability',
        ],
      },
    },
    { name: 'observedAt', title: 'Observed At', type: 'datetime' },
    { name: 'windowStart', title: 'Window Start', type: 'datetime' },
    { name: 'windowEnd', title: 'Window End', type: 'datetime' },
    { name: 'value', title: 'Value', type: 'number' },
    { name: 'baseline', title: 'Baseline', type: 'number' },
    {
      name: 'severity',
      title: 'Severity',
      type: 'string',
      options: { list: ['low', 'medium', 'high'] },
    },
    {
      name: 'details',
      title: 'Details',
      type: 'object',
      fields: [{ name: 'value', title: 'Value', type: 'text', hidden: true }],
    },
  ],
};
