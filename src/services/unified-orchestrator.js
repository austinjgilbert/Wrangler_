/**
 * Unified Orchestration Service
 * 
 * Master service that orchestrates ALL intelligence services to build a complete
 * company/account picture. Services build upon each other's data intelligently.
 * 
 * Pipeline Flow:
 * 1. Account Foundation (scan, resolve, create)
 * 2. Web Intelligence (discover, crawl, extract, brief, verify)
 * 3. Social Intelligence (LinkedIn profiles, search, person intelligence)
 * 4. Strategic Intelligence (OSINT, competitor research, enrichment)
 * 5. Synthesis (combine all data into unified intelligence picture)
 * 
 * Each stage uses data from previous stages to inform what to do next.
 */

import { findOrCreateMasterAccount, getMasterAccount } from './sanity-account.js';
import { createPipelineJob, executeNextPipelineStage, buildCompleteResearchSet } from './research-pipeline.js';
import { autoEnrichAccount } from './enrichment-service.js';
import { researchCompetitors } from './competitor-research.js';
import { buildPayloadIndex } from '../lib/payload-helpers.js';

/**
 * Orchestration stages
 */
export const ORCHESTRATION_STAGES = {
  FOUNDATION: 'foundation',           // Initial scan, account creation
  WEB_INTELLIGENCE: 'web_intelligence', // Discover, crawl, extract, brief, verify
  SOCIAL_INTELLIGENCE: 'social_intelligence', // LinkedIn profiles, search, person briefs
  STRATEGIC_INTELLIGENCE: 'strategic_intelligence', // OSINT, competitor research
  SYNTHESIS: 'synthesis',             // Combine all data
  COMPLETE: 'complete',
};

/**
 * Create unified orchestration job
 */
