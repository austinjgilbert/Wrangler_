/**
 * Research Pipeline Service
 * 
 * Orchestrates complete research pipelines for accounts:
 * 1. Initial scan
 * 2. Site discovery
 * 3. Page crawling
 * 4. Evidence extraction
 * 5. LinkedIn research
 * 6. Brief generation
 * 7. Verification
 * 
 * Runs in background to build complete research sets over time
 */

/**
 * Research pipeline stages
 */
export const PIPELINE_STAGES = {
  INITIAL_SCAN: 'initial_scan',
  DISCOVERY: 'discovery',
  CRAWL: 'crawl',
  EXTRACTION: 'extraction',
  LINKEDIN: 'linkedin',
  BRIEF: 'brief',
  VERIFICATION: 'verification',
  COMPLETE: 'complete',
};

/**
 * Pipeline configuration
 */
export const PIPELINE_CONFIG = {
  // Stage priorities (higher = more important)
  priorities: {
    [PIPELINE_STAGES.INITIAL_SCAN]: 10,
    [PIPELINE_STAGES.DISCOVERY]: 8,
    [PIPELINE_STAGES.CRAWL]: 7,
    [PIPELINE_STAGES.EXTRACTION]: 6,
    [PIPELINE_STAGES.LINKEDIN]: 5,
    [PIPELINE_STAGES.BRIEF]: 4,
    [PIPELINE_STAGES.VERIFICATION]: 3,
  },
  // Time delays between stages (ms) - spread out to avoid resource limits
  delays: {
    [PIPELINE_STAGES.INITIAL_SCAN]: 0,
    [PIPELINE_STAGES.DISCOVERY]: 5000, // 5 seconds
    [PIPELINE_STAGES.CRAWL]: 10000, // 10 seconds
    [PIPELINE_STAGES.EXTRACTION]: 15000, // 15 seconds
    [PIPELINE_STAGES.LINKEDIN]: 20000, // 20 seconds
    [PIPELINE_STAGES.BRIEF]: 25000, // 25 seconds
    [PIPELINE_STAGES.VERIFICATION]: 30000, // 30 seconds
  },
  // Budget limits per stage
  budgets: {
    [PIPELINE_STAGES.DISCOVERY]: 20,
    [PIPELINE_STAGES.CRAWL]: 15,
    [PIPELINE_STAGES.EXTRACTION]: 10,
  },
};

function normalizePipelinePriority(priority) {
  if (typeof priority === 'number' && Number.isFinite(priority)) return priority;
  switch (priority) {
    case 'urgent': return 100;
    case 'high': return 75;
    case 'low': return 25;
    case 'normal':
    default:
      return 50;
  }
}

function normalizeRequestedStages(requestedStages = []) {
  const requested = new Set(Array.isArray(requestedStages) ? requestedStages.filter(Boolean) : []);
  if (requested.size === 0) {
    return [
      PIPELINE_STAGES.INITIAL_SCAN,
      PIPELINE_STAGES.DISCOVERY,
      PIPELINE_STAGES.CRAWL,
      PIPELINE_STAGES.EXTRACTION,
      PIPELINE_STAGES.LINKEDIN,
      PIPELINE_STAGES.BRIEF,
      PIPELINE_STAGES.VERIFICATION,
    ];
  }

  const expanded = new Set();
  const dependencyMap = {
    [PIPELINE_STAGES.INITIAL_SCAN]: [],
    [PIPELINE_STAGES.DISCOVERY]: [PIPELINE_STAGES.INITIAL_SCAN],
    [PIPELINE_STAGES.CRAWL]: [PIPELINE_STAGES.INITIAL_SCAN, PIPELINE_STAGES.DISCOVERY],
    [PIPELINE_STAGES.EXTRACTION]: [PIPELINE_STAGES.INITIAL_SCAN, PIPELINE_STAGES.DISCOVERY, PIPELINE_STAGES.CRAWL],
    [PIPELINE_STAGES.LINKEDIN]: [PIPELINE_STAGES.INITIAL_SCAN],
    [PIPELINE_STAGES.BRIEF]: [PIPELINE_STAGES.INITIAL_SCAN, PIPELINE_STAGES.DISCOVERY, PIPELINE_STAGES.CRAWL, PIPELINE_STAGES.EXTRACTION],
    [PIPELINE_STAGES.VERIFICATION]: [PIPELINE_STAGES.INITIAL_SCAN, PIPELINE_STAGES.DISCOVERY, PIPELINE_STAGES.CRAWL, PIPELINE_STAGES.EXTRACTION, PIPELINE_STAGES.BRIEF],
  };

  function addStage(stage) {
    if (!stage || expanded.has(stage)) return;
    (dependencyMap[stage] || []).forEach(addStage);
    expanded.add(stage);
  }

  requested.forEach(addStage);
  const ordered = [
    PIPELINE_STAGES.INITIAL_SCAN,
    PIPELINE_STAGES.DISCOVERY,
    PIPELINE_STAGES.CRAWL,
    PIPELINE_STAGES.EXTRACTION,
    PIPELINE_STAGES.LINKEDIN,
    PIPELINE_STAGES.BRIEF,
    PIPELINE_STAGES.VERIFICATION,
  ];
  return ordered.filter(stage => expanded.has(stage));
}

