export default {
  name: 'bestKnownPath',
  title: 'Best Known Path',
  type: 'document',
  fields: [
    { name: 'pathId', title: 'Path ID', type: 'string' },
    { name: 'scenarioId', title: 'Scenario ID', type: 'string' },
    { name: 'steps', title: 'Steps', type: 'array', of: [{ type: 'string' }] },
    { name: 'fallbackSteps', title: 'Fallback Steps', type: 'array', of: [{ type: 'string' }] },
    { name: 'successRate', title: 'Success Rate', type: 'number' },
    { name: 'confidenceScore', title: 'Confidence Score', type: 'number' },
    { name: 'lastValidatedAt', title: 'Last Validated At', type: 'datetime' },
  ],
};
