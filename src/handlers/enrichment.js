/**
 * Enrichment & Research Pipeline Handlers
 * Handles background enrichment and research pipeline execution
 */

import {
  queueEnrichmentJob,
  getEnrichmentStatus,
  getCompleteResearchSet,
  executeEnrichmentStage,
  executeVirtualEnrichmentStage,
  listEnrichmentJobs,
  autoEnrichAccount,
} from '../services/enrichment-service.js';

import { getPipelineProgress } from '../services/research-pipeline.js';

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';

const FULL_PIPELINE_STAGES = ['initial_scan', 'discovery', 'crawl', 'extraction', 'linkedin', 'brief', 'verification'];

function buildEnrichmentQueueOptions(body = {}) {
  const mode = body.mode || 'standard';
  const requestedStages = Array.isArray(body.stages || body.requestedStages)
    ? [...new Set((body.stages || body.requestedStages).filter(Boolean))]
    : [];
  const baseOptions = {
    ...(body.options || {}),
    requestedStages,
    source: body.options?.source || `sdk_${mode}`,
    metadata: {
      ...(body.options?.metadata || {}),
      runMode: mode,
      selfHealRequested: body.selfHeal !== false,
    },
  };

  if (mode === 'deep') {
    return {
      ...baseOptions,
      goalKey: `deep_pipeline_${Date.now()}`,
      requestedStages: requestedStages.length > 0 ? requestedStages : FULL_PIPELINE_STAGES,
      includeLinkedIn: true,
      includeBrief: true,
      includeVerification: true,
      maxDepth: Math.max(Number(baseOptions.maxDepth || 0), 3),
      budget: Math.max(Number(baseOptions.budget || 0), 40),
      priority: Math.min(Number(baseOptions.priority || 3), 3),
    };
  }

  if (mode === 'restart') {
    return {
      ...baseOptions,
      goalKey: `restart_${Date.now()}`,
      priority: Math.min(Number(baseOptions.priority || 5), 5),
      metadata: {
        ...baseOptions.metadata,
        restartRequestedAt: new Date().toISOString(),
      },
    };
  }

  return baseOptions;
}

async function attemptAutomaticResolution({
  env,
  requestId,
  accountKey,
  canonicalUrl,
}) {
  const actions = [];

  const tasks = [];

  tasks.push(
    import('../services/self-heal.js')
      .then(({ runAutomaticSelfHeal }) => runAutomaticSelfHeal(env, { requestId }))
      .then(() => {
        actions.push('self-heal');
      })
      .catch(() => {})
  );

  if (accountKey) {
    tasks.push(
      import('../services/gap-fill-orchestrator.js')
        .then(({ triggerGapFill }) => triggerGapFill({
          env,
          accountKey,
          canonicalUrl,
          trigger: 'enrich_auto_resolution',
        }))
        .then(() => {
          actions.push('gap-fill');
        })
        .catch(() => {})
    );
  }

  await Promise.allSettled(tasks);
  return actions;
}

async function scheduleAutomaticResolution(executionContext, params) {
  if (executionContext?.waitUntil) {
    executionContext.waitUntil(attemptAutomaticResolution(params));
    return {
      selfHealingScheduled: true,
      repairActions: ['scheduled'],
    };
  }

  const repairActions = await attemptAutomaticResolution(params);
  return {
    selfHealingScheduled: repairActions.length > 0,
    repairActions,
  };
}

/**
 * Queue enrichment job for account
 * POST /enrich/queue
 */
