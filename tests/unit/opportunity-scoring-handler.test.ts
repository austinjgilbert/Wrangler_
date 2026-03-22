import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleOpportunityScore } from '../../src/handlers/opportunity-scoring.js';

const now = '2026-03-22T03:00:00.000Z';

const mockCandidates = [
  {
    _id: 'candidate-1',
    _type: 'actionCandidate',
    actionType: 'outreach',
    patternMatch: 'execution_ready',
    opportunityScore: 0,
    confidence: 0.8,
    lifecycleStatus: 'active',
    expirationTime: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-03-21T12:00:00.000Z',
    account: { _ref: 'account-1' },
    person: { _ref: 'person-1' },
    signals: ['migration_signal'],
    evidence: ['Uses WordPress 4.x'],
    missingData: [],
    whyNow: 'Legacy CMS detected',
    recommendedNextStep: 'Send intro email',
    draftStatus: 'ready',
  },
  {
    _id: 'candidate-2',
    _type: 'actionCandidate',
    actionType: 'follow_up',
    patternMatch: 'follow_up_required',
    opportunityScore: 0,
    confidence: 0.5,
    lifecycleStatus: 'active',
    expirationTime: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-03-20T12:00:00.000Z',
    account: { _ref: 'account-2' },
    person: null,
    signals: [],
    evidence: [],
    missingData: ['contact_info'],
    whyNow: null,
    recommendedNextStep: null,
    draftStatus: null,
  },
];

const mockAccounts = [
  {
    _id: 'account-1',
    accountKey: 'acme-corp',
    companyName: 'Acme Corp',
    opportunityScore: 80,
    profileCompleteness: { score: 75 },
    aiReadiness: { score: 60 },
    technologyStack: {
      legacySystems: ['jQuery'],
      migrationOpportunities: ['CMS modernization'],
      painPoints: ['Slow content delivery'],
    },
    lastScannedAt: '2026-03-21T10:00:00.000Z',
    updatedAt: '2026-03-21T12:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
  },
  {
    _id: 'account-2',
    accountKey: 'beta-inc',
    companyName: 'Beta Inc',
    opportunityScore: 40,
    profileCompleteness: { score: 30 },
    aiReadiness: { score: 20 },
    technologyStack: {},
    lastScannedAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-10T12:00:00.000Z',
    createdAt: '2026-02-01T00:00:00.000Z',
  },
];

const mockPeople = [
  {
    _id: 'person-1',
    name: 'Jane Smith',
    currentTitle: 'VP Engineering',
    isDecisionMaker: true,
    seniorityLevel: 'vp',
  },
];

const mockSignals = [
  {
    _id: 'signal-1',
    _type: 'signalEvent',
    signalType: 'migration_signal',
    strength: 0.8,
    timestamp: '2026-03-21T08:00:00.000Z',
    account: { _ref: 'account-1' },
    metadata: { baseStrength: 0.8 },
  },
];

function createGroqQuery(overrides: Record<string, any> = {}) {
  return vi.fn().mockImplementation((_client: any, query: string, _params: any) => {
    if (query.includes('actionCandidate')) return overrides.candidates ?? mockCandidates;
    if (query.includes('"account"')) return overrides.accounts ?? mockAccounts;
    if (query.includes('"person"')) return overrides.people ?? mockPeople;
    if (query.includes('signalEvent')) return overrides.signals ?? mockSignals;
    return null;
  });
}

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('https://worker/opportunities/score');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), { method: 'GET' });
}

const mockClient = { projectId: 'test', dataset: 'test' };
const assertSanityConfigured = vi.fn().mockReturnValue(mockClient);
const mockEnv = {};

describe('handleOpportunityScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns scored and ranked candidates', async () => {
    const groqQuery = createGroqQuery();
    const request = makeRequest();

    const response = await handleOpportunityScore(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.actions).toBeDefined();
    expect(data.data.actions.length).toBeGreaterThan(0);
    expect(data.data.totalCandidates).toBe(2);

    // First action should be higher scored (execution_ready + VP + strong signals)
    const first = data.data.actions[0];
    expect(first.rank).toBe(1);
    expect(first.score).toBeDefined();
    expect(first.score.total).toBeGreaterThan(0);
    expect(first.score.strongestDrivers).toBeDefined();
  });

  it('returns empty actions when no candidates exist', async () => {
    const groqQuery = createGroqQuery({ candidates: [] });
    const request = makeRequest();

    const response = await handleOpportunityScore(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.actions).toEqual([]);
    expect(data.data.totalCandidates).toBe(0);
  });

  it('filters by accountKey when provided', async () => {
    const groqQuery = createGroqQuery();
    const request = makeRequest({ accountKey: 'acme-corp' });

    await handleOpportunityScore(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);

    // Verify the GROQ query includes accountKey filter
    const candidateQuery = groqQuery.mock.calls[0][1];
    expect(candidateQuery).toContain('accountKey == $accountKey');
  });

  it('respects limit parameter', async () => {
    const groqQuery = createGroqQuery();
    const request = makeRequest({ limit: '1' });

    const response = await handleOpportunityScore(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(200);
    // The GROQ query should include the limit
    const candidateQuery = groqQuery.mock.calls[0][1];
    expect(candidateQuery).toContain('[0...1]');
  });

  it('clamps limit to max 200', async () => {
    const groqQuery = createGroqQuery();
    const request = makeRequest({ limit: '999' });

    await handleOpportunityScore(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);

    const candidateQuery = groqQuery.mock.calls[0][1];
    expect(candidateQuery).toContain('[0...200]');
  });

  it('supports rank mode (raw ranked list)', async () => {
    const groqQuery = createGroqQuery();
    const request = makeRequest({ mode: 'rank' });

    const response = await handleOpportunityScore(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.actions).toBeDefined();
    // rank mode doesn't have date/limit fields from queue
    expect(data.data.generatedAt).toBeDefined();
  });

  it('does not leak error.message in response', async () => {
    const groqQuery = vi.fn().mockRejectedValue(new Error('Sanity project ID nlqb7zmk connection failed'));
    const request = makeRequest();

    const response = await handleOpportunityScore(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
    expect(JSON.stringify(data)).not.toContain('nlqb7zmk');
    expect(JSON.stringify(data)).not.toContain('connection failed');
  });

  it('passes maxPerAccount through to queue generation', async () => {
    const groqQuery = createGroqQuery();
    const request = makeRequest({ maxPerAccount: '1' });

    const response = await handleOpportunityScore(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(200);
    // With maxPerAccount=1, should have at most 1 action per account
    const accountRefs = data.data.actions.map((a: any) => a.candidate?.account?._ref);
    const counts = new Map<string, number>();
    for (const ref of accountRefs) {
      counts.set(ref, (counts.get(ref) || 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(1);
    }
  });
});
