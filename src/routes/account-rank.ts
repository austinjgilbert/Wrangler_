/**
 * Account stack-rank: score and rank a bulk account list by intent and key insights
 * for prioritization and focus. Processes accounts one-by-one and returns a
 * sorted list with scores and breakdown.
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { calculatePriorityScore, rankAccounts, getWhyNowReasoning } from '../services/sdr-scoring-service.js';

const ACCOUNT_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  accountKey,
  companyName,
  canonicalUrl,
  rootDomain,
  domain,
  opportunityScore,
  aiReadiness,
  businessScale,
  signals,
  lastScannedAt,
  latestBriefRef,
  latestOsintReportRef,
  technologyStack
`;

const PERSON_FIELDS = `
  _id,
  name,
  currentTitle,
  title,
  linkedInUrl,
  profileUrl,
  companyName,
  currentCompany,
  relatedAccountKey,
  rootDomain,
  function,
  seniority,
  execClaimsUsed,
  teamMap
`;

const MAX_ACCOUNTS_DEFAULT = 200;

export interface StackRankBody {
  /** Explicit account keys to rank */
  accountKeys?: string[];
  /** Domains to resolve to accounts and rank (e.g. ["example.com"]) */
  domains?: string[];
  /** When no accountKeys/domains: fetch up to this many accounts from Sanity (e.g. recent) */
  limit?: number;
  /** Cap total accounts processed per request (default 200) */
  maxAccounts?: number;
  /** If true, store the ranked result in KV under accountRanking:{listId} for later retrieval */
  storeResult?: boolean;
  /** Optional name for the list (used when storeResult is true) */
  listName?: string;
}

export async function handleAccountsStackRank(
  request: Request,
  requestId: string,
  env: any
): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as StackRankBody;
    const {
      accountKeys: bodyKeys = [],
      domains: bodyDomains = [],
      limit = 50,
      maxAccounts = MAX_ACCOUNTS_DEFAULT,
      storeResult = false,
      listName,
    } = body;

    const { initSanityClient, groqQuery } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse(
        'SANITY_NOT_CONFIGURED',
        'Sanity not configured; set SANITY_PROJECT_ID and SANITY_TOKEN',
        {},
        503,
        requestId
      );
    }

    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), maxAccounts);
    const safeMax = Math.min(Math.max(1, Number(maxAccounts) || MAX_ACCOUNTS_DEFAULT), 500);

    let accounts: Array<Record<string, unknown>> = [];

    if (Array.isArray(bodyKeys) && bodyKeys.length > 0) {
      const keys = [...new Set(bodyKeys)].slice(0, safeMax).filter((k): k is string => typeof k === 'string');
      if (keys.length > 0) {
        const query = `*[_type == "account" && accountKey in $keys]{${ACCOUNT_FIELDS}}`;
        const result = await groqQuery(client, query, { keys });
        accounts = Array.isArray(result) ? result : [];
      }
    } else if (Array.isArray(bodyDomains) && bodyDomains.length > 0) {
      const domains = [...new Set(bodyDomains)]
        .slice(0, safeMax)
        .map((d) => String(d).toLowerCase().replace(/^www\./, '').trim())
        .filter(Boolean);
      if (domains.length > 0) {
        const query = `*[_type == "account" && domain in $domains]{${ACCOUNT_FIELDS}}`;
        const result = await groqQuery(client, query, { domains });
        accounts = Array.isArray(result) ? result : [];
      }
      // If any domain didn't match, try findAccountByDomain for each missing (optional)
    } else {
      const query = `*[_type == "account"] | order(_updatedAt desc)[0...${safeLimit}]{${ACCOUNT_FIELDS}}`;
      const result = await groqQuery(client, query, {});
      accounts = Array.isArray(result) ? result : [];
    }

    if (accounts.length === 0) {
      return createSuccessResponse(
        {
          ranked: [],
          total: 0,
          message: 'No accounts to rank. Provide accountKeys, domains, or ensure Sanity has accounts.',
        },
        requestId
      );
    }

    const accountKeys = accounts.map((a) => (a.accountKey as string)).filter(Boolean);
    const domains = accounts.map((a) => (a.rootDomain || a.domain) as string).filter(Boolean);

    const personsQuery = `*[_type == "person" && (relatedAccountKey in $accountKeys || rootDomain in $domains)]{${PERSON_FIELDS}}`;
    const persons = (await groqQuery(client, personsQuery, { accountKeys, domains })) as Array<Record<string, unknown>>;
    const personsByAccount: Record<string, Array<Record<string, unknown>>> = {};
    for (const p of persons || []) {
      let key = p.relatedAccountKey as string;
      if (!key) {
        const acc = accounts.find((a) => (a.rootDomain === p.rootDomain || a.domain === p.rootDomain));
        key = acc ? (acc.accountKey as string) : '';
      }
      if (key) {
        if (!personsByAccount[key]) personsByAccount[key] = [];
        personsByAccount[key].push(p);
      }
    }

    const scored: Array<{
      rank: number;
      accountKey: string;
      companyName: string;
      canonicalUrl: string;
      total: number;
      breakdown: { intent: number; proximity: number; freshness: number; fit: number; conversationLeverage: number };
      whyNow: string;
    }> = [];
    for (const account of accounts) {
      const person = personsByAccount[(account.accountKey as string)]?.[0] ?? null;
      const result = calculatePriorityScore(account as any, person as any, {});
      const whyNow = getWhyNowReasoning(result);
      scored.push({
        rank: 0,
        accountKey: result.accountKey,
        companyName: result.companyName || (account.rootDomain as string) || '',
        canonicalUrl: result.canonicalUrl || '',
        total: result.total,
        breakdown: result.breakdown,
        whyNow,
      });
    }

    const ranked = rankAccounts(scored as any);
    ranked.forEach((r: any, i: number) => {
      r.rank = i + 1;
    });

    const payload: Record<string, unknown> = {
      ranked: ranked.slice(0, safeMax),
      total: ranked.length,
    };

    if (storeResult && env.ACCOUNT_RANKING_KV) {
      const listId = listName || `stack-rank-${Date.now()}`;
      const kvKey = `accountRanking:${listId}`;
      await env.ACCOUNT_RANKING_KV.put(
        kvKey,
        JSON.stringify({
          listId,
          listName: listName || null,
          ranked: ranked.slice(0, safeMax),
          total: ranked.length,
          createdAt: new Date().toISOString(),
          requestId,
        }),
        { expirationTtl: 60 * 60 * 24 * 7 }
      );
      (payload as any).stored = { listId, kvKey };
    }

    return createSuccessResponse(payload, requestId);
  } catch (error: any) {
    return createErrorResponse(
      'STACK_RANK_ERROR',
      (error as Error).message,
      {},
      500,
      requestId
    );
  }
}
