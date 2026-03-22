import { createErrorResponse, createSuccessResponse, safeParseJson, sanitizeErrorMessage } from '../utils/response.js';
import {
  fetchActionCandidateById,
  fetchDocumentsByIds,
  fetchLatestGmailDraftForActionCandidate,
  fetchSignalsForActionCandidate,
} from '../lib/sanity.ts';
import {
  explainDraftGeneration,
  explainOpportunityScore,
  explainPatternMatch,
} from '../lib/scoreExplanationService.ts';
import { getDraftRecord } from '../services/gmail-workflow.ts';

export async function handleAnalyticsExplain(request: Request, requestId: string, env: any) {
  try {
    let body: Record<string, any> = {};
    if (request.method === 'POST') {
      const { data, error: parseError } = await safeParseJson(request, requestId);
      if (parseError) return parseError;
      body = data;
    }

    const explainType = String(body.explainType || body.type || '').trim();
    const actionCandidateId = String(body.actionCandidateId || '').trim();
    const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';

    if (!explainType) {
      return createErrorResponse('VALIDATION_ERROR', 'explainType is required', {}, 400, requestId);
    }
    if (!actionCandidateId) {
      return createErrorResponse('VALIDATION_ERROR', 'actionCandidateId is required', {}, 400, requestId);
    }

    const actionCandidate = await fetchActionCandidateById(env, actionCandidateId);
    if (!actionCandidate) {
      return createErrorResponse('NOT_FOUND', 'Action candidate not found', { actionCandidateId }, 404, requestId);
    }

    const refs = uniqueRefs([
      actionCandidate.account?._ref,
      actionCandidate.person?._ref,
      ...(actionCandidate.signalRefs || []).map((ref: any) => ref?._ref).filter(Boolean),
    ]);

    const relatedDocs = refs.length > 0 ? await fetchDocumentsByIds(env, refs) : [];
    const docsById = new Map(relatedDocs.map((doc: any) => [doc._id, doc]));
    const account = actionCandidate.account?._ref ? docsById.get(actionCandidate.account._ref) || null : null;
    const person = actionCandidate.person?._ref ? docsById.get(actionCandidate.person._ref) || null : null;

    const signals = actionCandidate.signalRefs?.length
      ? relatedDocs.filter((doc: any) => doc?._type === 'signal')
      : await fetchSignalsForActionCandidate(env, {
          accountRef: actionCandidate.account?._ref || null,
          personRef: actionCandidate.person?._ref || null,
        });

    if (explainType === 'opportunity_score') {
      return createSuccessResponse(explainOpportunityScore({
        actionCandidate,
        account,
        person,
        signals,
      }), requestId);
    }

    if (explainType === 'pattern_match') {
      return createSuccessResponse(explainPatternMatch({
        actionCandidate,
      }), requestId);
    }

    if (explainType === 'draft_generation') {
      const draft = await resolveDraft(env, actionCandidateId, draftId);
      if (!draft) {
        return createErrorResponse('NOT_FOUND', 'Draft not found for action candidate', { actionCandidateId, draftId: draftId || null }, 404, requestId);
      }

      return createSuccessResponse(explainDraftGeneration({
        actionCandidate,
        draft,
      }), requestId);
    }

    return createErrorResponse('VALIDATION_ERROR', `Unsupported explainType: ${explainType}`, {}, 400, requestId);
  } catch (error: any) {
    return createErrorResponse('ANALYTICS_EXPLAIN_ERROR', sanitizeErrorMessage(error, 'analytics/explain'), {}, 500, requestId);
  }
}

async function resolveDraft(env: any, actionCandidateId: string, draftId?: string) {
  if (draftId) {
    return await getDraftRecord(env, draftId);
  }
  return await fetchLatestGmailDraftForActionCandidate(env, actionCandidateId);
}

function uniqueRefs(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}
