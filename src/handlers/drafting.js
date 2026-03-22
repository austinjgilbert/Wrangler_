/**
 * Drafting Engine Handlers
 * Exposes draftingEngine.ts via public API endpoints for SDK consumption.
 * 
 * POST /drafting/generate  — generate email draft from action candidate
 * POST /drafting/regenerate — regenerate draft with operator feedback
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';

/**
 * Generate an email draft for an action candidate.
 * Fetches the candidate + account + person + signals from Sanity,
 * then calls generateEmailDraft from draftingEngine.ts.
 *
 * POST /drafting/generate
 * Body: { actionCandidateId: string, objective?: string, tone?: string, maxEmailWords?: number }
 */
export async function handleGenerateDraft(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const client = assertSanityConfigured(env);
    const body = await request.json().catch(() => null);

    if (!body || !body.actionCandidateId) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'actionCandidateId is required',
        { hint: 'POST body must include actionCandidateId' },
        400,
        requestId
      );
    }

    const { actionCandidateId, objective, tone, maxEmailWords } = body;

    // Fetch action candidate
    const candidate = await groqQuery(client,
      `*[_type == "actionCandidate" && _id == $id][0]`,
      { id: actionCandidateId }
    );

    if (!candidate) {
      return createErrorResponse(
        'NOT_FOUND',
        'Action candidate not found',
        { hint: 'Verify the actionCandidateId exists' },
        404,
        requestId
      );
    }

    // Fetch account and person in parallel
    const accountRef = candidate.account?._ref;
    const personRef = candidate.person?._ref;

    const [account, person, signals] = await Promise.all([
      accountRef
        ? groqQuery(client, `*[_type == "account" && _id == $id][0]`, { id: accountRef })
        : null,
      personRef
        ? groqQuery(client, `*[_type == "person" && _id == $id][0]`, { id: personRef })
        : null,
      fetchSignals(groqQuery, client, accountRef, personRef),
    ]);

    // Collect detected technologies from account
    const detectedTechnologies = collectTechnologies(account);

    // Generate draft
    const { generateEmailDraft } = await import('../lib/draftingEngine.ts');
    const draft = await generateEmailDraft(env, {
      actionCandidate: candidate,
      account,
      person,
      signals: signals || [],
      detectedTechnologies,
      objective,
      tone,
      maxEmailWords,
    });

    return createSuccessResponse(draft, requestId);

  } catch (error) {
    console.error('[DRAFTING_GENERATE] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to generate draft',
      {},
      500,
      requestId
    );
  }
}

/**
 * Regenerate a draft with operator feedback.
 * Fetches the same context as generate, plus the previous draft
 * from the candidate's existing draft data.
 *
 * POST /drafting/regenerate
 * Body: { actionCandidateId: string, operatorFeedback?: string, objective?: string, tone?: string }
 */
export async function handleRegenerateDraft(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const client = assertSanityConfigured(env);
    const body = await request.json().catch(() => null);

    if (!body || !body.actionCandidateId) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'actionCandidateId is required',
        { hint: 'POST body must include actionCandidateId' },
        400,
        requestId
      );
    }

    const { actionCandidateId, operatorFeedback, objective, tone } = body;

    // Fetch action candidate
    const candidate = await groqQuery(client,
      `*[_type == "actionCandidate" && _id == $id][0]`,
      { id: actionCandidateId }
    );

    if (!candidate) {
      return createErrorResponse(
        'NOT_FOUND',
        'Action candidate not found',
        { hint: 'Verify the actionCandidateId exists' },
        404,
        requestId
      );
    }

    // Fetch account, person, signals, and previous draft in parallel
    const accountRef = candidate.account?._ref;
    const personRef = candidate.person?._ref;

    const [account, person, signals] = await Promise.all([
      accountRef
        ? groqQuery(client, `*[_type == "account" && _id == $id][0]`, { id: accountRef })
        : null,
      personRef
        ? groqQuery(client, `*[_type == "person" && _id == $id][0]`, { id: personRef })
        : null,
      fetchSignals(groqQuery, client, accountRef, personRef),
    ]);

    const detectedTechnologies = collectTechnologies(account);

    // Extract previous draft from candidate if it exists
    const previousDraft = candidate.currentDraft || candidate.lastDraft || null;

    // Regenerate draft
    const { regenerateDraft } = await import('../lib/draftingEngine.ts');
    const draft = await regenerateDraft(env, {
      actionCandidate: candidate,
      account,
      person,
      signals: signals || [],
      detectedTechnologies,
      previousDraft,
      operatorFeedback,
      objective,
      tone,
    });

    return createSuccessResponse(draft, requestId);

  } catch (error) {
    console.error('[DRAFTING_REGENERATE] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to regenerate draft',
      {},
      500,
      requestId
    );
  }
}

/**
 * Fetch recent signals for an account and/or person.
 * Matches both account-level and person-level signals per @englead2 review.
 */
async function fetchSignals(groqQuery, client, accountRef, personRef) {
  if (!accountRef && !personRef) return [];

  // Build filter based on available refs
  let filter;
  const params = {};

  if (accountRef && personRef) {
    filter = `account._ref == $accountRef || person._ref == $personRef`;
    params.accountRef = accountRef;
    params.personRef = personRef;
  } else if (accountRef) {
    filter = `account._ref == $accountRef`;
    params.accountRef = accountRef;
  } else {
    filter = `person._ref == $personRef`;
    params.personRef = personRef;
  }

  const result = await groqQuery(client,
    `*[_type == "signalEvent" && (${filter})] | order(timestamp desc)[0...10]`,
    params
  );

  return result || [];
}

/**
 * Collect detected technologies from account data.
 * Matches the pattern used by draftingEngine's collectDetectedTechnologies.
 */
function collectTechnologies(account) {
  if (!account) return [];
  const tech = account.technologyStack || {};
  return [
    ...(account.techStack || []),
    ...(tech.cms || []),
    ...(tech.frameworks || []),
    ...(tech.legacySystems || []),
  ].filter(Boolean);
}