function buildGoalKey(options = {}) {
  if (typeof options.goalKey === 'string' && options.goalKey.trim()) {
    return options.goalKey.trim();
  }
  const stages = normalizeRequestedStages(options.requestedStages || []);
  return stages.length === 7 ? 'full_pipeline' : `stages:${stages.join('+')}`;
}

function buildStablePipelineJobId(accountKey, goalKey) {
  const safeAccountKey = (accountKey || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
  const safeGoalKey = (goalKey || 'full_pipeline').replace(/[^a-zA-Z0-9_-]/g, '-');
  return `pipeline.${safeAccountKey}.${safeGoalKey}`;
}

/**
 * Initialize research pipeline for account
 * @param {string} canonicalUrl - Account canonical URL
 * @param {object} options - Pipeline options
 * @returns {object} - Pipeline job definition
 */
export function createPipelineJob(canonicalUrl, options = {}) {
  const requestedStages = normalizeRequestedStages(options.requestedStages || []);
  const goalKey = buildGoalKey({ ...options, requestedStages });
  const jobId = buildStablePipelineJobId(options.accountKey, goalKey);
  
  return {
    jobId,
    canonicalUrl,
    accountKey: options.accountKey || null,
    status: 'pending',
    currentStage: PIPELINE_STAGES.INITIAL_SCAN,
    completedStages: [],
    failedStages: [],
    results: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    priority: normalizePipelinePriority(options.priority || 50),
    goalKey,
    options: {
      includeLinkedIn: options.includeLinkedIn !== false,
      includeBrief: options.includeBrief !== false,
      includeVerification: options.includeVerification !== false,
      maxDepth: options.maxDepth || 2,
      budget: options.budget || 20,
      requestedStages,
      ...options,
    },
    metadata: {
      createdBy: options.userId || 'system',
      source: options.source || 'background_enrichment',
      ...options.metadata,
    },
  };
}

/**
 * Execute pipeline stage
 * @param {object} job - Pipeline job
 * @param {string} stage - Stage to execute
 * @param {object} context - Execution context (handlers, functions, etc.)
 * @returns {Promise<{success: boolean, result?: any, error?: string}>}
 */
export async function executePipelineStage(job, stage, context = {}) {
  const {
    handleScan,
    handleDiscover,
    handleCrawl,
    handleExtract,
    handleLinkedInProfile,
    handleBrief,
    handleVerify,
    requestId,
    env,
  } = context;
  
  // Ensure we have required handlers
  if (!requestId) {
    throw new Error('requestId required in context');
  }
  if (!env) {
    throw new Error('env required in context');
  }
  
  try {
    let result;
    
    switch (stage) {
      case PIPELINE_STAGES.INITIAL_SCAN:
        // Execute scan
        const scanRequest = new Request(`https://worker/scan?url=${encodeURIComponent(job.canonicalUrl)}`);
        const scanResponse = await handleScan(scanRequest, requestId, env);
        const scanData = await scanResponse.json();
        if (scanData.ok) {
          result = scanData.data;
        } else {
          throw new Error(scanData.error?.message || 'Scan failed');
        }
        break;
        
      case PIPELINE_STAGES.DISCOVERY:
        // Discover pages
        const discoverRequest = new Request('https://worker/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: job.canonicalUrl,
            budget: PIPELINE_CONFIG.budgets[PIPELINE_STAGES.DISCOVERY],
          }),
        });
        const discoverResponse = await handleDiscover(discoverRequest, requestId);
        const discoverData = await discoverResponse.json();
        if (discoverData.ok) {
          result = discoverData.data;
        } else {
          throw new Error(discoverData.error?.message || 'Discovery failed');
        }
        break;
        
      case PIPELINE_STAGES.CRAWL:
        // Crawl discovered pages
        const discoveredPages = job.results[PIPELINE_STAGES.DISCOVERY]?.candidates || [];
        if (discoveredPages.length === 0) {
          return { success: true, result: { fetched: [], skipped: [] }, skipped: true };
        }
        
        const crawlRequest = new Request('https://worker/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: job.canonicalUrl,
            depth: job.options.maxDepth || 2,
            budget: PIPELINE_CONFIG.budgets[PIPELINE_STAGES.CRAWL],
            includeTypes: ['pricing', 'security', 'docs', 'careers', 'about', 'blog'],
          }),
        });
        const crawlResponse = await handleCrawl(crawlRequest, requestId);
        const crawlData = await crawlResponse.json();
        if (crawlData.ok) {
          result = crawlData.data;
        } else {
          throw new Error(crawlData.error?.message || 'Crawl failed');
        }
        break;
        
      case PIPELINE_STAGES.EXTRACTION:
        // Extract evidence from crawled pages
        const crawledPages = job.results[PIPELINE_STAGES.CRAWL]?.fetched || [];
        if (crawledPages.length === 0) {
          return { success: true, result: [], skipped: true };
        }
        
        // Extract from top pages (limit to avoid resource limits)
        const pagesToExtract = crawledPages.slice(0, PIPELINE_CONFIG.budgets[PIPELINE_STAGES.EXTRACTION]);
        const extractions = [];
        
        for (const page of pagesToExtract) {
          try {
            const extractRequest = new Request('https://worker/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: page.url || page.finalUrl,
                mode: 'fast',
              }),
            });
            const extractResponse = await handleExtract(extractRequest, requestId, env);
            const extractData = await extractResponse.json();
            if (extractData.ok) {
              extractions.push(extractData.data);
            }
          } catch (e) {
            // Continue with other pages
          }
        }
        
        result = { extractions, total: extractions.length };
        break;
        
      case PIPELINE_STAGES.LINKEDIN:
        // LinkedIn research (if enabled)
        if (!job.options.includeLinkedIn) {
          return { success: true, result: null, skipped: true };
        }
        
        // Try to find LinkedIn profile from scan data
        const scanResult = job.results[PIPELINE_STAGES.INITIAL_SCAN];
        const companyName = scanResult?.businessUnits?.companyName || 
                          scanResult?.technologyStack?.companyName;
        
        if (!companyName) {
          return { success: true, result: null, skipped: true, reason: 'No company name found' };
        }
        
        // Note: LinkedIn scraping requires profile URL
        // This would need to be enhanced to search for profiles
        result = { skipped: true, reason: 'LinkedIn profile URL required' };
        break;
        
      case PIPELINE_STAGES.BRIEF:
        // Generate research brief
        if (!job.options.includeBrief) {
          return { success: true, result: null, skipped: true };
        }
        
        const briefRequest = new Request('https://worker/brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyOrSite: job.canonicalUrl,
            seedUrl: job.canonicalUrl,
          }),
        });
        const briefResponse = await handleBrief(briefRequest, requestId, env);
        const briefData = await briefResponse.json();
        if (briefData.ok) {
          result = briefData.data;
        } else {
          throw new Error(briefData.error?.message || 'Brief generation failed');
        }
        break;
        
      case PIPELINE_STAGES.VERIFICATION:
        // Verify claims (if enabled)
        if (!job.options.includeVerification) {
          return { success: true, result: null, skipped: true };
        }
        
        // Extract claims from brief or evidence
        const brief = job.results[PIPELINE_STAGES.BRIEF];
        const evidence = job.results[PIPELINE_STAGES.EXTRACTION];
        
        if (!brief && !evidence) {
          return { success: true, result: null, skipped: true, reason: 'No claims to verify' };
        }
        
        // Extract claims from brief evidence
        const claims = [];
        const briefEvidence = brief?.evidence || brief?.evidencePack || null;
        if (briefEvidence?.keyFacts) {
          briefEvidence.keyFacts.forEach((fact, idx) => {
            if (fact && fact.length > 20) { // Only verify substantial claims
              claims.push(fact.substring(0, 200)); // Limit claim length
            }
          });
        }
        
        if (evidence?.extractions) {
          evidence.extractions.forEach(ext => {
            if (ext.claims && Array.isArray(ext.claims)) {
              ext.claims.forEach(claim => {
                const claimText = claim.text || claim.claim || '';
                if (claimText && claimText.length > 20) {
                  claims.push(claimText.substring(0, 200));
                }
              });
            }
          });
        }
        
        if (claims.length === 0) {
          return { success: true, result: null, skipped: true, reason: 'No claims extracted' };
        }
        
        // Verify top 3-5 claims
        const claimsToVerify = claims.slice(0, 5);
        const sources = [];
        
        // Gather sources from brief and evidence
        if (briefEvidence?.urls) {
          sources.push(...briefEvidence.urls.slice(0, 5));
        }
        if (evidence?.extractions) {
          evidence.extractions.forEach(ext => {
            if (ext.url && !sources.includes(ext.url)) {
              sources.push(ext.url);
            }
          });
        }
        
        if (sources.length < 2) {
          return { success: true, result: null, skipped: true, reason: 'Insufficient sources for verification' };
        }
        
        // Verify claims
        const verifyRequest = new Request('https://worker/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claims: claimsToVerify,
            sources: sources.slice(0, 5),
          }),
        });
        const verifyResponse = await handleVerify(verifyRequest, requestId, env);
        const verifyData = await verifyResponse.json();
        
        if (verifyData.ok) {
          result = verifyData.data;
        } else {
          throw new Error(verifyData.error?.message || 'Verification failed');
        }
        break;
        
      default:
        throw new Error(`Unknown pipeline stage: ${stage}`);
    }
    
    return { success: true, result };
    
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Execute next pipeline stage
 * @param {object} job - Pipeline job
 * @param {object} context - Execution context
 * @returns {Promise<{job: object, completed: boolean}>}
 */
