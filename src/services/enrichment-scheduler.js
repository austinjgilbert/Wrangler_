/**
 * Enrichment Scheduler
 * Automatically processes enrichment jobs in background
 * Can be triggered via cron or on-demand
 */

import { processPendingEnrichmentJobs } from './enrichment-executor.js';

/**
 * Process enrichment jobs (for cron trigger)
 * Automatically advances pipeline stages
 */
export async function scheduleEnrichmentProcessing(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  handlers,
  env,
  requestId
) {
  const context = {
    ...handlers,
    requestId: requestId || `scheduler-${Date.now()}`,
    env,
  };
  
  const result = await processPendingEnrichmentJobs(
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
    context,
    {
      limit: 10, // Process up to 10 jobs per run
      maxStagesPerJob: 1, // One stage per job per run
    }
  );
  
  return result;
}

/**
 * Auto-advance enrichment when account is accessed
 * Executes next stage if job is pending/in-progress
 */
export async function autoAdvanceEnrichment(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  accountKey,
  handlers = {},
  env,
  requestId
) {
  try {
    // Get active job
    const { getActiveEnrichmentJob } = await import('./enrichment-service.js');
    const job = await getActiveEnrichmentJob(groqQuery, client, accountKey);
    
    if (!job || !job._id) {
      return { advanced: false, reason: 'No active job' };
    }
    
    // Execute next stage (non-blocking, don't wait)
    const { executeEnrichmentPipeline } = await import('./enrichment-executor.js');
    const context = {
      ...handlers,
      requestId: requestId || `auto-${Date.now()}`,
      env,
    };
    
    // Execute in background (don't await to avoid blocking)
    executeEnrichmentPipeline(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      job._id,
      context,
      { maxStagesPerRun: 1 }
    ).catch(err => {
      console.error('Auto-advance enrichment error:', err);
    });
    
    return {
      advanced: true,
      jobId: job._id,
    };
    
  } catch (error) {
    console.error('Auto-advance enrichment error:', error);
    return { advanced: false, error: error.message };
  }
}