export function createUnifiedOrchestrationJob(input, inputType = 'url', options = {}) {
  const jobId = `unified-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  return {
    jobId,
    input,
    inputType,
    status: 'pending',
    currentStage: ORCHESTRATION_STAGES.FOUNDATION,
    completedStages: [],
    failedStages: [],
    
    // Data accumulated from each stage
    data: {
      account: null,
      scan: null,
      discovery: null,
      crawl: null,
      extraction: null,
      brief: null,
      verification: null,
      linkedinProfiles: [],
      linkedinSearch: null,
      personBriefs: [],
      osint: null,
      competitorResearch: null,
      enrichment: null,
      synthesis: null,
    },
    
    // Metadata
    accountKey: null,
    canonicalUrl: null,
    companyName: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    
    // Options
    options: {
      includeLinkedIn: options.includeLinkedIn !== false,
      includePersonBriefs: options.includePersonBriefs !== false,
      includeOSINT: options.includeOSINT !== false,
      includeCompetitors: options.includeCompetitors !== false,
      includeEnrichment: options.includeEnrichment !== false,
      maxLinkedInProfiles: options.maxLinkedInProfiles || 10,
      maxPersonBriefs: options.maxPersonBriefs || 5,
      discoveryBudget: options.discoveryBudget || 20,
      crawlBudget: options.crawlBudget || 15,
      extractionBudget: options.extractionBudget || 10,
      ...options,
    },
    
    // Context passed between stages
    context: {},
  };
}

/**
 * Execute foundation stage
 * Creates account foundation: scan, resolve domain, create account
 */
async function executeFoundationStage(job, context) {
  const {
    handleScan,
    requestId,
    env,
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
  } = context;
  
  try {
    let accountKey = null;
    let canonicalUrl = null;
    let companyName = null;
    let account = null;
    let scanResult = null;
    
    // Resolve input based on type
    if (job.inputType === 'url') {
      // Scan URL to create account
      canonicalUrl = job.input;
      
      const scanRequest = new Request(`https://worker/scan?url=${encodeURIComponent(canonicalUrl)}`);
      const scanResponse = await handleScan(scanRequest, requestId, env);
      const scanData = await scanResponse.json();
      
      if (!scanData.ok || !scanData.data) {
        throw new Error(scanData.error?.message || 'Scan failed');
      }
      
      scanResult = scanData.data;
      companyName = scanResult.businessUnits?.companyName || 
                   scanResult.technologyStack?.companyName || null;
      
      // Create/find master account
      const accountResult = await findOrCreateMasterAccount(
        groqQuery,
        upsertDocument,
        patchDocument,
        client,
        canonicalUrl,
        companyName,
        scanResult
      );
      
      if (!accountResult.success) {
        throw new Error(accountResult.error || 'Failed to create account');
      }
      
      accountKey = accountResult.accountKey;
      account = accountResult.account;
      
    } else if (job.inputType === 'domain') {
      // Normalize domain to URL and scan
      canonicalUrl = job.input.startsWith('http') ? job.input : `https://${job.input}`;
      
      const scanRequest = new Request(`https://worker/scan?url=${encodeURIComponent(canonicalUrl)}`);
      const scanResponse = await handleScan(scanRequest, requestId, env);
      const scanData = await scanResponse.json();
      
      if (!scanData.ok || !scanData.data) {
        throw new Error(scanData.error?.message || 'Scan failed');
      }
      
      scanResult = scanData.data;
      companyName = scanResult.businessUnits?.companyName || 
                   scanResult.technologyStack?.companyName || null;
      
      const accountResult = await findOrCreateMasterAccount(
        groqQuery, upsertDocument, patchDocument, client,
        canonicalUrl, companyName, scanResult
      );
      
      if (!accountResult.success) {
        throw new Error(accountResult.error || 'Failed to create account');
      }
      
      accountKey = accountResult.accountKey;
      account = accountResult.account;
      
    } else if (job.inputType === 'accountKey') {
      // Use existing account
      accountKey = job.input;
      account = await getMasterAccount(groqQuery, client, accountKey);
      if (account) {
        canonicalUrl = account.canonicalUrl;
        companyName = account.companyName;
      }
    } else if (job.inputType === 'company') {
      // Search for existing account by company name
      const searchResult = await findOrCreateAccountFromCompany(
        job.input,
        { groqQuery, upsertDocument, client, handleScan, requestId, env }
      );
      
      if (searchResult.success) {
        accountKey = searchResult.accountKey;
        account = searchResult.account;
        canonicalUrl = searchResult.canonicalUrl;
        companyName = searchResult.companyName;
      } else {
        throw new Error(searchResult.error || 'Failed to find/create account');
      }
    }
    
    // Store foundation data
    job.data.account = account;
    job.data.scan = scanResult;
    job.accountKey = accountKey;
    job.canonicalUrl = canonicalUrl;
    job.companyName = companyName;
    
    // Store account in context for next stages
    job.context.accountKey = accountKey;
    job.context.canonicalUrl = canonicalUrl;
    job.context.companyName = companyName;
    
    return { success: true };
    
  } catch (error) {
    console.error('[ORCHESTRATE] Foundation stage failed:', error.message);
    return {
      success: false,
      error: "Foundation stage failed",
    };
  }
}

/**
 * Execute web intelligence stage
 * Uses foundation data to discover, crawl, extract, brief, verify
 */
