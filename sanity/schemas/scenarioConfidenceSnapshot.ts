export default {
  name: 'scenarioConfidenceSnapshot',
  title: 'Scenario Confidence Snapshot',
  type: 'document',
  fields: [
    { name: 'snapshotId', title: 'Snapshot ID', type: 'string' },
    { name: 'scenarioId', title: 'Scenario ID', type: 'string' },
    { name: 'scenarioClass', title: 'Scenario Class', type: 'string', options: { list: ['critical', 'reliability', 'stress', 'chaos'] } },
    { name: 'executionConfidence', title: 'Execution Confidence', type: 'number' },
    { name: 'outputConfidence', title: 'Output Confidence', type: 'number' },
    { name: 'repairConfidence', title: 'Repair Confidence', type: 'number' },
    { name: 'stabilityConfidence', title: 'Stability Confidence', type: 'number' },
    { name: 'overallConfidence', title: 'Overall Confidence', type: 'number' },
    { name: 'issues', title: 'Issues', type: 'array', of: [{ type: 'string' }] },
    { name: 'generatedAt', title: 'Generated At', type: 'datetime' },
  ],
};
