import type { ActionCandidate, OperatorFeedback, OperatorFeedbackType, SignalEvent } from '../../shared/types.ts';
import {
  createDraftPolicyVersion,
  createLearningRecord,
  createOperatorFeedback,
  createScoringPolicyVersion,
  createStrategyInstructionVersion,
  createUserPatternRecord,
  fetchActionCandidateById,
  fetchDocumentsByIds,
  fetchLatestMoltbotConfig,
  fetchSignalsForActionCandidate,
  updateActionCandidate,
  updateMoltbotConfig,
  upsertMoltPattern,
  fetchPatternByType,
} from './sanity.ts';
import {
  buildDraftPolicyVersion,
  buildScoringPolicyVersion,
  buildStrategyInstructionVersion,
  createPatternVersionRecord,
  ensureBaselinePolicyVersions,
} from './policyVersioningService.ts';
import { compactRuleSet } from './memoryHygieneService.ts';
import { recordOutcomeEvent } from './outcomeLinkingService.ts';

const MIN_SIGNAL_WEIGHT_PROMOTION_COUNT = 3;
const MIN_PATTERN_PROMOTION_COUNT = 3;

type FeedbackInput = {
  actionCandidateId: string;
  idempotencyKey?: string;
  feedbackType: OperatorFeedbackType;
  operatorEdit?: string;
  timestamp?: string;
  outcome?: string;
};

export async function recordFeedback(env: any, input: FeedbackInput) {
  await ensureBaselinePolicyVersions(env, {
    actor: 'operator',
    reason: 'Ensure baseline policy versions exist before recording operator feedback.',
    now: input.timestamp || new Date().toISOString(),
  }).catch(() => null);
  const candidate = await fetchActionCandidateById(env, input.actionCandidateId) as ActionCandidate | null;
  if (!candidate?._id) {
    throw new Error(`ActionCandidate not found: ${input.actionCandidateId}`);
  }

  const feedback = buildOperatorFeedback(input, candidate);
  await createOperatorFeedback(env, feedback);

  const signals = await resolveSignalsForFeedback(env, candidate);

  await updateActionCandidate(env, candidate._id, deriveActionCandidateStatePatch(candidate, feedback));
  const signalWeights = await updateSignalWeights(env, { actionCandidate: candidate, feedback, signals });
  const patternStrength = await updatePatternStrength(env, { actionCandidate: candidate, feedback });
  const promptRetraining = await retrainDraftPrompts(env, { actionCandidate: candidate, feedback });
  const outcomeEvent = await recordFeedbackOutcomeEvent(env, candidate, feedback);
  await storeFeedbackLearningArtifacts(env, { actionCandidate: candidate, feedback, signals });

  return {
    feedback,
    signalWeights,
    patternStrength,
    promptRetraining,
    outcomeEvent,
  };
}

