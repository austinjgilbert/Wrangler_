/**
 * Auto-Enrichment Pipeline Service
 * Automatically enriches accounts in the background when they're accessed
 * Runs non-blocking, builds complete profiles, compares to similar accounts
 */

import { queueEnrichmentJob, getActiveEnrichmentJob } from './enrichment-service.js';
import { quickAccountExists, quickGetCompleteProfile } from './sanity-quick-query.js';
import { generateAccountKey, normalizeCanonicalUrl } from '../sanity-client.js';

/**
 * Trigger auto-enrichment for an account (non-blocking)
 * Called automatically when accounts are searched/scanned/queried
 */
export async function triggerAutoEnrichment(
  client,
  groqQuery,
  upsertDocument,
  identifier,
  identifierType = 'auto',
  options = {}
) {
  try {
    // Resolve account key from identifier
    let accountKey;
    let canonicalUrl;
    
    if (identifierType === 'auto') {
      // Try to detect type
      if (identifier.includes('http://') || identifier.includes('https://')) {
        canonicalUrl = normalizeCanonicalUrl(identifier);
        accountKey = await generateAccountKey(canonicalUrl);
      } else if (identifier.includes('.')) {
        // Looks like a domain
        canonicalUrl = `https://${identifier}`;
        accountKey = await generateAccountKey(canonicalUrl);
      } else {
        // Assume it's an accountKey
        accountKey = identifier;
        const account = await quickAccountExists(client, groqQuery, accountKey);
        if (account && account.domain) {
          canonicalUrl = `https://${account.domain}`;
        }
      }
    } else if (identifierType === 'url') {
      canonicalUrl = normalizeCanonicalUrl(identifier);
      accountKey = await generateAccountKey(canonicalUrl);
    } else if (identifierType === 'domain') {
      canonicalUrl = `https://${identifier}`;
      accountKey = await generateAccountKey(canonicalUrl);
    } else {
      accountKey = identifier;
      const account = await quickAccountExists(client, groqQuery, accountKey);
      if (account && account.domain) {
        canonicalUrl = `https://${account.domain}`;
      }
    }
    
    if (!accountKey || !canonicalUrl) {
      return { triggered: false, reason: 'Could not resolve account' };
    }
    
    // Check if enrichment already in progress or recently completed
    const existingJob = await getActiveEnrichmentJob(groqQuery, client, accountKey);
    if (existingJob) {
      return { 
        triggered: false, 
        reason: 'Enrichment already in progress',
        jobId: existingJob.jobId,
        status: existingJob.status,
      };
    }
    
    // Check if account is already well-enriched (completed in last 7 days)
    const profile = await quickGetCompleteProfile(client, groqQuery, accountKey);
    if (profile.isEnriched && profile.enrichment) {
      const enrichedDate = new Date(profile.enrichment.updatedAt);
      const daysSince = (Date.now() - enrichedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        return { 
          triggered: false, 
          reason: 'Recently enriched',
          daysSince: Math.floor(daysSince),
        };
      }
    }
    
    // Queue enrichment job (non-blocking)
    const result = await queueEnrichmentJob(
      groqQuery,
      upsertDocument,
      client,
      canonicalUrl,
      accountKey,
      {
        auto: true,
        priority: options.priority || 'normal',
        ...options,
      }
    );
    
    // Return immediately (enrichment will be processed by scheduler or on next access)
    return {
      triggered: true,
      jobId: result.jobId,
      accountKey,
      canonicalUrl,
      status: result.status,
    };
    
  } catch (error) {
    // Don't fail the main request if enrichment fails
    console.error('Auto-enrichment trigger error:', error);
    return { 
      triggered: false, 
      reason: 'Enrichment trigger failed',
      error: error.message,
    };
  }
}

/**
 * Execute first stage of enrichment immediately (non-blocking)
 * Helps kickstart the pipeline
 */
export async function kickstartEnrichment(
  client,
  groqQuery,
  upsertDocument,
  patchDocument,
  accountKey,
  handlers,
  env,
  requestId
) {
  try {
    // Get active job
    const activeJob = await getActiveEnrichmentJob(groqQuery, client, accountKey);
    
    if (!activeJob || activeJob.status === 'complete') {
      return { started: false };
    }
    
    // Execute first stage
    const { executeEnrichmentPipeline } = await import('./enrichment-executor.js');
    const context = {
      ...handlers,
      requestId: requestId || `kickstart-${Date.now()}`,
      env,
    };
    
    const result = await executeEnrichmentPipeline(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      activeJob._id,
      context,
      { maxStagesPerRun: 1, delayBetweenStages: 0 }
    );
    
    return {
      started: result.success,
      progress: result.progress,
    };
    
  } catch (error) {
    console.error('Kickstart enrichment error:', error);
    return { started: false, error: error.message };
  }
}

/**
 * Hook: Called after account scan
 * Automatically triggers enrichment if account is new or stale
 */
