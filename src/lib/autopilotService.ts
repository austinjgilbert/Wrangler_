import type { BestKnownPath, RepairAttempt, RuntimeIncident, ScenarioConfidenceSnapshot, ScenarioRun } from './autopilotTypes.ts';
import {
  createBestKnownPath,
  createFlowExperience,
  createMetricSnapshot,
  createRepairAttempt,
  createRuntimeIncident,
  createScenarioConfidenceSnapshot,
  createScenarioRun,
  fetchDocumentsByType,
  updateRuntimeIncident,
} from './sanity.ts';
import { buildBestKnownPath, recalculateBestKnownPaths } from './bestPathService.ts';
import { buildFlowExperience } from './flowExperienceService.ts';
import { getAutonomyPolicy } from './repairPolicyService.ts';
import { detectRuntimeIncidents, computeRuntimeHealth } from './runtimeHealthService.ts';
import { replayCriticalScenarios, replayDegradedScenarios } from './scenarioReplayService.ts';
import { scoreScenario } from './scenarioConfidenceService.ts';
import { queueAntiDriftMaintenance, rerankActions } from './superuserInterface.ts';

export async function runAutopilotCycle(env: any, input: {
  includeDegraded?: boolean;
  attemptRepairs?: boolean;
  quarantine?: boolean;
} = {}) {
  const startedAt = new Date().toISOString();
  const policy = await getAutonomyPolicy(env);
  const runtimeHealth = await computeRuntimeHealth(env);
  const detectedIncidents = detectRuntimeIncidents({ runtimeHealth, now: startedAt });
  await Promise.all(detectedIncidents.map((incident) => createRuntimeIncident(env, incident).catch(() => null)));

  const criticalRuns = await replayCriticalScenarios(env);
  const degradedRuns = input.includeDegraded ? await replayDegradedScenarios(env) : [];
  const allRuns = [...criticalRuns, ...degradedRuns];
  const persistedRuns = await persistScenarioRuns(env, allRuns);

  const snapshots = await persistScenarioSnapshots(env, allRuns);
  const bestPaths = await persistBestPaths(env, allRuns);
  const experiences = await persistFlowExperiences(env, allRuns);

  const repairAttempts = input.attemptRepairs
    ? await attemptSafeRepairs(env, {
        incidents: detectedIncidents,
        degradedRuns,
        policy,
      })
    : [];

  if (input.quarantine) {
    await quarantineUnstable(env, detectedIncidents, degradedRuns);
  }

  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    runtimeHealth,
    criticalRuns: criticalRuns.length,
    degradedRuns: degradedRuns.length,
    repairsAttempted: repairAttempts.length,
    incidentsDetected: detectedIncidents.length,
    reliabilityScore: computeReliabilityScore({ runtimeHealth, runs: allRuns, repairs: repairAttempts }),
    policy,
  };

  await createMetricSnapshot(env, {
    _type: 'molt.metricSnapshot',
    _id: `molt.metricSnapshot.autopilot.${sanitizeId(startedAt.slice(0, 13))}`,
    dateRange: { from: startedAt, to: report.completedAt },
    aggregates: report,
    generatedAt: report.completedAt,
  }).catch(() => null);

  return {
    report,
    runs: persistedRuns,
    snapshots,
    bestPaths,
    experiences,
    repairAttempts,
  };
}

