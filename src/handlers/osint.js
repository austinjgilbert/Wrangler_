/**
 * OSINT Handlers
 * Handles OSINT pipeline endpoints
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { runOsintPipeline } from '../osint/pipeline.js';
import { generateAccountKey, normalizeCanonicalUrl, extractRootDomain } from '../sanity-client.js';

/**
 * POST /osint/queue
 * Queue an OSINT job (now runs synchronously)
 * Note: This endpoint now runs synchronously to avoid worker async limits
 */
export async function handleQueueOsint(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  patchDocument,
  assertSanityConfigured,
  handlers
) {
  // Redirect to synchronous run endpoint
  // This maintains API compatibility while running synchronously
  const { handleRunOsint } = await import('./osint.js');
  return await handleRunOsint(request, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured, handlers);
}

/**
 * GET /osint/status
 * Get OSINT job status
 */
export async function handleGetOsintStatus(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');
    const yearParam = url.searchParams.get('year');
    
    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey parameter is required',
        {},
        400,
        requestId
      );
    }
    
    // Default to current year + 1 (2027 as of Jan 5, 2026)
    const year = yearParam ? parseInt(yearParam) : (new Date().getFullYear() + 1);
    const mode = 'year_ahead';
    
    // Get state from Durable Object (source of truth)
    let jobState = null;
    if (env.OSINT_JOBS_DO) {
      try {
        const id = env.OSINT_JOBS_DO.idFromName(`${accountKey}.${year}.${mode}`);
        const stub = env.OSINT_JOBS_DO.get(id);
        const stateResponse = await stub.fetch('http://internal/state', { method: 'GET' });
        const stateResult = await stateResponse.json();
        if (stateResult.ok) {
          jobState = stateResult.data;
        }
      } catch (e) {
        // DO might not exist yet, fall back to Sanity
      }
    }
    
    // Fall back to Sanity if DO not available
    if (!jobState) {
      let client;
      try {
        client = assertSanityConfigured(env);
      } catch (error) {
        if (error.code === 'SANITY_NOT_CONFIGURED') {
          return createErrorResponse(
            'CONFIGURATION_ERROR',
            'Sanity CMS not configured',
            {
              message: error.details.message,
              action: error.details.action,
              missing: error.details.missing,
              suggestion: 'Configure Sanity to check OSINT job status. See documentation for setup instructions.',
            },
            503,
            requestId
          );
        }
        throw error;
      }
      
      // Try to find the most recent job (within the last 12 months)
      // Query for jobs matching the accountKey and mode, sorted by date
      const jobs = await groqQuery(
        client,
        '*[_type == "osintJob" && accountKey == $accountKey && mode == $mode] | order(_createdAt desc)[0]',
        { accountKey, mode }
      );
      
      if (jobs) {
        jobState = {
          status: jobs.status,
          stage: jobs.stage || 0,
          progress: jobs.progress || 0,
          startedAt: jobs.startedAt,
          updatedAt: jobs.updatedAt || jobs._updatedAt,
          error: jobs.error || null,
          reportId: jobs.reportRef || null,
        };
      } else {
        return createErrorResponse(
          'NOT_FOUND',
          'OSINT job not found',
          { accountKey, hint: 'No job found for this account. Run POST /osint/queue to generate one.' },
          404,
          requestId
        );
      }
    }
    
    return createSuccessResponse(jobState, requestId);
    
  } catch (error) {
    // Check if it's a Sanity configuration error
    if (error.code === 'SANITY_NOT_CONFIGURED') {
      return createErrorResponse(
        'CONFIGURATION_ERROR',
        'Sanity CMS not configured',
        {
          message: error.details?.message || error.message,
          action: error.details?.action || 'Set SANITY_PROJECT_ID and SANITY_TOKEN secrets',
          missing: error.details?.missing || [],
          suggestion: 'Configure Sanity to check OSINT job status. See documentation for setup instructions.',
        },
        503,
        requestId
      );
    }
    
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get OSINT status',
      { error: error.message, code: error.code },
      500,
      requestId
    );
  }
}

/**
 * GET /osint/report
 * Get OSINT report
 */
export async function handleGetOsintReport(
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
        'accountKey parameter is required',
        {},
        400,
        requestId
      );
    }
    
    // Use current date-based identifier (YYYY-MM format)
    const now = new Date();
    const reportIdSuffix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const mode = 'year_ahead';
    
    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      if (error.code === 'SANITY_NOT_CONFIGURED') {
        return createErrorResponse(
          'CONFIGURATION_ERROR',
          'Sanity CMS not configured',
          {
            message: error.details.message,
            action: error.details.action,
            missing: error.details.missing,
            suggestion: 'Configure Sanity to retrieve OSINT reports. See documentation for setup instructions.',
          },
          503,
          requestId
        );
      }
      throw error;
    }
    
    // Try to find the most recent report (within the last 12 months)
    // Query for reports matching the accountKey and mode, sorted by date
    const reports = await groqQuery(
      client,
      '*[_type == "osintReport" && accountKey == $accountKey && mode == $mode] | order(_createdAt desc)[0]',
      { accountKey, mode }
    );
    
    if (!reports) {
      return createErrorResponse(
        'NOT_FOUND',
        'OSINT report not found',
        { accountKey, hint: 'No report found for this account. Run POST /osint/queue to generate one.' },
        404,
        requestId
      );
    }
    
    const report = reports;
    
    // Remove Sanity metadata
    const { _id, _type, _rev, _createdAt, _updatedAt, ...reportData } = report;
    
    return createSuccessResponse({ report: reportData }, requestId);
    
  } catch (error) {
    // Check if it's a Sanity configuration error
    if (error.code === 'SANITY_NOT_CONFIGURED') {
      return createErrorResponse(
        'CONFIGURATION_ERROR',
        'Sanity CMS not configured',
        {
          message: error.details?.message || error.message,
          action: error.details?.action || 'Set SANITY_PROJECT_ID and SANITY_TOKEN secrets',
          missing: error.details?.missing || [],
          suggestion: 'Configure Sanity to retrieve OSINT reports. See documentation for setup instructions.',
        },
        503,
        requestId
      );
    }
    
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get OSINT report',
      { error: error.message, code: error.code },
      500,
      requestId
    );
  }
}

