import { describe, expect, test } from 'vitest';
import { normalizeSignal } from '../../src/lib/signalIngestion.ts';

describe('signal ingestion freshness contract', () => {
  test('signup signal gets freshness metadata and stable uncertainty state', () => {
    const signal = normalizeSignal({
      source: 'product_signup',
      signalType: 'signup',
      account: { _type: 'reference', _ref: 'acct-1' },
      timestamp: '2026-03-07T12:00:00.000Z',
      metadata: { sourceUrl: 'https://example.com/signup' },
    });

    expect(signal.observedAt).toBe('2026-03-07T12:00:00.000Z');
    expect(signal.staleAfter).toBeTruthy();
    expect(signal.refreshPriority).toBeGreaterThan(0);
    expect(signal.uncertaintyState).toMatch(/confirmed|likely/);
  });
});