export async function handleQueueEnrichment(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  assertSanityConfigured,
  executionContext = null
) {
  try {
    const body = await request.json();
    let canonicalUrl = body.canonicalUrl || body.url;
    let accountKey = body.accountKey;
    const accountId = body.accountId;
    const client = assertSanityConfigured(env);

    if (accountId && !canonicalUrl) {
      const altId = accountId.startsWith('account.') ? accountId.replace('account.', 'account-') : accountId.replace('account-', 'account.');
      const account = await groqQuery(client, `*[_type == "account" && (_id == $accountId || _id == $altId)]{ _id, accountKey, canonicalUrl, domain, rootDomain }[0]`, {
        accountId,
        altId,
      });
      if (account) {
        accountKey = account.accountKey || accountId.replace(/^account[.-]/, '');
        canonicalUrl = account.canonicalUrl || (account.domain ? `https://${account.domain}` : null) || (account.rootDomain ? `https://${account.rootDomain}` : null);
      }
    }

    if (!canonicalUrl) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'canonicalUrl, url, or accountId required',
        {},
        400,
        requestId
      );
    }

    let finalAccountKey = accountKey;
    if (!finalAccountKey) {
      const { generateAccountKey } = await import('../services/sanity-account.js');
      finalAccountKey = await generateAccountKey(canonicalUrl);
      if (!finalAccountKey) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Failed to generate account key',
          {},
          400,
          requestId
        );
      }
    }
    
    // Queue enrichment
    const queueOptions = buildEnrichmentQueueOptions(body);
    let result
    try {
      result = await queueEnrichmentJob(
        groqQuery,
        upsertDocument,
        client,
        canonicalUrl,
        finalAccountKey,
        queueOptions
      );
    } catch (queueError) {
      if (/attribute\/datatype count|validationError/i.test(String(queueError?.message || ''))) {
        result = {
          success: true,
          jobId: `virtual.${finalAccountKey}`,
          status: 'pending',
          message: 'Queued with virtual job fallback',
        };
      } else {
        throw queueError;
      }
    }

    const automaticResolution = body.selfHeal === false
      ? { selfHealingScheduled: false, repairActions: [] }
      : await scheduleAutomaticResolution(executionContext, {
          env,
          requestId,
          accountKey: finalAccountKey,
          canonicalUrl,
        });
    
    return createSuccessResponse({
      queued: result.success,
      jobId: result.jobId,
      status: result.status,
      message: result.message,
      mode: body.mode || 'standard',
      selfHealingScheduled: automaticResolution.selfHealingScheduled,
      repairActions: automaticResolution.repairActions,
    }, requestId);
    
  } catch (error) {
    console.error('[ENRICH_QUEUE] Error:', error.message, error.stack);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to queue enrichment',
      { hint: error.message },
      500,
      requestId
    );
  }
}

/**
 * Get enrichment status
 * GET /enrich/status?accountKey=...
 */
