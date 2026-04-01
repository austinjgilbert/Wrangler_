/**
 * Job queue utilities for Molt Growth Loop.
 */

import {
  createMoltJob,
  fetchQueuedMoltJobs,
  updateMoltJob,
  fetchPatternByType,
  upsertMoltPattern,
  createMetricSnapshot,
  createEnrichJob,
  createActionCandidate as storeActionCandidate,
  fetchActiveActionCandidatesForAccount,
  fetchDocumentsByIds,
} from './sanity.ts';
import { updatePatternsFromEvent, buildPatternSuggestions } from './patterns.ts';
import { handleEnrichRun } from '../routes/dq.ts';
import { handleDailyRun } from '../routes/network.ts';
import { handleOpportunitiesDaily } from '../routes/opportunities.ts';
import {
  createActionCandidate as buildActionCandidate,
  createActionCandidatesFromScanResult,
  expireActionCandidate,
} from './actionCandidate.ts';
import { getActivePolicyContext } from './policyVersioningService.ts';
import {
  recalculateSignalSourceReliability,
  recomputeDriftMetrics,
  retireStalePatterns,
} from './driftMonitoringService.ts';
import { runScenarioRegressionSuite } from './scenarioRegressionService.ts';
import { scenarioFixtures } from './scenarioFixtures.ts';
import { createLogger } from '../utils/logger.js';
import { runAutopilotCycle } from './autopilotService.ts';
import { replayCriticalScenarios, replayDegradedScenarios } from './scenarioReplayService.ts';
import { recalculateBestKnownPaths } from './bestPathService.ts';
import { computeRuntimeHealth } from './runtimeHealthService.ts';
import { createBestKnownPath, createScenarioConfidenceSnapshot, createScenarioRun, fetchDocumentsByType } from './sanity.ts';
import { scoreScenario } from './scenarioConfidenceService.ts';

