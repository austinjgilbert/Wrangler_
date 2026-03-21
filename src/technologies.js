/**
 * Technologies Intelligence Handlers
 *
 * Three endpoints for the Technologies page rebuild:
 *   GET  /technologies/insights?accountKey=X   — read tech data + AI analysis for an account
 *   POST /technologies/analyze                 — trigger AI analysis of tech stack
 *   GET  /technologies/search?tech=X&category=Y — reverse lookup (stub, deferred to post-MVP)
 *
 * Data sources:
 *   - technology docs (_type: "technology")     — shared per-tech records (name, category, status)
 *   - account.technologies[]                    — reference array to technology docs
 *   - account.technologyStack                   — raw categorized scan data (14 category arrays)
 *   - accountPack.techAnalysisData              — JSON blob with AI-generated insights + summary
 *   - accountPack.techAnalysisIndex             — queryable index (hasTechAnalysis, lastAnalyzedAt, etc.)
 *
 * Architecture decision (2026-03-21):
 *   technology docs are source of truth for per-tech data.
 *   accountPack blob holds AI analysis only (selling angles, risk, summary).
 *   /technologies/insights reads both, merges into single response.
 */

import { createSuccessResponse, createErrorResponse } from './utils/response.js';

// ─── Constants ──────────────────────────────────────────────────────────

/**
 * Valid status values for the technology doc `status` field.
 * AI may return 'testing' — map it to 'unknown' at write time.
 * The full AI status is preserved in the techAnalysisData blob.
 */
const VALID_DOC_STATUSES = new Set(['active', 'legacy', 'unknown']);

function normalizeDocStatus(aiStatus) {
  if (VALID_DOC_STATUSES.has(aiStatus)) return aiStatus;
  // 'testing', 'at_risk', 'opportunity', etc. → 'unknown' on the doc field
  return 'unknown';
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Fetch account (with resolved technology references) + accountPack AI analysis.
 * Two parallel GROQ queries.
 */
async function fetchAccountTechData(groqQuery, client, accountKey) {
  const [account, pack] = await Promise.all([
    groqQuery(
      client,
      `*[_type == "account" && (_id == $dotId || _id == $dashId || accountKey == $key)][0]{
        _id, accountKey, companyName, domain, canonicalUrl, rootDomain,
        technologyStack,
        "technologies": technologies[]->{ _id, name, slug, category, isLegacy, isMigrationTarget, lastEnrichedAt }
      }`,
      { dotId: `account.${accountKey}`, dashId: `account-${accountKey}`, key: accountKey }
    ),
    groqQuery(
      client,
      `*[_type == "accountPack" && (_id == $dotId || _id == $dashId || accountKey == $key)][0]{
        _id, accountKey,
        techAnalysisIndex{ hasTechAnalysis, lastAnalyzedAt, stackMaturity, legacyCount, totalTechnologies },
        techAnalysisData
      }`,
      { dotId: `accountPack.${accountKey}`, dashId: `accountPack-${accountKey}`, key: accountKey }
    ),
  ]);

  let techAnalysis = null;
  if (pack?.techAnalysisData) {
    try {
      techAnalysis = JSON.parse(pack.techAnalysisData);
    } catch (e) {
      console.error(`[technologies] Failed to parse techAnalysisData for ${accountKey}:`, e);
    }
  }

  return { account, pack, techAnalysis };
}

/**
 * Build a unified technology list from resolved technology doc references
 * and the raw technologyStack scan data.
 *
 * Technology docs are authoritative (have category, isLegacy, etc.).
 * Raw technologyStack fills gaps for techs not yet linked as docs.
 */
function buildTechnologyList(account) {
  const techs = [];
  const seen = new Set(); // lowercase name dedup

  // 1. Technology doc references (authoritative)
  if (Array.isArray(account.technologies)) {
    for (const tech of account.technologies) {
      if (!tech?.name) continue;
      const key = tech.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      techs.push({
        name: tech.name,
        slug: tech.slug,
        category: tech.category || 'detected',
        isLegacy: tech.isLegacy || false,
        isMigrationTarget: tech.isMigrationTarget || false,
        source: 'enrichment',
        lastEnrichedAt: tech.lastEnrichedAt || null,
      });
    }
  }

  // 2. Raw technologyStack (fill gaps — techs detected by scan but not yet linked as docs)
  const stack = account.technologyStack;
  if (stack && typeof stack === 'object') {
    for (const [category, items] of Object.entries(stack)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const name = typeof item === 'string' ? item.trim() : item?.name?.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        techs.push({
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          category,
          isLegacy: category === 'legacySystems',
          isMigrationTarget: category === 'migrationOpportunities',
          source: 'scan',
          lastEnrichedAt: null,
        });
      }
    }
  }

  return techs;
}

