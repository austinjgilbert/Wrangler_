/**
 * Person Intelligence Handler
 * POST /person/brief endpoint handler
 */

import { createSuccessResponse, createErrorResponse, generateRequestId, safeParseJson } from '../utils/response.js';
import { generatePersonBriefInternal } from '../services/person-intelligence-service.js';
import { createLogger } from '../utils/logger.js';

/**
 * Handle person brief generation request
 * POST /person/brief
 */
export async function handlePersonBrief(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  patchDocument,
  assertSanityConfigured,
  internalFunctions
) {
  try {
    // Parse request body
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;

    // Validate required fields
    const { name, profileUrl, companyName, companyDomain } = body;

    if (!name) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'name parameter is required',
        {},
        400,
        requestId
      );
    }

    // Validate at least one company identifier
    if (!companyName && !companyDomain && !profileUrl) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'At least one of companyName, companyDomain, or profileUrl is required',
        {},
        400,
        requestId
      );
    }

    // Validate budgets
    const crawlBudget = Math.min(Math.max(1, parseInt(body.crawlBudget) || 20), 30);
    const evidenceBudget = Math.min(Math.max(1, parseInt(body.evidenceBudget) || 6), 10);
    const mode = body.mode === 'deep' ? 'deep' : 'fast';
    const recencyDays = Math.max(1, Math.min(365, parseInt(body.recencyDays) || 365));
    const verify = body.verify !== false; // Default true
    const store = body.store !== false; // Default true

    // Validate required internal dependencies to avoid opaque 500s
    if (!internalFunctions || typeof internalFunctions.searchProvider !== 'function') {
      return createErrorResponse(
        'CONFIGURATION_ERROR',
        'Search provider not configured',
        {
          action: 'Configure search provider credentials',
          missing: ['searchProvider'],
        },
        503,
        requestId
      );
    }

    if (typeof internalFunctions.fetchWithTimeout !== 'function') {
      return createErrorResponse(
        'CONFIGURATION_ERROR',
        'Network fetch utility not configured',
        {
          action: 'Verify internal fetch utilities are available',
          missing: ['fetchWithTimeout'],
        },
        503,
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
          {
            hint: 'Sanity CMS not configured',
            missing: error.details?.missing || [],
          },
          503,
          requestId
        );
      }
      throw error;
    }

    // Build context with all internal functions
    const finalRequestId = requestId || generateRequestId();
    const logger = createLogger(finalRequestId, 'person-intelligence-handler');
    
    const context = {
      requestId: finalRequestId,
      logger, // Add structured logger for auto-enrichment
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      env,
      // Internal functions from index.js (passed via internalFunctions parameter)
      searchProvider: internalFunctions.searchProvider,
      getBrowserHeaders: internalFunctions.getBrowserHeaders,
      fetchWithTimeout: internalFunctions.fetchWithTimeout,
      readHtmlWithLimit: internalFunctions.readHtmlWithLimit,
      extractTitle: internalFunctions.extractTitle,
      cleanMainText: internalFunctions.cleanMainText,
      detectSignals: internalFunctions.detectSignals,
      extractExcerpts: internalFunctions.extractExcerpts,
      extractEntities: internalFunctions.extractEntities,
      extractClaims: internalFunctions.extractClaims,
      extractScriptSrcs: internalFunctions.extractScriptSrcs,
      extractLinkHrefs: internalFunctions.extractLinkHrefs,
      extractNavigationLinks: internalFunctions.extractNavigationLinks,
      detectTechnologyStack: internalFunctions.detectTechnologyStack,
      analyzeBusinessScale: internalFunctions.analyzeBusinessScale,
      detectBusinessUnits: internalFunctions.detectBusinessUnits,
      analyzePerformance: internalFunctions.analyzePerformance,
      calculateAIReadinessScore: internalFunctions.calculateAIReadinessScore,
      discoverPages: internalFunctions.discoverPages,
      crawlWithConcurrency: internalFunctions.crawlWithConcurrency,
      verifyClaimsInternal: internalFunctions.verifyClaimsInternal,
    };

    logger.info('Generating person brief', {
      name,
      companyName: companyName || companyDomain,
      mode,
    });

    // Call orchestration service
    const result = await generatePersonBriefInternal(
      {
        name,
        profileUrl,
        companyName,
        companyDomain,
        mode,
        recencyDays,
        crawlBudget,
        evidenceBudget,
        verify,
        store,
      },
      context
    );

    if (!result.success) {
      logger.error('Person brief generation failed', null, {
        error: result.error,
        name,
        timeout: result.timeout,
        step: result.step,
      });
      
      // Provide more helpful error message for timeouts
      if (result.timeout) {
        return createErrorResponse(
          'TIMEOUT_ERROR',
          result.error || 'Request timed out while scanning website',
          { 
            details: result,
            suggestion: result.suggestion || 'The website may be slow. Try again later or provide the company domain directly.',
            step: result.step || 'unknown',
          },
          504, // Gateway Timeout
          finalRequestId
        );
      }
      
      return createErrorResponse(
        'ORCHESTRATION_ERROR',
        result.error || 'Failed to generate person brief',
        { 
          details: result,
          step: result.step || 'unknown',
        },
        500,
        finalRequestId
      );
    }
    
    // Log successful generation with enrichment info
    if (result.personBrief?.confidenceImproved) {
      logger.info('Person brief generated with auto-enrichment', {
        name,
        enrichmentActions: result.personBrief.enrichmentActions?.length || 0,
        confidenceScore: result.personBrief.opportunityConfidence?.score || 0,
        confidenceLevel: result.personBrief.opportunityConfidence?.confidence || 'unknown',
      });
    } else {
      logger.info('Person brief generated', {
        name,
        confidenceScore: result.personBrief?.opportunityConfidence?.score || 0,
        confidenceLevel: result.personBrief?.opportunityConfidence?.confidence || 'unknown',
      });
    }

    // Fire-and-forget activity event — never blocks response
    const { emitActivityEvent } = await import('../lib/sanity.ts');
    emitActivityEvent(env, {
      eventType: 'data_write',
      status: 'completed',
      source: 'worker',
      accountKey: result.accountKey || null,
      category: 'research',
      message: `Person brief generated for ${name}`,
      data: {
        personName: name,
        personId: result.personId,
        companyName: companyName || companyDomain || null,
        confidenceScore: result.personBrief?.opportunityConfidence?.score || null,
      },
      idempotencyKey: `person-brief.${result.personId || name}.${Date.now()}`,
    }).catch(() => {});

    // Return bounded response
    return createSuccessResponse(
      {
        personId: result.personId,
        accountKey: result.accountKey,
        briefId: result.briefId,
        evidenceIds: result.evidenceIds || [],
        verificationId: result.verificationId,
        personBrief: result.personBrief,
      },
      finalRequestId
    );

  } catch (error) {
    const errorLogger = createLogger(requestId || generateRequestId(), 'person-intelligence-handler');
    errorLogger.error('Person brief handler failed', error);
    
    console.error('[PERSON_INTEL] Error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to generate person brief',
      {},
      500,
      requestId || generateRequestId()
    );
  }
}

