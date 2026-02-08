/**
 * Unified Orchestrator Handler
 * POST /orchestrate - Orchestrate complete company/account intelligence pipeline
 */

import { createSuccessResponse, createErrorResponse, generateRequestId } from '../utils/response.js';
import { createUnifiedOrchestrationJob, executeNextOrchestrationStage, ORCHESTRATION_STAGES } from '../services/unified-orchestrator.js';

/**
 * Handle unified orchestration request
 * POST /orchestrate
 */
export async function handleUnifiedOrchestrate(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  patchDocument,
  assertSanityConfigured,
  handlers,
  internalFunctions
) {
  try {
    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid JSON in request body',
        { message: e.message },
        400,
        requestId
      );
    }
    
    const { input, inputType = 'url', options = {}, runMode = 'queue' } = body;
    
    // Validate input
    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'input parameter is required and must be a non-empty string',
        { received: typeof input },
        400,
        requestId
      );
    }
    
    // Validate inputType
    if (!['url', 'accountKey', 'company'].includes(inputType)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'inputType must be one of: url, accountKey, company',
        { received: inputType },
        400,
        requestId
      );
    }
    
    // Validate runMode
    if (!['queue', 'sync', 'async'].includes(runMode)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'runMode must be one of: queue, sync, async',
        { received: runMode },
        400,
        requestId
      );
    }
    
    // Get Sanity client (required for storing orchestration job)
    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      if (error.code === 'SANITY_NOT_CONFIGURED') {
        return createErrorResponse(
          'CONFIGURATION_ERROR',
          'Sanity CMS not configured (required for orchestration)',
          {
            message: error.details?.message || error.message,
            action: error.details?.action || 'Configure Sanity secrets',
          },
          503,
          requestId
        );
      }
      throw error;
    }
    
    // Import required utilities
    const { fetchWithTimeout } = await import('../utils/http.js');
    const { readHtmlWithLimit: readHtmlUtil } = await import('../utils/html.js').catch(() => {
      // Fallback if html utils not available
      return { readHtmlWithLimit: null };
    });
    
    // Read HTML utility (from utils/html.js, passed via internalFunctions, or fallback)
    const readHtmlWithLimit = internalFunctions?.readHtmlWithLimit || readHtmlUtil || async function(response, maxSize) {
      const reader = response.body.getReader();
      const chunks = [];
      let totalSize = 0;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          if (totalSize + value.length > maxSize) {
            const remaining = maxSize - totalSize;
            chunks.push(value.slice(0, remaining));
            totalSize = maxSize;
            break;
          }
          
          chunks.push(value);
          totalSize += value.length;
        }
      } finally {
        reader.releaseLock();
      }
      
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      const decoder = new TextDecoder('utf-8', { fatal: false });
      return decoder.decode(combined);
    };
    
    // Build context with all handlers and functions
    const context = {
      // Core handlers
      handleScan: handlers.handleScan,
      handleDiscover: handlers.handleDiscover,
      handleCrawl: handlers.handleCrawl,
      handleExtract: handlers.handleExtract,
      handleBrief: handlers.handleBrief,
      handleVerify: handlers.handleVerify,
      handleLinkedInProfile: handlers.handleLinkedInProfile,
      
      // LinkedIn handlers
      handleLinkedInSearch: handlers.handleLinkedInSearch || (async (req, reqId, fetchFn, readFn) => {
        const { handleLinkedInSearch } = await import('./linkedin-search.js');
        return await handleLinkedInSearch(req, reqId, fetchFn, readFn);
      }),
      
      // Person intelligence handler
      handlePersonBrief: handlers.handlePersonBrief || (async (req, reqId, env, gq, ud, pd, asc, ifs) => {
        const { handlePersonBrief } = await import('./person-intelligence.js');
        return await handlePersonBrief(req, reqId, env, gq, ud, pd, asc, ifs);
      }),
      
      // OSINT handler
      handleQueueOsint: handlers.handleQueueOsint || (async (req, reqId, env, gq, ud, pd, asc, hs) => {
        const { handleQueueOsint } = await import('./osint.js');
        return await handleQueueOsint(req, reqId, env, gq, ud, pd, asc, hs);
      }),
      
      // Utilities
      fetchWithTimeout,
      readHtmlWithLimit,
      
      // Sanity functions
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      assertSanityConfigured,
      
      // Context
      requestId: requestId || generateRequestId(),
      env,
      internalFunctions: internalFunctions || {},
      handlers: handlers || {},
    };
    
    // Create orchestration job
    let job = createUnifiedOrchestrationJob(input, inputType, options);
    
    // Execute based on run mode
    if (runMode === 'sync') {
      // Execute all stages synchronously (can be slow)
      let completed = false;
      let iterationCount = 0;
      const maxIterations = 10; // Safety limit
      
      while (!completed && iterationCount < maxIterations) {
        const result = await executeNextOrchestrationStage(job, context);
        completed = result.completed;
        job = result.job;
        iterationCount++;
        
        // Add delay between stages to avoid rate limits
        if (!completed) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Store job in Sanity
      try {
        const jobDoc = {
          _type: 'orchestrationJob',
          _id: job.jobId,
          ...job,
        };
        await upsertDocument(client, jobDoc);
      } catch (e) {
        console.warn('Failed to store orchestration job:', e.message);
      }
      
      return createSuccessResponse(
        {
          jobId: job.jobId,
          status: job.status,
          currentStage: job.currentStage,
          completedStages: job.completedStages,
          failedStages: job.failedStages,
          data: job.data,
          synthesis: job.data.synthesis,
          completed: job.status === 'complete',
          runMode: 'sync',
        },
        requestId
      );
      
    } else if (runMode === 'async') {
      // Execute asynchronously (fire and forget, returns immediately)
      // Store job and queue for background processing
      const jobDoc = {
        _type: 'orchestrationJob',
        _id: job.jobId,
        ...job,
        status: 'queued',
      };
      
      try {
        await upsertDocument(client, jobDoc);
        
        // Trigger background execution (non-blocking)
        executeOrchestrationBackground(job, context).catch(error => {
          console.error('Background orchestration failed:', error);
        });
        
        return createSuccessResponse(
          {
            jobId: job.jobId,
            status: 'queued',
            message: 'Orchestration job queued for background processing',
            currentStage: job.currentStage,
            runMode: 'async',
            checkStatus: `/orchestrate/status?jobId=${job.jobId}`,
          },
          requestId
        );
      } catch (e) {
        return createErrorResponse(
          'STORAGE_ERROR',
          'Failed to queue orchestration job',
          { message: e.message },
          500,
          requestId
        );
      }
      
    } else {
      // 'queue' mode - similar to async but uses queue system
      // For now, use async mode (queue system would require Cloudflare Queues)
      const jobDoc = {
        _type: 'orchestrationJob',
        _id: job.jobId,
        ...job,
        status: 'queued',
      };
      
      try {
        await upsertDocument(client, jobDoc);
        
        // Trigger background execution
        executeOrchestrationBackground(job, context).catch(error => {
          console.error('Background orchestration failed:', error);
        });
        
        return createSuccessResponse(
          {
            jobId: job.jobId,
            status: 'queued',
            message: 'Orchestration job queued for background processing',
            currentStage: job.currentStage,
            runMode: 'queue',
            checkStatus: `/orchestrate/status?jobId=${job.jobId}`,
          },
          requestId
        );
      } catch (e) {
        return createErrorResponse(
          'STORAGE_ERROR',
          'Failed to queue orchestration job',
          { message: e.message },
          500,
          requestId
        );
      }
    }
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      { message: error.message, stack: error.stack },
      500,
      requestId
    );
  }
}