/**
 * Group technologies by category for the response.
 */
function groupByCategory(technologies) {
  const groups = {};
  for (const tech of technologies) {
    const cat = tech.category || 'detected';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(tech);
  }
  return groups;
}

// ─── Handler 1: GET /technologies/insights ──────────────────────────────

/**
 * Returns technology data + AI analysis for an account.
 *
 * Merges three data sources:
 *   - technology docs (per-tech metadata: category, isLegacy, etc.)
 *   - account.technologyStack (raw scan data, fills gaps)
 *   - accountPack.techAnalysisData (AI-generated insights, if available)
 *
 * If AI analysis exists, each technology is enriched with selling angles,
 * risk assessments, etc. If not, returns raw tech data with needsAnalysis: true.
 */
export async function handleTechInsights(request, requestId, env, groqQuery, assertSanityConfigured) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');

    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey query parameter required',
        { hint: 'GET /technologies/insights?accountKey=adventhealth-com' },
        400,
        requestId
      );
    }

    const client = assertSanityConfigured(env);
    const { account, pack, techAnalysis } = await fetchAccountTechData(groqQuery, client, accountKey);

    if (!account) {
      return createErrorResponse(
        'NOT_FOUND',
        'Account not found',
        { hint: `No account with key "${accountKey}". Scan the account first.` },
        404,
        requestId
      );
    }

    const technologies = buildTechnologyList(account);
    const grouped = groupByCategory(technologies);
    const categories = Object.keys(grouped);
    const hasAnalysis = !!(techAnalysis && pack?.techAnalysisIndex?.hasTechAnalysis);

    // Merge AI insights into technology list if available
    let enrichedTechnologies = technologies;
    if (hasAnalysis && Array.isArray(techAnalysis.technologies)) {
      const insightsByName = new Map();
      for (const t of techAnalysis.technologies) {
        if (t.name) insightsByName.set(t.name.toLowerCase(), t);
      }

      enrichedTechnologies = technologies.map(tech => {
        const insight = insightsByName.get(tech.name.toLowerCase());
        if (!insight) return { ...tech, insights: null };
        return {
          ...tech,
          status: insight.status || (tech.isLegacy ? 'legacy' : 'unknown'),
          confidence: insight.confidence || 0,
          insights: {
            risk: insight.risk || [],
            opportunity: insight.opportunity || [],
            painPoints: insight.painPoints || [],
            targetPersonas: insight.targetPersonas || [],
            sellingAngle: insight.sellingAngle || null,
            competitorUsage: insight.competitorUsage || null,
          },
        };
      });
    } else {
      // No AI analysis — set basic status from doc metadata
      enrichedTechnologies = technologies.map(tech => ({
        ...tech,
        status: tech.isLegacy ? 'legacy' : tech.isMigrationTarget ? 'migration-target' : 'unknown',
        confidence: 0,
        insights: null,
      }));
    }

    const legacyCount = technologies.filter(t => t.isLegacy).length;

    return createSuccessResponse({
      accountKey: account.accountKey,
      companyName: account.companyName || account.domain,
      needsAnalysis: !hasAnalysis,
      technologies: enrichedTechnologies,
      grouped: groupByCategory(enrichedTechnologies),
      summary: hasAnalysis ? normalizeSummary(techAnalysis.stackSummary || techAnalysis.summary) : null,
      meta: {
        lastAnalyzedAt: hasAnalysis ? (pack.techAnalysisIndex.lastAnalyzedAt || techAnalysis.analyzedAt || null) : null,
        totalCount: technologies.length,
        categoryCount: categories.length,
        legacyCount: hasAnalysis ? (pack.techAnalysisIndex.legacyCount ?? legacyCount) : legacyCount,
        stackMaturity: hasAnalysis ? (pack.techAnalysisIndex.stackMaturity || null) : null,
        categories,
      },
    }, requestId);
  } catch (error) {
    console.error('[technologies/insights] Error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch technology insights',
      { hint: 'Check accountKey parameter and Sanity configuration' },
      500,
      requestId
    );
  }
}

// ─── Handler 2: POST /technologies/analyze ──────────────────────────────

/**
 * Triggers AI analysis of an account's technology stack.
 *
 * Reads technology data from account, runs LLM analysis (stubbed for now),
 * writes results to accountPack as techAnalysisIndex + techAnalysisData.
 *
 * Body: { accountKey: string, force?: boolean }
 *
 * Staleness check: hashes the raw technologyStack. If hash matches
 * existing analysis and force !== true, returns cached result.
 */
