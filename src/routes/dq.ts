/**
 * Data Quality routes
 * - POST /dq/scan
 * - POST /dq/enrich/queue
 * - POST /dq/enrich/run
 * - POST /dq/enrich/apply
 */

import { createErrorResponse, createSuccessResponse, safeParseJson, sanitizeErrorMessage } from '../utils/response.js';
import { runDqRules } from '../lib/dqRules.ts';
import { computeDqPriority } from '../lib/scoring.ts';
import { enqueueActionCandidateJob } from '../lib/jobs.ts';
import { crawlSite } from '../lib/crawler.ts';
import { extractAccountFacts, extractTechSignals } from '../lib/extractors.ts';
import { generatePatchProposal, applyPatchesToDocument } from '../lib/proposals.ts';
import { derivePatternInsights } from '../lib/patterns.ts';
import { buildEventDoc } from '../lib/events.ts';
import { notify } from '../lib/notify.ts';
import { createLogger } from '../utils/logger.js';
import { buildDeterministicSnapshotId } from '../../shared/accountStoragePolicy.ts';
import {
  fetchAccounts,
  fetchPeople,
  fetchTechnologies,
  createDqFinding,
  createEnrichJob,
  fetchQueuedEnrichJobs,
  updateEnrichJob,
  createEnrichProposal,
  fetchProposalById,
  patchEntity,
  updateEnrichProposal,
  createMoltApproval,
  createMoltEvent,
  createCrawlSnapshot,
} from '../lib/sanity.ts';

function staleDays(lastEnrichedAt?: string) {
  if (!lastEnrichedAt) return 999;
  return Math.floor((Date.now() - new Date(lastEnrichedAt).getTime()) / (1000 * 60 * 60 * 24));
}

export async function handleDqScan(request: Request, requestId: string, env: any) {
  try {
    const accounts = await fetchAccounts(env);
    const people = await fetchPeople(env);
    const technologies = await fetchTechnologies(env);

    const findings = runDqRules({ accounts, people, technologies });
    const storedIds: string[] = [];
    const queuedJobs: string[] = [];
    for (const finding of findings) {
      const doc = {
        _type: 'dq.finding',
        _id: `dq.finding.${finding.entityType}.${finding.entityId}.${Date.now()}`,
        ...finding,
        createdAt: new Date().toISOString(),
      };
      await createDqFinding(env, doc);
      storedIds.push(doc._id);

      const priority = computeDqPriority({
        severity: finding.severity,
        missingCoreField: !!finding.details?.field,
        staleDays: staleDays(finding.details?.lastEnrichedAt),
      });
      if (priority >= 80) {
        const job = {
          _type: 'enrich.job',
          _id: `enrich.job.${finding.entityType}.${finding.entityId}.${Date.now()}`,
          findingRef: { _type: 'reference', _ref: doc._id },
          entityType: finding.entityType,
          entityId: finding.entityId,
          goal: finding.summary,
          scope: { maxDepth: 1, maxPages: 5 },
          priority,
          status: 'queued',
          attempts: 0,
          maxAttempts: 3,
          nextAttemptAt: new Date().toISOString(),
          leaseExpiresAt: null,
          createdAt: new Date().toISOString(),
        };
        const storedJob = await createEnrichJob(env, job);
        queuedJobs.push(storedJob._id);
      }
    }

    const top = findings.slice(0, 5).map((f) => f.summary);
    return createSuccessResponse(
      { findingsCount: findings.length, storedIds, topFindings: top, jobsQueued: queuedJobs },
      requestId
    );
  } catch (error: any) {
    console.error('[DQ_SCAN] Error:', error.message);
    return createErrorResponse('DQ_SCAN_ERROR', 'Failed to run DQ scan', {}, 500, requestId);
  }
}

export async function handleEnrichQueue(request: Request, requestId: string, env: any) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    const findings = Array.isArray(body.findings) ? body.findings : [];
    const jobs: string[] = [];

    for (const finding of findings) {
      const priority = computeDqPriority({
        severity: finding.severity || 'low',
        missingCoreField: !!finding.details?.field,
        staleDays: staleDays(finding.details?.lastEnrichedAt),
      });
      const job = {
        _type: 'enrich.job',
        _id: `enrich.job.${finding.entityType}.${finding.entityId}.${Date.now()}`,
        findingRef: finding._id ? { _type: 'reference', _ref: finding._id } : null,
        entityType: finding.entityType,
        entityId: finding.entityId,
        goal: finding.summary,
        scope: { maxDepth: 1, maxPages: 5 },
        priority,
        status: 'queued',
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date().toISOString(),
        leaseExpiresAt: null,
        createdAt: new Date().toISOString(),
      };
      const storedJob = await createEnrichJob(env, job);
      jobs.push(storedJob._id);
    }

    return createSuccessResponse({ queued: jobs.length, jobIds: jobs }, requestId);
  } catch (error: any) {
    console.error('[ENRICH_QUEUE_DQ] Error:', error.message);
    return createErrorResponse('ENRICH_QUEUE_ERROR', 'Failed to queue enrichment', {}, 500, requestId);
  }
}

