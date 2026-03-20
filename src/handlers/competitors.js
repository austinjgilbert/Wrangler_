/**
 * Competitor Research Handlers
 * Handles competitor discovery, research, and comparative analysis
 */

import {
  researchCompetitors,
  getCompetitorResearch,
  identifyProspectingOpportunities,
  buildIndustryProfile,
} from '../services/competitor-research.js';

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { hydratePayload } from '../lib/payload-helpers.js';

/**
 * Research competitors for account
 * POST /competitors/research
 */
export async function handleResearchCompetitors(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  patchDocument,
  assertSanityConfigured,
  getAccountData
) {
  try {
    const body = await request.json();
    const accountKey = body.accountKey;
    const canonicalUrl = body.canonicalUrl || body.url;
    
    if (!accountKey && !canonicalUrl) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Either accountKey or canonicalUrl required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Get account data
    let accountKeyFinal = accountKey;
    let account = null;
    let accountResearchSet = null;
    
    if (accountKey) {
      const accountQuery = `*[_type == "account" && (_id == $dotId || _id == $dashId || accountKey == $key)][0]`;
      account = await groqQuery(client, accountQuery, { dotId: `account.${accountKey}`, dashId: `account-${accountKey}`, key: accountKey });
      
      const packQuery = `*[_type == "accountPack" && (_id == $dotId || _id == $dashId || accountKey == $key)][0]`;
      const pack = await groqQuery(client, packQuery, { dotId: `accountPack.${accountKey}`, dashId: `accountPack-${accountKey}`, key: accountKey });
      const packPayload = hydratePayload(pack);
      accountResearchSet = packPayload.researchSet || null;
      
        // Merge scan data from accountPack into account object for competitor discovery
        if (packPayload.scan) {
          account = {
            ...account,
            ...packPayload.scan,
            domain: account?.domain || pack?.domain || accountKeyFinal,
            canonicalUrl: account?.canonicalUrl || pack?.canonicalUrl,
            companyName: account?.companyName || pack?.companyName,
          };
          console.log('Merged account data for competitor discovery:', {
            hasTechStack: !!account.technologyStack,
            hasBusinessScale: !!account.businessScale,
            hasBusinessUnits: !!account.businessUnits,
            domain: account.domain,
          });
        } else {
          console.warn('No scan data in accountPack for competitor discovery');
        }
    } else if (canonicalUrl) {
      // Generate account key and get account
      const { generateAccountKey } = await import('../services/sanity-account.js');
      accountKeyFinal = await generateAccountKey(canonicalUrl);
      
      if (accountKeyFinal) {
        const accountQuery = `*[_type == "account" && (_id == $dotId || _id == $dashId || accountKey == $key)][0]`;
        account = await groqQuery(client, accountQuery, { dotId: `account.${accountKeyFinal}`, dashId: `account-${accountKeyFinal}`, key: accountKeyFinal });
        
        const packQuery = `*[_type == "accountPack" && (_id == $dotId || _id == $dashId || accountKey == $key)][0]`;
        const pack = await groqQuery(client, packQuery, { dotId: `accountPack.${accountKeyFinal}`, dashId: `accountPack-${accountKeyFinal}`, key: accountKeyFinal });
        const packPayload2 = hydratePayload(pack);
        accountResearchSet = packPayload2.researchSet || null;
        
        // Merge scan data from accountPack into account object for competitor discovery
        if (packPayload2.scan) {
          account = {
            ...account,
            ...packPayload2.scan,
            domain: account?.domain || pack?.domain || accountKeyFinal,
            canonicalUrl: account?.canonicalUrl || pack?.canonicalUrl,
            companyName: account?.companyName || pack?.companyName,
          };
          console.log('Merged account data for competitor discovery:', {
            hasTechStack: !!account.technologyStack,
            hasBusinessScale: !!account.businessScale,
            hasBusinessUnits: !!account.businessUnits,
            domain: account.domain,
          });
        } else {
          console.warn('No scan data in accountPack for competitor discovery');
        }
      }
    }
    
    if (!account) {
      return createErrorResponse(
        'NOT_FOUND',
        'Account not found. Scan account first.',
        { accountKey: accountKeyFinal, canonicalUrl },
        404,
        requestId
      );
    }
    
    // Research competitors
    const result = await researchCompetitors(
      groqQuery,
      upsertDocument,
      client,
      accountKeyFinal,
      account,
      accountResearchSet,
      body.options || {}
    );
    
    return createSuccessResponse({
      research: result,
      competitors: result.competitors,
      comparison: result.comparison,
      opportunities: result.opportunities,
      insights: result.insights,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to research competitors',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Get competitor research for account
 * GET /competitors/research?accountKey=...
 */
export async function handleGetCompetitorResearch(
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
    
    const research = await getCompetitorResearch(groqQuery, client, accountKey);
    
    if (!research) {
      return createErrorResponse(
        'NOT_FOUND',
        'Competitor research not found. Run research first.',
        { accountKey },
        404,
        requestId
      );
    }
    
    // Identify prospecting opportunities
    const opportunities = identifyProspectingOpportunities(research);
    const industryProfile = buildIndustryProfile(research);
    
    return createSuccessResponse({
      research: research,
      opportunities: opportunities,
      industryProfile: industryProfile,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get competitor research',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Get prospecting opportunities
 * GET /competitors/opportunities?accountKey=...
 */
export async function handleGetProspectingOpportunities(
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
    
    const research = await getCompetitorResearch(groqQuery, client, accountKey);
    
    if (!research) {
      return createErrorResponse(
        'NOT_FOUND',
        'Competitor research not found. Run research first.',
        { accountKey },
        404,
        requestId
      );
    }
    
    const opportunities = identifyProspectingOpportunities(research);
    const industryProfile = buildIndustryProfile(research);
    
    return createSuccessResponse({
      opportunities: opportunities,
      industryProfile: industryProfile,
      competitorCount: research.competitors?.length || 0,
      highPriorityCount: opportunities.filter(o => o.priority === 'high').length,
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get prospecting opportunities',
      { error: error.message },
      500,
      requestId
    );
  }
}