export async function updateSignalWeights(env: any, input: {
  actionCandidate: ActionCandidate;
  feedback: OperatorFeedback;
  signals?: SignalEvent[];
}) {
  const signals = Array.isArray(input.signals) ? input.signals : [];
  const existing = await fetchPatternByType(env, 'operator.signalWeights');
  const weights = { ...(existing?.successStats?.weights || {}) };
  const counters = { ...(existing?.successStats?.counters || {}) };
  const delta = signalFeedbackDelta(input.feedback.feedbackType);
  const impacted: Record<string, number> = {};
  const observedOnly: string[] = [];
  const lowTrust = isLowTrustFeedback(input.actionCandidate, input.feedback);

  const signalTypes = uniqueStrings(signals.map((signal) => signal.signalType));
  for (const signalType of signalTypes) {
    counters[signalType] = (counters[signalType] || 0) + 1;
    if (lowTrust || counters[signalType] < MIN_SIGNAL_WEIGHT_PROMOTION_COUNT || delta === 0) {
      observedOnly.push(signalType);
      continue;
    }
    const current = typeof weights[signalType] === 'number' ? weights[signalType] : 1;
    const next = clamp(current + (delta * 0.35), 0.4, 1.6);
    weights[signalType] = round(next);
    impacted[signalType] = weights[signalType];
  }

  const doc = {
    _type: 'molt.pattern',
    _id: existing?._id || 'molt.pattern.operator.signalWeights',
    patternType: 'operator.signalWeights',
    conditions: {},
    recommendedMoves: buildSignalWeightRecommendations(impacted, input.feedback.feedbackType),
    evidenceEvents: [],
    successStats: {
      ...(existing?.successStats || {}),
      weights,
      counters,
      lastFeedbackType: input.feedback.feedbackType,
      observedOnly,
      lowTrust,
      updatedAt: input.feedback.timestamp,
    },
    lastUpdated: input.feedback.timestamp,
  };
  await upsertMoltPattern(env, doc);
  if (Object.keys(impacted).length > 0) {
    await createScoringPolicyVersion(env, buildScoringPolicyVersion({
      versionId: `scoring.feedback.${safeDocId(input.feedback._id)}`,
      changedBy: 'operator-feedback',
      changedAt: input.feedback.timestamp,
      reason: `Promote signal-weight updates from feedback ${input.feedback.feedbackType}.`,
      previousVersion: input.actionCandidate.scoringVersion || 'scoring.default',
      expectedImpact: `Adjust ranking sensitivity for ${Object.keys(impacted).join(', ')}.`,
      activationStatus: 'active',
      weights,
      thresholds: { minimumSampleSize: MIN_SIGNAL_WEIGHT_PROMOTION_COUNT },
    }));
  }
  return { impacted, observedOnly, promoted: Object.keys(impacted).length > 0, patternId: doc._id };
}

export async function updatePatternStrength(env: any, input: {
  actionCandidate: ActionCandidate;
  feedback: OperatorFeedback;
}) {
  const patternKey = input.actionCandidate.patternMatch || 'unknown';
  const existing = await fetchPatternByType(env, 'operator.patternStrength');
  const strengths = { ...(existing?.successStats?.strengths || {}) };
  const entry = strengths[patternKey] || { score: 0.5, count: 0, lastOutcome: null };
  const nextCount = (entry.count || 0) + 1;
  const delta = patternFeedbackDelta(input.feedback.feedbackType);
  const lowTrust = isLowTrustFeedback(input.actionCandidate, input.feedback);
  const shouldPromote = !lowTrust && nextCount >= MIN_PATTERN_PROMOTION_COUNT && delta !== 0;
  const nextScore = shouldPromote
    ? clamp((entry.score || 0.5) + (delta * 0.25), 0, 1)
    : clamp(entry.score || 0.5, 0, 1);
  strengths[patternKey] = {
    score: round(nextScore),
    count: nextCount,
    lastOutcome: input.feedback.outcome || input.feedback.feedbackType,
    updatedAt: input.feedback.timestamp,
    promoted: shouldPromote,
  };

  const doc = {
    _type: 'molt.pattern',
    _id: existing?._id || 'molt.pattern.operator.patternStrength',
    patternType: 'operator.patternStrength',
    conditions: {},
    recommendedMoves: buildPatternRecommendations(patternKey, strengths[patternKey]),
    evidenceEvents: [],
    successStats: {
      ...(existing?.successStats || {}),
      strengths,
      updatedAt: input.feedback.timestamp,
    },
    lastUpdated: input.feedback.timestamp,
  };
  await upsertMoltPattern(env, doc);
  if (shouldPromote) {
    await createPatternVersionRecord(env, {
      patternKey,
      changedBy: 'operator-feedback',
      reason: `Update pattern strength from ${input.feedback.feedbackType}.`,
      expectedImpact: `Refine ranking confidence for pattern ${patternKey}.`,
      now: input.feedback.timestamp,
    });
  }
  return { patternKey, strength: strengths[patternKey], promoted: shouldPromote, patternId: doc._id };
}