export async function handleEnrichRun(request: Request, requestId: string, env: any) {
  try {
    const jobs = await fetchQueuedEnrichJobs(env);
    const accounts = await fetchAccounts(env);
    const accountMap = new Map(accounts.map((account) => [account._id, account]));
    const applied: string[] = [];
    const pending: string[] = [];
    const logger = createLogger(requestId, 'dq.enrich.run');

    for (const job of jobs) {
      try {
        const attempts = (job.attempts || 0) + 1;
        await updateEnrichJob(env, job._id, {
          status: 'running',
          attempts,
          leaseExpiresAt: new Date(Date.now() + (5 * 60 * 1000)).toISOString(),
        });
        const account = job.entityType === 'account'
          ? accountMap.get(job.entityId)
          : null;

        if (!account?.domain) {
          await updateEnrichJob(env, job._id, { status: 'skipped', error: 'missing domain', leaseExpiresAt: null });
          continue;
        }

        const seedUrl = `https://${account.domain}`;
        const snapshots = await crawlSite({
          seedUrl,
          env,
          maxDepth: job.scope?.maxDepth || 1,
          maxPages: job.scope?.maxPages || 5,
        });
        for (const snap of snapshots) {
          await createCrawlSnapshot(env, {
            _type: 'crawl.snapshot',
            _id: buildDeterministicSnapshotId({
              namespace: 'crawl.snapshot.dq',
              accountKey: account.accountKey || null,
              accountId: account._id,
              urlOrPath: snap.url,
            }),
            accountRef: { _type: 'reference', _ref: account._id },
            accountKey: account.accountKey || '',
            snapshotClass: 'dq_enrichment',
            sourceType: 'dq',
            url: snap.url,
            status: snap.status,
            snippet: snap.snippet,
            fetchedAt: snap.fetchedAt,
            robotsAllowed: snap.robotsAllowed,
            traceId: requestId,
          });
        }

        const snippets = snapshots.map((s) => s.snippet);
        const accountFacts = extractAccountFacts(snippets);
        const techSignals = extractTechSignals(snippets);

        const updates: Record<string, any> = {
          ...(accountFacts.industry ? { industry: accountFacts.industry } : {}),
          ...(techSignals.length > 0 ? { techStack: techSignals } : {}),
          lastEnrichedAt: new Date().toISOString(),
        };

        const evidence = snapshots.map((s) => ({
          url: s.url,
          snippet: s.snippet,
          fetchedAt: s.fetchedAt,
        }));

        const proposal = generatePatchProposal({
          entityId: account._id,
          entityType: 'account',
          updates,
          evidence,
        });

        const proposalDoc = {
          _type: 'enrich.proposal',
          _id: `enrich.proposal.${job._id}`,
          jobRef: { _type: 'reference', _ref: job._id },
          entityRef: { _type: 'reference', _ref: account._id },
          patches: proposal.patches,
          confidence: proposal.confidence,
          risk: proposal.risk,
          traceId: requestId,
          evidence,
          status: proposal.risk === 'safe' ? 'applied' : 'pending_approval',
          createdAt: new Date().toISOString(),
        };
        await createEnrichProposal(env, proposalDoc);

        if (proposal.risk === 'safe') {
          const updated = applyPatchesToDocument(account, proposal.patches);
          await patchEntity(env, account._id, updated);
          await enqueueActionCandidateJob({
            env,
            accountRef: account._id,
            traceId: requestId,
            priority: Math.max(70, job.priority || 70),
          });
          applied.push(proposalDoc._id);
          const eventDoc = buildEventDoc({
            type: 'enrich.applied',
            text: `Applied safe enrichment to ${account._id}`,
            channel: 'system',
            actor: 'moltbot',
            entities: [{ _ref: account._id, entityType: 'account' }],
            tags: ['enrich'],
            traceId: requestId,
            idempotencyKey: `enrich.applied.${proposalDoc._id}`,
          });
          await createMoltEvent(env, eventDoc);
        } else {
          const approvalDoc = {
            _type: 'molt.approval',
            _id: `molt.approval.${proposalDoc._id}`,
            actionType: 'enrich.apply',
            riskLevel: 'dangerous',
            preview: `Apply enrichment proposal ${proposalDoc._id}`,
            actionPayload: { proposalId: proposalDoc._id },
            status: 'pending',
            relatedEntities: [{ _type: 'reference', _ref: account._id }],
            createdAt: new Date().toISOString(),
            audit: { source: 'enrich.run' },
          };
          await createMoltApproval(env, approvalDoc);
          await notify('approval_required', 'Enrichment approval required', {
            approvalId: approvalDoc._id,
            proposalId: proposalDoc._id,
          }, env);
          pending.push(proposalDoc._id);
          const eventDoc = buildEventDoc({
            type: 'approval.requested',
            text: `Approval required for enrichment ${proposalDoc._id}`,
            channel: 'system',
            actor: 'moltbot',
            entities: [{ _ref: account._id, entityType: 'account' }],
            tags: ['approval', 'enrich'],
            traceId: requestId,
            idempotencyKey: `approval.requested.${proposalDoc._id}`,
          });
          await createMoltEvent(env, eventDoc);
        }

        await updateEnrichJob(env, job._id, { status: 'done', leaseExpiresAt: null });
        logger.info('enrich.job.completed', { jobId: job._id, entityId: account._id });
      } catch (jobError: any) {
        const attempts = (job.attempts || 0) + 1;
        const maxAttempts = job.maxAttempts || 3;
        const retryable = attempts < maxAttempts;
        const nextAttemptAt = retryable
          ? new Date(Date.now() + (Math.min(2 ** attempts, 30) * 60 * 1000)).toISOString()
          : null;
        await updateEnrichJob(env, job._id, {
          status: retryable ? 'queued' : 'failed',
          error: jobError.message,
          leaseExpiresAt: null,
          nextAttemptAt,
        });
        logger.error('enrich.job.failed', jobError, { jobId: job._id, retryable, nextAttemptAt });
      }
    }

    const [people, technologies] = await Promise.all([
      fetchPeople(env),
      fetchTechnologies(env),
    ]);
    const patterns = derivePatternInsights({
      accounts,
      people,
      technologies,
    });

    return createSuccessResponse(
      { jobsProcessed: jobs.length, applied, pending, patterns },
      requestId
    );
  } catch (error: any) {
    console.error('[ENRICH_RUN] Error:', error.message);
    return createErrorResponse('ENRICH_RUN_ERROR', 'Failed to run enrichment', {}, 500, requestId);
  }
}

