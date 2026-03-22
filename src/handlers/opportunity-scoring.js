/**
 * Opportunity Scoring Handler
 * Exposes opportunityEngine.ts via public API endpoint for SDK consumption.
 *
 * GET /opportunities/score           — score all active candidates (with limit)
 * GET /opportunities/score?accountKey=X — score candidates for a specific account
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import {
  rankActionCandidates,
  generateTopActionQueue,
} from '../lib/opportunityEngine.ts';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const DEFAULT_MAX_PER_ACCOUNT = 3;

/**
 * Score and rank action candidates, returning a prioritized action queue.
 *
 * Query params:
 *   accountKey  — filter to a single account's candidates (cheaper)
 *   limit       — max candidates to return (default 100, max 200)
 *   maxPerAccount — max actions per account in queue (default 3)
 *   mode        — 'queue' (default, with dailyLimit/maxPerAccount) or 'rank' (raw ranked list)
 */
export async function handleOpportunityScore(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const client = assertSanityConfigured(env);
    const url = new URL(request.url);

    const accountKey = url.searchParams.get('accountKey') || null;
    const limit = clampInt(parseInt(url.searchParams.get('limit') || '', 10) || DEFAULT_LIMIT, 1, MAX_LIMIT);
    const maxPerAccount = clampInt(parseInt(url.searchParams.get('maxPerAccount') || '', 10) || DEFAULT_MAX_PER_ACCOUNT, 1, 10);
    const mode = url.searchParams.get('mode') === 'rank' ? 'rank' : 'queue';

    // Fetch active candidates — scoped to account if provided
    const now = new Date().toISOString();
    let candidateFilter = `_type == "actionCandidate" && lifecycleStatus != "expired" && expirationTime > $now`;
    const candidateParams = { now };

    if (accountKey) {
      candidateFilter += ` && account._ref in *[_type == "account" && accountKey == $accountKey]._id`;
      candidateParams.accountKey = accountKey;
    }

    const candidates = await groqQuery(client,
      `*[${candidateFilter}] | order(updatedAt desc)[0...${limit}]`,
      candidateParams
    );

    if (!candidates || candidates.length === 0) {
      return createSuccessResponse({
        date: now.split('T')[0],
        limit,
        generatedAt: now,
        actions: [],
        totalCandidates: 0,
      }, requestId);
    }

    // Collect unique account and person refs for batch fetching
    const accountRefs = [...new Set(candidates.map(c => c.account?._ref).filter(Boolean))];
    const personRefs = [...new Set(candidates.map(c => c.person?._ref).filter(Boolean))];

    // Batch fetch accounts, people, and signals in parallel
    const [accounts, people, signals] = await Promise.all([
      accountRefs.length > 0
        ? groqQuery(client,
            `*[_type == "account" && _id in $ids]`,
            { ids: accountRefs }
          )
        : [],
      personRefs.length > 0
        ? groqQuery(client,
            `*[_type == "person" && _id in $ids]`,
            { ids: personRefs }
          )
        : [],
      accountRefs.length > 0
        ? groqQuery(client,
            `*[_type == "signalEvent" && account._ref in $accountRefs] | order(timestamp desc)[0...50]`,
            { accountRefs }
          )
        : [],
    ]);

    // Score and rank
    if (mode === 'rank') {
      const ranked = rankActionCandidates({
        candidates,
        accounts: accounts || [],
        people: people || [],
        signals: signals || [],
        now,
      });

      return createSuccessResponse({
        generatedAt: now,
        totalCandidates: candidates.length,
        actions: ranked.slice(0, limit),
      }, requestId);
    }

    // Default: queue mode with dailyLimit and maxPerAccount
    const queue = generateTopActionQueue({
      candidates,
      accounts: accounts || [],
      people: people || [],
      signals: signals || [],
      now,
      dailyLimit: limit,
      maxPerAccount,
    });

    return createSuccessResponse({
      ...queue,
      totalCandidates: candidates.length,
    }, requestId);

  } catch (error) {
    console.error('[OPPORTUNITY_SCORE] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to score opportunities',
      {},
      500,
      requestId
    );
  }
}

function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? value : min;
  return Math.round(Math.max(min, Math.min(max, n)));
}
