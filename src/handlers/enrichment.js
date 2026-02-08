/**
 * Enrichment & Research Pipeline Handlers
 * Handles background enrichment and research pipeline execution
 */

import {
  queueEnrichmentJob,
  getEnrichmentStatus,
  getCompleteResearchSet,
  executeEnrichmentStage,
  listEnrichmentJobs,
  autoEnrichAccount,
} from '../services/enrichment-service.js';

import { getPipelineProgress } from '../services/research-pipeline.js';

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';

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
  assertSanityConfigured
) {
  try {
    const body = await request.json();
    const canonicalUrl = body.canonicalUrl || body.url;
    const accountKey = body.accountKey;
    
    if (!canonicalUrl) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'canonicalUrl or url required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Generate accountKey if not provided
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
    const result = await queueEnrichmentJob(
      groqQuery,
      upsertDocument,
      client,
      canonicalUrl,
      finalAccountKey,
      body.options || {}
    );
    
    return createSuccessResponse({
      queued: result.success,
      jobId: result.jobId,
      status: result.status,
      message: result.message,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to queue enrichment',
      { error: error.message },
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
    
    const status = await getEnrichmentStatus(groqQuery, client, accountKey);
    
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