export async function retrainDraftPrompts(env: any, input: {
  actionCandidate: ActionCandidate;
  feedback: OperatorFeedback;
}) {
  const config = await fetchLatestMoltbotConfig(env);
  if (!config?._id) {
    return { updated: false, reason: 'missing_moltbot_config' };
  }

  const toneRules = compactRuleSet([
    ...(config.toneRules || []),
    ...deriveToneRules(input.actionCandidate, input.feedback),
  ], 25);

  const operatingRules = compactRuleSet([
    ...(config.operatingRules || []),
    ...deriveOperatingRules(input.actionCandidate, input.feedback),
  ], 40);

  await updateMoltbotConfig(env, config._id, {
    toneRules,
    operatingRules,
  });
  await createDraftPolicyVersion(env, buildDraftPolicyVersion({
    versionId: `draft.feedback.${safeDocId(input.feedback._id)}`,
    changedBy: 'operator-feedback',
    changedAt: input.feedback.timestamp,
    reason: `Promote draft learnings from ${input.feedback.feedbackType}.`,
    previousVersion: input.actionCandidate.draftPolicyVersion || 'draft.default',
    expectedImpact: 'Improve future draft specificity and operator fit.',
    activationStatus: 'active',
    toneRules,
    operatingRules,
    systemPrompt: 'Feedback-informed SDR drafting policy.',
  }));
  await createStrategyInstructionVersion(env, buildStrategyInstructionVersion({
    versionId: `strategy.feedback.${safeDocId(input.feedback._id)}`,
    changedBy: 'operator-feedback',
    changedAt: input.feedback.timestamp,
    reason: `Capture strategy-level operator learnings from ${input.feedback.feedbackType}.`,
    previousVersion: input.actionCandidate.strategyVersion || 'strategy.default',
    expectedImpact: 'Make future drafts and ranking more aligned with validated operator behavior.',
    activationStatus: 'active',
    operatingRules,
    toneRules,
    values: config.values || [],
  }));

  return {
    updated: true,
    configId: config._id,
    toneRulesAdded: deriveToneRules(input.actionCandidate, input.feedback),
    operatingRulesAdded: deriveOperatingRules(input.actionCandidate, input.feedback),
  };
}

function buildOperatorFeedback(input: FeedbackInput, candidate?: ActionCandidate | null): OperatorFeedback {
  const timestamp = input.timestamp || new Date().toISOString();
  const idempotencyKey = String(
    input.idempotencyKey ||
    [
      input.actionCandidateId,
      input.feedbackType,
      timestamp,
      input.operatorEdit || '',
      input.outcome || '',
    ].join('|'),
  ).trim();
  const id = `operatorFeedback.${safeDocId(idempotencyKey)}`;
  return {
    _type: 'operatorFeedback',
    _id: id,
    actionCandidate: { _type: 'reference', _ref: input.actionCandidateId },
    actionCandidateId: input.actionCandidateId,
    idempotencyKey,
    scoringVersion: candidate?.scoringVersion,
    patternVersion: candidate?.patternVersion,
    draftPolicyVersion: candidate?.draftPolicyVersion,
    strategyVersion: candidate?.strategyVersion,
    feedbackType: input.feedbackType,
    operatorEdit: input.operatorEdit ? String(input.operatorEdit).trim() : undefined,
    timestamp,
    outcome: input.outcome ? String(input.outcome).trim() : undefined,
  };
}

function deriveActionCandidateStatePatch(candidate: ActionCandidate, feedback: OperatorFeedback) {
  const patch: Record<string, any> = {
    updatedAt: feedback.timestamp,
  };
  if (feedback.feedbackType === 'sent_draft') {
    patch.draftStatus = 'approved';
  }
  if (feedback.feedbackType === 'edited_draft') {
    patch.draftStatus = 'drafted';
  }
  if (feedback.feedbackType === 'ignored_action') {
    patch.lifecycleStatus = 'completed';
  }
  if (feedback.feedbackType === 'marked_incorrect') {
    patch.lifecycleStatus = 'expired';
    patch.draftStatus = 'expired';
  }
  if (feedback.feedbackType === 'booked_meeting') {
    patch.lifecycleStatus = 'completed';
    patch.draftStatus = 'approved';
  }
  return patch;
}

