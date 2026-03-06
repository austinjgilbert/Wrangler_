/**
 * Background Enrichment Service
 * 
 * Manages background research pipelines for accounts:
 * - Queues enrichment jobs
 * - Executes pipelines over time
 * - Stores complete research sets
 * - Allows recall of enriched data
 */

import {
  createPipelineJob,
  executeNextPipelineStage,
  getPipelineProgress,
  buildCompleteResearchSet,
  PIPELINE_STAGES,
} from './research-pipeline.js';

/**
 * Queue enrichment job for account
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {object} client - Sanity client
 * @param {string} canonicalUrl - Account canonical URL
 * @param {string} accountKey - Account key
 * @param {object} options - Enrichment options
 * @returns {Promise<{success: boolean, jobId: string}>}
 */
export async function queueEnrichmentJob(
  groqQuery,
  upsertDocument,
  client,
  canonicalUrl,
  accountKey,
  options = {}
) {
  const goalKey = options.goalKey || (Array.isArray(options.requestedStages) && options.requestedStages.length > 0
    ? `stages:${[...new Set(options.requestedStages)].sort().join('+')}`
    : 'full_pipeline');
  // Check if enrichment already in progress
  const existingJob = await getActiveEnrichmentJob(groqQuery, client, accountKey, goalKey);
  if (existingJob) {
    return {
      success: true,
      jobId: existingJob.jobId,
      status: existingJob.status,
      message: 'Enrichment already in progress',
    };
  }
  
  // Create pipeline job
  const job = createPipelineJob(canonicalUrl, {
    accountKey,
    goalKey,
    ...options,
  });
  
  // Store job in Sanity
  const jobDoc = {
    _type: 'enrichmentJob',
    _id: job.jobId,
    accountKey,
    canonicalUrl,
    status: job.status,
    currentStage: job.currentStage,
    completedStages: job.completedStages,
    failedStages: job.failedStages,
    results: job.results,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    priority: job.priority,
    goalKey: job.goalKey || goalKey,
    options: job.options,
    metadata: job.metadata,
  };
  
  await upsertDocument(client, jobDoc);
  
  // Trigger first stage execution (async, non-blocking)
  // Note: In production, this would be handled by a background worker
  // For now, we'll execute stages on-demand via API
  
  return {
    success: true,
    jobId: job.jobId,
    status: job.status,
  };
}

/**
 * Get active enrichment job for account
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object|null>}
 */
export async function getActiveEnrichmentJob(groqQuery, client, accountKey, goalKey = null) {
  try {
    let query = `*[_type == "enrichmentJob" && accountKey == $accountKey && status in ["pending", "in_progress"]]`;
    const params = { accountKey };
    if (goalKey) {
      query += ` && goalKey == $goalKey`;
      params.goalKey = goalKey;
    }
    query += ` | order(updatedAt desc)[0]`;
    const raw = await groqQuery(client, query, params);
    const job = Array.isArray(raw) && raw.length > 0 ? raw[0] : (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null);
    return job ?? null;
  } catch (e) {
    return null;
  }
}

/**
 * Get enrichment job by ID
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} jobId - Job ID
 * @returns {Promise<object|null>}
 */
export async function getEnrichmentJob(groqQuery, client, jobId) {
  try {
    const query = `*[_id == $jobId][0]`;
    const raw = await groqQuery(client, query, { jobId });
    const job = Array.isArray(raw) && raw.length > 0 ? raw[0] : (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null);
    return job ?? null;
  } catch (e) {
    return null;
  }
}

/**
 * Execute next stage of enrichment job
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {Function} patchDocument - Patch document function
 * @param {object} client - Sanity client
 * @param {string} jobId - Job ID
 * @param {object} context - Execution context (handlers, etc.)
 * @returns {Promise<{success: boolean, job: object, completed: boolean}>}
 */
