import { beforeEach, describe, expect, test, vi } from 'vitest';

const fetchPatternByType = vi.fn(async () => null);
const upsertMoltPattern = vi.fn(async (env, doc) => doc);
const createScoringPolicyVersion = vi.fn(async () => {});
const fetchAccounts = vi.fn(async () => []);
const fetchActionCandidates = vi.fn(async () => []);
const fetchLatestMoltbotConfig = vi.fn(async () => ({ _id: 'cfg-1', operatingRules: [], toneRules: [], values: [] }));
const fetchPeople = vi.fn(async () => []);
const fetchSignals = vi.fn(async () => []);
const createEnrichJob = vi.fn(async () => {});
const createMetricSnapshot = vi.fn(async () => {});
const createMoltEvent = vi.fn(async () => {});
const createStrategyBrief = vi.fn(async () => {});
const fetchSignalsForActionCandidate = vi.fn(async () => []);
const updateMoltbotConfig = vi.fn(async () => {});

vi.mock('../../src/lib/sanity.ts', () => ({
  fetchPatternByType,
  upsertMoltPattern,
  createScoringPolicyVersion,
  fetchAccounts,
  fetchActionCandidates,
  fetchLatestMoltbotConfig,
  fetchPeople,
  fetchSignals,
  createEnrichJob,
  createMetricSnapshot,
  createMoltEvent,
  createStrategyBrief,
  fetchSignalsForActionCandidate,
  updateMoltbotConfig,
}));

const ensureBaselinePolicyVersions = vi.fn(async () => ({}));
const buildScoringPolicyVersion = vi.fn((input) => ({ _type: 'scoringPolicyVersion', policyType: 'scoring', ...input }));
const createPatternVersionRecord = vi.fn(async () => {});
const buildStrategyInstructionVersion = vi.fn((input) => ({ _type: 'strategyInstructionVersion', policyType: 'strategy', ...input }));

vi.mock('../../src/lib/policyVersioningService.ts', () => ({
  ensureBaselinePolicyVersions,
  buildScoringPolicyVersion,
  createPatternVersionRecord,
  buildStrategyInstructionVersion,
}));

vi.mock('../../src/lib/events.ts', () => ({
  buildEventDoc: vi.fn((input) => ({ _id: `event.${input.type}`, ...input })),
}));

vi.mock('../../src/lib/opportunityEngine.ts', () => ({
  generateTopActionQueue: vi.fn(() => ({ date: '2026-03-07', limit: 100, generatedAt: '2026-03-07T12:00:00.000Z', actions: [] })),
}));

vi.mock('../../src/lib/nightlyIntelligence.ts', () => ({
  generateTomorrowPriorityQueue: vi.fn(async () => ({ date: '2026-03-07', limit: 100, generatedAt: '2026-03-07T12:00:00.000Z', actions: [] })),
  rescoreAllActionCandidates: vi.fn(async () => ({ ranked: [], updatedCount: 0, newlyElevatedAccounts: [] })),
}));

vi.mock('../../src/lib/sdrCommandInterface.ts', () => ({
  buildTopActionsTodayView: vi.fn(() => ({ title: 'TOP ACTIONS TODAY', generatedAt: '2026-03-07T12:00:00.000Z', totalActions: 0, page: 1, pageSize: 50, hasMore: false, actions: [] })),
}));

vi.mock('../../src/lib/draftingEngine.ts', () => ({
  generateEmailDraft: vi.fn(async () => ({ actionCandidateId: 'cand-1', subject: 'Hi', shortEmailDraft: 'Body', evidenceReference: '', outreachAngle: '', personaFraming: '', sanityPositioning: '', callOpeningLine: '', generatedAt: '2026-03-07T12:00:00.000Z' })),
}));

vi.mock('../../src/lib/jobs.ts', () => ({
  enqueueActionCandidateJob: vi.fn(async () => ({ _id: 'job-1' })),
}));

vi.mock('../../src/services/gmail-workflow.ts', () => ({
  saveDraftRecord: vi.fn(async () => ({ draftId: 'draft-1' })),
}));

describe('superuser policy versioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('adjustSignalWeights creates a scoring policy version', async () => {
    const { adjustSignalWeights } = await import('../../src/lib/superuserInterface.ts');

    await adjustSignalWeights({}, {
      weights: { signup: 1.4, pricing_page_visit: 1.2 },
      note: 'Boost high-intent sources',
    });

    expect(ensureBaselinePolicyVersions).toHaveBeenCalled();
    expect(createScoringPolicyVersion).toHaveBeenCalled();
    expect(upsertMoltPattern).toHaveBeenCalled();
  });
});
