/**
 * MoltBot Handlers
 * Routes: /molt/run, /molt/approve
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { runMoltBot } from '../lib/orchestrator.ts';
import { handleApprovalDecision, handleUnifiedApprovalDecision } from '../lib/approval.ts';
import { fetchMoltApprovalById, createMoltEvent, createMoltJob } from '../lib/sanity.ts';
import { buildEventDoc } from '../lib/events.ts';

export async function handleMoltRun(request, requestId, env) {
  try {
    const body = await request.json();
    const requestText = body.requestText;
    const mode = body.mode || 'auto';
    const entityHints = Array.isArray(body.entityHints) ? body.entityHints : [];
    const requireApproval = !!body.requireApproval;

    if (!requestText || typeof requestText !== 'string') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'requestText is required',
        {},
        400,
        requestId
      );
    }

    const eventDoc = buildEventDoc({
      type: 'request.received',
      text: requestText,
      channel: 'web',
      actor: 'austin',
      entities: [],
      tags: [],
      traceId: requestId,
      idempotencyKey: requestId,
    });
    await createMoltEvent(env, eventDoc);
    const jobType = mode === 'draft' ? 'draft.create'
      : mode === 'plan' ? 'plan.create'
        : mode === 'reflect' ? 'reflect.create'
          : 'research.run';
    const jobDoc = {
      _type: 'molt.job',
      _id: `molt.job.request.${requestId}`,
      jobType,
      status: 'queued',
      priority: 50,
      attempts: 0,
      traceId: requestId,
      idempotencyKey: `request.${requestId}`,
      createdFromEvent: { _type: 'reference', _ref: eventDoc._id },
      inputRefs: [],
      outputRefs: [],
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await createMoltJob(env, jobDoc);

    const result = await runMoltBot({
      env,
      requestText,
      mode,
      entityHints,
      requireApproval,
      traceId: requestId,
    });

    return createSuccessResponse(
      {
        traceId: requestId,
        requestId: result.requestId,
        artifactId: result.artifactId,
        status: result.status,
        summary: result.summary,
        approvalId: result.approvalId,
        jobsQueued: [jobDoc._id],
      },
      requestId
    );
  } catch (error) {
    return createErrorResponse(
      'MOLTBOT_ERROR',
      'Failed to run MoltBot',
      { error: error.message },
      500,
      requestId
    );
  }
}

export async function handleMoltApprove(request, requestId, env) {
  try {
    const body = await request.json();
    const approvalId = body.approvalId;
    const decision = body.decision;

    if (!approvalId || !decision) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'approvalId and decision are required',
        {},
        400,
        requestId
      );
    }

    if (!['approve', 'reject'].includes(decision)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'decision must be approve or reject',
        {},
        400,
        requestId
      );
    }

    const unifiedApproval = await fetchMoltApprovalById(env, approvalId);
    const result = unifiedApproval
      ? await handleUnifiedApprovalDecision({ env, approvalId, decision })
      : await handleApprovalDecision({
        env,
        approvalId,
        decision,
        traceId: requestId,
      });

    return createSuccessResponse(
      {
        approvalId,
        status: result.status,
        artifactId: result.artifactId,
      },
      requestId
    );
  } catch (error) {
    return createErrorResponse(
      'MOLTBOT_APPROVAL_ERROR',
      'Failed to process approval decision',
      { error: error.message },
      500,
      requestId
    );
  }
}
