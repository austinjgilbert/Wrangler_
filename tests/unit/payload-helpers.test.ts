import { describe, it, expect } from 'vitest';
import { buildPayloadIndex, hydratePayload } from '../../src/lib/payload-helpers.js';

describe('buildPayloadIndex', () => {
  it('returns empty object for null/undefined', () => {
    expect(buildPayloadIndex(null)).toEqual({});
    expect(buildPayloadIndex(undefined)).toEqual({});
    expect(buildPayloadIndex('')).toEqual({});
  });

  it('sets all booleans to false for empty payload', () => {
    const index = buildPayloadIndex({});
    expect(index.hasScan).toBe(false);
    expect(index.hasDiscovery).toBe(false);
    expect(index.hasCrawl).toBe(false);
    expect(index.hasEvidence).toBe(false);
    expect(index.hasLinkedin).toBe(false);
    expect(index.hasBrief).toBe(false);
    expect(index.hasVerification).toBe(false);
    expect(index.hasCompetitors).toBe(false);
    expect(index.hasCompetitorResearch).toBe(false);
    expect(index.hasTechnologyStack).toBe(false);
    expect(index.hasBusinessUnits).toBe(false);
    expect(index.hasBusinessScale).toBe(false);
    expect(index.enrichmentState).toBeNull();
    expect(index.enrichmentCompletedAt).toBeNull();
  });

  it('detects top-level stage presence', () => {
    const index = buildPayloadIndex({
      scan: { technologyStack: { cms: ['WordPress'] }, businessScale: { revenue: '10M' } },
      discovery: { pages: [] },
      brief: { executiveSummary: 'test' },
      competitors: { competitors: [] },
      competitorResearch: { data: 'test' },
    });
    expect(index.hasScan).toBe(true);
    expect(index.hasDiscovery).toBe(true);
    expect(index.hasBrief).toBe(true);
    expect(index.hasCompetitors).toBe(true);
    expect(index.hasCompetitorResearch).toBe(true);
    expect(index.hasCrawl).toBe(false);
    expect(index.hasEvidence).toBe(false);
    expect(index.hasLinkedin).toBe(false);
    expect(index.hasVerification).toBe(false);
    expect(index.hasTechnologyStack).toBe(true);
    expect(index.hasBusinessScale).toBe(true);
    expect(index.hasBusinessUnits).toBe(false);
  });

  it('detects stages inside researchSet', () => {
    const index = buildPayloadIndex({
      researchSet: {
        scan: { technologyStack: { analytics: ['GA4'] }, businessUnits: { divisions: [] } },
        discovery: { pages: [] },
        crawl: { pages: [] },
        evidence: { packs: [] },
        linkedin: { people: [] },
        brief: { executiveSummary: 'test' },
        verification: { results: [] },
      },
    });
    expect(index.hasScan).toBe(true);
    expect(index.hasDiscovery).toBe(true);
    expect(index.hasCrawl).toBe(true);
    expect(index.hasEvidence).toBe(true);
    expect(index.hasLinkedin).toBe(true);
    expect(index.hasBrief).toBe(true);
    expect(index.hasVerification).toBe(true);
    expect(index.hasTechnologyStack).toBe(true);
    expect(index.hasBusinessUnits).toBe(true);
  });

  it('prefers top-level scan over researchSet for tech/business flags', () => {
    const index = buildPayloadIndex({
      scan: { technologyStack: { cms: ['WordPress'] } },
      researchSet: { scan: { businessScale: { revenue: '10M' } } },
    });
    // scan is top-level, so technologyStack comes from there
    expect(index.hasTechnologyStack).toBe(true);
    // businessScale is only in researchSet.scan, but buildPayloadIndex uses top-level scan first
    expect(index.hasBusinessScale).toBe(false);
  });

  it('preserves enrichmentState object', () => {
    const enrichmentState = {
      jobId: 'job-123',
      goalKey: 'full_pipeline',
      status: 'in_progress',
      currentStage: 'crawl',
      completedStages: ['initial_scan', 'discovery'],
      failedStages: [],
      startedAt: '2026-03-20T00:00:00Z',
      updatedAt: '2026-03-20T01:00:00Z',
      priority: 50,
      requestedStages: [],
      includeLinkedIn: true,
      includeBrief: true,
      includeVerification: true,
      maxDepth: 2,
      budget: 20,
      source: 'background_enrichment',
      createdBy: 'system',
    };
    const index = buildPayloadIndex({ enrichmentState });
    expect(index.enrichmentState).toEqual(enrichmentState);
    expect(index.enrichmentState.jobId).toBe('job-123');
  });

  it('preserves enrichmentCompletedAt', () => {
    const index = buildPayloadIndex({ enrichmentCompletedAt: '2026-03-20T02:00:00Z' });
    expect(index.enrichmentCompletedAt).toBe('2026-03-20T02:00:00Z');
  });

  it('produces exactly 14 keys (no extra attributes)', () => {
    const index = buildPayloadIndex({ scan: { technologyStack: {} } });
    const keys = Object.keys(index);
    expect(keys).toHaveLength(14);
    expect(keys.sort()).toEqual([
      'enrichmentCompletedAt',
      'enrichmentState',
      'hasBrief',
      'hasBusinessScale',
      'hasBusinessUnits',
      'hasCompetitorResearch',
      'hasCompetitors',
      'hasCrawl',
      'hasDiscovery',
      'hasEvidence',
      'hasLinkedin',
      'hasScan',
      'hasTechnologyStack',
      'hasVerification',
    ]);
  });
});

