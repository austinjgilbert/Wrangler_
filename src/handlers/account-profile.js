/**
 * Account Profile Handler
 * GET /account/profile?accountKey=...
 *
 * Unified read surface for a single account. Returns everything we know:
 *   - Account identity & scores
 *   - Research data (brief, tech stack, leadership, competitors)
 *   - OSINT intelligence (year-ahead report, hiring signals, news)
 *   - Completeness analysis with gap list
 *   - Enrichment job status
 *   - Refresh metadata (staleness, next refresh)
 *   - Actionable hint for agents
 *
 * Uses a single consolidated GROQ query (4 doc types in 1 call) via CDN
 * for cache-friendly reads. Follows the intelligence-dashboard.js pattern.
 *
 * Sprint 8 Lane 1 — @deploymentcloud
 * AX review: @agentspeak (hint field, significance scoring)
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { analyseCompleteness, needsBackgroundWork, getRefreshIntervalDays } from '../services/account-completeness.js';
import { hydratePayload } from '../lib/payload-helpers.js';

// ─── Staleness thresholds (days) ────────────────────────────────────────
const STALE_DAYS = 90;

/**
 * GET /account/profile?accountKey=<key>
 *
 * @param {Request} request
 * @param {string} requestId
 * @param {object} env
 * @param {Function} groqQueryCached - CDN-backed GROQ query
 * @param {Function} assertSanityConfigured
 */
export async function handleAccountProfile(
  request,
  requestId,
  env,
  groqQueryCached,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');

    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey parameter is required',
        { hint: 'Pass ?accountKey=<key> to identify the account' },
        400,
        requestId
      );
    }

    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      if (error.code === 'SANITY_NOT_CONFIGURED') {
        return createErrorResponse(
          'CONFIG_ERROR',
          'Sanity CMS not configured',
          { hint: 'Set SANITY_PROJECT_ID and SANITY_TOKEN secrets' },
          503,
          requestId
        );
      }
      throw error;
    }

    // ── Single consolidated GROQ query ──────────────────────────────────
    // Fetches account + accountPack + enrichmentJob + osintReport in 1 call.
    // Uses CDN (groqQueryCached) — responses may be up to ~60s stale.
    const data = await getProfileData(groqQueryCached, client, accountKey);

    const account = data.account;
    if (!account) {
      return createErrorResponse(
        'NOT_FOUND',
        'Account not found',
        { hint: 'No account found for the given accountKey' },
        404,
        requestId
      );
    }

    const accountPack = data.accountPack || null;
    const enrichmentJob = data.enrichmentJob || null;
    const osintReport = data.osintReport || null;
    const persons = data.persons || [];

    // ── Completeness analysis ───────────────────────────────────────────
    const completeness = analyseCompleteness(account, accountPack, enrichmentJob);
    const backgroundWork = needsBackgroundWork(account, accountPack, enrichmentJob);

    // ── Build research section from accountPack payload ─────────────────
    const payload = hydratePayload(accountPack);
    const research = buildResearchSection(account, payload, persons);

    // ── Build OSINT section ─────────────────────────────────────────────
    const osint = buildOsintSection(osintReport, payload);

    // ── Enrichment status ───────────────────────────────────────────────
    const enrichment = buildEnrichmentStatus(enrichmentJob);

    // ── Refresh metadata ────────────────────────────────────────────────
    const refresh = buildRefreshMeta(account);

    // ── Data age per dimension ──────────────────────────────────────────
    const meta = buildMeta(account, accountPack, osintReport);

    // ── Actionable hint for agents ──────────────────────────────────────
    const hint = buildHint(completeness, backgroundWork, refresh);

    return createSuccessResponse({
      account: {
        accountKey: account.accountKey,
        companyName: account.companyName,
        domain: account.domain,
        canonicalUrl: account.canonicalUrl,
        industry: account.industry,
        classification: account.classification,
        tags: account.tags || [],
        opportunityScore: account.opportunityScore,
        aiReadiness: account.aiReadiness,
        performance: account.performance,
        businessScale: account.businessScale,
      },
      completeness: {
        score: completeness.score,
        gaps: completeness.gaps,
        nextStages: completeness.nextStages,
        dimensions: completeness.dimensions,
      },
      enrichment,
      research,
      osint,
      refresh,
      meta,
      hint,
    }, requestId);

  } catch (error) {
    console.error(`[${requestId}] Account profile failed:`, error);
    return createErrorResponse(
      'PROFILE_ERROR',
      'Failed to load account profile',
      { hint: 'Profile query or builder function failed' },
      500,
      requestId
    );
  }
}