export async function getAutopilotOverview(env: any) {
  const [runtimeHealth, scenarioSnapshots, repairAttempts, bestPaths, incidents, policy] = await Promise.all([
    computeRuntimeHealth(env),
    fetchDocumentsByType(env, 'scenarioConfidenceSnapshot', 30).catch(() => []),
    fetchDocumentsByType(env, 'repairAttempt', 30).catch(() => []),
    fetchDocumentsByType(env, 'bestKnownPath', 20).catch(() => []),
    fetchDocumentsByType(env, 'runtimeIncident', 20).catch(() => []),
    getAutonomyPolicy(env),
  ]);

  const weakest = scenarioSnapshots
    .slice()
    .sort((a: any, b: any) => Number(a.overallConfidence || 0) - Number(b.overallConfidence || 0))
    .slice(0, 5);

  return {
    runtimeHealth,
    scenarioConfidence: {
      top: scenarioSnapshots.slice(0, 5).map(mapScenarioSnapshot),
      weakest: weakest.map(mapScenarioSnapshot),
      trend: scenarioSnapshots.slice(0, 12).map((snapshot: any) => ({
        scenarioId: snapshot.scenarioId,
        overallConfidence: Number(snapshot.overallConfidence || 0),
        generatedAt: snapshot.generatedAt,
      })),
    },
    repairActivity: {
      attempted: repairAttempts.length,
      succeeded: repairAttempts.filter((item: any) => item.outcome === 'succeeded').length,
      failed: repairAttempts.filter((item: any) => item.outcome === 'failed').length,
      approvalsNeeded: repairAttempts.filter((item: any) => item.outcome === 'approval_required').length,
      recent: repairAttempts.slice(0, 8).map((item: any) => ({
        attemptId: item.attemptId || item._id,
        strategy: item.strategy,
        outcome: item.outcome,
        completedAt: item.completedAt || item.startedAt,
      })),
    },
    bestPathLearning: bestPaths.slice(0, 8).map((path: any) => ({
      scenarioId: path.scenarioId,
      confidenceScore: Number(path.confidenceScore || 0),
      successRate: Number(path.successRate || 0),
      steps: Array.isArray(path.steps) ? path.steps : [],
    })),
    autonomyPolicy: policy,
    quarantinedFlows: incidents
      .filter((incident: any) => incident.status === 'quarantined')
      .map((incident: any) => ({
        incidentId: incident.incidentId || incident._id,
        category: incident.category,
        summary: incident.summary,
        severity: incident.severity,
      })),
  };
}

async function persistScenarioRuns(env: any, runs: ScenarioRun[]) {
  await Promise.all(runs.map((run) => createScenarioRun(env, run).catch(() => null)));
  return runs;
}

async function persistScenarioSnapshots(env: any, runs: ScenarioRun[]) {
  const snapshots = runs.map((run) => scoreScenario({
    scenarioId: run.scenarioId,
    scenarioClass: run.scenarioClass,
    executionPassed: run.status === 'passed',
    outputReady: run.status !== 'failed',
    repairSucceeded: Array.isArray(run.repairAttempts) && run.repairAttempts.length > 0,
    stabilitySignals: [run.stabilityConfidence],
    issues: run.issues,
  }));
  await Promise.all(snapshots.map((snapshot) => createScenarioConfidenceSnapshot(env, snapshot).catch(() => null)));
  return snapshots;
}

async function persistBestPaths(env: any, runs: ScenarioRun[]) {
  const bestPaths = recalculateBestKnownPaths(runs);
  await Promise.all(bestPaths.map((path) => createBestKnownPath(env, path).catch(() => null)));
  return bestPaths;
}

async function persistFlowExperiences(env: any, runs: ScenarioRun[]) {
  const grouped = runs.reduce<Record<string, ScenarioRun[]>>((acc, run) => {
    acc[run.scenarioId] = acc[run.scenarioId] || [];
    acc[run.scenarioId].push(run);
    return acc;
  }, {});
  const experiences = Object.entries(grouped).map(([flowId, items]) => buildFlowExperience(flowId, items[0]?.scenarioClass || 'critical', items));
  await Promise.all(experiences.map((experience) => createFlowExperience(env, experience).catch(() => null)));
  return experiences;
}