async function executeWebIntelligenceStage(job, context) {
  const {
    handleDiscover,
    handleCrawl,
    handleExtract,
    handleBrief,
    handleVerify,
    requestId,
    env,
  } = context;
  
  try {
    const canonicalUrl = job.canonicalUrl || job.context.canonicalUrl;
    if (!canonicalUrl) {
      throw new Error('Canonical URL required for web intelligence');
    }
    
    // Stage 1: Discover pages
    try {
      const discoverRequest = new Request('https://worker/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: canonicalUrl,
          budget: job.options.discoveryBudget || 20,
        }),
      });
      
      const discoverResponse = await handleDiscover(discoverRequest, requestId);
      const discoverData = await discoverResponse.json();
      
      if (discoverData.ok) {
        job.data.discovery = discoverData.data;
        job.context.discoveredPages = discoverData.data?.candidates || [];
      }
    } catch (e) {
      console.warn('Discovery failed:', e.message);
    }
    
    // Stage 2: Crawl discovered pages
    const discoveredPages = job.context.discoveredPages || [];
    if (discoveredPages.length > 0) {
      try {
        const crawlRequest = new Request('https://worker/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: canonicalUrl,
            depth: 2,
            budget: job.options.crawlBudget || 15,
            includeTypes: ['pricing', 'security', 'docs', 'careers', 'about', 'blog', 'press', 'news'],
          }),
        });
        
        const crawlResponse = await handleCrawl(crawlRequest, requestId);
        const crawlData = await crawlResponse.json();
        
        if (crawlData.ok) {
          job.data.crawl = crawlData.data;
          job.context.crawledPages = crawlData.data?.fetched || [];
        }
      } catch (e) {
        console.warn('Crawl failed:', e.message);
      }
    }
    
    // Stage 3: Extract evidence from crawled pages
    const crawledPages = job.context.crawledPages || [];
    if (crawledPages.length > 0) {
      const extractions = [];
      const pagesToExtract = crawledPages.slice(0, job.options.extractionBudget || 10);
      
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
      
      job.data.extraction = { extractions, total: extractions.length };
      job.context.extractions = extractions;
    }
    
    // Stage 4: Generate research brief (uses scan + crawl + extraction data)
    try {
      const briefRequest = new Request('https://worker/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyOrSite: job.companyName || canonicalUrl,
          seedUrl: canonicalUrl,
        }),
      });
      
      const briefResponse = await handleBrief(briefRequest, requestId, env);
      const briefData = await briefResponse.json();
      
      if (briefData.ok) {
        job.data.brief = briefData.data;
        job.context.briefClaims = extractClaimsFromBrief(briefData.data);
      }
    } catch (e) {
      console.warn('Brief generation failed:', e.message);
    }
    
    // Stage 5: Verify claims (uses brief + extraction data)
    const claims = job.context.briefClaims || [];
    const sources = extractSourcesFromContext(job.context);
    
    if (claims.length > 0 && sources.length >= 2) {
      try {
        const verifyRequest = new Request('https://worker/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claims: claims.slice(0, 5), // Top 5 claims
            sources: sources.slice(0, 5), // Top 5 sources
          }),
        });
        
        const verifyResponse = await handleVerify(verifyRequest, requestId, env);
        const verifyData = await verifyResponse.json();
        
        if (verifyData.ok) {
          job.data.verification = verifyData.data;
        }
      } catch (e) {
        console.warn('Verification failed:', e.message);
      }
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('[ORCHESTRATE] Web intelligence stage failed:', error.message);
    return {
      success: false,
      error: "Web intelligence stage failed",
    };
  }
}

/**
 * Execute social intelligence stage
 * Uses company name from foundation to find LinkedIn profiles, generate person briefs
 */