/**
 * Execute orchestration in background
 * Runs all stages sequentially with delays
 */
async function executeOrchestrationBackground(job, context) {
  const { client, upsertDocument, patchDocument, groqQuery } = context;
  
  try {
    let completed = false;
    let iterationCount = 0;
    const maxIterations = 10;
    
    while (!completed && iterationCount < maxIterations) {
      // Update job status
      try {
        await patchDocument(client, job.jobId, {
          set: {
            status: job.status,
            currentStage: job.currentStage,
            updatedAt: job.updatedAt,
          },
        });
      } catch (e) {
        // Continue even if update fails
      }
      
      // Execute next stage
      const result = await executeNextOrchestrationStage(job, context);
      completed = result.completed;
      job = result.job;
      iterationCount++;
      
      // Add delay between stages (2-5 seconds)
      if (!completed) {
        const delay = 2000 + Math.random() * 3000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Store final job state
    try {
      const jobDoc = {
        _type: 'orchestrationJob',
        _id: job.jobId,
        ...job,
      };
      await upsertDocument(client, jobDoc);
    } catch (e) {
      console.error('Failed to store final orchestration job state:', e.message);
    }
    
  } catch (error) {
    // Update job with error state
    try {
      await patchDocument(client, job.jobId, {
        set: {
          status: 'error',
          error: error.message,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      // Silent fail
    }
    
    throw error;
  }
}

/**
 * Get orchestration job status
 * GET /orchestrate/status?jobId=...
 */
export async function handleGetOrchestrationStatus(
  request,
  requestId,
  groqQuery,
  assertSanityConfigured,
  env
) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');
    
    if (!jobId) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'jobId parameter is required',
        { hint: 'Provide ?jobId=<job-id>' },
        400,
        requestId
      );
    }
    
    // Get Sanity client
    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      if (error.code === 'SANITY_NOT_CONFIGURED') {
        return createErrorResponse(
          'CONFIGURATION_ERROR',
          'Sanity CMS not configured',
          { message: error.message },
          503,
          requestId
        );
      }
      throw error;
    }
    
    // Query job
    const query = `*[_type == "orchestrationJob" && _id == $jobId][0]`;
    const job = await groqQuery(client, query, { jobId });
    
    if (!job) {
      return createErrorResponse(
        'NOT_FOUND',
        'Orchestration job not found',
        { jobId },
        404,
        requestId
      );
    }
    
    // Calculate progress
    const totalStages = 5; // Foundation, Web, Social, Strategic, Synthesis
    const completed = job.completedStages?.length || 0;
    const progress = Math.round((completed / totalStages) * 100);
    
    return createSuccessResponse(
      {
        jobId: job.jobId,
        status: job.status,
        currentStage: job.currentStage,
        progress,
        completedStages: job.completedStages || [],
        failedStages: job.failedStages || [],
        data: {
          accountKey: job.accountKey,
          canonicalUrl: job.canonicalUrl,
          companyName: job.companyName,
          completeness: job.data?.synthesis?.completeness || {},
        },
        synthesis: job.data?.synthesis || null,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
      },
      requestId
    );
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      { message: error.message },
      500,
      requestId
    );
  }
}
