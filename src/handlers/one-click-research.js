/**
 * One-Click Research Handler
 * Complete research capabilities in a single request
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { orchestrateAccountResearch } from '../services/unified-orchestrator.js';
import { quickGetCompleteProfile } from '../services/sanity-quick-query.js';
import { triggerAutoEnrichment } from '../services/auto-enrichment-pipeline.js';
import { researchCompetitors } from '../services/competitor-research.js';
import { enrichWithComparison } from '../services/auto-enrichment-pipeline.js';

/**
 * Handle one-click complete research
 * POST /research/complete
 * 
 * Single endpoint that does everything:
 * - Scans account
 * - Enriches with full pipeline
 * - Researches competitors
 * - Compares accounts
 * - Returns complete intelligence
 */
export async function handleOneClickResearch(
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
    const body = await request.json().catch(() => ({}));
    const {
      input, // URL, company name, or accountKey
      inputType = 'auto', // 'url', 'domain', 'company', 'accountKey', 'auto'
      includeCompetitors = true,
      includeComparison = true,
      mode = 'fast', // 'fast' or 'deep'
      autoEnrich = true,
    } = body;

    if (!input) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'input parameter is required (URL, company name, or accountKey)',
        {},
        400,
        requestId
      );
    }

    const client = assertSanityConfigured(env);

    // Detect input type if auto
    let detectedType = inputType;
    if (inputType === 'auto') {
      if (input.includes('http://') || input.includes('https://')) {
        detectedType = 'url';
      } else if (input.includes('.')) {
        detectedType = 'domain';
      } else if (input.length === 16) {
        detectedType = 'accountKey';
      } else {
        detectedType = 'company';
      }
    }

    // Build context
    const context = {
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      requestId,
      env,
      ...handlers,
    };

    // Step 1: Orchestrate account research (scan + basic enrichment)
    // For large sites, use smart crawl strategy
    let orchestration;
    try {
      orchestration = await orchestrateAccountResearch({
        input,
        inputType: detectedType,
        context,
        options: {
          mode,
          includeEnrichment: true,
          includeCompetitors: includeCompetitors,
          crawlStrategy: 'smart', // Use smart crawl for large sites
        },
      });
    } catch (orchestrationError) {
      // If orchestration fails due to size limits, suggest OSINT
      if (orchestrationError.message?.includes('size') || orchestrationError.message?.includes('limit')) {
        const { generateAccountKey } = await import('../sanity-client.js');
        const { generateOsintSuggestion } = await import('../services/osint-scan-suggestion.js');
        const accountKey = await generateAccountKey(input);
        
        return createSuccessResponse({
          input,
          inputType: detectedType,
          error: 'SIZE_LIMIT_EXCEEDED',
          message: 'Site too large for standard crawl. OSINT scan recommended.',
          ...generateOsintSuggestion(input, accountKey),
        }, requestId);
      }
      throw orchestrationError;
    }

    if (orchestration.status === 'error') {
      return createErrorResponse(
        'RESEARCH_ERROR',
        'Failed to orchestrate research',
        { hint: orchestration.error || 'Unknown orchestration error' },
        500,
        requestId
      );
    }

    // Step 2: Trigger full enrichment if requested
    let enrichmentResult = null;
    if (autoEnrich && orchestration.accountKey && orchestration.canonicalUrl) {
      try {
        // Use the canonicalUrl to trigger enrichment
        enrichmentResult = await triggerAutoEnrichment(
          client,
          groqQuery,
          upsertDocument,
          orchestration.canonicalUrl,
          'url',
          {
            priority: mode === 'deep' ? 'high' : 'normal',
            trigger: 'one-click-research',
          }
        );
      } catch (err) {
        console.error('Enrichment trigger error:', err);
        // Continue without failing
      }
    }

    // Step 3: Get complete profile with similar accounts
    let completeProfile = null;
    let comparisonResult = null;
    
    if (orchestration.accountKey) {
      try {
        completeProfile = await quickGetCompleteProfile(
          client,
          groqQuery,
          orchestration.accountKey
        );

        // Step 4: Comparison if requested
        if (includeComparison && completeProfile.account) {
          try {
            comparisonResult = await enrichWithComparison(
              client,
              groqQuery,
              upsertDocument,
              orchestration.accountKey
            );
          } catch (err) {
            console.error('Comparison error:', err);
          }
        }
      } catch (err) {
        console.error('Profile fetch error:', err);
      }
    }

    // Build comprehensive response
    const result = {
      input,
      inputType: detectedType,
      accountKey: orchestration.accountKey,
      canonicalUrl: orchestration.canonicalUrl,
      companyName: orchestration.companyName,
      
      // Account data
      account: orchestration.account || completeProfile?.account || null,
      
      // Research data
      researchSet: orchestration.researchSet || null,
      
      // Competitor research
      competitors: orchestration.competitorResearch || null,
      
      // Complete profile
      profile: completeProfile || null,
      
      // Comparison data
      comparison: comparisonResult?.comparison || completeProfile?.similarAccounts || null,
      
      // Enrichment status
      enrichment: {
        triggered: enrichmentResult?.triggered || false,
        jobId: enrichmentResult?.jobId || null,
        status: enrichmentResult?.status || null,
        isEnriched: completeProfile?.isEnriched || false,
        isEnriching: completeProfile?.isEnriching || false,
      },
      
      // Opportunities
      opportunities: orchestration.opportunities || [],
      
      // Metadata
      metadata: {
        mode,
        includeCompetitors,
        includeComparison,
        autoEnrich,
        timestamp: new Date().toISOString(),
      },
    };

    // ── Activity event: research complete ───────────────────────────
    const { emitActivityEvent } = await import('../lib/sanity.ts');
    emitActivityEvent(env, {
      eventType: 'system',
      status: 'completed',
      source: 'worker',
      accountKey: orchestration.accountKey || null,
      category: 'research',
      message: `Research completed for ${orchestration.accountKey || input}`,
      data: {
        input,
        inputType: detectedType,
        mode,
        includeCompetitors,
        enrichmentTriggered: enrichmentResult?.triggered || false,
        opportunityCount: orchestration.opportunities?.length || 0,
      },
      idempotencyKey: `research.complete.${orchestration.accountKey || input}.${Date.now()}`,
    }).catch((err) => {
      console.error('[RESEARCH_COMPLETE] Activity event failed (non-blocking):', err?.message);
    });

    return createSuccessResponse(result, requestId);

  } catch (error) {
    console.error('[ONE_CLICK_RESEARCH] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to complete one-click research',
      {},
      500,
      requestId
    );
  }
}

