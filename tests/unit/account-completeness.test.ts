/**
 * Unit tests for account-completeness.js
 *
 * Tests the core gap analysis logic that drives the entire enrichment pipeline.
 */

import { describe, it, expect } from 'vitest';
import {
  analyseCompleteness,
  buildCompletenessSummary,
  needsBackgroundWork,
  getRefreshIntervalDays,
  isAccountStale,
} from '../../src/services/account-completeness.js';

describe('analyseCompleteness', () => {
  it('returns 0% for empty account with no pack', () => {
    const result = analyseCompleteness(null, null, null);
    expect(result.score).toBe(0);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.nextStages.length).toBeGreaterThan(0);
  });

  it('returns 0% for empty account with empty pack', () => {
    const result = analyseCompleteness({}, { payload: {} }, null);
    expect(result.score).toBe(0);
    expect(result.gaps).toContain('scan');
    expect(result.gaps).toContain('discovery');
    expect(result.gaps).toContain('technologies');
  });

  it('gives 15% credit for scan data', () => {
    const pack = { payload: { scan: { technologyStack: ['React'] } } };
    const result = analyseCompleteness({}, pack, null);
    expect(result.score).toBe(15);
    expect(result.gaps).not.toContain('scan');
  });

  it('gives credit for Content OS fields on account', () => {
    const account = {
      technologies: [{ _ref: 'tech-1' }],
      leadership: [{ _ref: 'person-1' }],
      painPoints: [{ category: 'performance', description: 'Slow loads' }],
      benchmarks: { estimatedEmployees: '500' },
    };

    const result = analyseCompleteness(account, null, null);

    expect(result.dimensions.technologies?.present).toBe(true);
    expect(result.dimensions.leadership?.present).toBe(true);
    expect(result.dimensions.painPoints?.present).toBe(true);
    expect(result.dimensions.benchmarks?.present).toBe(true);

    // technologies 6 + leadership 8 + painPoints 5 + benchmarks 5 = 24
    expect(result.score).toBe(24);
  });

  it('returns 100% for fully enriched account', () => {
    const account = {
      technologies: [{ _ref: 'tech-1' }],
      technologyStack: {
        analytics: ['GA4'],
        ecommerce: ['Shopify'],
        hosting: ['Cloudflare'],
      },
      leadership: [{ _ref: 'person-1' }],
      painPoints: [{ category: 'tech-debt', description: 'Legacy CMS' }],
      benchmarks: { estimatedEmployees: '200' },
      competitorResearch: { count: 3 },
      classification: { industry: 'SaaS' },
    };

    const pack = {
      payload: {
        scan: { ts: true },
        discovery: { pages: [] },
        crawl: { pages: [] },
        evidence: { entities: [] },
        linkedin: { profiles: [] },
        brief: { sections: [] },
        verification: { verified: [] },
      },
    };

    const result = analyseCompleteness(account, pack, null);
    expect(result.score).toBe(100);
    expect(result.gaps).toHaveLength(0);
  });

  it('identifies correct next stages for missing pipeline data', () => {
    const result = analyseCompleteness({}, { payload: {} }, null);

    // Pipeline stages should be in nextStages
    expect(result.nextStages).toContain('initial_scan');
    expect(result.nextStages).toContain('discovery');
    expect(result.nextStages).toContain('crawl');
    expect(result.nextStages).toContain('extraction');
    expect(result.nextStages).toContain('linkedin');
    expect(result.nextStages).toContain('brief');
    expect(result.nextStages).toContain('verification');
  });

  it('handles researchSet alternative field paths', () => {
    const pack = {
      payload: {
        researchSet: {
          discovery: { pages: [] },
          crawl: { data: true },
          evidence: { entities: [] },
          linkedin: { profiles: [] },
          brief: { content: 'summary' },
          verification: { results: [] },
        },
      },
    };

    const result = analyseCompleteness({}, pack, null);

    // These should all be present via researchSet path
    expect(result.dimensions.discovery?.present).toBe(true);
    expect(result.dimensions.crawl?.present).toBe(true);
    expect(result.dimensions.extraction?.present).toBe(true);
    expect(result.dimensions.linkedin?.present).toBe(true);
    expect(result.dimensions.brief?.present).toBe(true);
    expect(result.dimensions.verification?.present).toBe(true);
  });
});