export async function handleTechAnalyze(request, requestId, env, groqQuery, upsertDocument, assertSanityConfigured, ctx) {
  try {
    const body = await request.json();
    const { accountKey, force } = body;

    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey required in request body',
        { hint: 'POST /technologies/analyze with { "accountKey": "adventhealth-com" }' },
        400,
        requestId
      );
    }

    const client = assertSanityConfigured(env);
    const { account, pack, techAnalysis } = await fetchAccountTechData(groqQuery, client, accountKey);

    if (!account) {
      return createErrorResponse(
        'NOT_FOUND',
        'Account not found',
        { hint: `No account with key "${accountKey}". Scan the account first.` },
        404,
        requestId
      );
    }

    const technologies = buildTechnologyList(account);

    if (technologies.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'No technology data available for this account. Run a scan first.',
        { hint: 'POST /enrich/queue with this accountKey to trigger a scan' },
        400,
        requestId
      );
    }

    // Staleness check: hash the raw tech stack to detect changes
    const rawStackHash = simpleHash(JSON.stringify(account.technologyStack || {}));
    const existingHash = techAnalysis?.rawStackHash;

    if (techAnalysis && pack?.techAnalysisIndex?.hasTechAnalysis && !force) {
      if (existingHash === rawStackHash) {
        return createSuccessResponse({
          accountKey,
          status: 'already_analyzed',
          lastAnalyzedAt: pack.techAnalysisIndex.lastAnalyzedAt || null,
          rawStackHash,
          message: 'Insights are current (tech stack unchanged). Pass force: true to re-analyze.',
        }, requestId);
      }
      // Stack changed — fall through to re-analyze
      console.log(`[technologies/analyze] Tech stack changed for ${accountKey} (hash ${existingHash} → ${rawStackHash}), re-analyzing`);
    }

    // ── LLM Analysis (STUB — @aiprompt will provide the real prompt) ──
    //
    // TODO: Replace with actual LLM call.
    // Real implementation will:
    //   1. Build structured prompt with tech list + company context
    //   2. Call LLM with system/user role separation (no interpolation in system prompt)
    //   3. Parse structured response
    //   4. Write techAnalysisIndex + techAnalysisData to accountPack
    //
    // For now, return stub indicating analysis was triggered.

    const analysisId = `tech-analysis-${accountKey}-${Date.now()}`;

    console.log(`[technologies/analyze] Stub: would analyze ${technologies.length} technologies for ${accountKey} (hash: ${rawStackHash})`);

    return createSuccessResponse({
      accountKey,
      status: 'analyzing',
      analysisId,
      technologiesQueued: technologies.length,
      rawStackHash,
      message: 'AI analysis triggered. Results will be available via GET /technologies/insights once complete.',
    }, requestId);
  } catch (error) {
    console.error('[technologies/analyze] Error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to trigger technology analysis',
      { hint: 'Check accountKey parameter and Sanity configuration' },
      500,
      requestId
    );
  }
}

// ─── Handler 3: GET /technologies/search (DEFERRED) ─────────────────────

/**
 * Reverse lookup: find accounts that use a specific technology.
 *
 * DEFERRED to post-MVP per @englead + @realist scope review.
 * The Technologies page doesn't need cross-account search for v1.
 *
 * When implemented, this will query technology docs + account references
 * rather than scanning all accountPacks.
 */
export async function handleTechSearch(request, requestId) {
  const url = new URL(request.url);
  const tech = url.searchParams.get('tech');
  const category = url.searchParams.get('category');

  return createSuccessResponse({
    query: { tech, category },
    accounts: [],
    total: 0,
    message: 'Cross-account technology search is coming in a future release. Use the Technologies page for per-account insights.',
  }, requestId);
}

// ─── Utilities ──────────────────────────────────────────────────────────

/**
 * Normalize the AI-generated stack summary for consistent response shape.
 * Handles migrationReadiness as either number (0-1) or string enum.
 */
function normalizeSummary(summary) {
  if (!summary) return null;
  let readiness = summary.migrationReadiness;
  if (typeof readiness === 'string') {
    const MAP = { ready: 1.0, partial: 0.5, not_ready: 0.0 };
    readiness = MAP[readiness] ?? 0.5;
  }
  return {
    stackMaturity: summary.stackMaturity || summary.maturityAssessment || null,
    migrationReadiness: typeof readiness === 'number' ? readiness : 0,
    topRisks: summary.topRisks || [],
    topOpportunities: summary.topOpportunities || [],
    overallAssessment: summary.overallAssessment || summary.maturityAssessment || '',
  };
}

/**
 * Simple string hash for staleness detection.
 * Not cryptographic — just for comparing whether tech stack changed.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return 'h' + Math.abs(hash).toString(36);
}
