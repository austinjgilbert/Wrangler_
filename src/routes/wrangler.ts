/**
 * Wrangler ingest route.
 * Accepts a Q&A exchange and stores it as interaction + molt.event.
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { buildEventDoc } from '../lib/events.ts';
import { resolveEntities } from '../lib/entityResolver.ts';
import { enqueueJobs } from '../lib/jobs.ts';
import { createMoltEvent } from '../lib/sanity.ts';

export async function handleWranglerIngest(request: Request, requestId: string, env: any) {
  try {
    const body = (await request.json()) as Record<string, any>;
    const userPrompt = body.userPrompt || body.prompt;
    const gptResponse = body.gptResponse || body.response;
    const sessionId = body.sessionId || null;
    const referencedAccounts = body.referencedAccounts || [];
    const referencedPeople = body.referencedPeople || [];
    const contextTags = body.contextTags || [];

    if (!userPrompt || !gptResponse) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'userPrompt and gptResponse are required',
        {},
        400,
        requestId
      );
    }

    const { groqQuery, upsertDocument, patchDocument, assertSanityConfigured } = await import('../sanity-client.js');
    const client = assertSanityConfigured(env);
    const { storeInteraction } = await import('../services/interaction-storage.js');

    const interactionResult = await storeInteraction(
      groqQuery,
      upsertDocument,
      patchDocument,
      client,
      {
        sessionId,
        userPrompt,
        gptResponse,
        referencedAccounts,
        referencedPeople,
        contextTags,
        requestId,
      },
      {}
    );

    if (!interactionResult.success) {
      return createErrorResponse(
        'SANITY_ERROR',
        'Failed to store interaction',
        { error: interactionResult.error },
        500,
        requestId
      );
    }

    const entities = await resolveEntities({
      env,
      text: `${userPrompt}\n${gptResponse}`,
      entityHints: [...referencedAccounts, ...referencedPeople],
    });

    const eventDoc = buildEventDoc({
      type: 'wrangler.interaction',
      text: userPrompt,
      channel: 'wrangler',
      actor: 'wrangler',
      entities: entities.map((e) => ({ _ref: e._ref, entityType: e.entityType })),
      outcome: null,
      tags: ['wrangler'],
      traceId: requestId,
      idempotencyKey: `wrangler.${interactionResult.interactionId}`,
    });

    await createMoltEvent(env, eventDoc);

    const jobsQueued = await enqueueJobs({
      env,
      event: eventDoc,
      entities: entities.map((e) => ({ _ref: e._ref, entityType: e.entityType })),
      hasOutcome: false,
    });

    // ── Gap-Fill: trigger background enrichment for every resolved account ──
    // This ensures that whenever a user asks about a company via the GPT,
    // the system starts filling in the complete account profile automatically.
    const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
    const gapFillResults: any[] = [];
    for (const entity of entities) {
      if (entity.entityType === 'account') {
        // Resolve accountKey from the entity reference (account-{key} format)
        const refId = entity._ref || '';
        const accountKey = refId.startsWith('account-') ? refId.replace('account-', '') : null;
        if (accountKey) {
          triggerGapFill({
            env,
            accountKey,
            trigger: 'wrangler',
          }).then((r: any) => gapFillResults.push(r)).catch(() => {});
        }
      }
    }

    return createSuccessResponse(
      {
        interactionId: interactionResult.interactionId,
        sessionId: interactionResult.sessionId,
        eventId: eventDoc._id,
        jobsQueued,
        backgroundEnrichment: true,
      },
      requestId
    );
  } catch (error: any) {
    return createErrorResponse('WRANGLER_ERROR', error.message, {}, 500, requestId);
  }
}