async function storeFeedbackLearningArtifacts(env: any, input: {
  actionCandidate: ActionCandidate;
  feedback: OperatorFeedback;
  signals: SignalEvent[];
}) {
  const now = input.feedback.timestamp;
  const accountRef = input.actionCandidate.account?._ref
    ? [{ _type: 'reference', _ref: input.actionCandidate.account._ref }]
    : [];

  await createLearningRecord(env, {
    _type: 'learning',
    _id: `learning.operatorFeedback.${input.feedback._id}`,
    learningId: `operator-feedback-${input.feedback._id}`,
    title: `Operator feedback: ${input.feedback.feedbackType}`,
    summary: buildLearningSummary(input.actionCandidate, input.feedback, input.signals),
    derivedFrom: [],
    applicableToAccounts: accountRef,
    applicableToBriefs: [],
    patternType: input.actionCandidate.patternMatch || 'operator.feedback',
    memoryPhrase: `Feedback on ${input.actionCandidate.actionType}`,
    relevanceScore: clamp(Math.abs(feedbackDelta(input.feedback.feedbackType)), 0, 1),
    contextTags: uniqueStrings([
      'operator-feedback',
      input.feedback.feedbackType,
      input.actionCandidate.actionType,
      input.actionCandidate.patternMatch || '',
    ]),
    recommendedActions: [
      input.actionCandidate.recommendedNextStep,
      `Apply ${input.feedback.feedbackType} learnings to future drafts for ${input.actionCandidate.patternMatch || 'similar patterns'}.`,
    ].filter(Boolean),
    tags: uniqueStrings(input.actionCandidate.signals || []),
    confidence: clamp(input.actionCandidate.confidence || 0.5, 0, 1),
    createdAt: now,
  });

  await createUserPatternRecord(env, {
    _type: 'userPattern',
    _id: `userPattern.operatorFeedback.${input.feedback._id}`,
    userId: 'operator',
    userSegment: 'sdr',
    timestamp: now,
    action: input.feedback.feedbackType,
    approach: input.feedback.operatorEdit || input.actionCandidate.whyNow || '',
    context: {
      accountKey: input.actionCandidate.account?._ref || null,
      accountDomain: null,
      intent: input.actionCandidate.patternMatch || null,
      persona: input.actionCandidate.person?._ref || null,
    },
    outcome: input.feedback.outcome || input.feedback.feedbackType,
    timeSpent: null,
    toolsUsed: ['draftingEngine', 'opportunityEngine', 'operatorFeedback'],
    sequence: [input.actionCandidate.actionType, input.feedback.feedbackType],
    thinking: buildLearningSummary(input.actionCandidate, input.feedback, input.signals),
    metadata: {
      value: JSON.stringify({
        actionCandidateId: input.actionCandidate.id,
        signals: input.signals.map((signal) => signal.signalType),
      }),
    },
  });
}

function buildLearningSummary(actionCandidate: ActionCandidate, feedback: OperatorFeedback, signals: SignalEvent[]) {
  const signalText = signals.length ? signals.slice(0, 3).map((signal) => signal.signalType).join(', ') : 'no linked signals';
  return `Feedback ${feedback.feedbackType} was recorded for ${actionCandidate.actionType}. Pattern ${actionCandidate.patternMatch || 'unknown'} and signals ${signalText} should be adjusted based on outcome ${feedback.outcome || 'not provided'}.`;
}

function deriveToneRules(actionCandidate: ActionCandidate, feedback: OperatorFeedback): string[] {
  const rules: string[] = [];
  if (feedback.feedbackType === 'edited_draft' && feedback.operatorEdit) {
    rules.push(`Mirror operator-approved phrasing patterns from edits: ${truncate(feedback.operatorEdit, 160)}`);
  }
  if (feedback.feedbackType === 'booked_meeting') {
    rules.push(`When pattern ${actionCandidate.patternMatch || 'unknown'} appears, keep the outreach concise and tied to immediate business relevance.`);
  }
  if (feedback.feedbackType === 'marked_incorrect') {
    rules.push(`Avoid overstating unverified claims for pattern ${actionCandidate.patternMatch || 'unknown'}; be explicit about observed evidence only.`);
  }
  return rules;
}