async function executeSocialIntelligenceStage(job, context) {
  const {
    handleLinkedInSearch,
    handleLinkedInProfile,
    handlePersonBrief,
    requestId,
    env,
    groqQuery,
    upsertDocument,
    patchDocument,
    assertSanityConfigured,
    internalFunctions,
  } = context;
  
  if (!job.options.includeLinkedIn) {
    return { success: true, skipped: true };
  }
  
  try {
    const companyName = job.companyName || job.context.companyName;
    const canonicalUrl = job.canonicalUrl || job.context.canonicalUrl;
    
    if (!companyName) {
      return { success: true, skipped: true, reason: 'No company name available' };
    }
    
    // Stage 1: Search LinkedIn for company employees
    let linkedinResults = [];
    
    try {
      // Search for people at the company
      const searchRequest = new Request('https://worker/linkedin/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: companyName,
          limit: job.options.maxLinkedInProfiles || 10,
          filters: {
            company: companyName,
          },
        }),
      });
      
      // Note: handleLinkedInSearch needs to be passed fetchWithTimeout and readHtmlWithLimit
      const fetchWithTimeoutFn = context.fetchWithTimeout || await import('../utils/http.js').then(m => m.fetchWithTimeout);
      const readHtmlWithLimitFn = context.readHtmlWithLimit || await import('../utils/html.js').then(m => m.readHtmlWithLimit).catch(() => null);
      
      if (!fetchWithTimeoutFn || !readHtmlWithLimitFn) {
        throw new Error('fetchWithTimeout and readHtmlWithLimit required for LinkedIn search');
      }
      
      const searchResponse = await handleLinkedInSearch(
        searchRequest,
        requestId,
        fetchWithTimeoutFn,
        readHtmlWithLimitFn
      );
      const searchData = await searchResponse.json();
      
      if (searchData.ok && searchData.data?.results) {
        linkedinResults = searchData.data.results;
        job.data.linkedinSearch = searchData.data;
        job.context.linkedinProfiles = linkedinResults;
      }
    } catch (e) {
      console.warn('LinkedIn search failed:', e.message);
    }
    
    // Stage 2: Scrape individual LinkedIn profiles
    const profilesScraped = [];
    const profilesToScrape = linkedinResults.slice(0, job.options.maxLinkedInProfiles || 10);
    
    for (const profile of profilesToScrape) {
      if (!profile.profileUrl) continue;
      
      try {
        const profileRequest = new Request('https://worker/linkedin/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileUrl: profile.profileUrl,
          }),
        });
        
        const profileResponse = await handleLinkedInProfile(profileRequest, requestId, env);
        const profileData = await profileResponse.json();
        
        if (profileData.ok && profileData.data) {
          profilesScraped.push(profileData.data);
        }
      } catch (e) {
        // Continue with other profiles
      }
    }
    
    job.data.linkedinProfiles = profilesScraped;
    
    // Stage 3: Generate person briefs for key executives
    // Use scan data to identify key titles/roles
    const scanData = job.data.scan;
    const keyRoles = ['CEO', 'CTO', 'CMO', 'VP', 'Director', 'Head of'];
    
    const executiveProfiles = profilesScraped.filter(p => {
      const headline = (p.headline || '').toLowerCase();
      return keyRoles.some(role => headline.includes(role.toLowerCase()));
    }).slice(0, job.options.maxPersonBriefs || 5);
    
    if (job.options.includePersonBriefs && executiveProfiles.length > 0) {
      const personBriefs = [];
      
      for (const profile of executiveProfiles) {
        try {
          // Check if client is available
          let client;
          try {
            client = assertSanityConfigured(env);
          } catch (e) {
            // Sanity not configured, skip person briefs
            break;
          }
          
          const personBriefRequest = new Request('https://worker/person/brief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: profile.name,
              profileUrl: profile.url || profile.profileUrl,
              companyName: companyName,
              companyDomain: extractDomainFromUrl(canonicalUrl),
              mode: 'fast',
              verify: true,
              store: true,
            }),
          });
          
          const briefResponse = await handlePersonBrief(
            personBriefRequest,
            requestId,
            env,
            groqQuery,
            upsertDocument,
            patchDocument,
            assertSanityConfigured,
            internalFunctions || {}
          );
          
          const briefData = await briefResponse.json();
          
          if (briefData.ok && briefData.data?.personBrief) {
            personBriefs.push(briefData.data);
          }
        } catch (e) {
          console.warn(`Person brief failed for ${profile.name}:`, e.message);
        }
      }
      
      job.data.personBriefs = personBriefs;
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('[ORCHESTRATE] Social intelligence stage failed:', error.message);
    return {
      success: false,
      error: "Social intelligence stage failed",
    };
  }
}

/**
 * Execute strategic intelligence stage
 * OSINT, competitor research, enrichment
 */
