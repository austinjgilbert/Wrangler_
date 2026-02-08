/**
 * Sanity Webhook Handler
 *
 * POST /webhooks/sanity
 *
 * Receives webhook notifications from Sanity when documents are created
 * or updated. Automatically triggers enrichment for accounts that have gaps.
 *
 * Setup in Sanity:
 *   1. Go to sanity.io/manage → Project → API → Webhooks
 *   2. Create webhook:
 *      - URL: https://website-scanner.austin-gilbert.workers.dev/webhooks/sanity
 *      - Trigger on: Create, Update
 *      - Filter: _type == "account"
 *      - Projection: {_id, accountKey, domain, rootDomain, profileCompleteness}
 *      - Secret: (set as SANITY_WEBHOOK_SECRET in worker)
 *      - HTTP method: POST
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';

interface SanityWebhookPayload {
  _id: string;
  _type: string;
  accountKey?: string;
  domain?: string;
  rootDomain?: string;
  profileCompleteness?: {
    score?: number;
    gaps?: string[];
    nextStages?: string[];
  };
}

/**
 * Verify Sanity webhook signature.
 * Sanity sends HMAC-SHA256 in the `sanity-webhook-signature` header.
 */
async function verifySignature(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return computed === signature;
  } catch {
    return false;
  }
}

export async function handleSanityWebhook(request: Request, requestId: string, env: any) {
  try {
    const rawBody = await request.text();

    // ── Verify webhook signature (if secret is configured) ────────────
    const secret = env.SANITY_WEBHOOK_SECRET;
    if (secret) {
      const signature = request.headers.get('sanity-webhook-signature');
      const valid = await verifySignature(rawBody, signature, secret);
      if (!valid) {
        return createErrorResponse('AUTH_ERROR', 'Invalid webhook signature', {}, 401, requestId);
      }
    }

    let payload: SanityWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return createErrorResponse('VALIDATION_ERROR', 'Invalid JSON', {}, 400, requestId);
    }

    // Only process account documents
    if (payload._type !== 'account') {
      return createSuccessResponse({ skipped: true, reason: 'Not an account document' }, requestId);
    }

    const accountKey = payload.accountKey;
    const domain = payload.domain || payload.rootDomain;

    if (!accountKey || !domain) {
      return createSuccessResponse({ skipped: true, reason: 'Missing accountKey or domain' }, requestId);
    }

    // ── Check if enrichment is needed ─────────────────────────────────
    const completeness = payload.profileCompleteness;
    const score = completeness?.score ?? 0;
    const hasGaps = (completeness?.gaps?.length ?? 0) > 0;
    const hasNextStages = (completeness?.nextStages?.length ?? 0) > 0;

    // Only trigger enrichment if profile is incomplete (< 80%) or has gaps
    if (score >= 80 && !hasGaps && !hasNextStages) {
      return createSuccessResponse({
        skipped: true,
        reason: `Profile completeness ${score}% — no enrichment needed`,
        accountKey,
      }, requestId);
    }

    // ── Trigger gap-fill enrichment ───────────────────────────────────
    const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
    triggerGapFill({
      env,
      accountKey,
      domain,
      trigger: 'sanity_webhook',
    }).catch((err: any) => {
      console.error(`[SanityWebhook] Gap-fill failed for ${accountKey}:`, err?.message);
    });

    return createSuccessResponse({
      triggered: true,
      accountKey,
      domain,
      currentScore: score,
      gaps: completeness?.gaps || [],
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('WEBHOOK_ERROR', error.message, {}, 500, requestId);
  }
}