async function attemptSafeRepairs(env: any, input: {
  incidents: RuntimeIncident[];
  degradedRuns: ScenarioRun[];
  policy: Awaited<ReturnType<typeof getAutonomyPolicy>>;
}) {
  const attempts: RepairAttempt[] = [];
  for (const incident of input.incidents) {
    const startedAt = new Date().toISOString();
    let strategy = 'monitor';
    let outcome: RepairAttempt['outcome'] = 'skipped';
    let notes: string[] = [];

    if (incident.category === 'job_failures') {
      strategy = 'retry_job';
      await queueAntiDriftMaintenance(env, { includeHeavyJobs: false }).catch(() => null);
      outcome = input.policy.allowedRepairs.includes(strategy) ? 'succeeded' : 'approval_required';
      notes = ['Queued anti-drift maintenance to re-run failed operational work.'];
    } else if (incident.category === 'stale_evidence') {
      strategy = 'refresh_stale_state';
      await queueAntiDriftMaintenance(env, { includeHeavyJobs: true }).catch(() => null);
      outcome = input.policy.allowedRepairs.includes(strategy) ? 'succeeded' : 'approval_required';
      notes = ['Queued stale entity refresh.'];
    } else if (incident.category === 'duplicate_actions') {
      strategy = 'retry_job';
      await rerankActions(env, { dailyLimit: 50, pageSize: 50 }).catch(() => null);
      outcome = input.policy.allowedRepairs.includes(strategy) ? 'succeeded' : 'approval_required';
      notes = ['Re-ranked action candidates to reduce duplicate action pressure.'];
    } else if (incident.category === 'weak_drafts') {
      strategy = 'regenerate_draft';
      await rerankActions(env, { dailyLimit: 25, pageSize: 25 }).catch(() => null);
      outcome = input.policy.allowedRepairs.includes(strategy) ? 'succeeded' : 'approval_required';
      notes = ['Recomputed top actions as a bounded repair for weak draft conditions.'];
    }

    const attempt: RepairAttempt = {
      _type: 'repairAttempt',
      _id: `repairAttempt.${sanitizeId(incident.category)}.${sanitizeId(startedAt)}`,
      attemptId: `repairAttempt.${sanitizeId(incident.category)}.${sanitizeId(startedAt)}`,
      incidentId: incident.incidentId,
      scenarioId: null,
      strategy,
      tier: 'repair',
      outcome,
      startedAt,
      completedAt: new Date().toISOString(),
      notes,
      details: { incidentCategory: incident.category },
    };
    attempts.push(attempt);
    await createRepairAttempt(env, attempt).catch(() => null);
    if (outcome === 'succeeded') {
      await updateRuntimeIncident(env, incident._id, {
        status: 'repaired',
      }).catch(() => null);
    }
  }

  for (const degradedRun of input.degradedRuns) {
    if (degradedRun.scenarioId !== 'runtime_confidence') continue;
    const startedAt = new Date().toISOString();
    const attempt: RepairAttempt = {
      _type: 'repairAttempt',
      _id: `repairAttempt.runtime_confidence.${sanitizeId(startedAt)}`,
      attemptId: `repairAttempt.runtime_confidence.${sanitizeId(startedAt)}`,
      scenarioId: degradedRun.scenarioId,
      strategy: 'retry_api_call',
      tier: 'repair',
      outcome: input.policy.allowedRepairs.includes('retry_api_call') ? 'succeeded' : 'approval_required',
      startedAt,
      completedAt: new Date().toISOString(),
      notes: ['Triggered bounded rerank to restore fresh confidence snapshots.'],
    };
    attempts.push(attempt);
    await createRepairAttempt(env, attempt).catch(() => null);
  }

  return attempts;
}

async function quarantineUnstable(env: any, incidents: RuntimeIncident[], degradedRuns: ScenarioRun[]) {
  const unstableScenarioIds = new Set(degradedRuns.filter((run) => run.overallConfidence < 55).map((run) => run.scenarioId));
  const targets = incidents.filter((incident) => unstableScenarioIds.has(incident.scenarioId || '') || incident.severity === 'critical');
  await Promise.all(targets.map((incident) => updateRuntimeIncident(env, incident._id, { status: 'quarantined' }).catch(() => null)));
}

function computeReliabilityScore(input: {
  runtimeHealth: Awaited<ReturnType<typeof computeRuntimeHealth>>;
  runs: ScenarioRun[];
  repairs: RepairAttempt[];
}) {
  const scenarioAverage = input.runs.length
    ? input.runs.reduce((sum, run) => sum + Number(run.overallConfidence || 0), 0) / input.runs.length
    : 75;
  const repairBonus = input.repairs.length
    ? (input.repairs.filter((repair) => repair.outcome === 'succeeded').length / input.repairs.length) * 8
    : 0;
  return Math.max(0, Math.min(100, Math.round(
    (scenarioAverage * 0.7)
    + ((100 - (input.runtimeHealth.failedJobs * 12)) * 0.15)
    + ((100 - input.runtimeHealth.staleEvidenceRate) * 0.1)
    + repairBonus,
  )));
}

function mapScenarioSnapshot(snapshot: any) {
  return {
    scenarioId: snapshot.scenarioId,
    scenarioClass: snapshot.scenarioClass,
    overallConfidence: Number(snapshot.overallConfidence || 0),
    issues: Array.isArray(snapshot.issues) ? snapshot.issues : [],
    generatedAt: snapshot.generatedAt,
  };
}

function sanitizeId(value: string) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}