async function executeStrategicIntelligenceStage(job, context) {
  const {
    handleQueueOsint,
    groqQuery,
    upsertDocument,
    patchDocument,
    assertSanityConfigured,
    handlers,
    requestId,
    env,
    client,
  } = context;
  
  try {
    const accountKey = job.accountKey || job.context.accountKey;
    const canonicalUrl = job.canonicalUrl || job.context.canonicalUrl;
    
    if (!accountKey) {
      throw new Error('Account key required for strategic intelligence');
    }
    
    // Stage 1: Queue OSINT year-ahead intelligence
    if (job.options.includeOSINT) {
      try {
        const osintRequest = new Request('https://worker/osint/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountKey,
            seedUrl: canonicalUrl,
            mode: 'fast',
          }),
        });
        
        const osintResponse = await handleQueueOsint(
          osintRequest,
          requestId,
          env,
          groqQuery,
          upsertDocument,
          patchDocument,
          assertSanityConfigured,
          handlers || {}
        );
        
        const osintData = await osintResponse.json();
        
        if (osintData.ok && osintData.data) {
          job.data.osint = {
            jobId: osintData.data.jobId,
            status: 'queued',
            message: osintData.data.message,
          };
        }
      } catch (e) {
        console.warn('OSINT queue failed:', e.message);
      }
    }
    
    // Stage 2: Trigger enrichment (uses scan data)
    if (job.options.includeEnrichment && client) {
      try {
        const { autoEnrichAccount } = await import('./enrichment-service.js');
        const enrichResult = await autoEnrichAccount(
          groqQuery,
          upsertDocument,
          client,
          accountKey,
          canonicalUrl
        );
        
        job.data.enrichment = {
          hasResearchSet: enrichResult.hasResearchSet,
          jobId: enrichResult.jobId,
          message: enrichResult.message,
        };
      } catch (e) {
        console.warn('Enrichment failed:', e.message);
      }
    }
    
    // Stage 3: Competitor research (uses scan + brief data)
    if (job.options.includeCompetitors && client) {
      try {
        const account = job.data.account;
        const brief = job.data.brief;
        
        if (account) {
          const compResult = await researchCompetitors(
            groqQuery,
            upsertDocument,
            patchDocument,
            client,
            accountKey,
            account,
            brief || null,
            { competitorLimit: 10 }
          );
          
          job.data.competitorResearch = compResult;
        }
      } catch (e) {
        console.warn('Competitor research failed:', e.message);
      }
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('[ORCHESTRATE] Strategic intelligence stage failed:', error.message);
    return {
      success: false,
      error: "Strategic intelligence stage failed",
    };
  }
}

/**
 * Execute synthesis stage
 * Combines all collected data into unified intelligence picture
 */
async function executeSynthesisStage(job, context) {
  try {
    const synthesis = {
      accountKey: job.accountKey,
      canonicalUrl: job.canonicalUrl,
      companyName: job.companyName,
      synthesizedAt: new Date().toISOString(),
      
      // Core intelligence
      account: job.data.account,
      webIntelligence: {
        scan: job.data.scan,
        discovery: job.data.discovery,
        crawl: job.data.crawl,
        extraction: job.data.extraction,
        brief: job.data.brief,
        verification: job.data.verification,
      },
      
      socialIntelligence: {
        linkedinProfiles: job.data.linkedinProfiles.length,
        linkedinSearch: job.data.linkedinSearch,
        personBriefs: job.data.personBriefs.length,
        keyPeople: job.data.personBriefs.map(pb => ({
          name: pb.personBrief?.executiveSummary?.[0]?.split(' ')[0] || 'Unknown',
          title: pb.personBrief?.executiveSummary?.[0] || null,
          briefId: pb.briefId,
        })),
      },
      
      strategicIntelligence: {
        osint: job.data.osint,
        competitorResearch: job.data.competitorResearch ? {
          competitorCount: job.data.competitorResearch.competitors?.length || 0,
          opportunitiesCount: job.data.competitorResearch.opportunities?.length || 0,
        } : null,
        enrichment: job.data.enrichment,
      },
      
      // Completeness metrics
      completeness: {
        hasWebIntelligence: !!(job.data.scan || job.data.brief),
        hasSocialIntelligence: job.data.linkedinProfiles.length > 0 || job.data.personBriefs.length > 0,
        hasStrategicIntelligence: !!(job.data.osint || job.data.competitorResearch),
        hasVerification: !!job.data.verification,
        totalDataPoints: calculateDataPoints(job),
      },
      
      // Summary insights
      insights: generateInsights(job),
    };
    
    job.data.synthesis = synthesis;
    
    return { success: true };
    
  } catch (error) {
    console.error('[ORCHESTRATE] Synthesis stage failed:', error.message);
    return {
      success: false,
      error: "Synthesis stage failed",
    };
  }
}

/**
 * Execute next orchestration stage
 */
