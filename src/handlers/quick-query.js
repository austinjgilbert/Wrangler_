/**
 * Quick Query Handler
 * Fast, optimized queries for Sanity database
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import * as QuickQuery from '../services/sanity-quick-query.js';

/**
 * Handle quick query requests
 * GET /query/quick?type=account&key=xxx
 */
export async function handleQuickQuery(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const client = assertSanityConfigured(env);
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'account';
    const key = url.searchParams.get('key');
    const domain = url.searchParams.get('domain');
    const search = url.searchParams.get('search');
    const accountKey = url.searchParams.get('accountKey');
    
    // Trigger auto-enrichment and advance pipeline (background, non-blocking)
    const { onAccountQueried } = await import('../services/auto-enrichment-pipeline.js');
    const { autoAdvanceEnrichment } = await import('../services/enrichment-scheduler.js');
    
    let result;
    
    switch (type) {
      case 'account':
        if (accountKey) {
          result = await QuickQuery.quickGetAccount(client, groqQuery, accountKey);
          // Trigger enrichment if account exists
          if (result) {
            onAccountQueried(client, groqQuery, null, accountKey).catch(() => {});
          }
        } else if (domain) {
          result = await QuickQuery.quickGetAccountByDomain(client, groqQuery, domain);
          if (result) {
            onAccountQueried(client, groqQuery, null, result.accountKey).catch(() => {});
          }
        } else if (key) {
          result = await QuickQuery.quickGetAccount(client, groqQuery, key);
          if (result) {
            onAccountQueried(client, groqQuery, null, key).catch(() => {});
          }
        } else {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'key, accountKey, or domain required for type=account',
            {},
            400,
            requestId
          );
        }
        break;
        
      case 'pack':
        if (!accountKey && !key) {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'accountKey or key required for type=pack',
            {},
            400,
            requestId
          );
        }
        result = await QuickQuery.quickGetAccountPack(client, groqQuery, accountKey || key);
        break;
        
      case 'profile':
        if (!accountKey && !key) {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'accountKey or key required for type=profile',
            {},
            400,
            requestId
          );
        }
        result = await QuickQuery.quickGetCompleteProfile(client, groqQuery, accountKey || key);
        // Trigger enrichment if profile exists but not enriched
        if (result && result.account) {
          if (!result.isEnriched && !result.isEnriching) {
            onAccountQueried(client, groqQuery, null, result.account.accountKey).catch(() => {});
          } else if (result.isEnriching) {
            // Advance pipeline if in progress
            const { upsertDocument, patchDocument } = await import('../sanity-client.js');
            const { autoAdvanceEnrichment } = await import('../services/enrichment-scheduler.js');
            autoAdvanceEnrichment(
              groqQuery,
              upsertDocument,
              patchDocument,
              client,
              result.account.accountKey,
              {}, // handlers not needed for advance
              env,
              requestId
            ).catch(() => {});
          }
        }
        break;
        
      case 'similar':
        if (!accountKey && !key) {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'accountKey or key required for type=similar',
            {},
            400,
            requestId
          );
        }
        const limit = parseInt(url.searchParams.get('limit') || '10');
        result = await QuickQuery.quickFindSimilarAccounts(
          client,
          groqQuery,
          accountKey || key,
          { limit }
        );
        break;
        
      case 'search':
        if (!search) {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'search parameter required for type=search',
            {},
            400,
            requestId
          );
        }
        const searchLimit = parseInt(url.searchParams.get('limit') || '20');
        const minScore = url.searchParams.get('minScore') 
          ? parseInt(url.searchParams.get('minScore'))
          : null;
        result = await QuickQuery.quickSearchAccounts(
          client,
          groqQuery,
          search,
          { limit: searchLimit, minScore }
        );
        // Trigger enrichment for searched accounts (first 5)
        if (Array.isArray(result) && result.length > 0) {
          const topResults = result.slice(0, 5);
          for (const acc of topResults) {
            onAccountQueried(client, groqQuery, null, acc.accountKey).catch(() => {});
          }
        }
        break;
        
      case 'top':
        const topLimit = parseInt(url.searchParams.get('limit') || '50');
        const topMinScore = url.searchParams.get('minScore')
          ? parseInt(url.searchParams.get('minScore'))
          : 50;
        result = await QuickQuery.quickGetTopAccounts(
          client,
          groqQuery,
          { limit: topLimit, minScore: topMinScore }
        );
        break;
        
      case 'exists':
        if (!key && !domain) {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'key or domain required for type=exists',
            {},
            400,
            requestId
          );
        }
        result = await QuickQuery.quickAccountExists(
          client,
          groqQuery,
          key || domain
        );
        break;
        
      case 'enrichment-status':
        if (!accountKey && !key) {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'accountKey or key required for type=enrichment-status',
            {},
            400,
            requestId
          );
        }
        result = await QuickQuery.quickGetEnrichmentStatus(
          client,
          groqQuery,
          accountKey || key
        );
        break;
        
      case 'stale':
        const staleLimit = parseInt(url.searchParams.get('limit') || '100');
        const daysStale = parseInt(url.searchParams.get('days') || '30');
        const staleMinScore = url.searchParams.get('minScore')
          ? parseInt(url.searchParams.get('minScore'))
          : null;
        result = await QuickQuery.quickGetStaleAccounts(
          client,
          groqQuery,
          { limit: staleLimit, daysStale, minScore: staleMinScore }
        );
        break;
        
      default:
        return createErrorResponse(
          'VALIDATION_ERROR',
          `Unknown query type: ${type}`,
          { 
            supported: [
              'account', 'pack', 'profile', 'similar', 
              'search', 'top', 'exists', 'enrichment-status', 'stale'
            ],
          },
          400,
          requestId
        );
    }
    
    return createSuccessResponse({
      type,
      data: result,
      count: Array.isArray(result) ? result.length : (result ? 1 : 0),
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'QUERY_ERROR',
      'Failed to execute quick query',
      { error: error.message, stack: error.stack },
      500,
      requestId
    );
  }
}

