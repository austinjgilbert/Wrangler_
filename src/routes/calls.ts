/**
 * Call Transcript Intake + Coaching Loop
 * - POST /calls/ingest
 * - POST /calls/react
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { parseTranscript, cleanTranscript } from '../lib/callClean.ts';
import { buildCallInsight } from '../lib/callInsight.ts';
import { buildCallTasks } from '../lib/callTasks.ts';
import { buildCoaching } from '../lib/callCoaching.ts';
import { resolveEntities } from '../lib/entityResolver.ts';
import {
  createCallSession,
  createCallInsight,
  createCallTask,
  createCallCoaching,
  createCallFollowupDraft,
  fetchCallSessionById,
  updateCallSession,
  createMoltEvent,
  createMoltJob,
} from '../lib/sanity.ts';
import { buildEventDoc } from '../lib/events.ts';

function buildFollowupDraft(insight: any) {
  const subject = 'Follow-up from our call';
  const body = [
    'Thanks for the conversation today.',
    `Key pain: ${insight.pains?.[0] || 'N/A'}`,
    `Goal: ${insight.goals?.[0] || 'N/A'}`,
    'Proposed next step: confirm decision process and timeline.',
  ].join('\n');
  return { subject, body };
}

export async function handleCallsIngest(request: Request, requestId: string, env: any) {
  try {
    const body = await request.json();
    const transcript = body.transcript;
    const meetingType = body.meetingType || 'discovery';
    const accountHint = body.accountHint || '';
    const peopleHints = body.peopleHints || [];
    const objectives = body.objectives || [];

    if (!transcript) {
      return createErrorResponse('VALIDATION_ERROR', 'transcript is required', {}, 400, requestId);
    }

    const entities = await resolveEntities({
      env,
      text: `${transcript}\n${accountHint}\n${peopleHints.join(' ')}`,
      entityHints: [accountHint, ...peopleHints],
    });

    const entries = parseTranscript(transcript);
    const transcriptClean = cleanTranscript(entries);
    const accountRef = entities.find((e) => e.entityType === 'account');
    const sessionDoc = {
      _type: 'call.session',
      _id: `call.session.${Date.now()}`,
      accountRef: accountRef ? { _type: 'reference', _ref: accountRef._ref } : null,
      peopleRefs: entities.filter((e) => e.entityType === 'person').map((e) => ({ _type: 'reference', _ref: e._ref })),
      date: new Date().toISOString(),
      source: 'manual',
      transcriptRaw: transcript,
      transcriptClean,
      meetingType,
      objectives,
      outcome: null,
    };
    await createCallSession(env, sessionDoc);
    const eventDoc = buildEventDoc({
      type: 'call.ingested',
      text: `Call ingested ${sessionDoc._id}`,
      channel: 'web',
      actor: 'moltbot',
      entities: accountRef ? [{ _ref: accountRef._ref, entityType: 'account' }] : [],
      tags: ['call'],
      traceId: requestId,
      idempotencyKey: sessionDoc._id,
    });
    await createMoltEvent(env, eventDoc);

    const insight = buildCallInsight(entries);
    const insightDoc = {
      _type: 'call.insight',
      _id: `call.insight.${sessionDoc._id}`,
      sessionRef: { _type: 'reference', _ref: sessionDoc._id },
      ...insight,
    };
    await createCallInsight(env, insightDoc);
    await createMoltJob(env, {
      _type: 'molt.job',
      _id: `molt.job.call.analyze.${sessionDoc._id}`,
      jobType: 'call.analyze',
      status: 'done',
      priority: 70,
      attempts: 1,
      traceId: requestId,
      idempotencyKey: `call.analyze.${sessionDoc._id}`,
      createdFromEvent: { _type: 'reference', _ref: eventDoc._id },
      inputRefs: [{ _type: 'reference', _ref: sessionDoc._id }],
      outputRefs: [{ _type: 'reference', _ref: insightDoc._id }],
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const tasks = buildCallTasks({ sessionId: sessionDoc._id, insight });
    for (const task of tasks) {
      await createCallTask(env, task);
    }

    const draft = buildFollowupDraft(insight);
    const draftDoc = {
      _type: 'call.followupDraft',
      _id: `call.followupDraft.${sessionDoc._id}`,
      sessionRef: { _type: 'reference', _ref: sessionDoc._id },
      channel: 'email',
      subject: draft.subject,
      body: draft.body,
    };
    await createCallFollowupDraft(env, draftDoc);

    const coaching = buildCoaching(entries);
    const coachingDoc = {
      _type: 'call.coaching',
      _id: `call.coaching.${sessionDoc._id}`,
      sessionRef: { _type: 'reference', _ref: sessionDoc._id },
      ...coaching,
    };
    await createCallCoaching(env, coachingDoc);
    await createMoltJob(env, {
      _type: 'molt.job',
      _id: `molt.job.call.coach.${sessionDoc._id}`,
      jobType: 'call.coach',
      status: 'done',
      priority: 70,
      attempts: 1,
      traceId: requestId,
      idempotencyKey: `call.coach.${sessionDoc._id}`,
      createdFromEvent: { _type: 'reference', _ref: eventDoc._id },
      inputRefs: [{ _type: 'reference', _ref: sessionDoc._id }],
      outputRefs: [{ _type: 'reference', _ref: coachingDoc._id }],
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return createSuccessResponse(
      {
        sessionId: sessionDoc._id,
        tasksCreated: tasks.length,
        followupDraftId: draftDoc._id,
        coachingId: coachingDoc._id,
      },
      requestId
    );
  } catch (error: any) {
    return createErrorResponse('CALL_INGEST_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleCallsReact(request: Request, requestId: string, env: any) {
  try {
    const body = await request.json();
    const sessionId = body.sessionId;
    if (!sessionId) {
      return createErrorResponse('VALIDATION_ERROR', 'sessionId required', {}, 400, requestId);
    }
    const session = await fetchCallSessionById(env, sessionId);
    if (!session) {
      return createErrorResponse('NOT_FOUND', 'session not found', {}, 404, requestId);
    }
    const eventDoc = buildEventDoc({
      type: 'call.reprocessed',
      text: `Call reprocessed ${sessionId}`,
      channel: 'system',
      actor: 'moltbot',
      entities: session.accountRef ? [{ _ref: session.accountRef._ref, entityType: 'account' }] : [],
      tags: ['call'],
      traceId: requestId,
      idempotencyKey: `call.reprocessed.${sessionId}`,
    });
    await createMoltEvent(env, eventDoc);

    const entries = parseTranscript(session.transcriptRaw || '');
    const transcriptClean = cleanTranscript(entries);
    await updateCallSession(env, sessionId, { transcriptClean });

    const insight = buildCallInsight(entries);
    const insightDoc = {
      _type: 'call.insight',
      _id: `call.insight.${sessionId}`,
      sessionRef: { _type: 'reference', _ref: sessionId },
      ...insight,
    };
    await createCallInsight(env, insightDoc);

    const tasks = buildCallTasks({ sessionId, insight });
    for (const task of tasks) {
      await createCallTask(env, task);
    }

    const coaching = buildCoaching(entries);
    const coachingDoc = {
      _type: 'call.coaching',
      _id: `call.coaching.${sessionId}`,
      sessionRef: { _type: 'reference', _ref: sessionId },
      ...coaching,
    };
    await createCallCoaching(env, coachingDoc);

    return createSuccessResponse(
      {
        sessionId,
        tasksCreated: tasks.length,
        coachingId: coachingDoc._id,
      },
      requestId
    );
  } catch (error: any) {
    return createErrorResponse('CALL_REACT_ERROR', error.message, {}, 500, requestId);
  }
}
