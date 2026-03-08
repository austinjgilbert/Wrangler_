import type { FlowExperience, ScenarioRun } from './autopilotTypes.ts';

export function buildFlowExperience(flowId: string, scenarioType: string, runs: ScenarioRun[]): FlowExperience {
  const successRuns = runs.filter((run) => run.status === 'passed');
  const failures = runs.flatMap((run) => run.issues || []);
  const repairStrategies = runs.flatMap((run) => run.repairAttempts || []);
  const sortedLatencies = runs
    .map((run) => Number(run.latencyMs || 0))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const medianLatencyMs = sortedLatencies.length
    ? sortedLatencies[Math.floor(sortedLatencies.length / 2)]
    : 0;

  return {
    _type: 'flowExperience',
    _id: `flowExperience.${flowId}`,
    flowId,
    scenarioType,
    runs: runs.length,
    successRate: runs.length ? round((successRuns.length / runs.length) * 100) : 0,
    medianLatencyMs,
    commonFailures: [...new Set(failures)].slice(0, 8),
    successfulRepairStrategies: [...new Set(repairStrategies)].slice(0, 8),
    bestKnownPath: successRuns[0]?.bestKnownPath || runs[0]?.bestKnownPath || [],
    confidenceScore: runs.length ? round(runs.reduce((sum, run) => sum + Number(run.overallConfidence || 0), 0) / runs.length) : 0,
    lastValidatedAt: runs[0]?.completedAt || new Date().toISOString(),
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
