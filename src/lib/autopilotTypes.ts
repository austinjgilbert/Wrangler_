export type ScenarioClass = 'critical' | 'reliability' | 'stress' | 'chaos';
export type RepairTier = 'detect' | 'repair' | 'escalate';
export type RepairOutcome = 'succeeded' | 'failed' | 'skipped' | 'approval_required';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'repaired' | 'quarantined' | 'monitoring';

export type ScenarioRun = {
  _type: 'scenarioRun';
  _id: string;
  scenarioId: string;
  scenarioClass: ScenarioClass;
  status: 'passed' | 'failed' | 'degraded';
  startedAt: string;
  completedAt?: string;
  executionConfidence: number;
  outputConfidence: number;
  repairConfidence: number;
  stabilityConfidence: number;
  overallConfidence: number;
  latencyMs?: number;
  issues: string[];
  bestKnownPath?: string[];
  repairAttempts?: string[];
  details?: Record<string, unknown>;
};

export type FlowExperience = {
  _type: 'flowExperience';
  _id: string;
  flowId: string;
  scenarioType: string;
  runs: number;
  successRate: number;
  medianLatencyMs: number;
  commonFailures: string[];
  successfulRepairStrategies: string[];
  bestKnownPath: string[];
  confidenceScore: number;
  lastValidatedAt: string;
};

export type RepairAttempt = {
  _type: 'repairAttempt';
  _id: string;
  attemptId: string;
  incidentId?: string | null;
  scenarioId?: string | null;
  strategy: string;
  tier: RepairTier;
  outcome: RepairOutcome;
  startedAt: string;
  completedAt?: string;
  notes?: string[];
  details?: Record<string, unknown>;
};

export type AutonomyPolicy = {
  _type: 'autonomyPolicy';
  _id: string;
  policyId: string;
  version: string;
  allowedRepairs: string[];
  approvalRequiredActions: string[];
  monitorOnlyActions: string[];
  updatedAt: string;
};

export type RuntimeIncident = {
  _type: 'runtimeIncident';
  _id: string;
  incidentId: string;
  category: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary: string;
  detectedAt: string;
  flowId?: string | null;
  scenarioId?: string | null;
  details?: Record<string, unknown>;
};

export type BestKnownPath = {
  _type: 'bestKnownPath';
  _id: string;
  pathId: string;
  scenarioId: string;
  steps: string[];
  fallbackSteps: string[];
  successRate: number;
  confidenceScore: number;
  lastValidatedAt: string;
};

export type ScenarioConfidenceSnapshot = {
  _type: 'scenarioConfidenceSnapshot';
  _id: string;
  snapshotId: string;
  scenarioId: string;
  scenarioClass: ScenarioClass;
  executionConfidence: number;
  outputConfidence: number;
  repairConfidence: number;
  stabilityConfidence: number;
  overallConfidence: number;
  issues: string[];
  generatedAt: string;
};
