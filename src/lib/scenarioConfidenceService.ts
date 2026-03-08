import type { ScenarioConfidenceSnapshot, ScenarioRun } from './autopilotTypes.ts';

export function scoreScenario(input: {
  scenarioId: string;
  scenarioClass: ScenarioConfidenceSnapshot['scenarioClass'];
  executionPassed: boolean;
  outputReady: boolean;
  repairSucceeded: boolean;
  stabilitySignals?: number[];
  issues?: string[];
}) {
  const executionConfidence = input.executionPassed ? 92 : 38;
  const outputConfidence = input.outputReady ? 88 : 44;
  const repairConfidence = input.repairSucceeded ? 82 : input.executionPassed ? 70 : 35;
  const stabilityBase = input.stabilitySignals && input.stabilitySignals.length > 0
    ? average(input.stabilitySignals)
    : input.executionPassed ? 84 : 40;
  const issuesPenalty = Math.min((input.issues || []).length * 6, 24);
  const overallConfidence = clamp(Math.round(
    ((executionConfidence * 0.32)
    + (outputConfidence * 0.28)
    + (repairConfidence * 0.18)
    + (stabilityBase * 0.22))
    - issuesPenalty,
  ));

  const generatedAt = new Date().toISOString();
  return {
    _type: 'scenarioConfidenceSnapshot',
    _id: `scenarioConfidenceSnapshot.${sanitizeId(input.scenarioId)}.${sanitizeId(generatedAt.slice(0, 10))}`,
    snapshotId: `scenarioConfidence.${sanitizeId(input.scenarioId)}.${sanitizeId(generatedAt)}`,
    scenarioId: input.scenarioId,
    scenarioClass: input.scenarioClass,
    executionConfidence,
    outputConfidence,
    repairConfidence,
    stabilityConfidence: clamp(Math.round(stabilityBase)),
    overallConfidence,
    issues: input.issues || [],
    generatedAt,
  } satisfies ScenarioConfidenceSnapshot;
}

export function scenarioRunFromSnapshot(input: {
  scenarioId: string;
  scenarioClass: ScenarioConfidenceSnapshot['scenarioClass'];
  status: ScenarioRun['status'];
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  issues?: string[];
  bestKnownPath?: string[];
  details?: Record<string, unknown>;
  repairAttempts?: string[];
}) {
  const executionPassed = input.status === 'passed';
  const snapshot = scoreScenario({
    scenarioId: input.scenarioId,
    scenarioClass: input.scenarioClass,
    executionPassed,
    outputReady: executionPassed || input.status === 'degraded',
    repairSucceeded: Array.isArray(input.repairAttempts) && input.repairAttempts.length > 0,
    stabilitySignals: [executionPassed ? 88 : 45, input.status === 'degraded' ? 58 : 84],
    issues: input.issues,
  });
  return {
    _type: 'scenarioRun',
    _id: `scenarioRun.${sanitizeId(input.scenarioId)}.${sanitizeId(input.completedAt)}`,
    scenarioId: input.scenarioId,
    scenarioClass: input.scenarioClass,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    executionConfidence: snapshot.executionConfidence,
    outputConfidence: snapshot.outputConfidence,
    repairConfidence: snapshot.repairConfidence,
    stabilityConfidence: snapshot.stabilityConfidence,
    overallConfidence: snapshot.overallConfidence,
    latencyMs: input.latencyMs,
    issues: input.issues || [],
    bestKnownPath: input.bestKnownPath || [],
    repairAttempts: input.repairAttempts || [],
    details: input.details || {},
  } satisfies ScenarioRun;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function sanitizeId(value: string) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}