describe('buildCompletenessSummary', () => {
  it('builds a summary with all required fields', () => {
    const summary = buildCompletenessSummary({}, { payload: {} }, null);

    expect(summary).toHaveProperty('score');
    expect(summary).toHaveProperty('gaps');
    expect(summary).toHaveProperty('nextStages');
    expect(summary).toHaveProperty('dimensionFlags');
    expect(summary).toHaveProperty('assessedAt');
    expect(typeof summary.score).toBe('number');
    expect(Array.isArray(summary.gaps)).toBe(true);
    expect(typeof summary.assessedAt).toBe('string');
  });

  it('dimensionFlags are boolean values', () => {
    const summary = buildCompletenessSummary({}, { payload: {} }, null);

    for (const [_key, value] of Object.entries(summary.dimensionFlags)) {
      expect(typeof value).toBe('boolean');
    }
  });
});

describe('needsBackgroundWork', () => {
  it('returns needed=true for empty account', () => {
    const result = needsBackgroundWork({}, { payload: {} });
    expect(result.needed).toBe(true);
    expect(result.stages.length).toBeGreaterThan(0);
  });

  it('returns needed=false for fully enriched account', () => {
    const account = {
      technologies: [{ _ref: 'tech-1' }],
      technologyStack: {
        analytics: ['GA4'],
        ecommerce: ['Shopify'],
        hosting: ['Cloudflare'],
      },
      leadership: [{ _ref: 'person-1' }],
      painPoints: [{ category: 'tech-debt', description: 'Legacy' }],
      benchmarks: { estimatedEmployees: '200' },
      competitorResearch: { count: 3 },
      classification: { industry: 'SaaS' },
    };

    const pack = {
      payload: {
        scan: { ts: true },
        discovery: { pages: [] },
        crawl: { pages: [] },
        evidence: { entities: [] },
        linkedin: { profiles: [] },
        brief: { sections: [] },
        verification: { verified: [] },
      },
    };

    const result = needsBackgroundWork(account, pack);
    expect(result.needed).toBe(false);
  });
});

describe('getRefreshIntervalDays', () => {
  it('returns 3 days for high-value accounts (≥80)', () => {
    expect(getRefreshIntervalDays(80)).toBe(3);
    expect(getRefreshIntervalDays(95)).toBe(3);
  });

  it('returns 7 days for medium-value accounts (≥50)', () => {
    expect(getRefreshIntervalDays(50)).toBe(7);
    expect(getRefreshIntervalDays(79)).toBe(7);
  });

  it('returns 14 days for low-value accounts (≥30)', () => {
    expect(getRefreshIntervalDays(30)).toBe(14);
    expect(getRefreshIntervalDays(49)).toBe(14);
  });

  it('returns 30 days for minimal-value accounts (<30)', () => {
    expect(getRefreshIntervalDays(0)).toBe(30);
    expect(getRefreshIntervalDays(29)).toBe(30);
  });

  it('defaults to 30 days when undefined', () => {
    expect(getRefreshIntervalDays(undefined as any)).toBe(30);
  });
});

describe('isAccountStale', () => {
  it('returns stale when lastScannedAt is missing', () => {
    const result = isAccountStale({ opportunityScore: 50 });
    expect(result.isStale).toBe(true);
    expect(result.daysSinceScan).toBeNull();
  });

  it('returns stale when scan is older than interval', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    const result = isAccountStale({ opportunityScore: 50, lastScannedAt: tenDaysAgo });
    // 50 score → 7 day interval, 10 days ago → stale
    expect(result.isStale).toBe(true);
    expect(result.intervalDays).toBe(7);
    expect(result.daysSinceScan).toBeGreaterThanOrEqual(10);
  });

  it('returns not stale when scan is recent', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 86400000).toISOString();
    const result = isAccountStale({ opportunityScore: 50, lastScannedAt: oneDayAgo });
    // 50 score → 7 day interval, 1 day ago → not stale
    expect(result.isStale).toBe(false);
    expect(result.intervalDays).toBe(7);
    expect(result.daysSinceScan).toBeLessThanOrEqual(1);
  });

  it('returns stale for high-value account with 4-day-old scan', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString();
    const result = isAccountStale({ opportunityScore: 85, lastScannedAt: fourDaysAgo });
    // 85 score → 3 day interval, 4 days ago → stale
    expect(result.isStale).toBe(true);
    expect(result.intervalDays).toBe(3);
  });

  it('handles invalid date gracefully', () => {
    const result = isAccountStale({ opportunityScore: 50, lastScannedAt: 'not-a-date' });
    expect(result.isStale).toBe(true);
    expect(result.daysSinceScan).toBeNull();
  });

  it('handles null account gracefully', () => {
    const result = isAccountStale(null);
    expect(result.isStale).toBe(true);
    expect(result.intervalDays).toBe(30);
  });
});