export async function handleEnrichApply(request: Request, requestId: string, env: any) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    const proposalId = body.proposalId;
    if (!proposalId) {
      return createErrorResponse('VALIDATION_ERROR', 'proposalId required', {}, 400, requestId);
    }

    const proposal = await fetchProposalById(env, proposalId);
    if (!proposal) {
      return createErrorResponse('NOT_FOUND', 'proposal not found', {}, 404, requestId);
    }
    if (proposal.risk !== 'risky') {
      return createErrorResponse('INVALID_STATE', 'proposal not risky', {}, 400, requestId);
    }

    const entityId = proposal.entityRef?._ref;
    if (!entityId) {
      return createErrorResponse('INVALID_STATE', 'missing entityRef', {}, 400, requestId);
    }

    const updated = applyPatchesToDocument({}, proposal.patches);
    await patchEntity(env, entityId, updated);
    await enqueueActionCandidateJob({
      env,
      accountRef: entityId,
      traceId: requestId,
      priority: 80,
    });
    // Mark proposal as applied.
    await updateEnrichProposal(env, proposalId, { status: 'applied' });
    const eventDoc = buildEventDoc({
      type: 'enrich.approved',
      text: `Applied approved enrichment ${proposalId}`,
      channel: 'system',
      actor: 'austin',
      entities: [{ _ref: entityId, entityType: 'account' }],
      tags: ['enrich', 'approval'],
      traceId: requestId,
      idempotencyKey: `enrich.approved.${proposalId}`,
    });
    await createMoltEvent(env, eventDoc);
    return createSuccessResponse({ applied: true, proposalId }, requestId);
  } catch (error: any) {
    console.error('[ENRICH_APPLY] Error:', error.message);
    return createErrorResponse('ENRICH_APPLY_ERROR', 'Failed to apply enrichment', {}, 500, requestId);
  }
}
