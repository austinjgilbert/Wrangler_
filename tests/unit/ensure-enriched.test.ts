import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────

const mockGroqQuery = vi.fn();
const mockAssertSanityConfigured = vi.fn();
const mockTriggerGapFill = vi.fn();

vi.mock('../../src/services/gap-fill-orchestrator.js', () => ({
  triggerGapFill: (...args: any[]) => mockTriggerGapFill(...args),
}));

import { handleEnsureEnriched } from '../../src/handlers/ensure-enriched.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function makeRequest(body: any): Request {
  return new Request('https://worker.test/account/ensure-enriched', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function parseResponse(response: Response) {
  return response.json();
}

// ─── Fixtures ───────────────────────────────────────────────────────────

const ACCOUNT = {
  _id: 'account-test123',
  accountKey: 'test123',
  domain: 'example.com',
  canonicalUrl: 'https://example.com',
  companyName: 'Test Corp',
  opportunityScore: 75,
  lastScannedAt: new Date().toISOString(),
  technologyStack: { cms: ['WordPress'], analytics: ['GA4'], ecommerce: ['Shopify'], hosting: ['AWS'] },
  technologies: [{ _id: 'tech-1', name: 'WordPress' }],
  classification: { industry: 'tech' },
  leadership: [{ name: 'CEO' }],
  painPoints: [{ area: 'growth' }],
  benchmarks: { revenue: '10M' },
  competitors: [{ name: 'Rival' }],
  competitorResearch: [{ name: 'Rival' }],
  profileCompleteness: { score: 100 },
};

const ACCOUNT_PACK = {
  _id: 'accountPack-test123',
  accountKey: 'test123',
  payloadIndex: { scan: true, discovery: true, crawl: true, extraction: true, linkedin: true, brief: true, verification: true },
  payloadData: JSON.stringify({ scan: {}, discovery: {}, crawl: {}, evidence: {}, linkedin: {}, brief: {}, verification: {} }),
};

const ENRICHMENT_JOB_ACTIVE = {
  _id: 'job-123',
  accountKey: 'test123',
  status: 'in_progress',
  currentStage: 'crawl',
  completedStages: ['initial_scan', 'discovery'],
  _updatedAt: new Date().toISOString(),
};

// ─── Default mock setup ─────────────────────────────────────────────────

function setupMocks(overrides: {
  account?: any;
  accountPack?: any;
  enrichmentJob?: any;
} = {}) {
  mockAssertSanityConfigured.mockReturnValue({ projectId: 'test' });

  // groqQuery returns different results based on query content
  mockGroqQuery.mockImplementation((_client: any, query: string) => {
    if (query.includes('_type == "account"')) {
      return 'account' in overrides ? overrides.account : ACCOUNT;
    }
    if (query.includes('_type == "accountPack"')) {
      return 'accountPack' in overrides ? overrides.accountPack : ACCOUNT_PACK;
    }
    if (query.includes('enrich.job')) {
      return 'enrichmentJob' in overrides ? overrides.enrichmentJob : null;
    }
    return null;
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('handleEnsureEnriched', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Validation ──────────────────────────────────────────────────────

  it('returns 400 on missing body', async () => {
    const request = new Request('https://worker.test/account/ensure-enriched', {
      method: 'POST',
      body: '',
    });
    const res = await handleEnsureEnriched(request, 'req-1', {}, mockGroqQuery, mockAssertSanityConfigured);
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing accountKey', async () => {
    setupMocks();
    const res = await handleEnsureEnriched(makeRequest({}), 'req-2', {}, mockGroqQuery, mockAssertSanityConfigured);
    const json = await parseResponse(res);
    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 on non-string accountKey', async () => {
    setupMocks();
    const res = await handleEnsureEnriched(makeRequest({ accountKey: 123 }), 'req-3', {}, mockGroqQuery, mockAssertSanityConfigured);
    expect(res.status).toBe(400);
  });

  // ── Config errors ───────────────────────────────────────────────────

  it('returns 503 when Sanity not configured', async () => {
    const err = new Error('Not configured') as any;
    err.code = 'SANITY_NOT_CONFIGURED';
    mockAssertSanityConfigured.mockImplementation(() => { throw err; });

    const res = await handleEnsureEnriched(makeRequest({ accountKey: 'test123' }), 'req-4', {}, mockGroqQuery, mockAssertSanityConfigured);
    const json = await parseResponse(res);
    expect(res.status).toBe(503);
    expect(json.error.code).toBe('CONFIG_ERROR');
  });

  // ── Not found ───────────────────────────────────────────────────────

  it('returns 404 when account not found', async () => {
    setupMocks({ account: null });
    const res = await handleEnsureEnriched(makeRequest({ accountKey: 'nonexistent' }), 'req-5', {}, mockGroqQuery, mockAssertSanityConfigured);
    const json = await parseResponse(res);
    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  // ── Already complete ────────────────────────────────────────────────

  it('returns already_complete when profile is fully enriched', async () => {
    setupMocks();
    const res = await handleEnsureEnriched(makeRequest({ accountKey: 'test123' }), 'req-6', {}, mockGroqQuery, mockAssertSanityConfigured);
    const json = await parseResponse(res);
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.ensured).toBe(true);
    expect(json.data.action).toBe('already_complete');
    expect(json.data.completeness.score).toBeGreaterThan(0);
    expect(mockTriggerGapFill).not.toHaveBeenCalled();
  });

  // ── Enrichment in progress ──────────────────────────────────────────

  it('returns in_progress when enrichment job is active', async () => {
    setupMocks({ enrichmentJob: ENRICHMENT_JOB_ACTIVE });
    const res = await handleEnsureEnriched(makeRequest({ accountKey: 'test123' }), 'req-7', {}, mockGroqQuery, mockAssertSanityConfigured);
    const json = await parseResponse(res);
    expect(res.status).toBe(200);
    expect(json.data.action).toBe('in_progress');
    expect(json.data.jobId).toBe('job-123');
    expect(mockTriggerGapFill).not.toHaveBeenCalled();
  });

  // ── Triggers gap-fill ───────────────────────────────────────────────

  it('triggers gap-fill when profile has gaps', async () => {
    // Account with no enrichment data — many gaps
    setupMocks({
      account: { ...ACCOUNT, technologyStack: null, leadership: null, painPoints: null, benchmarks: null, competitors: null, classification: null },
      accountPack: null,
    });
    mockTriggerGapFill.mockResolvedValue({
      triggered: true,
      jobId: 'job-new',
      priority: 'high',
      stages: ['initial_scan', 'discovery'],
      currentScore: 0,
    });

    const res = await handleEnsureEnriched(makeRequest({ accountKey: 'test123' }), 'req-8', {}, mockGroqQuery, mockAssertSanityConfigured);
    const json = await parseResponse(res);
    expect(res.status).toBe(200);
    expect(json.data.action).toBe('triggered');
    expect(json.data.jobId).toBe('job-new');
    expect(json.data.priority).toBe('high');
    expect(json.data.stages).toContain('initial_scan');
    expect(mockTriggerGapFill).toHaveBeenCalledWith(expect.objectContaining({
      accountKey: 'test123',
      trigger: 'ensure_enriched',
    }));
  });

  // ── Force flag ──────────────────────────────────────────────────────

  it('triggers gap-fill with force even when complete', async () => {
    setupMocks();
    mockTriggerGapFill.mockResolvedValue({
      triggered: true,
      jobId: 'job-forced',
      priority: 'normal',
      stages: [],
      currentScore: 100,
    });

    const res = await handleEnsureEnriched(makeRequest({ accountKey: 'test123', force: true }), 'req-9', {}, mockGroqQuery, mockAssertSanityConfigured);
    const json = await parseResponse(res);
    expect(res.status).toBe(200);
    expect(json.data.action).toBe('triggered');
    expect(mockTriggerGapFill).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'ensure_enriched_force',
    }));
  });

  // ── Gap-fill declines ───────────────────────────────────────────────

  it('returns no_action when gap-fill declines to trigger', async () => {
    setupMocks({
      account: { ...ACCOUNT, technologyStack: null, leadership: null, painPoints: null, benchmarks: null, classification: null },
      accountPack: null,
    });
    mockTriggerGapFill.mockResolvedValue({
      triggered: false,
      reason: 'Cannot resolve URL for account',
    });

    const res = await handleEnsureEnriched(makeRequest({ accountKey: 'test123' }), 'req-10', {}, mockGroqQuery, mockAssertSanityConfigured);
    const json = await parseResponse(res);
    expect(res.status).toBe(200);
    expect(json.data.action).toBe('no_action');
    expect(json.data.reason).toBe('Cannot resolve URL for account');
  });

  // ── Internal error ──────────────────────────────────────────────────

  it('returns 500 on unexpected error without leaking details', async () => {
    // Make assertSanityConfigured throw a non-SANITY_NOT_CONFIGURED error
    // This hits the re-throw path → outer catch → 500
    mockAssertSanityConfigured.mockImplementation(() => {
      throw new Error('Sanity connection timeout');
    });

    const res = await handleEnsureEnriched(makeRequest({ accountKey: 'test123' }), 'req-11', {}, mockGroqQuery, mockAssertSanityConfigured);
    const json = await parseResponse(res);
    expect(res.status).toBe(500);
    expect(json.error.code).toBe('INTERNAL_ERROR');
    // S1: no error.message leaked
    expect(JSON.stringify(json)).not.toContain('Sanity connection timeout');
  });
});