// ─── Query ──────────────────────────────────────────────────────────────

/**
 * Single consolidated GROQ query — 5 doc types in 1 API call.
 *
 * Fetches:
 *   1. account (identity, scores, relationships)
 *   2. accountPack (research payload — scan, brief, evidence, etc.)
 *   3. enrichmentJob (latest pipeline job status — queries both enrich.job + legacy enrichmentJob)
 *   4. osintReport (latest year-ahead intelligence report)
 *   5. persons (leadership team linked to this account)
 */
async function getProfileData(groqQueryCached, client, accountKey) {
  const query = `{
    "account": *[_type == "account" && accountKey == $accountKey][0] {
      _id, accountKey, domain, companyName, canonicalUrl,
      industry, classification, tags,
      technologyStack, technologies,
      opportunityScore, aiReadiness, performance, businessScale,
      leadership, painPoints, competitors, competitorResearch,
      benchmarks, signals,
      profileCompleteness,
      lastScannedAt, lastEnrichedAt,
      createdAt, _updatedAt
    },
    "accountPack": *[_type == "accountPack" && accountKey == $accountKey][0] {
      _id, accountKey,
      payloadIndex,
      payloadData,
      payload,
      _updatedAt
    },
    "enrichmentJob": *[_type in ["enrich.job", "enrichmentJob"] && accountKey == $accountKey] | order(_updatedAt desc)[0] {
      _id, accountKey, status, currentStage,
      completedStages, failedStages,
      priority, startedAt, _updatedAt
    },
    "osintReport": *[_type == "osintReport" && accountKey == $accountKey] | order(_createdAt desc)[0] {
      _id, accountKey, mode, year,
      executiveSummary, keyFindings, strategicRecommendations,
      industryTrends, competitiveLandscape,
      hiringSignals, newsInsights, initiatives,
      generatedAt, _createdAt, _updatedAt
    },
    "persons": *[_type == "person" && relatedAccountKey == $accountKey] | order(seniorityLevel desc) {
      _id, personKey, name, title, linkedinUrl,
      roleCategory, seniorityLevel, isDecisionMaker,
      _updatedAt
    }
  }`;

  return await groqQueryCached(client, query, { accountKey }) || {};
}

// ─── Builder Functions ──────────────────────────────────────────────────

function buildResearchSection(account, payload, persons) {
  // Brief
  const brief = payload.brief || payload.researchSet?.brief || null;
  const briefSummary = brief ? {
    executiveSummary: brief.executiveSummary || brief.summary || null,
    keyFindings: brief.keyFindings || brief.findings || [],
    generatedAt: brief.generatedAt || brief._createdAt || null,
  } : null;

  // Tech stack (from account directly)
  const techStack = account.technologyStack || null;

  // Leadership (from person docs)
  const leadership = persons.map(p => ({
    name: p.name,
    title: p.title,
    linkedinUrl: p.linkedinUrl || null,
    roleCategory: p.roleCategory || null,
    seniorityLevel: p.seniorityLevel || null,
    isDecisionMaker: p.isDecisionMaker || false,
  }));

  // Competitors
  const competitors = account.competitorResearch || account.competitors || null;

  // Pain points
  const painPoints = account.painPoints || [];

  // Benchmarks
  const benchmarks = account.benchmarks || null;

  return {
    brief: briefSummary,
    techStack,
    leadership,
    competitors,
    painPoints,
    benchmarks,
  };
}

function buildOsintSection(osintReport, payload) {
  if (!osintReport) {
    return {
      yearAhead: null,
      hiringSignals: [],
      newsInsights: [],
      initiatives: [],
    };
  }

  return {
    yearAhead: {
      executiveSummary: osintReport.executiveSummary || null,
      keyFindings: osintReport.keyFindings || [],
      strategicRecommendations: osintReport.strategicRecommendations || [],
      industryTrends: osintReport.industryTrends || [],
      competitiveLandscape: osintReport.competitiveLandscape || null,
      generatedAt: osintReport.generatedAt || osintReport._createdAt || null,
    },
    hiringSignals: osintReport.hiringSignals || [],
    newsInsights: osintReport.newsInsights || [],
    initiatives: osintReport.initiatives || [],
  };
}

