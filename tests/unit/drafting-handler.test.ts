import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock draftingEngine
vi.mock('../../src/lib/draftingEngine.ts', () => ({
  generateEmailDraft: vi.fn(),
  regenerateDraft: vi.fn(),
}));

import { handleGenerateDraft, handleRegenerateDraft } from '../../src/handlers/drafting.js';
import { generateEmailDraft, regenerateDraft } from '../../src/lib/draftingEngine.ts';

const mockCandidate = {
  _id: 'candidate-1',
  _type: 'actionCandidate',
  id: 'candidate-1',
  actionType: 'outreach',
  patternMatch: 'migration_signal',
  opportunityScore: 72,
  confidence: 0.8,
  whyNow: 'Legacy CMS detected',
  recommendedNextStep: 'Send intro email',
  signals: ['migration_signal'],
  evidence: ['Uses WordPress 4.x'],
  missingData: [],
  account: { _ref: 'account-1' },
  person: { _ref: 'person-1' },
  draftPolicyVersion: 'draft.v1',
  strategyVersion: 'strategy.v1',
  scoringVersion: 'scoring.v1',
  rankingPolicyVersion: 'ranking.v1',
  confidenceBreakdown: {
    dataConfidence: 0.7,
    entityConfidence: 0.8,
    patternConfidence: 0.75,
    actionConfidence: 0.65,
    draftConfidence: 0.6,
  },
};

const mockAccount = {
  _id: 'account-1',
  companyName: 'Acme Corp',
  domain: 'acme.com',
  technologyStack: {
    cms: ['WordPress'],
    frameworks: ['React'],
    legacySystems: ['jQuery'],
  },
};

const mockPerson = {
  _id: 'person-1',
  name: 'Jane Smith',
  currentTitle: 'VP Engineering',
};

const mockSignals = [
  {
    _id: 'signal-1',
    _type: 'signalEvent',
    signalType: 'migration_signal',
    strength: 0.8,
    timestamp: new Date().toISOString(),
    source: 'web',
    account: { _ref: 'account-1' },
  },
];

const mockDraftOutput = {
  actionCandidateId: 'candidate-1',
  outreachAngle: 'Migration opportunity',
  personaFraming: 'VP-level modernization pitch',
  evidenceReference: 'WordPress 4.x detected',
  sanityPositioning: 'Content operating system',
  subject: 'Question on Acme content stack',
  shortEmailDraft: 'Hi Jane, I noticed...',
  callOpeningLine: 'Hi Jane, reaching out because...',
  generatedAt: new Date().toISOString(),
  model: 'gpt-4',
  draftPolicyVersion: 'draft.v1',
  strategyVersion: 'strategy.v1',
  confidenceBreakdown: mockCandidate.confidenceBreakdown,
};

