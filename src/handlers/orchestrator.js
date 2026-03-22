/**
 * Account Orchestrator Handlers
 * Handles automatic orchestration of all background research
 */

import {
  orchestrateAccountResearch,
  getCompleteAccountIntelligence,
} from '../services/unified-orchestrator.js';

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';

/**
 * Orchestrate complete research from single input
 * POST /research
 */
export async function handleResearch(
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
    const body = await request.json();
    const input = body.input || body.url || body.company || body.accountKey;
    const inputType = body.inputType || 
                     (body.url ? 'url' : 
                      body.company ? 'company' : 
                      body.accountKey ? 'accountKey' : 'url');
    
    if (!input) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'input, url, company, or accountKey required',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Orchestrate complete research
    const result = await orchestrateAccountResearch({
      input,
      inputType,
      context: {
        groqQuery,
        upsertDocument,
        patchDocument,
        client,
        ...handlers,
        requestId,
        env,
      },
      options: body.options || {},
    });
    
    if (result.status === 'error') {
      return createErrorResponse(
        'ORCHESTRATION_ERROR',
        result.error || 'Failed to orchestrate research',
        { result },
        500,
        requestId
      );
    }
    
    return createSuccessResponse({
      orchestration: result,
      accountKey: result.accountKey,
      canonicalUrl: result.canonicalUrl,
      companyName: result.companyName,
      status: result.status,
      stages: result.stages,
      account: result.account,
      researchSet: result.researchSet,
      competitorResearch: result.competitorResearch,
      opportunities: result.opportunities,
    }, requestId);
    
  } catch (error) {
    console.error('[ORCHESTRATE_RESEARCH] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to orchestrate research',
      {},
      500,
      requestId
    );
  }
}

/**
 * Get complete account intelligence
 * GET /research/intelligence?accountKey=...
 */
export async function handleGetIntelligence(
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
    
    const intelligence = await getCompleteAccountIntelligence(groqQuery, client, accountKey);
    
    if (!intelligence) {
      return createErrorResponse(
        'NOT_FOUND',
        'Account intelligence not found',
        { accountKey },
        404,
        requestId
      );
    }
    
    return createSuccessResponse({
      intelligence: intelligence,
      account: intelligence.account,
      researchSet: intelligence.researchSet,
      competitorResearch: intelligence.competitorResearch,
      opportunities: intelligence.opportunities,
      industryProfile: intelligence.industryProfile,
      enrichmentStatus: intelligence.enrichmentStatus,
      completeness: intelligence.completeness,
    }, requestId);
    
  } catch (error) {
    console.error('[GET_INTELLIGENCE] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get account intelligence',
      {},
      500,
      requestId
    );
  }
}