describe('hydratePayload', () => {
  it('returns empty object for null/undefined pack', () => {
    expect(hydratePayload(null)).toEqual({});
    expect(hydratePayload(undefined)).toEqual({});
    expect(hydratePayload({})).toEqual({});
  });

  it('returns old-style payload object (backward compat)', () => {
    const pack = { payload: { scan: { data: 'test' }, brief: { summary: 'hello' } } };
    const result = hydratePayload(pack);
    expect(result).toBe(pack.payload); // same reference
    expect(result.scan.data).toBe('test');
  });

  it('parses payloadData string (new format)', () => {
    const original = { scan: { technologyStack: { cms: ['WordPress'] } }, brief: { executiveSummary: 'test' } };
    const pack = { payloadData: JSON.stringify(original) };
    const result = hydratePayload(pack);
    expect(result).toEqual(original);
    expect(result.scan.technologyStack.cms[0]).toBe('WordPress');
  });

  it('prefers old payload object over payloadData when both exist (migration transition)', () => {
    const oldPayload = { scan: { data: 'old' } };
    const newPayload = { scan: { data: 'new' } };
    const pack = { payload: oldPayload, payloadData: JSON.stringify(newPayload) };
    const result = hydratePayload(pack);
    expect(result).toBe(oldPayload); // backward compat wins
  });

  it('returns empty object on corrupted payloadData', () => {
    const pack = { payloadData: 'not-valid-json{{{' };
    const result = hydratePayload(pack);
    expect(result).toEqual({});
  });

  it('handles payloadData with empty object', () => {
    const pack = { payloadData: '{}' };
    expect(hydratePayload(pack)).toEqual({});
  });

  it('does not treat string payload as object (edge case)', () => {
    // If payload is a string (shouldn't happen, but defensive)
    const pack = { payload: 'some-string' };
    expect(hydratePayload(pack)).toEqual({});
  });

  it('round-trips through buildPayloadIndex + JSON.stringify + hydratePayload', () => {
    const original = {
      scan: { technologyStack: { cms: ['WordPress', 'Sanity'] }, businessScale: { revenue: '10M' } },
      discovery: { pages: [{ url: 'https://example.com' }] },
      crawl: { pages: [{ url: 'https://example.com', content: 'Hello world' }] },
      evidence: { packs: [{ claims: ['claim1'] }] },
      linkedin: { people: [{ name: 'John', title: 'CEO' }] },
      brief: { executiveSummary: 'A great company' },
      verification: { results: [{ verified: true }] },
      competitors: { competitors: ['Acme Corp'] },
      competitorResearch: { data: 'research' },
      enrichmentState: { jobId: 'job-456', status: 'complete' },
      enrichmentCompletedAt: '2026-03-20T03:00:00Z',
      researchSet: { scan: { summary: 'test' } },
    };

    // Build index
    const index = buildPayloadIndex(original);
    expect(index.hasScan).toBe(true);
    expect(index.hasCompetitorResearch).toBe(true);
    expect(index.enrichmentState.jobId).toBe('job-456');

    // Stringify
    const blob = JSON.stringify(original);

    // Hydrate back
    const pack = { payloadData: blob };
    const hydrated = hydratePayload(pack);
    expect(hydrated).toEqual(original);

    // Verify index matches hydrated
    const reIndex = buildPayloadIndex(hydrated);
    expect(reIndex).toEqual(index);
  });
});
