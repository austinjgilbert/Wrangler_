export default {
  name: 'flowExperience',
  title: 'Flow Experience',
  type: 'document',
  fields: [
    { name: 'flowId', title: 'Flow ID', type: 'string' },
    { name: 'scenarioType', title: 'Scenario Type', type: 'string' },
    { name: 'runs', title: 'Runs', type: 'number' },
    { name: 'successRate', title: 'Success Rate', type: 'number' },
    { name: 'medianLatencyMs', title: 'Median Latency Ms', type: 'number' },
    { name: 'commonFailures', title: 'Common Failures', type: 'array', of: [{ type: 'string' }] },
    { name: 'successfulRepairStrategies', title: 'Successful Repair Strategies', type: 'array', of: [{ type: 'string' }] },
    { name: 'bestKnownPath', title: 'Best Known Path', type: 'array', of: [{ type: 'string' }] },
    { name: 'confidenceScore', title: 'Confidence Score', type: 'number' },
    { name: 'lastValidatedAt', title: 'Last Validated At', type: 'datetime' },
  ],
};
