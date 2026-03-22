/**
 * Ensure Enriched Handler
 * POST /account/ensure-enriched
 *
 * Guarantees an account's profile is complete (or being completed).
 * Checks current completeness, triggers gap-fill if needed, returns status.
 *
 * Idempotent: if enrichment is already in progress, returns existing job.
 * If profile is already complete, returns completeness score with no work triggered.
 *
 * Sprint 8 Lane 2 — @workerbuilder
 * Depends on: account-completeness.js (shared with Lane 1 /account/profile)
 *             gap-fill-orchestrator.js (existing, battle-tested, 10+ callers)
 */

import { createSuccessResponse, createErrorResponse, safeParseJson } from '../utils/response.js';
import { analyseCompleteness, needsBackgroundWork } from '../services/account-completeness.js';

/**
 * POST /account/ensure-enriched
 *
 * Body: { accountKey: string, force?: boolean }
 *
 * @param {Request} request
 * @param {string} requestId
 * @param {object} env
 * @param {Function} groqQuery - Fresh query (not cached — data may have just been created)
 * @param {Function} assertSanityConfigured
 */
export async function handleEnsureEnriched(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    // ── Parse & validate ──────────────────────────────────────────────
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;

    const { accountKey, force = false } = body;

    if (!accountKey || typeof accountKey !== 'string') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey is required',
        { hint: 'POST with { "accountKey": "<key>" }' },
        400,
        requestId
      );
    }

    // ── Sanity client ─────────────────────────────────────────────────
    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      if (error.code === 'SANITY_NOT_CONFIGURED') {
        return createErrorResponse(
          'CONFIG_ERROR',
          'Sanity CMS not configured',
          { hint: 'Sanity CMS not configured' },
          503,
          requestId
        );
      }
      throw error;
    }

    // ── Load current state ────────────────────────────────────────────
    // Use fresh groqQuery (not cached) — caller may have just created the account
    const [account, accountPack, enrichmentJob] = await Promise.all([
      safeQuery(groqQuery, client,
        `*[_type == "account" && accountKey == $key][0]`,
        { key: accountKey }),
      safeQuery(groqQuery, client,
        `*[_type == "accountPack" && accountKey == $key][0]`,
        { key: accountKey }),
      safeQuery(groqQuery, client,
        `*[_type in ["enrich.job", "enrichmentJob"] && accountKey == $key && status in ["pending","in_progress"]] | order(_updatedAt desc)[0]`,
        { key: accountKey }),
    ]);

    if (!account) {
      return createErrorResponse(
        'NOT_FOUND',
        'Account not found',
        { hint: 'No account found for the given accountKey' },
        404,
        requestId
      );
    }

    // ── Completeness analysis ─────────────────────────────────────────
    const completeness = analyseCompleteness(account, accountPack, enrichmentJob);
    const work = needsBackgroundWork(account, accountPack, enrichmentJob);

    // ── Enrichment already running ──────────────────────────────────────
    // Check this before "already complete" — an in-progress job means
    // work is happening even if the score is high.
    const hasActiveJob = enrichmentJob &&
      ['pending', 'in_progress'].includes(enrichmentJob.status);

    if (hasActiveJob && !force) {
      return createSuccessResponse({
        ensured: true,
        action: 'in_progress',
        completeness: {
          score: completeness.score,
          gaps: completeness.gaps,
        },
        jobId: enrichmentJob._id,
        currentStage: enrichmentJob.currentStage || null,
      }, requestId);
    }

    // ── Already complete and not forced ───────────────────────────────
    if (!work.needed && !force) {
      return createSuccessResponse({
        ensured: true,
        action: 'already_complete',
        completeness: {
          score: completeness.score,
          gaps: completeness.gaps,
        },
      }, requestId);
    }

    // ── Trigger gap-fill ──────────────────────────────────────────────
    const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');

    const result = await triggerGapFill({
      env,
      accountKey,
      canonicalUrl: account.canonicalUrl,
      domain: account.domain,
      trigger: force ? 'ensure_enriched_force' : 'ensure_enriched',
    });

    if (!result.triggered) {
      // Gap-fill decided not to trigger (e.g., job already exists, or URL unresolvable)
      // SECURITY: result.reason is passed to the client. All gap-fill return paths
      // currently use static strings. If adding new return paths to triggerGapFill()
      // or needsBackgroundWork(), never include error.message in the reason field.
      return createSuccessResponse({
        ensured: true,
        action: 'no_action',
        reason: result.reason,
        completeness: {
          score: completeness.score,
          gaps: completeness.gaps,
        },
        jobId: result.jobId || null,
      }, requestId);
    }

    return createSuccessResponse({
      ensured: true,
      action: 'triggered',
      completeness: {
        score: result.currentScore ?? completeness.score,
        gaps: completeness.gaps,
      },
      jobId: result.jobId,
      priority: result.priority,
      stages: result.stages,
    }, requestId);

  } catch (error) {
    console.error(`[${requestId}] ensure-enriched failed:`, error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to ensure account enrichment',
      { hint: 'Enrichment check or trigger failed' },
      500,
      requestId
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function safeQuery(groqQuery, client, query, params) {
  try {
    return await groqQuery(client, query, params);
  } catch {
    return null;
  }
}
