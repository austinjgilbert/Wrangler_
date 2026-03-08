import { beforeEach, describe, expect, test, vi } from 'vitest';

const createOperatorFeedback = vi.fn(async (env, doc) => doc);
const fetchActionCandidateById = vi.fn();
const fetchDocumentsByIds = vi.fn();
const fetchSignalsForActionCandidate = vi.fn();
const updateActionCandidate = vi.fn(async () => {});
const fetchPatternByType = vi.fn(async () => null);
const upsertMoltPattern = vi.fn(async (env, doc) => doc);
const fetchLatestMoltbotConfig = vi.fn(async () => ({ _id: 'cfg-1', toneRules: [], operatingRules: [], values: [] }));
const updateMoltbotConfig = vi.fn(async () => {});
const createLearningRecord = vi.fn(async () => {});
const createUserPatternRecord = vi.fn(async () => {});
const createScoringPolicyVersion = vi.fn(async () => {});
const createDraftPolicyVersion = vi.fn(async () => {});
const createStrategyInstructionVersion = vi.fn(async () => {});

vi.mock('../../src/lib/sanity.ts', () => ({
  createOperatorFeedback,
  fetchActionCandidateById,
  fetchDocumentsByIds,
  fetchSignalsForActionCandidate,
  updateActionCandidate,
  fetchPatternByType,
  upsertMoltPattern,
  fetchLatestMoltbotConfig,
  updateMoltbotConfig,
  createLearningRecord,
  createUserPatternRecord,
  createScoringPolicyVersion,
  createDraftPolicyVersion,
  createStrategyInstructionVersion,
}));

const ensureBaselinePolicyVersions = vi.fn(async () => ({}));
const createPatternVersionRecord = vi.fn(async () => ({}));
const buildScoringPolicyVersion = vi.fn((input) => ({ _type: 'scoringPolicyVersion', policyType: 'scoring', ...input }));
const buildDraftPolicyVersion = vi.fn((input) => ({ _type: 'draftPolicyVersion', policyType: 'draft', ...input }));
const buildStrategyInstructionVersion = vi.fn((input) => ({ _type: 'strategyInstructionVersion', policyType: 'strategy', ...input }));

vi.mock('../../src/lib/policyVersioningService.ts', () => ({
  ensureBaselinePolicyVersions,
  createPatternVersionRecord,
  buildScoringPolicyVersion,
  buildDraftPolicyVersion,
  buildStrategyInstructionVersion,
}));

const compactRuleSet = vi.fn((values) => values);
vi.mock('../../src/lib/memoryHygieneService.ts', () => ({
  compactRuleSet,
}));

const recordOutcomeEvent = vi.fn(async () => ({ outcomeEventId: 'outcome-1' }));
vi.mock('../../src/lib/outcomeLinkingService.ts', () => ({
  recordOutcomeEvent,
}));

describe('operator feedback attribution guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchActionCandidateById.mockResolvedValue({
      _id: 'cand-1',
      id: 'cand-1',
      account: { _type: 'reference', _ref: 'acct-1' },
      person: { _type: 'reference', _ref: 'person-1' },
      signalRefs: [{ _type: 'reference', _ref: 'sig-1' }],
      evidenceRefs: [],
      actionType: 'send_email',
      patternMatch: 'scan.execution_ready',
      confidence: 0.82,
      uncertaintyState: 'likely',
      recommendedNextStep: 'Send email',
      whyNow: 'Strong fusion',
      signals: ['signup'],
      missingData: [],
      scoringVersion: 'scoring.v1',
      patternVersion: 'pattern.v1',
      draftPolicyVersion: 'draft.v1',
      strategyVersion: 'strategy.v1',
    });
    fetchDocumentsByIds.mockResolvedValue([
      { _type: 'signal', _id: 'sig-1', signalType: 'signup', strength: 0.9, timestamp: '2026-03-07T12:00:00.000Z', metadata: {} },
    ]);
    fetchSignalsForActionCandidate.mockResolvedValue([
      { _type: 'signal', _id: 'sig-broad', signalType: 'website_scan', strength: 0.4, timestamp: '2026-03-07T12:00:00.000Z', metadata: {} },
    ]);
  });

  test('uses candidate signalRefs before broad account/person fetches and records outcome linkage', async () => {
    const { recordFeedback } = await import('../../src/lib/operatorFeedback.ts');

    const result = await recordFeedback({}, {
      actionCandidateId: 'cand-1',
      feedbackType: 'booked_meeting',
      timestamp: '2026-03-07T12:00:00.000Z',
    });

    expect(fetchDocumentsByIds).toHaveBeenCalledWith({}, ['sig-1']);
    expect(fetchSignalsForActionCandidate).not.toHaveBeenCalled();
    expect(recordOutcomeEvent).toHaveBeenCalled();
    expect(result.outcomeEvent.outcomeEventId).toBe('outcome-1');
  });
});