function buildEnrichmentStatus(enrichmentJob) {
  if (!enrichmentJob) {
    return { status: 'none', jobId: null, lastUpdatedAt: null };
  }

  return {
    status: enrichmentJob.status || 'unknown',
    jobId: enrichmentJob._id,
    currentStage: enrichmentJob.currentStage || null,
    completedStages: enrichmentJob.completedStages || [],
    failedStages: enrichmentJob.failedStages || [],
    startedAt: enrichmentJob.startedAt || null,
    lastUpdatedAt: enrichmentJob._updatedAt || null,
  };
}

function buildRefreshMeta(account) {
  const lastScannedAt = account.lastScannedAt || null;
  const lastEnrichedAt = account.lastEnrichedAt || null;

  // Determine staleness
  const isStale = !lastScannedAt || isOlderThan(lastScannedAt, STALE_DAYS);

  // Refresh interval based on opportunity score (shared with cron refresh)
  const intervalDays = getRefreshIntervalDays(account.opportunityScore || 0);

  // Calculate next refresh
  const baseDate = lastScannedAt || lastEnrichedAt || account._updatedAt;
  const nextRefreshAt = baseDate
    ? new Date(new Date(baseDate).getTime() + intervalDays * 86400000).toISOString()
    : null;

  return {
    lastScannedAt,
    lastEnrichedAt,
    isStale,
    refreshInterval: `${intervalDays}d`,
    nextRefreshAt,
  };
}

function buildMeta(account, accountPack, osintReport) {
  const now = Date.now();

  const ageInDays = (dateStr) => {
    if (!dateStr) return null;
    const ms = now - new Date(dateStr).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const days = Math.floor(ms / 86400000);
    return days === 0 ? '<1d' : `${days}d`;
  };

  const sources = ['website'];
  if (accountPack) sources.push('enrichment');
  if (osintReport) sources.push('osint');
  // Check for LinkedIn data
  const payload = hydratePayload(accountPack);
  if (payload.linkedin || payload.researchSet?.linkedin) sources.push('linkedin');

  return {
    dataAge: {
      scan: ageInDays(account.lastScannedAt),
      enrichment: ageInDays(account.lastEnrichedAt),
      osint: ageInDays(osintReport?._createdAt),
      account: ageInDays(account._updatedAt),
    },
    sources,
  };
}

/**
 * Generate an actionable hint for agents.
 * Bridges "here's the data" → "here's your next action."
 * AX recommendation from @agentspeak.
 */
function buildHint(completeness, backgroundWork, refresh) {
  const { score, gaps } = completeness;

  // Perfect score
  if (score >= 100) {
    if (refresh.isStale) {
      return `Profile complete. Data is stale (last scan: ${refresh.lastScannedAt || 'never'}). Consider triggering a refresh.`;
    }
    return `Profile complete. Next refresh scheduled ${refresh.nextRefreshAt ? `around ${refresh.nextRefreshAt.split('T')[0]}` : 'based on activity'}.`;
  }

  // Has gaps
  const gapLabels = gaps.slice(0, 3).join(', ');
  const moreCount = gaps.length > 3 ? ` (+${gaps.length - 3} more)` : '';

  if (backgroundWork.needed) {
    return `Profile ${score}% complete. Missing: ${gapLabels}${moreCount}. Call POST /account/ensure-enriched to fill gaps.`;
  }

  // Enrichment already running
  if (!backgroundWork.needed && backgroundWork.reason?.includes('in progress')) {
    return `Profile ${score}% complete. Enrichment already in progress. Check back shortly.`;
  }

  return `Profile ${score}% complete. Missing: ${gapLabels}${moreCount}.`;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function isOlderThan(dateStr, days) {
  if (!dateStr) return true;
  const ts = new Date(dateStr).getTime();
  if (!Number.isFinite(ts)) return true;
  return ts < Date.now() - days * 86400000;
}