export async function executeNextOrchestrationStage(job, context) {
  const stage = job.currentStage;
  let result;
  
  try {
    switch (stage) {
      case ORCHESTRATION_STAGES.FOUNDATION:
        result = await executeFoundationStage(job, context);
        break;
        
      case ORCHESTRATION_STAGES.WEB_INTELLIGENCE:
        result = await executeWebIntelligenceStage(job, context);
        break;
        
      case ORCHESTRATION_STAGES.SOCIAL_INTELLIGENCE:
        result = await executeSocialIntelligenceStage(job, context);
        break;
        
      case ORCHESTRATION_STAGES.STRATEGIC_INTELLIGENCE:
        result = await executeStrategicIntelligenceStage(job, context);
        break;
        
      case ORCHESTRATION_STAGES.SYNTHESIS:
        result = await executeSynthesisStage(job, context);
        break;
        
      default:
        throw new Error(`Unknown orchestration stage: ${stage}`);
    }
    
    job.updatedAt = new Date().toISOString();
    
    if (result.success && !result.skipped) {
      job.completedStages.push(stage);
      
      // Move to next stage
      const stageOrder = [
        ORCHESTRATION_STAGES.FOUNDATION,
        ORCHESTRATION_STAGES.WEB_INTELLIGENCE,
        ORCHESTRATION_STAGES.SOCIAL_INTELLIGENCE,
        ORCHESTRATION_STAGES.STRATEGIC_INTELLIGENCE,
        ORCHESTRATION_STAGES.SYNTHESIS,
        ORCHESTRATION_STAGES.COMPLETE,
      ];
      
      const currentIndex = stageOrder.indexOf(stage);
      if (currentIndex < stageOrder.length - 1) {
        job.currentStage = stageOrder[currentIndex + 1];
        job.status = 'in_progress';
      } else {
        job.currentStage = ORCHESTRATION_STAGES.COMPLETE;
        job.status = 'complete';
      }
    } else if (result.skipped) {
      // Stage skipped but not failed - continue
      job.completedStages.push(stage);
      const stageOrder = [
        ORCHESTRATION_STAGES.FOUNDATION,
        ORCHESTRATION_STAGES.WEB_INTELLIGENCE,
        ORCHESTRATION_STAGES.SOCIAL_INTELLIGENCE,
        ORCHESTRATION_STAGES.STRATEGIC_INTELLIGENCE,
        ORCHESTRATION_STAGES.SYNTHESIS,
        ORCHESTRATION_STAGES.COMPLETE,
      ];
      const currentIndex = stageOrder.indexOf(stage);
      if (currentIndex < stageOrder.length - 1) {
        job.currentStage = stageOrder[currentIndex + 1];
        job.status = 'in_progress';
      }
    } else {
      // Stage failed - log but continue
      job.failedStages.push({
        stage,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
      
      // Continue to next stage anyway (non-blocking)
      const stageOrder = [
        ORCHESTRATION_STAGES.FOUNDATION,
        ORCHESTRATION_STAGES.WEB_INTELLIGENCE,
        ORCHESTRATION_STAGES.SOCIAL_INTELLIGENCE,
        ORCHESTRATION_STAGES.STRATEGIC_INTELLIGENCE,
        ORCHESTRATION_STAGES.SYNTHESIS,
        ORCHESTRATION_STAGES.COMPLETE,
      ];
      const currentIndex = stageOrder.indexOf(stage);
      if (currentIndex < stageOrder.length - 1) {
        job.currentStage = stageOrder[currentIndex + 1];
        job.status = 'in_progress';
      }
    }
    
    return {
      job,
      completed: job.status === 'complete',
      result,
    };
    
  } catch (error) {
    const stageError = `Stage ${stage} failed`;
    console.error(`[ORCHESTRATE] ${stageError}:`, error.message);
    job.failedStages.push({
      stage,
      error: stageError,
      timestamp: new Date().toISOString(),
    });
    job.status = 'error';
    job.updatedAt = new Date().toISOString();
    
    return {
      job,
      completed: false,
      result: { success: false, error: stageError },
    };
  }
}

// ── Company name resolution (ported from account-orchestrator.js) ────────────

async function findOrCreateAccountFromCompany(companyName, context) {
  const { groqQuery, client } = context;
  
  try {
    // Search for existing account by company name or domain
    const searchQuery = `*[_type == "account" && (companyName match $companyPattern || domain match $companyPattern)][0]`;
    const existingAccount = await groqQuery(client, searchQuery, { companyPattern: '*' + companyName + '*' });
    
    if (existingAccount) {
      const accountKey = existingAccount.accountKey;
      const account = await getMasterAccount(groqQuery, client, accountKey);
      
      return {
        success: true,
        accountKey,
        account,
        canonicalUrl: account?.canonicalUrl || existingAccount.canonicalUrl,
        companyName: account?.companyName || existingAccount.companyName,
      };
    }
    
    // Not found — suggest URL input instead
    return {
      success: false,
      error: 'Company not found. Please provide a URL to scan.',
      suggestion: 'Provide the company website URL instead',
    };
    
  } catch (error) {
    return {
      success: false,
      error: 'Failed to search for company',
    };
  }
}

// ── Compatibility wrapper for account-orchestrator callers ───────────────────

/**
 * Drop-in replacement for account-orchestrator's orchestrateAccountResearch.
 * Runs foundation + strategic stages only (same scope as the old orchestrator).
 * Skips web intelligence, social intelligence, and synthesis.
 * Returns the old return shape so callers don't need changes.
 */
export async function orchestrateAccountResearch(params) {
  const { input, inputType = 'url', context, options = {} } = params;
  
  // Create job with only foundation + strategic stages enabled
  const job = createUnifiedOrchestrationJob(input, inputType, {
    includeLinkedIn: false,
    includePersonBriefs: false,
    includeOSINT: false,
    includeCompetitors: options.includeCompetitors !== false,
    includeEnrichment: options.includeEnrichment !== false,
    ...options,
  });
  
  // Run foundation stage
  let stageResult = await executeNextOrchestrationStage(job, context);
  
  if (job.status === 'error' && !job.accountKey) {
    return {
      input, inputType,
      accountKey: null, canonicalUrl: null, companyName: null,
      status: 'error',
      stages: {
        accountCreation: { status: 'error', completed: false },
        enrichment: { status: 'pending', completed: false },
        competitorResearch: { status: 'pending', completed: false },
      },
      account: null, researchSet: null, competitorResearch: null, opportunities: [],
      startedAt: job.startedAt, completedAt: new Date().toISOString(),
      error: stageResult.result?.error || 'Foundation stage failed',
    };
  }
  
  // Skip web intelligence and social intelligence — jump to strategic
  job.currentStage = ORCHESTRATION_STAGES.STRATEGIC_INTELLIGENCE;
  job.completedStages.push(ORCHESTRATION_STAGES.WEB_INTELLIGENCE);
  job.completedStages.push(ORCHESTRATION_STAGES.SOCIAL_INTELLIGENCE);
  
  // Run strategic stage (enrichment + competitors)
  stageResult = await executeNextOrchestrationStage(job, context);
  
  // Fetch research set if enrichment completed
  let researchSet = null;
  if (job.data.enrichment?.hasResearchSet && context.client) {
    try {
      const { getCompleteResearchSet } = await import('./enrichment-service.js');
      researchSet = await getCompleteResearchSet(context.groqQuery, context.client, job.accountKey);
    } catch (e) {
      // Non-critical — researchSet stays null
    }
  }
  
  // Map to old return shape
  return {
    input, inputType,
    accountKey: job.accountKey,
    canonicalUrl: job.canonicalUrl,
    companyName: job.companyName,
    status: job.failedStages.length > 0 && !job.accountKey ? 'error' : 'complete',
    stages: {
      accountCreation: {
        status: job.completedStages.includes('foundation') ? 'complete' : 'error',
        completed: job.completedStages.includes('foundation'),
      },
      enrichment: {
        status: job.data.enrichment ? 'complete' : 'pending',
        completed: !!job.data.enrichment?.hasResearchSet,
        jobId: job.data.enrichment?.jobId,
        message: job.data.enrichment?.message,
      },
      competitorResearch: {
        status: job.data.competitorResearch ? 'complete' : 'pending',
        completed: !!job.data.competitorResearch,
        competitorCount: job.data.competitorResearch?.competitors?.length || 0,
        opportunitiesCount: job.data.competitorResearch?.opportunities?.length || 0,
      },
    },
    account: job.data.account,
    researchSet,
    competitorResearch: job.data.competitorResearch,
    opportunities: job.data.competitorResearch?.opportunities || [],
    startedAt: job.startedAt,
    completedAt: new Date().toISOString(),
  };
}

// ── Account intelligence reader (moved from account-orchestrator.js) ────────

/**
 * Get complete account intelligence — read-only data aggregation.
 * Not orchestration — just fetches and combines existing data.
 */
export async function getCompleteAccountIntelligence(groqQuery, client, accountKey) {
  try {
    const account = await getMasterAccount(groqQuery, client, accountKey);
    
    if (!account) {
      return null;
    }
    
    const { getCompleteResearchSet, getEnrichmentStatus } = await import('./enrichment-service.js');
    const { getCompetitorResearch, identifyProspectingOpportunities, buildIndustryProfile } = await import('./competitor-research.js');
    
    const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
    const competitorResearch = await getCompetitorResearch(groqQuery, client, accountKey);
    const opportunities = competitorResearch ? identifyProspectingOpportunities(competitorResearch) : [];
    const industryProfile = competitorResearch ? buildIndustryProfile(competitorResearch) : null;
    const enrichmentStatus = await getEnrichmentStatus(groqQuery, client, accountKey);
    
    return {
      account,
      researchSet,
      competitorResearch,
      opportunities,
      industryProfile,
      enrichmentStatus,
      completeness: {
        hasAccount: !!account,
        hasResearchSet: !!researchSet,
        hasCompetitorResearch: !!competitorResearch,
        hasOpportunities: opportunities.length > 0,
        enrichmentComplete: enrichmentStatus.status === 'complete',
      },
    };
  } catch (error) {
    return null;
  }
}

// Helper functions

function extractClaimsFromBrief(brief) {
  const evidence = brief?.evidence || brief?.evidencePack;
  if (!brief || !evidence) return [];
  
  const claims = [];
  
  if (evidence.keyFacts) {
    evidence.keyFacts.forEach(fact => {
      if (fact && fact.length > 20) {
        claims.push(fact.substring(0, 200));
      }
    });
  }
  
  return claims;
}

function extractSourcesFromContext(context) {
  const sources = [];
  
  if (context.crawledPages) {
    context.crawledPages.forEach(page => {
      if (page.url && !sources.includes(page.url)) {
        sources.push(page.url);
      }
    });
  }
  
  if (context.extractions) {
    context.extractions.forEach(ext => {
      if (ext.url && !sources.includes(ext.url)) {
        sources.push(ext.url);
      }
    });
  }
  
  return sources;
}

function extractDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

function calculateDataPoints(job) {
  let points = 0;
  
  if (job.data.scan) points += 10;
  if (job.data.discovery) points += 5;
  if (job.data.crawl) points += 10;
  if (job.data.extraction) points += job.data.extraction.total * 2;
  if (job.data.brief) points += 15;
  if (job.data.verification) points += 10;
  if (job.data.linkedinProfiles.length > 0) points += job.data.linkedinProfiles.length * 3;
  if (job.data.personBriefs.length > 0) points += job.data.personBriefs.length * 5;
  if (job.data.osint) points += 10;
  if (job.data.competitorResearch) points += 15;
  if (job.data.enrichment) points += 10;
  
  return points;
}

function generateInsights(job) {
  const insights = [];
  
  // Web intelligence insights
  if (job.data.scan) {
    const scan = job.data.scan;
    if (scan.opportunityScore && scan.opportunityScore > 70) {
      insights.push(`High opportunity score (${scan.opportunityScore}) indicates strong modernization potential`);
    }
    if (scan.aiReadinessScore && scan.aiReadinessScore > 60) {
      insights.push(`AI readiness score (${scan.aiReadinessScore}) suggests readiness for AI-powered solutions`);
    }
  }
  
  // Social intelligence insights
  if (job.data.personBriefs.length > 0) {
    insights.push(`Identified ${job.data.personBriefs.length} key executives with detailed intelligence`);
  }
  if (job.data.linkedinProfiles.length > 5) {
    insights.push(`Large team presence on LinkedIn (${job.data.linkedinProfiles.length} profiles found)`);
  }
  
  // Strategic intelligence insights
  if (job.data.competitorResearch) {
    const comps = job.data.competitorResearch.competitors?.length || 0;
    if (comps > 0) {
      insights.push(`Identified ${comps} competitors for comparative analysis`);
    }
  }
  
  return insights;
}