export async function enqueueJobs({
  env,
  event,
  entities,
  hasOutcome,
}: {
  env: any;
  event: any;
  entities: Array<{ _ref: string; entityType: string }>;
  hasOutcome: boolean;
}) {
  const jobs: string[] = [];
  const now = new Date().toISOString();

  for (const entity of entities) {
    if (entity.entityType === 'account') {
      const job = {
        _type: 'molt.job',
        _id: `molt.job.enrich.${entity._ref}.${Date.now()}`,
        jobType: 'enrich.account',
        status: 'queued',
        priority: 70,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: now,
        leaseExpiresAt: null,
        traceId: event.traceId || null,
        idempotencyKey: `enrich.account.${entity._ref}.${event._id}`,
        createdFromEvent: { _type: 'reference', _ref: event._id },
        inputRefs: [{ _type: 'reference', _ref: entity._ref }],
        outputRefs: [],
        error: null,
        createdAt: now,
        updatedAt: now,
      };
      await createMoltJob(env, job);
      jobs.push(job._id);

      const techJob = {
        _type: 'molt.job',
        _id: `molt.job.tech.${entity._ref}.${Date.now()}`,
        jobType: 'refresh.tech',
        status: 'queued',
        priority: 60,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: now,
        leaseExpiresAt: null,
        traceId: event.traceId || null,
        idempotencyKey: `refresh.tech.${entity._ref}.${event._id}`,
        createdFromEvent: { _type: 'reference', _ref: event._id },
        inputRefs: [{ _type: 'reference', _ref: entity._ref }],
        outputRefs: [],
        error: null,
        createdAt: now,
        updatedAt: now,
      };
      await createMoltJob(env, techJob);
      jobs.push(techJob._id);

      const actionJob = {
        _type: 'molt.job',
        _id: `molt.job.action-candidate.${entity._ref}.${Date.now()}`,
        jobType: 'action-candidate.generate',
        status: 'queued',
        priority: 75,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: now,
        leaseExpiresAt: null,
        traceId: event.traceId || null,
        idempotencyKey: `action-candidate.generate.${entity._ref}.${event._id}`,
        createdFromEvent: { _type: 'reference', _ref: event._id },
        inputRefs: [{ _type: 'reference', _ref: entity._ref }],
        outputRefs: [],
        error: null,
        createdAt: now,
        updatedAt: now,
      };
      await createMoltJob(env, actionJob);
      jobs.push(actionJob._id);
    }
    if (entity.entityType === 'person') {
      const job = {
        _type: 'molt.job',
        _id: `molt.job.enrich.person.${entity._ref}.${Date.now()}`,
        jobType: 'enrich.person',
        status: 'queued',
        priority: 65,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: now,
        leaseExpiresAt: null,
        traceId: event.traceId || null,
        idempotencyKey: `enrich.person.${entity._ref}.${event._id}`,
        createdFromEvent: { _type: 'reference', _ref: event._id },
        inputRefs: [{ _type: 'reference', _ref: entity._ref }],
        outputRefs: [],
        error: null,
        createdAt: now,
        updatedAt: now,
      };
      await createMoltJob(env, job);
      jobs.push(job._id);
    }
  }

  if (hasOutcome) {
    const job = {
      _type: 'molt.job',
      _id: `molt.job.pattern.${event._id}`,
      jobType: 'pattern.update',
      status: 'queued',
      priority: 80,
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: now,
      leaseExpiresAt: null,
      traceId: event.traceId || null,
      idempotencyKey: `pattern.update.${event._id}`,
      createdFromEvent: { _type: 'reference', _ref: event._id },
      inputRefs: [],
      outputRefs: [],
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await createMoltJob(env, job);
    jobs.push(job._id);
  }

  return jobs;
}

export async function enqueueActionCandidateJob({
  env,
  accountRef,
  personRef = null,
  traceId = null,
  createdFromEventRef = null,
  priority = 75,
}: {
  env: any;
  accountRef: string;
  personRef?: string | null;
  traceId?: string | null;
  createdFromEventRef?: string | null;
  priority?: number;
}) {
  const now = new Date().toISOString();
  const jobId = `molt.job.action-candidate.${accountRef}.${Date.now()}`;
  const inputRefs = [{ _type: 'reference', _ref: accountRef }];
  if (personRef) inputRefs.push({ _type: 'reference', _ref: personRef });

  const job = {
    _type: 'molt.job',
    _id: jobId,
    jobType: 'action-candidate.generate',
    status: 'queued',
    priority,
    attempts: 0,
    maxAttempts: 3,
    nextAttemptAt: now,
    leaseExpiresAt: null,
    traceId,
    idempotencyKey: `action-candidate.generate.${accountRef}.${personRef || 'none'}`,
    createdFromEvent: createdFromEventRef ? { _type: 'reference', _ref: createdFromEventRef } : null,
    inputRefs,
    outputRefs: [],
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  await createMoltJob(env, job);
  return job;
}

export async function enqueueAntiDriftMaintenanceJobs(env: any, input: {
  now?: string;
  includeHeavyJobs?: boolean;
}) {
  const now = input.now || new Date().toISOString();
  const dateKey = now.slice(0, 10);
  const jobs = [
    buildMaintenanceJob('recompute_drift_metrics', 70, now, dateKey),
    buildMaintenanceJob('retire_stale_patterns', 65, now, dateKey),
    buildMaintenanceJob('recalculate_signal_source_reliability', 60, now, dateKey),
  ];

  if (input.includeHeavyJobs) {
    jobs.push(
      buildMaintenanceJob('refresh_stale_entities', 58, now, dateKey),
      buildMaintenanceJob('revalidate_top_patterns', 55, now, dateKey),
      buildMaintenanceJob('run_scenario_regression_suite', 52, now, dateKey),
    );
  }

  for (const job of jobs) {
    await createMoltJob(env, job);
  }

  return jobs;
}

function buildMaintenanceJob(jobType: string, priority: number, now: string, dateKey: string) {
  return {
    _type: 'molt.job',
    _id: `molt.job.${jobType}.${dateKey}`,
    jobType,
    status: 'queued',
    priority,
    attempts: 0,
    maxAttempts: 3,
    nextAttemptAt: now,
    leaseExpiresAt: null,
    traceId: `nightly.${dateKey}`,
    idempotencyKey: `${jobType}.${dateKey}`,
    createdFromEvent: null,
    inputRefs: [],
    outputRefs: [],
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function runQueuedJobs({
  env,
  resolveEvent,
  resolveEntities,
  limit,
  jobTypes,
}: {
  env: any;
  resolveEvent: (eventRef: any) => Promise<any>;
  resolveEntities: (refs: any[]) => Promise<{ person?: any; account?: any }>;
  limit?: number;
  jobTypes?: string[];
}) {
  const jobs = await fetchQueuedMoltJobs(env, { limit, jobTypes });
  const results: any[] = [];
  const logger = createLogger(null, 'molt.jobs');

  for (const job of jobs) {
    try {
      const startedAt = new Date().toISOString();
      const attempts = (job.attempts || 0) + 1;
      const leaseExpiresAt = new Date(Date.now() + (5 * 60 * 1000)).toISOString();
      await updateMoltJob(env, job._id, {
        status: 'running',
        attempts,
        leaseExpiresAt,
        updatedAt: startedAt,
      });
      logger.info('job.started', { jobId: job._id, jobType: job.jobType, attempts });
      if (job.jobType === 'enrich.account') {
        // Trigger the full gap-fill pipeline (scan→discover→crawl→extract→brief→verify→competitors→classify)
        // This replaces the old single-stage DQ enrichment with comprehensive background research.
        const entityRef = job.inputRefs?.[0]?._ref || null;
        if (entityRef) {
          const accountKey = entityRef.startsWith('account-') ? entityRef.replace('account-', '') : entityRef;
          const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
          await triggerGapFill({
            env,
            accountKey,
            trigger: 'job_runner',
          });
        }
        // Also run DQ enrichment for data quality fixes
        const enrichJob = {
          _type: 'enrich.job',
          _id: `enrich.job.${job._id}`,
          findingRef: null,
          entityType: 'account',
          entityId: entityRef,
          goal: 'Auto-enrich from event',
          scope: { maxDepth: 1, maxPages: 5 },
          priority: job.priority || 60,
          status: 'queued',
          attempts: 0,
          maxAttempts: 3,
          nextAttemptAt: new Date().toISOString(),
          leaseExpiresAt: null,
          createdAt: new Date().toISOString(),
        };
        await createEnrichJob(env, enrichJob);
        await handleEnrichRun(new Request('https://local/dq/enrich/run', { method: 'POST' }), 'molt-jobs', env);
      }
      if (job.jobType === 'enrich.person') {
        const enrichJob = {
          _type: 'enrich.job',
          _id: `enrich.job.${job._id}`,
          findingRef: null,
          entityType: 'person',
          entityId: job.inputRefs?.[0]?._ref || null,
          goal: 'Auto-enrich person from event',
          scope: { maxDepth: 1, maxPages: 3 },
          priority: job.priority || 60,
          status: 'queued',
          attempts: 0,
          maxAttempts: 3,
          nextAttemptAt: new Date().toISOString(),
          leaseExpiresAt: null,
          createdAt: new Date().toISOString(),
        };
        await createEnrichJob(env, enrichJob);
        await handleEnrichRun(new Request('https://local/dq/enrich/run', { method: 'POST' }), 'molt-jobs', env);
      }

      if (job.jobType === 'pattern.update') {
        const event = await resolveEvent(job.createdFromEvent);
        const entities = await resolveEntities(event.entities || []);
        const existing = await fetchPatternByType(env, 'growth.patterns');
        const updated = updatePatternsFromEvent({
          event,
          person: entities.person,
          account: entities.account,
          existingPatterns: existing?.successStats || {},
        });
        const patternDoc = {
          _type: 'molt.pattern',
          _id: 'molt.pattern.growth',
          patternType: 'growth.patterns',
          conditions: {},
          recommendedMoves: buildPatternSuggestions(updated),
          evidenceEvents: [event._id],
          successStats: updated,
          lastUpdated: new Date().toISOString(),
        };
        await upsertMoltPattern(env, patternDoc);
        await createMetricSnapshot(env, {
          _type: 'molt.metricSnapshot',
          _id: `molt.metricSnapshot.${Date.now()}`,
          dateRange: { from: event.timestamp, to: new Date().toISOString() },
          aggregates: updated,
          generatedAt: new Date().toISOString(),
        });
      }
      if (job.jobType === 'action-candidate.generate') {
        const policyContext = await getActivePolicyContext(env).catch(() => ({
          scoringVersion: 'scoring.default',
          draftPolicyVersion: 'draft.default',
          strategyVersion: 'strategy.default',
          rankingPolicyVersion: 'ranking.default',
        }));
        const refs = (job.inputRefs || []).map((ref: any) => ref?._ref).filter(Boolean);
        const docs = await fetchDocumentsByIds(env, refs);
        const account = docs.find((doc: any) => doc?._type === 'account');
        const person = docs.find((doc: any) => doc?._type === 'person') || null;
        if (!account) throw new Error('Account document required for action candidate generation');

        const activeCandidates = await fetchActiveActionCandidatesForAccount(env, account._id);
        const nonExpiredActiveCandidates: any[] = [];
        for (const existing of activeCandidates) {
          const expired = new Date(existing.expirationTime || 0).getTime() <= Date.now();
          if (expired && existing._id) {
            await storeActionCandidate(env, expireActionCandidate({
              ...existing,
              _type: 'actionCandidate',
              id: existing.id || existing._id,
            }));
            continue;
          }
          nonExpiredActiveCandidates.push(existing);
        }

        const [generated] = createActionCandidatesFromScanResult({ account, person });
        const duplicate = nonExpiredActiveCandidates.find((candidate: any) =>
          candidate.actionType === generated.actionType &&
          (candidate.person?._ref || null) === (generated.person?._ref || null) &&
          candidate.patternMatch === generated.patternMatch &&
          candidate.recommendedNextStep === generated.recommendedNextStep,
        );

        const finalCandidate = duplicate
          ? buildActionCandidate({
              id: duplicate._id,
              account: generated.account,
              person: generated.person,
              patternMatch: generated.patternMatch,
              opportunityScore: Math.max(duplicate.opportunityScore || 0, generated.opportunityScore),
              confidence: Math.max(duplicate.confidence || 0, generated.confidence),
              urgency: generated.urgency,
              whyNow: generated.whyNow,
              actionType: generated.actionType,
              recommendedNextStep: generated.recommendedNextStep,
              evidence: [...(duplicate.evidence || []), ...generated.evidence],
              signals: [...(duplicate.signals || []), ...generated.signals],
              missingData: generated.missingData,
              draftStatus: duplicate.draftStatus || generated.draftStatus,
              expirationTime: duplicate.expirationTime || generated.expirationTime,
              scoringVersion: policyContext.scoringVersion,
              draftPolicyVersion: policyContext.draftPolicyVersion,
              strategyVersion: policyContext.strategyVersion,
              rankingPolicyVersion: policyContext.rankingPolicyVersion,
            })
          : {
              ...generated,
              scoringVersion: policyContext.scoringVersion,
              draftPolicyVersion: policyContext.draftPolicyVersion,
              strategyVersion: policyContext.strategyVersion,
              rankingPolicyVersion: policyContext.rankingPolicyVersion,
            };

        await storeActionCandidate(env, finalCandidate);
        await updateMoltJob(env, job._id, {
          status: 'done',
          outputRefs: [{ _type: 'reference', _ref: finalCandidate._id }],
          leaseExpiresAt: null,
          updatedAt: new Date().toISOString(),
        });
        logger.info('job.completed', { jobId: job._id, jobType: job.jobType, actionCandidateId: finalCandidate._id });
        results.push({ id: job._id, status: 'done', actionCandidateId: finalCandidate._id });
        continue;
      }
      if (job.jobType === 'convo.daily') {
        await handleDailyRun(new Request('https://local/network/dailyRun', { method: 'POST' }), 'molt-jobs', env);
      }
      if (job.jobType === 'brief.daily') {
        await handleOpportunitiesDaily(new Request('https://local/opportunities/daily', { method: 'POST', body: JSON.stringify({}) }), 'molt-jobs', env);
      }
      if (job.jobType === 'intelligence.nightly') {
        const { runNightlyIntelligencePipeline } = await import('./nightlyIntelligence.ts');
        await runNightlyIntelligencePipeline(env, {});
      }
      if (job.jobType === 'recompute_drift_metrics') {
        const metrics = await recomputeDriftMetrics(env);
        await updateMoltJob(env, job._id, {
          outputRefs: metrics.map((metric) => ({ _type: 'reference', _ref: metric._id })),
        });
      }
      if (job.jobType === 'retire_stale_patterns') {
        const retired = await retireStalePatterns(env);
        await updateMoltJob(env, job._id, {
          error: retired.length ? null : 'no_patterns_retired',
        });
      }
      if (job.jobType === 'refresh_stale_entities') {
        await handleEnrichRun(new Request('https://local/dq/enrich/run', { method: 'POST' }), 'molt-jobs', env);
      }
      if (job.jobType === 'revalidate_top_patterns') {
        await retireStalePatterns(env);
      }
      if (job.jobType === 'run_scenario_regression_suite') {
        const result = runScenarioRegressionSuite(scenarioFixtures);
        await createMetricSnapshot(env, {
          _type: 'molt.metricSnapshot',
          _id: `molt.metricSnapshot.scenarioRegression.${new Date().toISOString().slice(0, 10)}`,
          dateRange: { from: new Date().toISOString(), to: new Date().toISOString() },
          aggregates: result,
          generatedAt: new Date().toISOString(),
        });
        if (!result.passed) {
          throw new Error(`Scenario regression suite failed (${result.failed}/${result.total})`);
        }
      }
      if (job.jobType === 'recalculate_signal_source_reliability') {
        const metrics = await recalculateSignalSourceReliability(env);
        await updateMoltJob(env, job._id, {
          outputRefs: metrics.map((metric) => ({ _type: 'reference', _ref: metric._id })),
        });
      }
      if (job.jobType === 'replay_critical_scenarios') {
        const runs = await replayCriticalScenarios(env);
        await Promise.all(runs.map((run) => createScenarioRun(env, run)));
        await updateMoltJob(env, job._id, {
          outputRefs: runs.map((run) => ({ _type: 'reference', _ref: run._id })),
        });
      }
      if (job.jobType === 'replay_degraded_scenarios') {
        const runs = await replayDegradedScenarios(env);
        await Promise.all(runs.map((run) => createScenarioRun(env, run)));
        await updateMoltJob(env, job._id, {
          outputRefs: runs.map((run) => ({ _type: 'reference', _ref: run._id })),
        });
      }
      if (job.jobType === 'attempt_safe_repairs') {
        const result = await runAutopilotCycle(env, {
          includeDegraded: true,
          attemptRepairs: true,
          quarantine: false,
        });
        await updateMoltJob(env, job._id, {
          error: result.repairAttempts.length ? null : 'no_repairs_attempted',
        });
      }
      if (job.jobType === 'recalculate_best_paths') {
        const runs = await fetchDocumentsByType(env, 'scenarioRun', 100);
        const paths = recalculateBestKnownPaths(runs as any);
        await Promise.all(paths.map((path) => createBestKnownPath(env, path)));
        await updateMoltJob(env, job._id, {
          outputRefs: paths.map((path) => ({ _type: 'reference', _ref: path._id })),
        });
      }
      if (job.jobType === 'compute_runtime_confidence') {
        const runs = await fetchDocumentsByType(env, 'scenarioRun', 30);
        const health = await computeRuntimeHealth(env);
        const snapshots = (runs as any[]).slice(0, 10).map((run) => scoreScenario({
          scenarioId: run.scenarioId,
          scenarioClass: run.scenarioClass,
          executionPassed: run.status === 'passed',
          outputReady: run.status !== 'failed',
          repairSucceeded: Array.isArray(run.repairAttempts) && run.repairAttempts.length > 0,
          stabilitySignals: [run.stabilityConfidence, Math.max(0, 100 - health.staleEvidenceRate)],
          issues: run.issues,
        }));
        await Promise.all(snapshots.map((snapshot) => createScenarioConfidenceSnapshot(env, snapshot)));
        await updateMoltJob(env, job._id, {
          outputRefs: snapshots.map((snapshot) => ({ _type: 'reference', _ref: snapshot._id })),
        });
      }
      if (job.jobType === 'quarantine_unstable_flows') {
        await runAutopilotCycle(env, {
          includeDegraded: true,
          attemptRepairs: false,
          quarantine: true,
        });
      }

      if (job.jobType === 'auto-research') {
        // Auto-research: trigger gap-fill pipeline for the account
        const domain = job.payload?.domain;
        const entityRef = job.inputRefs?.[0]?._ref || null;
        if (domain || entityRef) {
          const accountKey = entityRef
            ? (entityRef.startsWith('account-') ? entityRef.replace('account-', '') : entityRef)
            : domain;
          const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
          await triggerGapFill({
            env,
            accountKey,
            domain,
            trigger: 'auto-research',
          }).catch((err: any) => {
            logger.warn('auto-research.gap-fill-failed', { domain, error: err?.message });
          });
        }
      }

      await updateMoltJob(env, job._id, { status: 'done', leaseExpiresAt: null, updatedAt: new Date().toISOString() });
      logger.info('job.completed', { jobId: job._id, jobType: job.jobType });
      results.push({ id: job._id, status: 'done' });
    } catch (error: any) {
      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = job.maxAttempts || 3;
      const retryable = attempts < maxAttempts;
      const nextAttemptAt = retryable
        ? new Date(Date.now() + (Math.min(2 ** attempts, 30) * 60 * 1000)).toISOString()
        : null;
      await updateMoltJob(env, job._id, {
        status: retryable ? 'queued' : 'failed',
        error: error.message,
        nextAttemptAt,
        leaseExpiresAt: null,
        updatedAt: new Date().toISOString(),
      });
      logger.error('job.failed', error, { jobId: job._id, jobType: job.jobType, retryable, nextAttemptAt });
      results.push({ id: job._id, status: retryable ? 'queued' : 'failed', error: error.message, retryable, nextAttemptAt });
    }
  }

  return results;
}