export async function handleGetEnrichmentStatus(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured,
) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');
    
    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey parameter required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    const status = await getEnrichmentStatus(groqQuery, client, accountKey, env);
    
    return createSuccessResponse({
      status: status,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get enrichment status',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Advance enrichment by one explicit step
 * POST /enrich/advance
 */
export async function handleAdvanceEnrichment(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  patchDocument,
  assertSanityConfigured,
  handlers,
  executionContext = null
) {
  try {
    const body = await request.json().catch(() => ({}));
    const accountKey = body?.accountKey;

    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey required',
        {},
        400,
        requestId
      );
    }

    const client = assertSanityConfigured(env);
    let status = await getEnrichmentStatus(groqQuery, client, accountKey, env);
    let executionResult = null;

    if (status?.status === 'in_progress' && status?.jobId && patchDocument && handlers) {
      try {
        if (String(status.jobId).startsWith('virtual.')) {
          executionResult = await executeVirtualEnrichmentStage(
            groqQuery,
            upsertDocument,
            patchDocument,
            client,
            accountKey,
            {
              ...handlers,
              requestId: `${requestId}-advance`,
              env,
            }
          );
        } else {
          executionResult = await executeEnrichmentStage(
            groqQuery,
            upsertDocument,
            patchDocument,
            client,
            status.jobId,
            {
              ...handlers,
              requestId: `${requestId}-advance`,
              env,
            }
          );
        }
      } catch (advanceError) {
        const automaticResolution = await scheduleAutomaticResolution(executionContext, {
          env,
          requestId: `${requestId}-repair`,
          accountKey,
          canonicalUrl: executionResult?.job?.canonicalUrl || null,
        });
        status = {
          ...status,
          advanceError: advanceError.message,
          selfHealingScheduled: automaticResolution.selfHealingScheduled,
          repairActions: automaticResolution.repairActions,
        };
      }
    } else if (status?.status === 'not_started' && patchDocument && handlers) {
      try {
        executionResult = await executeVirtualEnrichmentStage(
          groqQuery,
          upsertDocument,
          patchDocument,
          client,
          accountKey,
          {
            ...handlers,
            requestId: `${requestId}-advance`,
            env,
          }
        );
      } catch (advanceError) {
        const automaticResolution = await scheduleAutomaticResolution(executionContext, {
          env,
          requestId: `${requestId}-repair`,
          accountKey,
          canonicalUrl: null,
        });
        status = {
          ...status,
          advanceError: advanceError.message,
          selfHealingScheduled: automaticResolution.selfHealingScheduled,
          repairActions: automaticResolution.repairActions,
        };
      }
    } else if (status?.status === 'failed') {
      const automaticResolution = await scheduleAutomaticResolution(executionContext, {
        env,
        requestId: `${requestId}-repair`,
        accountKey,
        canonicalUrl: null,
      });
      status = {
        ...status,
        selfHealingScheduled: automaticResolution.selfHealingScheduled,
        repairActions: automaticResolution.repairActions,
      };
    }

    if (executionResult?.job) {
      const progress = getPipelineProgress(executionResult.job);
      status = executionResult.completed
        ? {
            status: 'complete',
            jobId: executionResult.job.jobId || executionResult.job._id,
            progress: 100,
            completedAt: executionResult.job.updatedAt,
            hasResearchSet: true,
          }
        : {
            status: executionResult.job.status || 'in_progress',
            jobId: executionResult.job.jobId || executionResult.job._id,
            progress: progress.progress,
            currentStage: progress.currentStage,
            estimatedTimeRemaining: progress.estimatedTimeRemaining,
            hasResearchSet: false,
          };
    } else if (!status?.advanceError && !status?.selfHealingScheduled) {
      status = await getEnrichmentStatus(groqQuery, client, accountKey, env);
    }

    return createSuccessResponse({
      status,
    }, requestId);
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to advance enrichment',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Get complete research set
 * GET /enrich/research?accountKey=...
 */
export async function handleGetResearchSet(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');
    
    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey parameter required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
    
    if (!researchSet) {
      return createErrorResponse(
        'NOT_FOUND',
        'Research set not found. Enrichment may not be complete.',
        { accountKey },
        404,
        requestId
      );
    }
    
    return createSuccessResponse({
      researchSet: researchSet,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get research set',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Execute next enrichment stage (for background processing)
 * POST /enrich/execute
 */
export async function handleExecuteEnrichmentStage(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  patchDocument,
  assertSanityConfigured,
  handlers
) {
  try {
    const body = await request.json();
    const jobId = body.jobId;
    
    if (!jobId) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'jobId required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Execute next stage
    const result = await executeEnrichmentStage(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      jobId,
      {
        ...handlers,
        requestId,
        env,
      }
    );
    
    // Deliver webhook notification if enrichment completed
    if (result.completed && result.job) {
      try {
        const { deliverWebhook } = await import('./webhooks.js');
        await deliverWebhook(env, 'enrichment.complete', {
          accountKey: result.job.accountKey,
          jobId,
          status: 'complete',
          completedAt: new Date().toISOString(),
          progress: getPipelineProgress(result.job),
        });
      } catch (webhookError) {
        // Don't fail the request if webhook delivery fails
        console.error('Webhook delivery failed:', webhookError);
      }
    } else if (!result.success && result.job) {
      // Deliver webhook for failures
      try {
        const { deliverWebhook } = await import('./webhooks.js');
        await deliverWebhook(env, 'enrichment.failed', {
          accountKey: result.job.accountKey,
          jobId,
          status: 'failed',
          error: result.error || 'Unknown error',
          failedAt: new Date().toISOString(),
        });
      } catch (webhookError) {
        // Don't fail the request if webhook delivery fails
        console.error('Webhook delivery failed:', webhookError);
      }
    }
    
    return createSuccessResponse({
      success: result.success,
      job: result.job,
      completed: result.completed,
      progress: result.job ? getPipelineProgress(result.job) : null,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to execute enrichment stage',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Process pending research pipeline jobs (run next stage for each)
 * POST /enrich/process - used by cron to advance enrichment pipelines
 */
export async function handleProcessEnrichmentJobs(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  patchDocument,
  assertSanityConfigured,
  handlers
) {
  try {
    const client = assertSanityConfigured(env);
    const { scheduleEnrichmentProcessing } = await import('../services/enrichment-scheduler.js');
    const result = await scheduleEnrichmentProcessing(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      handlers || {},
      env,
      requestId
    );
    return createSuccessResponse({
      processed: result.processed ?? 0,
      completed: result.completed ?? 0,
      inProgress: result.inProgress ?? 0,
      failed: result.failed ?? 0,
      results: result.results ?? [],
      error: result.error ?? null,
    }, requestId);
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to process enrichment jobs',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * List enrichment jobs
 * GET /enrich/jobs?status=...&accountKey=...
 */
export async function handleListEnrichmentJobs(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const accountKey = url.searchParams.get('accountKey');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    const client = assertSanityConfigured(env);
    
    const jobs = await listEnrichmentJobs(groqQuery, client, {
      status,
      accountKey,
      limit,
    });
    
    return createSuccessResponse({
      jobs: jobs,
      count: jobs.length,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to list enrichment jobs',
      { error: error.message },
      500,
      requestId
    );
  }
}


