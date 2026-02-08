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
} from './sanity.ts';
import { updatePatternsFromEvent, buildPatternSuggestions } from './patterns.ts';
import { handleEnrichRun } from '../routes/dq.ts';
import { handleDailyRun } from '../routes/network.ts';
import { handleOpportunitiesDaily } from '../routes/opportunities.ts';

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
    }
    if (entity.entityType === 'person') {
      const job = {
        _type: 'molt.job',
        _id: `molt.job.enrich.person.${entity._ref}.${Date.now()}`,
        jobType: 'enrich.person',
        status: 'queued',
        priority: 65,
        attempts: 0,
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

export async function runQueuedJobs({
  env,
  resolveEvent,
  resolveEntities,
}: {
  env: any;
  resolveEvent: (eventRef: any) => Promise<any>;
  resolveEntities: (refs: any[]) => Promise<{ person?: any; account?: any }>;
}) {
  const jobs = await fetchQueuedMoltJobs(env);
  const results: any[] = [];

  for (const job of jobs) {
    try {
      await updateMoltJob(env, job._id, { status: 'running', attempts: (job.attempts || 0) + 1, updatedAt: new Date().toISOString() });
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
      if (job.jobType === 'convo.daily') {
        await handleDailyRun(new Request('https://local/network/dailyRun', { method: 'POST' }), 'molt-jobs', env);
      }
      if (job.jobType === 'brief.daily') {
        await handleOpportunitiesDaily(new Request('https://local/opportunities/daily', { method: 'POST', body: JSON.stringify({}) }), 'molt-jobs', env);
      }

      await updateMoltJob(env, job._id, { status: 'done', updatedAt: new Date().toISOString() });
      results.push({ id: job._id, status: 'done' });
    } catch (error: any) {
      await updateMoltJob(env, job._id, { status: 'failed', error: error.message, updatedAt: new Date().toISOString() });
      results.push({ id: job._id, status: 'failed', error: error.message });
    }
  }

  return results;
}