export async function executeNextPipelineStage(job, context) {
  const stage = job.currentStage;
  const stageOrder = normalizeRequestedStages(job.options?.requestedStages || []);
  
  // Execute current stage
  const stageResult = await executePipelineStage(job, stage, context);
  
  // Update job
  job.updatedAt = new Date().toISOString();
  
  if (stageResult.success) {
    // Store result
    job.results[stage] = stageResult.result;
    job.completedStages.push(stage);
    
    // Move to next stage
    const currentIndex = stageOrder.indexOf(stage);
    if (currentIndex < stageOrder.length - 1) {
      job.currentStage = stageOrder[currentIndex + 1];
      job.status = 'in_progress';
    } else {
      job.currentStage = PIPELINE_STAGES.COMPLETE;
      job.status = job.failedStages.length > 0 ? 'partial' : 'complete';
    }
  } else {
    // Stage failed
    job.failedStages.push({
      stage,
      error: stageResult.error,
      timestamp: new Date().toISOString(),
    });
    
    // Continue to next stage anyway (non-blocking)
    const currentIndex = stageOrder.indexOf(stage);
    if (currentIndex < stageOrder.length - 1) {
      job.currentStage = stageOrder[currentIndex + 1];
      job.status = 'in_progress';
    } else {
      job.currentStage = PIPELINE_STAGES.COMPLETE;
      job.status = 'partial';
    }
  }
  
  return {
    job,
    completed: ['complete', 'partial'].includes(job.status),
  };
}