function deriveOperatingRules(actionCandidate: ActionCandidate, feedback: OperatorFeedback): string[] {
  const rules: string[] = [];
  const signalSummary = (actionCandidate.signals || []).slice(0, 3).join(', ');
  if (feedback.feedbackType === 'sent_draft' || feedback.feedbackType === 'booked_meeting') {
    rules.push(`Favor ${actionCandidate.actionType} when pattern ${actionCandidate.patternMatch || 'unknown'} appears with signals: ${signalSummary || 'none listed'}.`);
  }
  if (feedback.feedbackType === 'ignored_action') {
    rules.push(`De-prioritize ${actionCandidate.actionType} when missing data includes ${(actionCandidate.missingData || []).slice(0, 3).join(', ') || 'unknown gaps'}.`);
  }
  if (feedback.feedbackType === 'marked_incorrect') {
    rules.push(`Require stronger evidence before generating ${actionCandidate.actionType} for pattern ${actionCandidate.patternMatch || 'unknown'}.`);
  }
  return rules;
}

function feedbackDelta(feedbackType: OperatorFeedbackType): number {
  if (feedbackType === 'booked_meeting') return 0.35;
  if (feedbackType === 'sent_draft') return 0.12;
  if (feedbackType === 'edited_draft') return -0.05;
  if (feedbackType === 'ignored_action') return -0.12;
  if (feedbackType === 'marked_incorrect') return -0.3;
  return 0;
}

function signalFeedbackDelta(feedbackType: OperatorFeedbackType): number {
  if (feedbackType === 'edited_draft') return 0;
  return feedbackDelta(feedbackType);
}

function patternFeedbackDelta(feedbackType: OperatorFeedbackType): number {
  if (feedbackType === 'edited_draft') return 0;
  return feedbackDelta(feedbackType);
}

function buildSignalWeightRecommendations(impacted: Record<string, number>, feedbackType: OperatorFeedbackType): string[] {
  return Object.keys(impacted).map((signalType) => `${feedbackType} adjusted signal weight for ${signalType} to ${impacted[signalType]}.`);
}

function buildPatternRecommendations(patternKey: string, entry: { score: number; count: number }): string[] {
  return [`Pattern ${patternKey} now has strength ${entry.score} across ${entry.count} feedback events.`];
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function truncate(value: string, max: number): string {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function safeDocId(value: string): string {
  return String(value || 'feedback')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function resolveSignalsForFeedback(env: any, candidate: ActionCandidate): Promise<SignalEvent[]> {
  const directRefs = (candidate.signalRefs || []).map((ref) => ref?._ref).filter(Boolean);
  if (directRefs.length > 0) {
    const docs = await fetchDocumentsByIds(env, directRefs);
    return docs.filter((doc: any) => doc?._type === 'signal') as SignalEvent[];
  }
  return fetchSignalsForActionCandidate(env, {
    accountRef: candidate.account?._ref || null,
    personRef: candidate.person?._ref || null,
  }) as Promise<SignalEvent[]>;
}

function isLowTrustFeedback(candidate: ActionCandidate, feedback: OperatorFeedback): boolean {
  return candidate.uncertaintyState === 'contradictory'
    || candidate.uncertaintyState === 'stale'
    || feedback.feedbackType === 'marked_incorrect';
}

async function recordFeedbackOutcomeEvent(env: any, candidate: ActionCandidate, feedback: OperatorFeedback) {
  const eventType = feedback.feedbackType === 'sent_draft'
    ? 'sent'
    : feedback.feedbackType === 'edited_draft'
      ? 'drafted'
      : feedback.feedbackType === 'ignored_action'
        ? 'ignored'
        : feedback.feedbackType === 'booked_meeting'
          ? 'meeting_booked'
          : 'bad_fit';
  return recordOutcomeEvent(env, {
    actionCandidateId: candidate._id,
    eventType,
    observedAt: feedback.timestamp,
    actor: 'operator',
    outcomeLabel: feedback.outcome || feedback.feedbackType,
    metadata: {
      feedbackType: feedback.feedbackType,
    },
  }).catch(() => null);
}

function clamp(value: number, min: number, max: number): number {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, numeric));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
