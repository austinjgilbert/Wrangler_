import { beforeEach, describe, expect, test, vi } from 'vitest';
import { scenarioFixtures } from './fixtures/scenarios/index.ts';

const createMetricSnapshot = vi.fn(async (env, doc) => doc);
const createEnrichJob = vi.fn(async (env, doc) => doc);

vi.mock('../../src/lib/sanity.ts', async () => {
  const actual = await vi.importActual<any>('../../src/lib/sanity.ts');
  return {
    ...actual,
    createMetricSnapshot,
    createEnrichJob,
  };
});

describe('nightly intelligence scenario protections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('generateTomorrowPriorityQueue defaults to 100 actions and snapshots the queue', async () => {
    const { generateTomorrowPriorityQueue } = await import('../../src/lib/nightlyIntelligence.ts');
    const fixture = scenarioFixtures.find((item) => item.id === 'high-volume-action-queue')!;

    const queue = await generateTomorrowPriorityQueue({}, {
      candidates: fixture.inputBundle.actionCandidates || [],
      accounts: fixture.inputBundle.accounts || [],
      people: fixture.inputBundle.people || [],
      signals: fixture.inputBundle.signals || [],
      now: fixture.now,
    });

    expect(queue.limit).toBe(100);
    expect(createMetricSnapshot).toHaveBeenCalled();
  });

  test('backfillMissingEntityFields creates deterministic retryable jobs', async () => {
    const { backfillMissingEntityFields } = await import('../../src/lib/nightlyIntelligence.ts');
    const result = await backfillMissingEntityFields({}, {
      accounts: [
        {
          _type: 'account',
          _id: 'acct-stale',
          accountKey: 'acct-stale',
          updatedAt: '2025-12-01T00:00:00.000Z',
        },
      ],
      people: [],
      now: '2026-03-07T12:00:00.000Z',
    });

    expect(result.jobsQueued[0]).toBe('enrich.job.nightly.account.acct-stale.2026-03-07');
    expect(createEnrichJob).toHaveBeenCalledWith({}, expect.objectContaining({
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: '2026-03-07T12:00:00.000Z',
    }));
  });
});
