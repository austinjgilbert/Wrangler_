/**
 * Molt Growth Loop routes
 * - POST /molt/log
 * - POST /molt/jobs/run
 * - POST /molt/feedback
 */

import type { OperatorFeedbackType } from '../../shared/types.ts';
import { createErrorResponse, createSuccessResponse, safeParseJson, sanitizeErrorMessage } from '../utils/response.js';
import { buildEventDoc } from '../lib/events.ts';
import { resolveEntities } from '../lib/entityResolver.ts';
import { enqueueJobs, runQueuedJobs } from '../lib/jobs.ts';
import { buildPatternSuggestions } from '../lib/patterns.ts';
import { normalizeSignal, storeSignal, attachSignalToEntity, triggerActionCandidateEvaluation } from '../lib/signalIngestion.ts';
import { recordFeedback } from '../lib/operatorFeedback.ts';
import {
  createMoltEvent,
  fetchPatternByType,
  fetchMoltEventById,
  fetchDocumentsByIds,
} from '../lib/sanity.ts';

const FEEDBACK_TYPES: OperatorFeedbackType[] = [
  'sent_draft',
  'edited_draft',
  'ignored_action',
  'marked_incorrect',
  'booked_meeting',
];

function isValidFeedbackType(value: string): value is OperatorFeedbackType {
  return FEEDBACK_TYPES.includes(value as OperatorFeedbackType);
}

export async function handleMoltLog(request: Request, requestId: string, env: any) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
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

    const accountEntity = entities.find((e) => e.entityType === 'account');
    const personEntity = entities.find((e) => e.entityType === 'person');
    const signal = normalizeSignal({
      source: channel === 'slack' ? 'slack_alert' : 'manual_operator_note',
      signalType: channel === 'slack' ? 'slack_alert' : 'operator_note',
      account: accountEntity ? { _type: 'reference', _ref: accountEntity._ref } : null,
      person: personEntity ? { _type: 'reference', _ref: personEntity._ref } : null,
      timestamp: new Date().toISOString(),
      metadata: {
        summary: text,
        outcome,
        channel,
      },
    });
    await storeSignal(env, signal);
    await attachSignalToEntity(env, signal);
    const signalEvaluation = accountEntity
      ? { queued: false, reason: 'event_jobs_already_queued' }
      : await triggerActionCandidateEvaluation(env, signal);

    const pattern = await fetchPatternByType(env, 'growth.patterns');
    const nextSuggestions = buildPatternSuggestions(pattern?.successStats || {});

    return createSuccessResponse(
      {
        eventId: eventDoc._id,
        jobsQueued,
        signalId: signal.id,
        signalEvaluation,
        nextSuggestions,
      },
      requestId
    );
  } catch (error: any) {
    return createErrorResponse('MOLT_LOG_ERROR', sanitizeErrorMessage(error, 'molt/log'), {}, 500, requestId);
  }
}

export async function handleMoltJobsRun(request: Request, requestId: string, env: any) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.clone().json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const url = new URL(request.url);
    const limitRaw = typeof body.limit === 'number'
      ? body.limit
      : Number(url.searchParams.get('limit') || '');
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.max(1, Math.min(Math.floor(limitRaw), 25))
      : undefined;
    const jobTypes = Array.isArray(body.jobTypes)
      ? body.jobTypes.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined;

    const results = await runQueuedJobs({
      env,
      limit,
      jobTypes,
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
    return createErrorResponse('MOLT_JOBS_ERROR', sanitizeErrorMessage(error, 'molt/jobs'), {}, 500, requestId);
  }
}

export async function handleMoltFeedback(request: Request, requestId: string, env: any) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    const actionCandidateId = typeof body.actionCandidateId === 'string' ? body.actionCandidateId.trim() : null;
    const feedbackTypeRaw = body.feedbackType;
    const idempotencyKey = typeof body.idempotencyKey === 'string'
      ? body.idempotencyKey.trim()
      : (request.headers.get('Idempotency-Key') || '').trim() || undefined;
    const operatorEdit = typeof body.operatorEdit === 'string' ? body.operatorEdit.trim() : undefined;
    const timestamp = typeof body.timestamp === 'string' ? body.timestamp : undefined;
    const outcome = typeof body.outcome === 'string' ? body.outcome.trim() : undefined;

    if (!actionCandidateId) {
      return createErrorResponse('VALIDATION_ERROR', 'actionCandidateId is required', {}, 400, requestId);
    }
    if (!feedbackTypeRaw || !isValidFeedbackType(String(feedbackTypeRaw))) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        `feedbackType must be one of: ${FEEDBACK_TYPES.join(', ')}`,
        {},
        400,
        requestId
      );
    }

    const result = await recordFeedback(env, {
      actionCandidateId,
      idempotencyKey,
      feedbackType: feedbackTypeRaw as OperatorFeedbackType,
      operatorEdit: operatorEdit || undefined,
      timestamp,
      outcome,
    });

    return createSuccessResponse(
      {
        feedbackId: result.feedback._id,
        actionCandidateId: result.feedback.actionCandidateId,
        feedbackType: result.feedback.feedbackType,
        signalWeights: result.signalWeights,
        patternStrength: result.patternStrength,
        promptRetraining: result.promptRetraining,
      },
      requestId
    );
  } catch (error: any) {
    return createErrorResponse('MOLT_FEEDBACK_ERROR', sanitizeErrorMessage(error, 'molt/feedback'), {}, 500, requestId);
  }
}