export async function onAccountScanned(
  client,
  groqQuery,
  upsertDocument,
  canonicalUrl,
  accountKey,
  scanData
) {
  // Check if account needs enrichment
  const account = await quickAccountExists(client, groqQuery, accountKey);
  
  // Trigger enrichment for:
  // 1. New accounts (first scan)
  // 2. Accounts without recent enrichment
  // 3. High-opportunity accounts
  
  const shouldEnrich = !account || 
                       !account.lastScannedAt ||
                       (scanData?.technologyStack?.opportunityScore || 0) >= 50;
  
  if (shouldEnrich) {
    // Trigger in background (non-blocking)
    triggerAutoEnrichment(
      client,
      groqQuery,
      upsertDocument,
      accountKey,
      'accountKey',
      { 
        priority: (scanData?.technologyStack?.opportunityScore || 0) >= 70 ? 'high' : 'normal',
        trigger: 'scan',
      }
    ).catch(err => {
      console.error('Background enrichment trigger failed:', err);
    });
  }
}

/**
 * Hook: Called when account is queried/searched
 * Triggers enrichment if account exists but is not enriched
 */
export async function onAccountQueried(
  client,
  groqQuery,
  upsertDocument,
  identifier
) {
  // Check if account exists
  const account = await quickAccountExists(client, groqQuery, identifier);
  
  if (!account) {
    // Account doesn't exist - don't enrich yet (wait for scan)
    return;
  }
  
  // Check enrichment status
  const profile = await quickGetCompleteProfile(client, groqQuery, account.accountKey);
  
  if (!profile.isEnriched && !profile.isEnriching) {
    // Trigger enrichment for accessed but not enriched accounts
    triggerAutoEnrichment(
      client,
      groqQuery,
      upsertDocument,
      account.accountKey,
      'accountKey',
      { 
        priority: 'normal',
        trigger: 'query',
      }
    ).catch(err => {
      console.error('Background enrichment trigger failed:', err);
    });
  }
}

/**
 * Batch enrichment: Enrich multiple accounts in background
 */
export async function batchAutoEnrich(
  client,
  groqQuery,
  upsertDocument,
  identifiers,
  options = {}
) {
  const results = [];
  
  for (const identifier of identifiers) {
    try {
      const result = await triggerAutoEnrichment(
        client,
        groqQuery,
        upsertDocument,
        identifier,
        'auto',
        options
      );
      results.push({ identifier, ...result });
      
      // Small delay between triggers to avoid rate limits
      if (options.delayBetween) {
        await new Promise(resolve => setTimeout(resolve, options.delayBetween));
      }
    } catch (error) {
      results.push({ 
        identifier, 
        triggered: false, 
        error: error.message 
      });
    }
  }
  
  return {
    total: identifiers.length,
    triggered: results.filter(r => r.triggered).length,
    skipped: results.filter(r => !r.triggered && !r.error).length,
    errors: results.filter(r => r.error).length,
    results,
  };
}

/**
 * Enrichment comparison: Compare account to similar accounts
 * Runs automatically during enrichment pipeline
 */
export async function enrichWithComparison(
  client,
  groqQuery,
  upsertDocument,
  accountKey
) {
  const { quickGetCompleteProfile, quickFindSimilarAccounts } = await import('./sanity-quick-query.js');
  
  // Get account profile
  const profile = await quickGetCompleteProfile(client, groqQuery, accountKey);
  
  if (!profile.account) {
    return { success: false, reason: 'Account not found' };
  }
  
  // Find similar accounts
  const similar = await quickFindSimilarAccounts(
    client,
    groqQuery,
    accountKey,
    { limit: 10, minSimilarity: 0.3 }
  );
  
  if (similar.length === 0) {
    return { 
      success: true, 
      comparison: { 
        hasSimilar: false,
        similarCount: 0,
      },
    };
  }
  
  // Build comparison insights
  const comparison = {
    hasSimilar: true,
    similarCount: similar.length,
    topSimilar: similar.slice(0, 5).map(acc => ({
      accountKey: acc.accountKey,
      companyName: acc.companyName,
      domain: acc.domain,
      opportunityScore: acc.opportunityScore,
      aiReadiness: acc.aiReadiness?.score,
      sharedSignals: profile.account.signals?.filter(s => 
        acc.signals?.includes(s)
      ).length || 0,
    })),
    averageOpportunityScore: similar.reduce((sum, acc) => 
      sum + (acc.opportunityScore || 0), 0
    ) / similar.length,
    averageAIReadiness: similar.reduce((sum, acc) => 
      sum + (acc.aiReadiness?.score || 0), 0
    ) / similar.length,
  };
  
  // Store comparison in account document
  const { patchDocument } = await import('../sanity-client.js');
  await patchDocument(client, profile.account._id, {
    set: {
      similarAccounts: comparison.topSimilar,
      comparisonMetadata: {
        lastCompared: new Date().toISOString(),
        similarCount: similar.length,
      },
    },
  });
  
  return {
    success: true,
    comparison,
  };
}

