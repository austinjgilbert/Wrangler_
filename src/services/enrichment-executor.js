/**
 * Enrichment Pipeline Executor
 * Automatically executes enrichment stages in background
 */

import {
  executeNextPipelineStage,
  getPipelineProgress,
  buildCompleteResearchSet,
  PIPELINE_STAGES,
} from './research-pipeline.js';

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
          // Get existing pack to preserve payload structure
          const existingPack = await getDocument(client, packId);
          
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
 * Process pending enrichment jobs
 * Called periodically to advance pipeline stages
 */
export async function processPendingEnrichmentJobs(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  context,
  options = {}
) {
  const { limit = 5, maxStagesPerJob = 1 } = options;
  
  try {
    // Get pending/in-progress jobs
    const query = `*[
      _type == "enrichmentJob" 
      && status in ["pending", "in_progress"]
    ] | order(priority desc, startedAt asc) [0...${limit}]`;
    
    const jobs = await groqQuery(client, query);
    
    const results = [];
    
    for (const job of jobs) {
      try {
        const result = await executeEnrichmentPipeline(
          groqQuery,
          upsertDocument,
          patchDocument,
          client,
          job._id,
          context,
          { maxStagesPerRun: maxStagesPerJob }
        );
        
        results.push({
          jobId: job._id,
          accountKey: job.accountKey,
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
    
    return {
      processed: results.length,
      completed: results.filter(r => r.completed).length,
      inProgress: results.filter(r => !r.completed && r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
    
  } catch (error) {
    return {
      processed: 0,
      error: error.message,
    };
  }
}

