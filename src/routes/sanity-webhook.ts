/**
 * Sanity Webhook Handler
 *
 * POST /webhooks/sanity
 *
 * Receives webhook notifications from Sanity when documents are created
 * or updated. Automatically triggers enrichment for accounts, people,
 * and other entities that have gaps in their data.
 *
 * Setup in Sanity:
 *   1. Go to sanity.io/manage → Project → API → Webhooks
 *   2. Create webhook:
 *      - URL: https://website-scanner.austin-gilbert.workers.dev/webhooks/sanity
 *      - Trigger on: Create, Update
 *      - Filter: _type in ["account", "person", "interaction", "accountPack"]
 *      - Projection: {_id, _type, accountKey, domain, rootDomain, profileCompleteness, name, companyDomain}
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
  companyDomain?: string;
  name?: string;
  profileCompleteness?: {
    score?: number;
    gaps?: string[];
    nextStages?: string[];
  };
  // Person fields
  companyName?: string;
  linkedinUrl?: string;
  // Interaction fields
  userPrompt?: string;
  gptResponse?: string;
  contextTags?: string[];
}

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
    const computed = new Uint8Array(sig);
    // Decode hex signature to Uint8Array for timing-safe comparison
    const expected = new Uint8Array(
      (signature.match(/.{2}/g) || []).map(byte => parseInt(byte, 16))
    );
    if (computed.length !== expected.length) return false;
    // Constant-time comparison — prevents timing side-channel attacks
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed[i] ^ expected[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Handle account document changes — trigger gap-fill if incomplete
 */
async function handleAccountChange(payload: SanityWebhookPayload, env: any) {
  const accountKey = payload.accountKey;
  const domain = payload.domain || payload.rootDomain;

  if (!accountKey || !domain) {
    return { skipped: true, reason: 'Missing accountKey or domain' };
  }

  const completeness = payload.profileCompleteness;
  const score = completeness?.score ?? 0;
  const hasGaps = (completeness?.gaps?.length ?? 0) > 0;
  const hasNextStages = (completeness?.nextStages?.length ?? 0) > 0;

  if (score >= 80 && !hasGaps && !hasNextStages) {
    return {
      skipped: true,
      reason: `Profile completeness ${score}% — no enrichment needed`,
      accountKey,
    };
  }

  const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
  triggerGapFill({
    env,
    accountKey,
    domain,
    trigger: 'sanity_webhook',
  }).catch((err: any) => {
    console.error(`[SanityWebhook] Gap-fill failed for ${accountKey}:`, err?.message);
  });

  return {
    triggered: true,
    action: 'gap_fill',
    accountKey,
    domain,
    currentScore: score,
    gaps: completeness?.gaps || [],
  };
}

/**
 * Handle person document changes — enrich if missing key data
 */
async function handlePersonChange(payload: SanityWebhookPayload, env: any) {
  const name = payload.name;
  const companyDomain = payload.companyDomain || payload.domain;

  if (!name) {
    return { skipped: true, reason: 'Person document missing name' };
  }

  // Also trigger gap-fill for the associated account if we have a domain
  if (companyDomain) {
    const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
    const { generateAccountKey } = await import('../sanity-client.js');
    const accountKey = await generateAccountKey(`https://${companyDomain}`);
    triggerGapFill({
      env,
      accountKey,
      domain: companyDomain,
      trigger: 'sanity_webhook_person',
    }).catch((err: any) => {
      console.error(`[SanityWebhook] Person-triggered gap-fill failed:`, err?.message);
    });
  }

  return {
    triggered: true,
    action: 'person_enrichment',
    name,
    companyDomain,
  };
}

/**
 * Handle interaction document changes — derive learnings and trigger account enrichment
 */
async function handleInteractionChange(payload: SanityWebhookPayload, env: any) {
  const domain = payload.domain;
  const accountKey = payload.accountKey;

  if (!domain && !accountKey) {
    return { skipped: true, reason: 'Interaction has no associated domain or accountKey' };
  }

  // Trigger gap-fill for the account referenced in the interaction
  if (domain || accountKey) {
    const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
    triggerGapFill({
      env,
      accountKey: accountKey || null,
      domain: domain || null,
      trigger: 'sanity_webhook_interaction',
    }).catch((err: any) => {
      console.error(`[SanityWebhook] Interaction-triggered gap-fill failed:`, err?.message);
    });
  }

  return {
    triggered: true,
    action: 'interaction_enrichment',
    domain,
    accountKey,
  };
}

/**
 * Handle accountPack document changes — check if new data needs Content OS enrichment
 */
async function handleAccountPackChange(payload: SanityWebhookPayload, env: any) {
  const accountKey = payload.accountKey;
  const domain = payload.domain || payload.rootDomain;

  if (!accountKey) {
    return { skipped: true, reason: 'AccountPack missing accountKey' };
  }

  const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
  triggerGapFill({
    env,
    accountKey,
    domain: domain || null,
    trigger: 'sanity_webhook_pack',
  }).catch((err: any) => {
    console.error(`[SanityWebhook] Pack-triggered gap-fill failed for ${accountKey}:`, err?.message);
  });

  return {
    triggered: true,
    action: 'pack_enrichment',
    accountKey,
  };
}

export async function handleSanityWebhook(request: Request, requestId: string, env: any) {
  try {
    const rawBody = await request.text();

    const secret = env.SANITY_WEBHOOK_SECRET;
    if (!secret) {
      return createErrorResponse(
        'CONFIG_ERROR',
        'Webhook secret not configured — endpoint disabled for security',
        {},
        503,
        requestId,
      );
    }

    const signature = request.headers.get('sanity-webhook-signature');
    const valid = await verifySignature(rawBody, signature, secret);
    if (!valid) {
      return createErrorResponse('AUTH_ERROR', 'Invalid webhook signature', {}, 401, requestId);
    }

    let payload: SanityWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return createErrorResponse('VALIDATION_ERROR', 'Invalid JSON', {}, 400, requestId);
    }

    const docType = payload._type;
    let result: any;

    switch (docType) {
      case 'account':
        result = await handleAccountChange(payload, env);
        break;
      case 'person':
        result = await handlePersonChange(payload, env);
        break;
      case 'interaction':
        result = await handleInteractionChange(payload, env);
        break;
      case 'accountPack':
        result = await handleAccountPackChange(payload, env);
        break;
      default:
        result = { skipped: true, reason: `Unhandled document type: ${docType}` };
    }

    return createSuccessResponse({ ...result, documentType: docType }, requestId);
  } catch (error: any) {
    console.error(`[${requestId}] Webhook processing failed:`, error);
    return createErrorResponse('WEBHOOK_ERROR', 'Webhook processing failed', {}, 500, requestId);
  }
}
