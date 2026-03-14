import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueEnrichmentJob = vi.fn();
const getEnrichmentStatus = vi.fn();
const executeEnrichmentStage = vi.fn();
const executeVirtualEnrichmentStage = vi.fn();
const listEnrichmentJobs = vi.fn();
const autoEnrichAccount = vi.fn();
const getCompleteResearchSet = vi.fn();

const runAutomaticSelfHeal = vi.fn();
const triggerGapFill = vi.fn();

vi.mock('../../src/services/enrichment-service.js', () => ({
  queueEnrichmentJob,
  getEnrichmentStatus,
  getCompleteResearchSet,
  executeEnrichmentStage,
  executeVirtualEnrichmentStage,
  listEnrichmentJobs,
  autoEnrichAccount,
}));

vi.mock('../../src/services/self-heal.js', () => ({
  runAutomaticSelfHeal,
}));

vi.mock('../../src/services/gap-fill-orchestrator.js', () => ({
  triggerGapFill,
}));

const { handleQueueEnrichment, handleAdvanceEnrichment } = await import('../../src/handlers/enrichment.js');

function createJsonRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('enrichment handlers', () => {
  const env = { SANITY_PROJECT_ID: 'demo' };
  const client = { name: 'mock-client' };
  const groqQuery = vi.fn();
  const upsertDocument = vi.fn();
  const patchDocument = vi.fn();
  const assertSanityConfigured = vi.fn(() => client);
  const handlers = {
    handleScan: vi.fn(),
    handleDiscover: vi.fn(),
    handleCrawl: vi.fn(),
    handleExtract: vi.fn(),
    handleLinkedInProfile: vi.fn(),
    handleBrief: vi.fn(),
    handleVerify: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queueEnrichmentJob.mockResolvedValue({ success: true, jobId: 'job-123', status: 'pending' });
    getEnrichmentStatus.mockResolvedValue({ status: 'failed', jobId: 'job-123' });
    runAutomaticSelfHeal.mockResolvedValue({ ok: true });
    triggerGapFill.mockResolvedValue({ triggered: true });
  });

  it('queues deep enrichment with expanded pipeline options and background self-heal', async () => {
    const executionContext = { waitUntil: vi.fn() };

    const response = await handleQueueEnrichment(
      createJsonRequest('https://example.com/enrich/queue', {
        accountKey: 'acme',
        canonicalUrl: 'https://acme.com',
        mode: 'deep',
      }),
      'req-deep',
      env,
      groqQuery,
      upsertDocument,
      assertSanityConfigured,
      executionContext
    );

    expect(queueEnrichmentJob).toHaveBeenCalledTimes(1);
    const queueOptions = queueEnrichmentJob.mock.calls[0][5];
    expect(queueOptions.goalKey).toMatch(/^deep_pipeline_/);
    expect(queueOptions.requestedStages).toEqual([
      'initial_scan',
      'discovery',
      'crawl',
      'extraction',
      'linkedin',
      'brief',
      'verification',
    ]);
    expect(queueOptions.maxDepth).toBe(3);
    expect(queueOptions.budget).toBe(40);
    expect(queueOptions.includeVerification).toBe(true);

    expect(executionContext.waitUntil).toHaveBeenCalledTimes(1);
    await executionContext.waitUntil.mock.calls[0][0];
    expect(runAutomaticSelfHeal).toHaveBeenCalledWith(env, { requestId: 'req-deep' });
    expect(triggerGapFill).toHaveBeenCalledWith({
      env,
      accountKey: 'acme',
      canonicalUrl: 'https://acme.com',
      trigger: 'enrich_auto_resolution',
    });

    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.mode).toBe('deep');
    expect(payload.data.selfHealingScheduled).toBe(true);
    expect(payload.data.repairActions).toEqual(['scheduled']);
  });

  it('resolves account context from accountId before queueing restart runs', async () => {
    groqQuery.mockResolvedValueOnce({
      _id: 'account.acme',
      accountKey: 'acme',
      canonicalUrl: 'https://acme.com',
      domain: 'acme.com',
      rootDomain: 'acme.com',
    });

    await handleQueueEnrichment(
      createJsonRequest('https://example.com/enrich/queue', {
        accountId: 'account-acme',
        mode: 'restart',
        selfHeal: false,
      }),
      'req-restart',
      env,
      groqQuery,
      upsertDocument,
      assertSanityConfigured,
      null
    );

    expect(queueEnrichmentJob).toHaveBeenCalledTimes(1);
    expect(queueEnrichmentJob.mock.calls[0][3]).toBe('https://acme.com');
    expect(queueEnrichmentJob.mock.calls[0][4]).toBe('acme');
    expect(queueEnrichmentJob.mock.calls[0][5].goalKey).toMatch(/^restart_/);
  });

  it('schedules automatic resolution in background when advancing a failed job', async () => {
    const executionContext = { waitUntil: vi.fn() };

    const response = await handleAdvanceEnrichment(
      createJsonRequest('https://example.com/enrich/advance', {
        accountKey: 'acme',
      }),
      'req-advance',
      env,
      groqQuery,
      upsertDocument,
      patchDocument,
      assertSanityConfigured,
      handlers,
      executionContext
    );

    expect(executionContext.waitUntil).toHaveBeenCalledTimes(1);
    await executionContext.waitUntil.mock.calls[0][0];
    expect(runAutomaticSelfHeal).toHaveBeenCalledWith(env, { requestId: 'req-advance-repair' });
    expect(triggerGapFill).toHaveBeenCalledWith({
      env,
      accountKey: 'acme',
      canonicalUrl: null,
      trigger: 'enrich_auto_resolution',
    });

    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.status.status).toBe('failed');
    expect(payload.data.status.selfHealingScheduled).toBe(true);
    expect(payload.data.status.repairActions).toEqual(['scheduled']);
  });
});
