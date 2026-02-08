/**
 * Molt Growth Loop routes
 * - POST /molt/log
 * - POST /molt/jobs/run
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { buildEventDoc } from '../lib/events.ts';
import { resolveEntities } from '../lib/entityResolver.ts';
import { enqueueJobs, runQueuedJobs } from '../lib/jobs.ts';
import { buildPatternSuggestions } from '../lib/patterns.ts';
import {
  createMoltEvent,
  fetchPatternByType,
  fetchMoltEventById,
  fetchDocumentsByIds,
} from '../lib/sanity.ts';

export async function handleMoltLog(request: Request, requestId: string, env: any) {
  try {
    const body = await request.json();
    const text = body.text;
    const channel = body.channel || 'manual';
    const outcome = body.outcome || null;
    const entityHints = body.entityHints || [];

    if (!text) {
      return createErrorResponse('VALIDATION_ERROR', 'text is required', {}, 400, requestId);
    }

    const entities = await resolveEntities({ env, text, entityHints });
    const lower = text.toLowerCase();
    const type = lower.includes('call') ? 'call.ingested'
      : lower.includes('reply') ? 'reply.received'
        : lower.includes('sent') ? 'touch.sent'
          : 'note.captured';

    const eventDoc = buildEventDoc({
      type,
      text,
      channel,
      actor: 'austin',
      entities: entities.map((e) => ({ _ref: e._ref, entityType: e.entityType })),
      outcome,
      tags: [],
      traceId: requestId,
      idempotencyKey: requestId,
    });
    await createMoltEvent(env, eventDoc);

    const jobsQueued = await enqueueJobs({
      env,
      event: eventDoc,
      entities: entities.map((e) => ({ _ref: e._ref, entityType: e.entityType })),
      hasOutcome: !!outcome,
    });

    const pattern = await fetchPatternByType(env, 'growth.patterns');
    const nextSuggestions = buildPatternSuggestions(pattern?.successStats || {});

    return createSuccessResponse(
      {
        eventId: eventDoc._id,
        jobsQueued,
        nextSuggestions,
      },
      requestId
    );
  } catch (error: any) {
    return createErrorResponse('MOLT_LOG_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleMoltJobsRun(request: Request, requestId: string, env: any) {
  try {
    const results = await runQueuedJobs({
      env,
      resolveEvent: async (eventRef) => {
        return await fetchMoltEventById(env, eventRef?._ref || eventRef);
      },
      resolveEntities: async (refs) => {
        const ids = refs.map((r: any) => r.entityRef?._ref || r._ref || r);
        const docs = await fetchDocumentsByIds(env, ids);
        const person = docs.find((d: any) => d._type === 'person');
        const account = docs.find((d: any) => d._type === 'account');
        return { person, account };
      },
    });

    return createSuccessResponse({ jobsProcessed: results.length, results }, requestId);
  } catch (error: any) {
    return createErrorResponse('MOLT_JOBS_ERROR', error.message, {}, 500, requestId);
  }
}