/**
 * POST /osint/run
 * Run OSINT pipeline synchronously (admin/debug)
 */
export async function handleRunOsint(
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
    // Auth: global middleware validates WORKER_API_KEY (Sprint 9 Lane 4)
    // Read request body once
    const body = await request.json().catch(() => ({}));
    
    const { url, companyName, mode = 'year_ahead', recencyDays } = body;
    
    if (!url) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'url parameter is required',
        {},
        400,
        requestId
      );
    }
    
    // Normalize URL and generate account key
    const canonicalUrl = normalizeCanonicalUrl(url);
    if (!canonicalUrl) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid URL',
        { url },
        400,
        requestId
      );
    }
    
    const accountKey = await generateAccountKey(canonicalUrl);
    const rootDomain = extractRootDomain(canonicalUrl);
    
    // Calculate date range: now to now + 12 months
    const now = new Date();
    const twelveMonthsFromNow = new Date(now);
    twelveMonthsFromNow.setMonth(twelveMonthsFromNow.getMonth() + 12);
    
    const dateRange = {
      start: now.toISOString(),
      end: twelveMonthsFromNow.toISOString(),
      startYear: now.getFullYear(),
      endYear: twelveMonthsFromNow.getFullYear(),
      months: 12
    };
    
    // Generate date-based job ID (YYYY-MM format for the start of the 12-month window)
    const jobIdSuffix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const jobId = `osintJob.${accountKey}.${jobIdSuffix}.${mode}`;
    
    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      if (error.code === 'SANITY_NOT_CONFIGURED') {
        return createErrorResponse(
          'CONFIGURATION_ERROR',
          'Sanity CMS not configured',
          {
            message: error.details.message,
            action: error.details.action,
            missing: error.details.missing,
            suggestion: 'Configure Sanity to run OSINT pipeline. See documentation for setup instructions.',
          },
          503,
          requestId
        );
      }
      throw error;
    }
    
    // Get or create Durable Object stub (using date-based ID)
    let jobStateDO = null;
    if (env.OSINT_JOBS_DO) {
      const id = env.OSINT_JOBS_DO.idFromName(`${accountKey}.${jobIdSuffix}.${mode}`);
      const stub = env.OSINT_JOBS_DO.get(id);
      jobStateDO = {
        updateState: async (updates) => {
          await stub.fetch('http://internal/state', {
            method: 'POST',
            body: JSON.stringify(updates),
          });
        },
      };
    }
    
    // Build pipeline context
    const context = {
      accountKey,
      canonicalUrl,
      rootDomain,
      companyName: companyName || null,
      dateRange, // Use dateRange instead of year
      mode,
      recencyDays: recencyDays || parseInt(env.OSINT_DEFAULT_RECENCY_DAYS) || 365,
      requestId,
      env,
      client,
      groqQuery,
      upsertDocument,
      patchDocument,
      jobStateDO,
      ...handlers,
    };
    
    // Run pipeline
    let result;
    try {
      result = await runOsintPipeline(context);
      
      // Deliver webhook notification for successful completion
      try {
        const { deliverWebhook } = await import('./webhooks.js');
        await deliverWebhook(env, 'osint.complete', {
          accountKey,
          companyName: companyName || null,
          canonicalUrl,
          reportId: result.reportId,
          status: 'complete',
          completedAt: new Date().toISOString(),
        });
      } catch (webhookError) {
        // Don't fail the request if webhook delivery fails
        console.error('Webhook delivery failed:', webhookError);
      }
      
      return createSuccessResponse({
        success: true,
        reportId: result.reportId,
        report: result.report,
      }, requestId);
    } catch (pipelineError) {
      // Deliver webhook notification for failure
      try {
        const { deliverWebhook } = await import('./webhooks.js');
        await deliverWebhook(env, 'osint.failed', {
          accountKey,
          companyName: companyName || null,
          canonicalUrl,
          status: 'failed',
          error: pipelineError.message,
          failedAt: new Date().toISOString(),
        });
      } catch (webhookError) {
        // Don't fail the request if webhook delivery fails
        console.error('Webhook delivery failed:', webhookError);
      }
      
      throw pipelineError;
    }
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to run OSINT pipeline',
      { error: error.message },
      500,
      requestId
    );
  }
}