/**
 * Get pipeline progress
 * @param {object} job - Pipeline job
 * @returns {object} - Progress information
 */
export function getPipelineProgress(job) {
  const totalStages = normalizeRequestedStages(job.options?.requestedStages || []).length || 7;
  const completed = job.completedStages.length;
  const failed = job.failedStages.length;
  const progress = (completed / totalStages) * 100;
  
  return {
    progress: Math.round(progress),
    completed,
    failed,
    total: totalStages,
    currentStage: job.currentStage,
    status: job.status,
    estimatedTimeRemaining: estimateTimeRemaining(job),
  };
}

/**
 * Estimate time remaining
 * @param {object} job - Pipeline job
 * @returns {number} - Estimated seconds remaining
 */
function estimateTimeRemaining(job) {
  const stageOrder = [
    PIPELINE_STAGES.INITIAL_SCAN,
    PIPELINE_STAGES.DISCOVERY,
    PIPELINE_STAGES.CRAWL,
    PIPELINE_STAGES.EXTRACTION,
    PIPELINE_STAGES.LINKEDIN,
    PIPELINE_STAGES.BRIEF,
    PIPELINE_STAGES.VERIFICATION,
  ];
  
  const currentIndex = stageOrder.indexOf(job.currentStage);
  if (currentIndex === -1 || job.status === 'complete') {
    return 0;
  }
  
  let remaining = 0;
  for (let i = currentIndex; i < stageOrder.length; i++) {
    const stage = stageOrder[i];
    remaining += (PIPELINE_CONFIG.delays[stage] || 0) / 1000; // Convert to seconds
    remaining += 10; // Estimated execution time per stage
  }
  
  return Math.round(remaining);
}

