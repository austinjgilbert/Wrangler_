/**
 * Account Orchestrator Service
 * 
 * Master service that orchestrates all background research for an account:
 * 1. Initial scan (if needed)
 * 2. Full enrichment pipeline
 * 3. Competitor discovery and research
 * 4. Comparative analysis
 * 5. Opportunity identification
 * 
 * Runs automatically from a single input (URL, company name, or account key)
 */

import { autoEnrichAccount, getEnrichmentStatus } from './enrichment-service.js';
import { researchCompetitors, getCompetitorResearch } from './competitor-research.js';
import { findOrCreateMasterAccount, getMasterAccount } from './sanity-account.js';
import { extractQueryPatterns } from './learning-service.js';
import { storeInteraction } from './learning-storage.js';

/**
 * Orchestrate complete account research from single input
 * @param {object} params - Orchestration parameters
 * @param {string} params.input - Input (URL, company name, or account key)
 * @param {string} params.inputType - 'url', 'company', or 'accountKey'
 * @param {object} params.context - Execution context (handlers, functions, etc.)
 * @param {object} params.options - Options
 * @returns {Promise<object>} - Orchestration result
 */
export async function orchestrateAccountResearch(params) {
  const {
    input,
    inputType = 'url',
    context,
    options = {},
  } = params;
  
  const {
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
    handleScan,
    requestId,
    env,
  } = context;
  
  if (!client) {
    throw new Error('Sanity client required');
  }
  
  const result = {
    input,
    inputType,
    accountKey: null,
    canonicalUrl: null,
    companyName: null,
    status: 'starting',
    stages: {
      accountCreation: { status: 'pending', completed: false },
      enrichment: { status: 'pending', completed: false },
      competitorResearch: { status: 'pending', completed: false },
    },
    account: null,
    researchSet: null,
    competitorResearch: null,
    opportunities: [],
    startedAt: new Date().toISOString(),
  };
  
  try {
    // Step 1: Resolve account (create if needed)
    let accountKey = null;
    let canonicalUrl = null;
    let account = null;
    
    if (inputType === 'accountKey') {
      // Get existing account
      accountKey = input;
      account = await getMasterAccount(groqQuery, client, accountKey);
      if (account) {
        canonicalUrl = account.canonicalUrl;
        result.accountKey = accountKey;
        result.canonicalUrl = canonicalUrl;
        result.companyName = account.companyName;
        result.account = account;
      }
    } else if (inputType === 'url' || inputType === 'domain') {
      canonicalUrl = input.startsWith('http') ? input : `https://${input}`;
      const scanResult = await createAccountFromUrl(
        canonicalUrl,
        { handleScan, requestId, env, groqQuery, upsertDocument, patchDocument, client }
      );
      
      if (scanResult.success) {
        accountKey = scanResult.accountKey;
        account = scanResult.account;
        result.accountKey = accountKey;
        result.canonicalUrl = canonicalUrl;
        result.companyName = scanResult.companyName;
        result.account = account;
        result.stages.accountCreation = {
          status: 'complete',
          completed: true,
          scanData: scanResult.scanData,
        };
      } else {
        throw new Error(scanResult.error || 'Failed to create account');
      }
    } else if (inputType === 'company') {
      // Search for company or create from search
      const searchResult = await findOrCreateAccountFromCompany(
        input,
        { groqQuery, upsertDocument, client, handleScan, requestId, env }
      );
      
      if (searchResult.success) {
        accountKey = searchResult.accountKey;
        account = searchResult.account;
        canonicalUrl = searchResult.canonicalUrl;
        result.accountKey = accountKey;
        result.canonicalUrl = canonicalUrl;
        result.companyName = searchResult.companyName;
        result.account = account;
        result.stages.accountCreation = {
          status: 'complete',
          completed: true,
        };
      } else {
        throw new Error(searchResult.error || 'Failed to find/create account');
      }
    }
    
    if (!accountKey || !account) {
      throw new Error('Failed to resolve account');
    }
    
    result.status = 'account_created';
    
    // Step 1.5: Store learning patterns (non-blocking)
    try {
      const patterns = extractQueryPatterns({
        input,
        inputType,
        accountKey,
        timestamp: new Date().toISOString(),
      });
      
      // Store interaction for learning
      await storeInteraction(
        groqQuery,
        upsertDocument,
        client,
        {
          accountKey,
          interactionType: 'research_initiated',
          patterns,
          metadata: {
            input,
            inputType,
            timestamp: new Date().toISOString(),
          },
        }
      ).catch(() => {
        // Silently fail - learning is non-critical
      });
    } catch (learnError) {
      // Silently fail - learning is non-critical
    }
    
    // Step 2: Trigger enrichment (non-blocking)
    try {
      const enrichResult = await autoEnrichAccount(
        groqQuery,
        upsertDocument,
        client,
        accountKey,
        canonicalUrl
      );
      
      result.stages.enrichment = {
        status: enrichResult.hasResearchSet ? 'complete' : 'queued',
        completed: enrichResult.hasResearchSet,
        jobId: enrichResult.jobId,
        message: enrichResult.message,
      };
      
      // If enrichment already complete, get research set
      if (enrichResult.hasResearchSet) {
        const { getCompleteResearchSet } = await import('./enrichment-service.js');
        result.researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
      }
    } catch (enrichError) {
      result.stages.enrichment = {
        status: 'error',
        completed: false,
        error: enrichError.message,
      };
    }
    
    result.status = 'enrichment_triggered';
    
    // Step 3: Trigger competitor research (non-blocking, after enrichment starts)
    try {
      // Wait a bit for enrichment to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get research set if available
      const { getCompleteResearchSet } = await import('./enrichment-service.js');
      let researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
      
      // If not available yet, check enrichment status
      if (!researchSet) {
        const enrichStatus = await getEnrichmentStatus(groqQuery, client, accountKey);
        if (enrichStatus.status === 'complete' && enrichStatus.hasResearchSet) {
          researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
        }
      }
      
      // Research competitors (will queue enrichment for competitors)
      if (researchSet || options.forceCompetitorResearch) {
        const compResult = await researchCompetitors(
          groqQuery,
          upsertDocument,
          patchDocument,
          client,
          accountKey,
          account,
          researchSet || null,
          { competitorLimit: options.competitorLimit || 10 }
        );
        
        result.stages.competitorResearch = {
          status: 'complete',
          completed: true,
          competitorCount: compResult.competitors?.length || 0,
          opportunitiesCount: compResult.opportunities?.length || 0,
        };
        
        result.competitorResearch = compResult;
        result.opportunities = compResult.opportunities || [];
      } else {
        // Queue competitor research for later
        result.stages.competitorResearch = {
          status: 'queued',
          completed: false,
          message: 'Waiting for enrichment to complete',
        };
      }
    } catch (compError) {
      result.stages.competitorResearch = {
        status: 'error',
        completed: false,
        error: compError.message,
      };
    }
    
    result.status = 'complete';
    result.completedAt = new Date().toISOString();
    
    return result;
    
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    result.completedAt = new Date().toISOString();
    return result;
  }
}