/**
 * Handle quick account lookup with auto-enrichment
 * GET /research/quick?domain=xxx or ?accountKey=xxx
 */
export async function handleQuickResearch(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const client = assertSanityConfigured(env);
    const url = new URL(request.url);
    
    const domain = url.searchParams.get('domain');
    const accountKey = url.searchParams.get('accountKey');
    const urlParam = url.searchParams.get('url');
    
    const identifier = accountKey || domain || urlParam;
    
    if (!identifier) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'domain, accountKey, or url parameter required',
        {},
        400,
        requestId
      );
    }

    // Get complete profile
    const { quickGetCompleteProfile } = await import('../services/sanity-quick-query.js');
    let profile;
    
    if (accountKey) {
      profile = await quickGetCompleteProfile(client, groqQuery, accountKey);
    } else {
      // Resolve accountKey from domain/url
      const { quickGetAccountByDomain } = await import('../services/sanity-quick-query.js');
      const { generateAccountKey, normalizeCanonicalUrl } = await import('../sanity-client.js');
      
      const canonicalUrl = urlParam ? normalizeCanonicalUrl(urlParam) : `https://${domain}`;
      const key = await generateAccountKey(canonicalUrl);
      profile = await quickGetCompleteProfile(client, groqQuery, key);
    }

    if (!profile || !profile.account) {
      return createErrorResponse(
        'NOT_FOUND',
        'Account not found. Try scanning first with /scan',
        { identifier },
        404,
        requestId
      );
    }

    // Trigger enrichment if not enriched
    let enrichmentTriggered = false;
    if (!profile.isEnriched && !profile.isEnriching) {
      const { triggerAutoEnrichment } = await import('../services/auto-enrichment-pipeline.js');
      const { upsertDocument } = await import('../sanity-client.js');
      
      try {
        const result = await triggerAutoEnrichment(
          client,
          groqQuery,
          upsertDocument,
          profile.account.accountKey,
          'accountKey',
          { priority: 'normal', trigger: 'quick-research' }
        );
        enrichmentTriggered = result.triggered || false;
      } catch (err) {
        console.error('Enrichment trigger error:', err);
      }
    }

    return createSuccessResponse({
      account: profile.account,
      pack: profile.pack,
      enrichment: profile.enrichment,
      similarAccounts: profile.similarAccounts,
      isEnriched: profile.isEnriched,
      isEnriching: profile.isEnriching,
      enrichmentTriggered,
    }, requestId);

  } catch (error) {
    console.error('[QUICK_RESEARCH] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get quick research',
      {},
      500,
      requestId
    );
  }
}