function makeRequest(body: any): Request {
  return new Request('https://worker/drafting/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRegenerateRequest(body: any): Request {
  return new Request('https://worker/drafting/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// groqQuery mock that returns different results based on query
// Uses 'in' check instead of ?? to allow explicit null overrides
function createGroqQuery(overrides: Record<string, any> = {}) {
  return vi.fn().mockImplementation((_client: any, query: string, _params: any) => {
    if (query.includes('actionCandidate')) return 'candidate' in overrides ? overrides.candidate : mockCandidate;
    if (query.includes('"account"')) return 'account' in overrides ? overrides.account : mockAccount;
    if (query.includes('"person"')) return 'person' in overrides ? overrides.person : mockPerson;
    if (query.includes('signalEvent')) return 'signals' in overrides ? overrides.signals : mockSignals;
    return null;
  });
}

const mockClient = { projectId: 'test', dataset: 'test' };
const assertSanityConfigured = vi.fn().mockReturnValue(mockClient);
const mockEnv = { OPENAI_API_KEY: 'test-key' };

describe('handleGenerateDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when actionCandidateId is missing', async () => {
    const request = makeRequest({});
    const response = await handleGenerateDraft(request, 'req-1', mockEnv, createGroqQuery(), assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when body is not JSON', async () => {
    const request = new Request('https://worker/drafting/generate', {
      method: 'POST',
      body: 'not json',
    });
    const response = await handleGenerateDraft(request, 'req-1', mockEnv, createGroqQuery(), assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  it('returns 404 when candidate not found', async () => {
    const groqQuery = createGroqQuery({ candidate: null });
    const request = makeRequest({ actionCandidateId: 'nonexistent' });
    const response = await handleGenerateDraft(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe('NOT_FOUND');
  });

  it('generates draft successfully with full context', async () => {
    (generateEmailDraft as any).mockResolvedValue(mockDraftOutput);
    const groqQuery = createGroqQuery();
    const request = makeRequest({ actionCandidateId: 'candidate-1' });

    const response = await handleGenerateDraft(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.actionCandidateId).toBe('candidate-1');
    expect(data.data.shortEmailDraft).toBe('Hi Jane, I noticed...');
    expect(data.data.subject).toBe('Question on Acme content stack');

    // Verify generateEmailDraft was called with correct context
    expect(generateEmailDraft).toHaveBeenCalledOnce();
    const callArgs = (generateEmailDraft as any).mock.calls[0];
    expect(callArgs[0]).toBe(mockEnv);
    expect(callArgs[1].actionCandidate).toEqual(mockCandidate);
    expect(callArgs[1].account).toEqual(mockAccount);
    expect(callArgs[1].person).toEqual(mockPerson);
    expect(callArgs[1].signals).toEqual(mockSignals);
    expect(callArgs[1].detectedTechnologies).toContain('WordPress');
    expect(callArgs[1].detectedTechnologies).toContain('React');
  });

  it('passes optional parameters through', async () => {
    (generateEmailDraft as any).mockResolvedValue(mockDraftOutput);
    const groqQuery = createGroqQuery();
    const request = makeRequest({
      actionCandidateId: 'candidate-1',
      objective: 'Book a meeting',
      tone: 'Casual',
      maxEmailWords: 80,
    });

    await handleGenerateDraft(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);

    const callArgs = (generateEmailDraft as any).mock.calls[0];
    expect(callArgs[1].objective).toBe('Book a meeting');
    expect(callArgs[1].tone).toBe('Casual');
    expect(callArgs[1].maxEmailWords).toBe(80);
  });

  it('handles missing account and person gracefully', async () => {
    const candidateNoRefs = { ...mockCandidate, account: null, person: null };
    (generateEmailDraft as any).mockResolvedValue(mockDraftOutput);
    const groqQuery = createGroqQuery({ candidate: candidateNoRefs });
    const request = makeRequest({ actionCandidateId: 'candidate-1' });

    const response = await handleGenerateDraft(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it('does not leak error.message in response', async () => {
    (generateEmailDraft as any).mockRejectedValue(new Error('LLM API key expired'));
    const groqQuery = createGroqQuery();
    const request = makeRequest({ actionCandidateId: 'candidate-1' });

    const response = await handleGenerateDraft(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
    expect(JSON.stringify(data)).not.toContain('LLM API key expired');
  });
});

describe('handleRegenerateDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when actionCandidateId is missing', async () => {
    const request = makeRegenerateRequest({});
    const response = await handleRegenerateDraft(request, 'req-1', mockEnv, createGroqQuery(), assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  it('regenerates draft with operator feedback', async () => {
    const candidateWithDraft = {
      ...mockCandidate,
      currentDraft: { shortEmailDraft: 'Previous draft text', subject: 'Old subject' },
    };
    (regenerateDraft as any).mockResolvedValue(mockDraftOutput);
    const groqQuery = createGroqQuery({ candidate: candidateWithDraft });
    const request = makeRegenerateRequest({
      actionCandidateId: 'candidate-1',
      operatorFeedback: 'Make it shorter and more direct',
    });

    const response = await handleRegenerateDraft(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);

    const callArgs = (regenerateDraft as any).mock.calls[0];
    expect(callArgs[1].operatorFeedback).toBe('Make it shorter and more direct');
    expect(callArgs[1].previousDraft).toEqual(candidateWithDraft.currentDraft);
  });

  it('handles missing previous draft gracefully', async () => {
    (regenerateDraft as any).mockResolvedValue(mockDraftOutput);
    const groqQuery = createGroqQuery();
    const request = makeRegenerateRequest({
      actionCandidateId: 'candidate-1',
      operatorFeedback: 'Improve it',
    });

    const response = await handleRegenerateDraft(request, 'req-1', mockEnv, groqQuery, assertSanityConfigured);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);

    const callArgs = (regenerateDraft as any).mock.calls[0];
    expect(callArgs[1].previousDraft).toBeNull();
  });
});