/**
 * Build complete research set from pipeline results
 * @param {object} job - Completed pipeline job
 * @returns {object} - Complete research set
 */
export function buildCompleteResearchSet(job) {
  if (!['complete', 'partial'].includes(job.status)) {
    throw new Error('Pipeline not complete');
  }
  
  const researchSet = {
    accountKey: job.accountKey,
    canonicalUrl: job.canonicalUrl,
    completedAt: job.updatedAt,
    pipelineJobId: job.jobId,
    status: job.status,
    
    // Core data
    scan: job.results[PIPELINE_STAGES.INITIAL_SCAN] || null,
    discovery: job.results[PIPELINE_STAGES.DISCOVERY] || null,
    crawl: job.results[PIPELINE_STAGES.CRAWL] || null,
    evidence: job.results[PIPELINE_STAGES.EXTRACTION] || null,
    linkedin: job.results[PIPELINE_STAGES.LINKEDIN] || null,
    brief: job.results[PIPELINE_STAGES.BRIEF] || null,
    verification: job.results[PIPELINE_STAGES.VERIFICATION] || null,
    
    // Metadata
    stages: {
      completed: job.completedStages,
      failed: job.failedStages,
      total: job.completedStages.length + job.failedStages.length,
    },
    
    // Summary
    summary: {
      pagesDiscovered: job.results[PIPELINE_STAGES.DISCOVERY]?.candidates?.length || 0,
      pagesCrawled: job.results[PIPELINE_STAGES.CRAWL]?.fetched?.length || 0,
      evidencePacks: job.results[PIPELINE_STAGES.EXTRACTION]?.total || 0,
      hasBrief: !!job.results[PIPELINE_STAGES.BRIEF],
      hasLinkedIn: !!job.results[PIPELINE_STAGES.LINKEDIN],
    },
  };
  
  return researchSet;
}

