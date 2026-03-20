/**
 * Enrichment Pipeline Executor
 * Automatically executes enrichment stages in background.
 * Cron uses processPendingEnrichmentJobs to advance enrich.job (and legacy enrichmentJob) via the same executeEnrichmentStage path as the UI.
 */

import {
  executeNextPipelineStage,
  getPipelineProgress,
  buildCompleteResearchSet,
  PIPELINE_STAGES,
} from './research-pipeline.js';
import { getDocument } from '../sanity-client.js';
import { executeEnrichmentStage, trimAccountPackPayload } from './enrichment-service.js';
import { buildPayloadIndex, hydratePayload } from '../lib/payload-helpers.js';

/**
 * Execute enrichment pipeline stages automatically
 * Processes jobs in background with delays between stages
 */
export async function executeEnrichmentPipeline(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  jobId,
  context,
  options = {}
) {
  const { maxStagesPerRun = 1, delayBetweenStages = 5000 } = options;
  
  try {
    // Get job
    const jobQuery = `*[_id == $jobId][0]`;
    const job = await groqQuery(client, jobQuery, { jobId });
    
    if (!job) {
      return { success: false, error: 'Job not found' };
    }
    
    if (job.status === 'complete') {
      return { success: true, completed: true, job };
    }
    
    if (job.status === 'failed') {
      return { success: false, error: 'Job failed', job };
    }
    
    // Execute stages
    let stagesExecuted = 0;
    let currentJob = job;
    let completed = false;
    
    while (stagesExecuted < maxStagesPerRun && !completed && currentJob.status !== 'complete') {
      // Execute next stage
      const result = await executeNextPipelineStage(currentJob, context);
      
      currentJob = result.job;
      completed = result.completed;
      stagesExecuted++;
      
      // Update job in Sanity
      if (currentJob.status !== job.status || 
          currentJob.currentStage !== job.currentStage ||
          currentJob.completedStages.length !== job.completedStages.length) {
        
        await patchDocument(client, jobId, {
          set: {
            status: currentJob.status,
            currentStage: currentJob.currentStage,
            completedStages: currentJob.completedStages,
            failedStages: currentJob.failedStages,
            results: currentJob.results,
            updatedAt: new Date().toISOString(),
          },
        });
      }
      
      // If completed, build and store research set
      if (completed) {
        const researchSet = buildCompleteResearchSet(currentJob);
        
        // Store in accountPack
        const packId = `accountPack-${currentJob.accountKey}`;
        try {
          const existingPack = await getDocument(client, packId);
          const existingPayload = hydratePayload(existingPack);
          const updatedPayload = trimAccountPackPayload({
            ...existingPayload,
            scan: researchSet.scan || existingPayload.scan || null,
            discovery: researchSet.discovery || existingPayload.discovery || null,
            crawl: researchSet.crawl || existingPayload.crawl || null,
            evidence: researchSet.evidence || existingPayload.evidence || null,
            linkedin: researchSet.linkedin || existingPayload.linkedin || null,
            brief: researchSet.brief || existingPayload.brief || null,
            verification: researchSet.verification || existingPayload.verification || null,
            researchSet: researchSet,
            enrichmentCompletedAt: new Date().toISOString(),
          });
          const now = new Date().toISOString();
          if (existingPack && existingPack._id) {
            await patchDocument(client, packId, {
              set: {
                payloadIndex: buildPayloadIndex(updatedPayload),
                payloadData: JSON.stringify(updatedPayload),
                updatedAt: now,
              },
            });
          } else {
            await upsertDocument(client, {
              _type: 'accountPack',
              _id: packId,
              accountKey: currentJob.accountKey,
              canonicalUrl: currentJob.canonicalUrl || '',
              domain: (currentJob.canonicalUrl && new URL(currentJob.canonicalUrl).hostname) || '',
              payloadIndex: buildPayloadIndex(updatedPayload),
              payloadData: JSON.stringify(updatedPayload),
              createdAt: now,
              updatedAt: now,
            });
          }
        } catch (e) {
          console.error('Failed to store research set:', e);
        }
      }
      
      // Delay before next stage (if not complete and more stages to run)
      if (!completed && stagesExecuted < maxStagesPerRun) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenStages));
      }
    }
    
    return {
      success: true,
      completed,
      job: currentJob,
      stagesExecuted,
      progress: getPipelineProgress(currentJob),
    };
    
  } catch (error) {
    // Mark job as failed
    try {
      await patchDocument(client, jobId, {
        set: {
          status: 'failed',
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error('Failed to update job status:', e);
    }
    
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Process pending enrichment jobs (canonical enrich.job first, then legacy enrichmentJob).
 * Advances one stage per job per run using the same executeEnrichmentStage path as POST /enrich/advance.
 */
export async function processPendingEnrichmentJobs(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  context,
  options = {}
) {
  const { limit = 5 } = options;
  const results = [];

  try {
    // Canonical: enrich.job (same type the UI and queue use)
    const canonicalQuery = `*[
      _type == "enrich.job"
      && status in ["pending", "in_progress"]
    ] | order(priority asc, startedAt asc) [0...${limit}]`;
    let jobs = await groqQuery(client, canonicalQuery);
    if (!Array.isArray(jobs)) jobs = [];

    for (const job of jobs) {
      try {
        const result = await executeEnrichmentStage(
          groqQuery,
          upsertDocument,
          patchDocument,
          client,
          job._id,
          context
        );
        results.push({
          jobId: job._id,
          accountKey: job.accountKey,
          success: true,
          completed: result.completed === true,
        });
      } catch (error) {
        results.push({
          jobId: job._id,
          accountKey: job.accountKey,
          success: false,
          error: error.message,
        });
      }
    }

    // If we had fewer than limit canonical jobs, fill with legacy enrichmentJob
    if (results.length < limit) {
      const legacyQuery = `*[
        _type == "enrichmentJob"
        && status in ["pending", "in_progress"]
      ] | order(priority desc, startedAt asc) [0...${limit - results.length}]`;
      const legacyJobs = await groqQuery(client, legacyQuery);
      const legacyList = Array.isArray(legacyJobs) ? legacyJobs : [];

      for (const job of legacyList) {
        try {
          const result = await executeEnrichmentPipeline(
            groqQuery,
            upsertDocument,
            patchDocument,
            client,
            job._id,
            context,
            { maxStagesPerRun: 1 }
          );
          results.push({
            jobId: job._id,
            accountKey: job.accountKey,
            completed: result.completed === true,
            ...result,
          });
        } catch (error) {
          results.push({
            jobId: job._id,
            accountKey: job.accountKey,
            success: false,
            error: error.message,
          });
        }
      }
    }

    return {
      processed: results.length,
      completed: results.filter((r) => r.completed).length,
      inProgress: results.filter((r) => !r.completed && r.success !== false).length,
      failed: results.filter((r) => r.success === false).length,
      results,
    };
  } catch (error) {
    return {
      processed: results.length,
      completed: results.filter((r) => r.completed).length,
      inProgress: results.filter((r) => !r.completed && r.success !== false).length,
      failed: results.filter((r) => r.success === false).length,
      results,
      error: error.message,
    };
  }
}

