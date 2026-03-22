import { createErrorResponse, createSuccessResponse, safeParseJson, sanitizeErrorMessage } from '../utils/response.js';
import { generateInsights } from '../lib/insightEngine.ts';
import { executeOperatorQuery, explainActionCandidate, explainPatternById, safeAssistAction } from '../lib/operatorQueryEngine.ts';
import { buildSuggestionPreview, generateOperatorSuggestions } from '../lib/operatorSuggestionService.ts';
import {
  fetchActionCandidates,
  fetchAccounts,
  fetchDocumentsByType,
  fetchDriftMetricsByType,
  fetchLatestDocumentByType,
  fetchPeople,
  fetchSignals,
} from '../lib/sanity.ts';

export async function handleOperatorCopilotState(request: Request, requestId: string, env: any) {
  try {
    const url = new URL(request.url);
    const context = {
      section: url.searchParams.get('section') || undefined,
      accountId: url.searchParams.get('accountId') || null,
      accountName: url.searchParams.get('accountName') || null,
    };

    const [accounts, people, signals, actionCandidates, patterns, jobs, operatorFeedback, driftMetrics, latestScoring, latestDraft, latestStrategy] = await Promise.all([
      fetchAccounts(env),
      fetchPeople(env),
      fetchSignals(env),
      fetchActionCandidates(env),
      fetchDocumentsByType(env, 'molt.pattern', 80).catch(() => []),
      fetchDocumentsByType(env, 'molt.job', 120).catch(() => []),
      fetchDocumentsByType(env, 'operatorFeedback', 120).catch(() => []),
      loadDriftMetrics(env),
      fetchLatestDocumentByType(env, 'scoringPolicyVersion').catch(() => null),
      fetchLatestDocumentByType(env, 'draftPolicyVersion').catch(() => null),
      fetchLatestDocumentByType(env, 'strategyInstructionVersion').catch(() => null),
    ]);

    const suggestions = generateOperatorSuggestions({
      accounts,
      people,
      signals,
      actionCandidates,
      patterns,
      jobs,
      driftMetrics,
      context,
    });
    const insights = generateInsights({
      accounts,
      signals,
      patterns,
      actionCandidates,
      operatorFeedback,
      driftMetrics,
    });

    const learningUpdates = buildLearningUpdates(operatorFeedback, latestScoring, latestDraft, latestStrategy);
    const alerts = buildSystemAlerts(driftMetrics, jobs);

    return createSuccessResponse({
      context,
      suggestions,
      insights,
      conversationStarters: [
        'Why is this account high priority?',
        'Find ecommerce companies evaluating CMS',
        'Run research on fleetfeet.com',
        'Explain pattern success rate',
        'Show top opportunities this week',
      ],
      learningUpdates,
      systemAlerts: alerts,
      suggestionPreview: buildSuggestionPreview({
        accounts,
        people,
        signals,
        actionCandidates,
      }),
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_COPILOT_STATE_ERROR', sanitizeErrorMessage(error, 'copilot/state'), {}, 500, requestId);
  }
}

export async function handleOperatorCopilotQuery(request: Request, requestId: string, env: any) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    const prompt = String(body.prompt || '').trim();
    if (!prompt) {
      return createErrorResponse('VALIDATION_ERROR', 'prompt is required', {}, 400, requestId);
    }

    const result = await executeOperatorQuery(env, {
      prompt,
      context: body.context || {},
    });
    return createSuccessResponse(result, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_COPILOT_QUERY_ERROR', sanitizeErrorMessage(error, 'copilot/query'), {}, 500, requestId);
  }
}

export async function handleOperatorCopilotExplain(request: Request, requestId: string, env: any) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    const explainType = String(body.explainType || '').trim();
    if (!explainType) {
      return createErrorResponse('VALIDATION_ERROR', 'explainType is required', {}, 400, requestId);
    }

    if (explainType === 'action') {
      const actionId = String(body.actionId || body.actionCandidateId || '').trim();
      if (!actionId) {
        return createErrorResponse('VALIDATION_ERROR', 'actionId is required', {}, 400, requestId);
      }
      const explanation = await explainActionCandidate(env, actionId);
      if (!explanation) {
        return createErrorResponse('NOT_FOUND', 'Action explanation not found', { actionId }, 404, requestId);
      }
      return createSuccessResponse(explanation, requestId);
    }

    if (explainType === 'pattern') {
      const patternId = String(body.patternId || '').trim();
      if (!patternId) {
        return createErrorResponse('VALIDATION_ERROR', 'patternId is required', {}, 400, requestId);
      }
      const explanation = await explainPatternById(env, patternId);
      if (!explanation) {
        return createErrorResponse('NOT_FOUND', 'Pattern explanation not found', { patternId }, 404, requestId);
      }
      return createSuccessResponse(explanation, requestId);
    }

    return createErrorResponse('VALIDATION_ERROR', `Unsupported explainType: ${explainType}`, {}, 400, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_COPILOT_EXPLAIN_ERROR', sanitizeErrorMessage(error, 'copilot/explain'), {}, 500, requestId);
  }
}