export async function executeEnrichmentStage(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  jobId,
  context
) {
  // Get job
  const job = await getEnrichmentJob(groqQuery, client, jobId);
  if (!job) {
    throw new Error('Enrichment job not found');
  }
  
  if (['complete', 'partial'].includes(job.status)) {
    return {
      success: true,
      job,
      completed: true,
    };
  }
  
  // Execute next stage
  const { job: updatedJob, completed } = await executeNextPipelineStage(job, context);
  
  // Update job in Sanity
  await patchDocument(client, jobId, {
    set: {
      status: updatedJob.status,
      currentStage: updatedJob.currentStage,
      completedStages: updatedJob.completedStages,
      failedStages: updatedJob.failedStages,
      results: updatedJob.results,
      updatedAt: updatedJob.updatedAt,
      goalKey: updatedJob.goalKey || job.goalKey || null,
    },
  });
  
  // If complete, build and store research set
  if (completed) {
    const researchSet = buildCompleteResearchSet(updatedJob);
    
    // Store complete research set in accountPack
    const packId = `accountPack-${updatedJob.accountKey}`;
    try {
      // Get existing pack to preserve payload structure
      const sanityClient = await import('../sanity-client.js');
      const existingPack = sanityClient.getDocument ? await sanityClient.getDocument(client, packId) : null;
      
      // Merge researchSet into existing payload
      const existingPayload = existingPack?.payload || {};
      const updatedPayload = {
        ...existingPayload,
        researchSet: researchSet,
        enrichmentCompletedAt: new Date().toISOString(),
      };
      
      await patchDocument(client, packId, {
        set: {
          payload: updatedPayload,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error('Failed to store research set:', e);
      throw e; // Re-throw to let caller handle
    }
    
    // ── Trigger classification + competitor research + completeness update ──
    // This is the callback that turns a partial profile into a complete one.
    try {
      const { onEnrichmentComplete } = await import('./gap-fill-orchestrator.js');
      await onEnrichmentComplete(groqQuery, upsertDocument, patchDocument, client, updatedJob.accountKey);
    } catch (classifyErr) {
      console.error('Post-enrichment classification error:', classifyErr);
      // Don't fail the enrichment for this
    }
  }
  
  return {
    success: true,
    job: updatedJob,
    completed,
  };
}

/**
 * Get complete research set for account
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object|null>}
 */
export async function getCompleteResearchSet(groqQuery, client, accountKey) {
  try {
    // Get accountPack with research set
    const packId = `accountPack-${accountKey}`;
    const query = `*[_id == $packId][0]`;
    const raw = await groqQuery(client, query, { packId });
    const pack = Array.isArray(raw) && raw.length ? raw[0] : raw;
    
    if (!pack || !pack.payload?.researchSet) {
      return null;
    }
    
    return pack.payload.researchSet;
  } catch (e) {
    return null;
  }
}

/**
 * Get enrichment status for account
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object>}
 */
export async function getEnrichmentStatus(groqQuery, client, accountKey) {
  // Check for active job
  const activeJob = await getActiveEnrichmentJob(groqQuery, client, accountKey);
  
  // Check for complete research set
  const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
  
  if (activeJob) {
    const progress = getPipelineProgress(activeJob);
    return {
      status: 'in_progress',
      jobId: activeJob.jobId,
      progress: progress.progress,
      currentStage: progress.currentStage,
      estimatedTimeRemaining: progress.estimatedTimeRemaining,
      hasResearchSet: false,
    };
  } else if (researchSet) {
    return {
      status: 'complete',
      jobId: researchSet.pipelineJobId,
      progress: 100,
      completedAt: researchSet.completedAt,
      hasResearchSet: true,
      summary: researchSet.summary,
    };
  } else {
    return {
      status: 'not_started',
      hasResearchSet: false,
    };
  }
}

/**
 * List all enrichment jobs
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {object} filters - Filters (status, accountKey, limit)
 * @returns {Promise<Array<object>>}
 */
export async function listEnrichmentJobs(groqQuery, client, filters = {}) {
  let query = '*[_type == "enrichmentJob"';
  
  if (filters.status) {
    query += ` && status == $status`;
  }
  
  if (filters.accountKey) {
    query += ` && accountKey == $accountKey`;
  }
  
  query += ']';
  query += ' | order(updatedAt desc)';
  
  const limit = filters.limit || 50;
  query += `[0...${limit}]`;
  
  const params = {};
  if (filters.status) params.status = filters.status;
  if (filters.accountKey) params.accountKey = filters.accountKey;
  
  const jobs = await groqQuery(client, query, params);
  return jobs || [];
}

/**
 * Auto-enrich account (triggered automatically)
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @param {string} canonicalUrl - Canonical URL
 * @returns {Promise<{success: boolean, jobId?: string, message: string}>}
 */
export async function autoEnrichAccount(
  groqQuery,
  upsertDocument,
  client,
  accountKey,
  canonicalUrl
) {
  // Check if already enriched
  const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
  if (researchSet) {
    return {
      success: true,
      message: 'Account already enriched',
      hasResearchSet: true,
    };
  }
  
  // Check if enrichment in progress
  const activeJob = await getActiveEnrichmentJob(groqQuery, client, accountKey);
  if (activeJob) {
    return {
      success: true,
      jobId: activeJob.jobId,
      message: 'Enrichment already in progress',
      status: activeJob.status,
    };
  }
  
  // Queue enrichment
  return await queueEnrichmentJob(
    groqQuery,
    upsertDocument,
    client,
    canonicalUrl,
    accountKey,
    {
      priority: 50,
      source: 'auto_enrichment',
    }
  );
}

