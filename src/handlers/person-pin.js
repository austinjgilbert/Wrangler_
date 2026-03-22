/**
 * Person Contact Pin Override Handler
 *
 * PATCH /person/pin-contact
 * Body: { personId: string, field: "contactEmails" | "contactPhones", value: string }
 *
 * Sets `userPinned: true` on the matching contact entry, clears it on all others
 * in that array, recomputes consensus (scores + isPrimary), and syncs the legacy
 * flat email/phone field from the new primary.
 *
 * Uses computeContactConsensus() as the single code path for scoring — no
 * duplicated logic.
 *
 * @module person-pin
 */

import { computeContactConsensus } from '../lib/contactConsensus.js';

/**
 * Handle pin-contact request.
 *
 * @param {Request} request - Incoming request
 * @param {string} requestId - Request correlation ID
 * @param {Object} env - Worker environment bindings
 * @param {Function} groqQuery - Sanity GROQ query function
 * @param {Function} patchDocument - Sanity patch function
 * @param {Function} assertSanityConfigured - Returns configured Sanity client
 * @param {Function} createSuccessResponse - Standard success response builder
 * @param {Function} createErrorResponse - Standard error response builder
 * @param {Function} safeParseJson - Safe JSON body parser
 * @returns {Response}
 */
export async function handlePinContact(
  request,
  requestId,
  env,
  groqQuery,
  patchDocument,
  assertSanityConfigured,
  createSuccessResponse,
  createErrorResponse,
  safeParseJson,
) {
  // ── Parse body ──────────────────────────────────────────────────────────
  const { data: body, error: parseError } = await safeParseJson(request, requestId);
  if (parseError) return parseError;

  const { personId, field, value } = body || {};

  // ── Validate inputs ─────────────────────────────────────────────────────
  if (!personId || typeof personId !== 'string') {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'personId is required and must be a string',
      { field: 'personId' },
      400,
      requestId,
    );
  }

  if (field !== 'contactEmails' && field !== 'contactPhones') {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'field must be "contactEmails" or "contactPhones"',
      { field: 'field', received: field },
      400,
      requestId,
    );
  }

  if (!value || typeof value !== 'string') {
    return createErrorResponse(
      'VALIDATION_ERROR',
      'value is required and must be a string (email address or phone number)',
      { field: 'value' },
      400,
      requestId,
    );
  }

  // ── Fetch person document ───────────────────────────────────────────────
  let client;
  try {
    client = assertSanityConfigured(env);
  } catch (error) {
    return createErrorResponse(
      'CONFIG_ERROR',
      'Sanity not configured',
      {},
      500,
      requestId,
    );
  }

  const person = await groqQuery(
    client,
    `*[_type == "person" && _id == $id][0]{
      _id,
      email,
      phone,
      contactEmails,
      contactPhones
    }`,
    { id: personId },
  );

  if (!person) {
    return createErrorResponse(
      'NOT_FOUND',
      'Person document not found',
      { personId },
      404,
      requestId,
    );
  }

  // ── Find and pin the target entry ───────────────────────────────────────
  const entries = person[field] || [];
  const normalizedTarget = normalizeForMatch(value, field);

  let found = false;
  const updatedEntries = entries.map((entry) => {
    const normalizedEntry = normalizeForMatch(entry.value, field);
    if (normalizedEntry === normalizedTarget) {
      found = true;
      return { ...entry, userPinned: true };
    }
    // Clear userPinned on all other entries
    const { userPinned: _, ...rest } = entry;
    return rest;
  });

  if (!found) {
    return createErrorResponse(
      'NOT_FOUND',
      `No matching entry found in ${field}`,
      { value, field, availableCount: entries.length },
      404,
      requestId,
    );
  }

  // ── Recompute consensus ─────────────────────────────────────────────────
  // Build a synthetic person object with the updated array for consensus
  const syntheticPerson = {
    contactEmails: field === 'contactEmails' ? updatedEntries : (person.contactEmails || []),
    contactPhones: field === 'contactPhones' ? updatedEntries : (person.contactPhones || []),
  };

  const consensus = computeContactConsensus(syntheticPerson);

  // ── Build patch ─────────────────────────────────────────────────────────
  const patch = {
    contactEmails: consensus.emails,
    contactPhones: consensus.phones,
  };

  // Sync legacy flat fields from consensus primaries
  if (consensus.primaryEmail) {
    patch.email = consensus.primaryEmail.value;
  }
  if (consensus.primaryPhone) {
    patch.phone = consensus.primaryPhone.value;
  }

  // ── Write back ──────────────────────────────────────────────────────────
  try {
    await patchDocument(client, personId, { set: patch });
  } catch (error) {
    return createErrorResponse(
      'SANITY_ERROR',
      'Failed to update person document',
      {},
      500,
      requestId,
    );
  }

  return createSuccessResponse({
    pinned: true,
    personId,
    field,
    value,
    contactEmails: consensus.emails,
    contactPhones: consensus.phones,
    primaryEmail: consensus.primaryEmail?.value || null,
    primaryPhone: consensus.primaryPhone?.value || null,
  }, requestId);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a contact value for matching purposes.
 * Mirrors the normalization in contactConsensus.js without importing internals.
 *
 * @param {string} value - Raw contact value
 * @param {'contactEmails'|'contactPhones'} field - Which array we're matching in
 * @returns {string} Normalized value for comparison
 */
function normalizeForMatch(value, field) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (field === 'contactEmails') {
    return trimmed.toLowerCase();
  }
  // Phone: strip everything except digits and leading +
  return trimmed.replace(/[^0-9+]/g, '');
}