/**
 * Create account from URL
 * @param {string} url - URL to scan
 * @param {object} context - Execution context
 * @returns {Promise<object>}
 */
async function createAccountFromUrl(url, context) {
  const { handleScan, requestId, env, groqQuery, upsertDocument, patchDocument, client } = context;
  
  try {
    // Scan URL (orchestrate=false prevents recursive orchestration from handleScan)
    const scanRequest = new Request(`https://worker/scan?url=${encodeURIComponent(url)}&orchestrate=false`);
    const scanResponse = await handleScan(scanRequest, requestId, env);
    const scanData = await scanResponse.json();
    
    if (!scanData.ok || !scanData.data) {
      return {
        success: false,
        error: scanData.error?.message || 'Scan failed',
      };
    }
    
    const scanResult = scanData.data;
    const finalUrl = scanResult.finalUrl || url;
    
    // Get patchDocument from context
    const patchDoc = context.patchDocument || patchDocument;
    
    // Create/find master account
    const accountResult = await findOrCreateMasterAccount(
      groqQuery,
      upsertDocument,
      patchDoc,
      client,
      finalUrl,
      scanResult.businessUnits?.companyName || null,
      scanResult
    );
    
    if (!accountResult.success) {
      return {
        success: false,
        error: accountResult.error || 'Failed to create account',
      };
    }
    
    // Store scan in accountPack (upsert to handle first-time creation)
    try {
      const packId = `accountPack-${accountResult.accountKey}`;
      await upsertDocument(client, {
        _type: 'accountPack',
        _id: packId,
        accountKey: accountResult.accountKey,
        canonicalUrl: finalUrl,
        payload: { scan: scanResult },
        updatedAt: new Date().toISOString(),
      });
    } catch (packErr) {
      console.warn('[createAccountFromUrl] accountPack upsert failed:', packErr?.message);
    }
    
    // Fetch the full account if not already returned
    let account = accountResult.account;
    if (!account || !account._id) {
      account = await getMasterAccount(groqQuery, client, accountResult.accountKey);
    }
    
    return {
      success: true,
      accountKey: accountResult.accountKey,
      account: account || accountResult.account,
      canonicalUrl: finalUrl,
      companyName: scanResult.businessUnits?.companyName || null,
      scanData: scanResult,
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Find or create account from company name
 * @param {string} companyName - Company name
 * @param {object} context - Execution context
 * @returns {Promise<object>}
 */
async function findOrCreateAccountFromCompany(companyName, context) {
  const { groqQuery, upsertDocument, client, handleScan, requestId, env } = context;
  
  try {
    // Search for existing account
    const searchQuery = `*[_type == "account" && (companyName match "*${companyName}*" || domain match "*${companyName}*")][0]`;
    const existingAccount = await groqQuery(client, searchQuery, {});
    
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
    
    // If not found, would need to search web for company URL
    // For now, return error suggesting URL input
    return {
      success: false,
      error: 'Company not found. Please provide a URL to scan.',
      suggestion: 'Provide the company website URL instead',
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get complete account intelligence
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object>} - Complete account intelligence
 */
export async function getCompleteAccountIntelligence(groqQuery, client, accountKey) {
  try {
    // Get master account
    const account = await getMasterAccount(groqQuery, client, accountKey);
    
    if (!account) {
      return null;
    }
    
    // Get research set
    const { getCompleteResearchSet } = await import('./enrichment-service.js');
    const researchSet = await getCompleteResearchSet(groqQuery, client, accountKey);
    
    // Get competitor research
    const competitorResearch = await getCompetitorResearch(groqQuery, client, accountKey);
    
    // Get opportunities
    const { identifyProspectingOpportunities, buildIndustryProfile } = await import('./competitor-research.js');
    const opportunities = competitorResearch ? identifyProspectingOpportunities(competitorResearch) : [];
    const industryProfile = competitorResearch ? buildIndustryProfile(competitorResearch) : null;
    
    // Get enrichment status
    const { getEnrichmentStatus } = await import('./enrichment-service.js');
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