export async function handleOperatorCopilotAction(request: Request, requestId: string, env: any) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    const command = String(body.command || '').trim();
    if (!command) {
      return createErrorResponse('VALIDATION_ERROR', 'command is required', {}, 400, requestId);
    }
    const confirmed = Boolean(body.confirmed);
    const result = await safeAssistAction(env, command, confirmed);
    return createSuccessResponse(result, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_COPILOT_ACTION_ERROR', sanitizeErrorMessage(error, 'copilot/action'), {}, 500, requestId);
  }
}

async function loadDriftMetrics(env: any) {
  const [signalReliability, staleEvidence, duplicateAction, weakDraft, scoreInflation] = await Promise.all([
    fetchDriftMetricsByType(env, 'signal_source_reliability', 10).catch(() => []),
    fetchDriftMetricsByType(env, 'stale_evidence_percentage', 10).catch(() => []),
    fetchDriftMetricsByType(env, 'duplicate_action_rate', 10).catch(() => []),
    fetchDriftMetricsByType(env, 'weak_draft_rate', 10).catch(() => []),
    fetchDriftMetricsByType(env, 'score_inflation', 10).catch(() => []),
  ]);
  return {
    signalReliability,
    staleEvidence,
    duplicateAction,
    weakDraft,
    scoreInflation,
  };
}

function buildLearningUpdates(operatorFeedback: any[], latestScoring: any, latestDraft: any, latestStrategy: any) {
  const updates = [];
  const editedDrafts = operatorFeedback.filter((item) => item.feedbackType === 'edited_draft').length;
  if (editedDrafts > 0) {
    updates.push({
      id: 'draft-edit-trend',
      title: 'Draft edit pressure',
      summary: `${editedDrafts} draft edits were captured recently.`,
    });
  }
  if (latestScoring?.versionId) {
    updates.push({
      id: 'scoring-policy',
      title: 'Scoring policy updated',
      summary: `Current scoring policy version is ${latestScoring.versionId}.`,
    });
  }
  if (latestDraft?.versionId) {
    updates.push({
      id: 'draft-policy',
      title: 'Draft policy active',
      summary: `Current draft policy version is ${latestDraft.versionId}.`,
    });
  }
  if (latestStrategy?.versionId) {
    updates.push({
      id: 'strategy-policy',
      title: 'Strategy instruction active',
      summary: `Current strategy version is ${latestStrategy.versionId}.`,
    });
  }
  return updates.slice(0, 6);
}

function buildSystemAlerts(driftMetrics: Record<string, any[]>, jobs: any[]) {
  const alerts = [];
  const severeMetric = Object.values(driftMetrics).flat().find((metric: any) => metric?.severity === 'high');
  if (severeMetric) {
    alerts.push({
      id: `metric-${severeMetric.metricType}`,
      level: 'warning',
      summary: `High-severity drift metric detected: ${severeMetric.metricType}.`,
    });
  }
  const queuedJobs = jobs.filter((job) => job.status === 'queued').length;
  if (queuedJobs > 50) {
    alerts.push({
      id: 'queued-jobs',
      level: 'warning',
      summary: `Job queue pressure is elevated (${queuedJobs} queued).`,
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      id: 'healthy',
      level: 'info',
      summary: 'No critical system alerts are active right now.',
    });
  }
  return alerts;
}
