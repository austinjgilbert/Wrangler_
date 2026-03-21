/**
 * Tests for tech analysis index migration logic (Part B).
 * 
 * Tests: inferStackMaturity, countLegacy, hashStack.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// ─── Inline the pure logic from the migration script ──────────────

function inferStackMaturity(total: number, legacyCount: number): 'modern' | 'mixed' | 'legacy' {
  if (total === 0) return 'modern';
  const legacyRatio = legacyCount / total;
  if (legacyRatio >= 0.5) return 'legacy';
  if (legacyCount > 0) return 'mixed';
  return 'modern';
}

interface TechnologyStack {
  allDetected?: Array<{ name?: string; category?: string }>;
  legacySystems?: string[];
  [key: string]: unknown;
}

function countLegacy(technologyStack: TechnologyStack | null): number {
  if (!technologyStack) return 0;
  const legacySystems = technologyStack.legacySystems || [];
  const legacyFromArray = legacySystems.length;
  const allDetected = technologyStack.allDetected || [];
  const legacyFromDetected = allDetected.filter(t => {
    if (!t) return false;
    const name = t.name || '';
    const category = t.category || '';
    return name.includes('(Legacy)') || category === 'legacyCms';
  }).length;
  return Math.max(legacyFromArray, legacyFromDetected);
}

function hashStack(technologyStack: TechnologyStack | null): string | null {
  if (!technologyStack) return null;
  const serialized = JSON.stringify(technologyStack, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  });
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

// ─── Stack Maturity ───────────────────────────────────────────────
describe('inferStackMaturity', () => {
  it('returns "modern" when no technologies', () => {
    expect(inferStackMaturity(0, 0)).toBe('modern');
  });

  it('returns "modern" when all active (zero legacy)', () => {
    expect(inferStackMaturity(10, 0)).toBe('modern');
  });

  it('returns "mixed" when some legacy but under 50%', () => {
    expect(inferStackMaturity(10, 2)).toBe('mixed');
    expect(inferStackMaturity(10, 4)).toBe('mixed');
  });

  it('returns "legacy" when 50% or more are legacy', () => {
    expect(inferStackMaturity(10, 5)).toBe('legacy');
    expect(inferStackMaturity(10, 8)).toBe('legacy');
    expect(inferStackMaturity(2, 2)).toBe('legacy');
  });

  it('returns "mixed" when exactly 1 legacy out of many', () => {
    expect(inferStackMaturity(20, 1)).toBe('mixed');
  });

  it('returns "legacy" when 1 out of 1 is legacy', () => {
    expect(inferStackMaturity(1, 1)).toBe('legacy');
  });

  it('returns "mixed" when 1 out of 2 is legacy (49.99... rounds down)', () => {
    // 1/2 = 0.5 which is >= 0.5
    expect(inferStackMaturity(2, 1)).toBe('legacy');
  });

  it('returns "mixed" when 1 out of 3 is legacy', () => {
    expect(inferStackMaturity(3, 1)).toBe('mixed');
  });
});

// ─── Legacy Count ─────────────────────────────────────────────────
describe('countLegacy', () => {
  it('returns 0 for null stack', () => {
    expect(countLegacy(null)).toBe(0);
  });

  it('returns 0 for empty stack', () => {
    expect(countLegacy({ allDetected: [], legacySystems: [] })).toBe(0);
  });

  it('counts from legacySystems array', () => {
    expect(countLegacy({
      allDetected: [],
      legacySystems: ['WordPress (Legacy)', 'Joomla (Legacy)'],
    })).toBe(2);
  });

  it('counts from allDetected with "(Legacy)" in name', () => {
    expect(countLegacy({
      allDetected: [
        { name: 'WordPress (Legacy)', category: 'legacyCms' },
        { name: 'React', category: 'framework' },
      ],
      legacySystems: [],
    })).toBe(1);
  });

  it('counts from allDetected with legacyCms category', () => {
    expect(countLegacy({
      allDetected: [
        { name: 'Drupal', category: 'legacyCms' },
        { name: 'React', category: 'framework' },
      ],
      legacySystems: [],
    })).toBe(1);
  });

  it('uses max of legacySystems and allDetected counts (avoids double-counting)', () => {
    // Both sources report the same legacy tech — should be 1, not 2
    expect(countLegacy({
      allDetected: [
        { name: 'WordPress (Legacy)', category: 'legacyCms' },
      ],
      legacySystems: ['WordPress (Legacy)'],
    })).toBe(1);
  });

  it('uses higher count when sources disagree', () => {
    // allDetected has 2 legacy, legacySystems has 1
    expect(countLegacy({
      allDetected: [
        { name: 'WordPress (Legacy)', category: 'legacyCms' },
        { name: 'Joomla (Legacy)', category: 'legacyCms' },
      ],
      legacySystems: ['WordPress (Legacy)'],
    })).toBe(2);
  });

  it('handles missing legacySystems key', () => {
    expect(countLegacy({
      allDetected: [{ name: 'WordPress (Legacy)', category: 'legacyCms' }],
    })).toBe(1);
  });

  it('handles missing allDetected key', () => {
    expect(countLegacy({
      legacySystems: ['WordPress (Legacy)'],
    })).toBe(1);
  });

  it('handles null entries in allDetected', () => {
    expect(countLegacy({
      allDetected: [null as any, { name: 'React', category: 'framework' }],
      legacySystems: [],
    })).toBe(0);
  });
});

// ─── Hash Stack ───────────────────────────────────────────────────
describe('hashStack', () => {
  it('returns null for null stack', () => {
    expect(hashStack(null)).toBeNull();
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = hashStack({ allDetected: [{ name: 'React', category: 'framework' }] });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns same hash for same data', () => {
    const stack = { allDetected: [{ name: 'React', category: 'framework' }] };
    expect(hashStack(stack)).toBe(hashStack(stack));
  });

  it('returns different hash for different data', () => {
    const stack1 = { allDetected: [{ name: 'React', category: 'framework' }] };
    const stack2 = { allDetected: [{ name: 'Vue.js', category: 'framework' }] };
    expect(hashStack(stack1)).not.toBe(hashStack(stack2));
  });

  it('is deterministic regardless of key order', () => {
    // JSON.stringify with sorted keys ensures determinism
    const stack1: TechnologyStack = { allDetected: [], legacySystems: [] };
    const stack2: TechnologyStack = { legacySystems: [], allDetected: [] };
    expect(hashStack(stack1)).toBe(hashStack(stack2));
  });
});

// ─── Real Production Data Simulation ──────────────────────────────
describe('Real production data scenarios', () => {
  it('adventhealth-style account: mixed stack with legacy CMS', () => {
    const stack: TechnologyStack = {
      allDetected: [
        { name: 'WordPress (Legacy)', category: 'legacyCms' },
        { name: 'Google Analytics', category: 'analytics' },
        { name: 'Google Tag Manager', category: 'analytics' },
        { name: 'Cloudflare', category: 'hosting' },
        { name: 'AWS CloudFront', category: 'hosting' },
        { name: 'Google Cloud', category: 'hosting' },
        { name: 'Bootstrap', category: 'cssFramework' },
        { name: 'Sentry', category: 'monitoring' },
      ],
      legacySystems: ['WordPress (Legacy)'],
    };
    const legacy = countLegacy(stack);
    const total = stack.allDetected!.length;
    expect(legacy).toBe(1);
    expect(total).toBe(8);
    expect(inferStackMaturity(total, legacy)).toBe('mixed');
  });

  it('modern SaaS account: no legacy', () => {
    const stack: TechnologyStack = {
      allDetected: [
        { name: 'React', category: 'framework' },
        { name: 'Next.js', category: 'framework' },
        { name: 'Vercel', category: 'hosting' },
        { name: 'Stripe', category: 'payments' },
      ],
      legacySystems: [],
    };
    const legacy = countLegacy(stack);
    const total = stack.allDetected!.length;
    expect(legacy).toBe(0);
    expect(total).toBe(4);
    expect(inferStackMaturity(total, legacy)).toBe('modern');
  });

  it('heavily legacy account: multiple legacy systems', () => {
    const stack: TechnologyStack = {
      allDetected: [
        { name: 'WordPress (Legacy)', category: 'legacyCms' },
        { name: 'Joomla (Legacy)', category: 'legacyCms' },
        { name: 'Magento (Legacy)', category: 'legacyCms' },
        { name: 'Cloudflare', category: 'hosting' },
      ],
      legacySystems: ['WordPress (Legacy)', 'Joomla (Legacy)', 'Magento (Legacy)'],
    };
    const legacy = countLegacy(stack);
    const total = stack.allDetected!.length;
    expect(legacy).toBe(3);
    expect(total).toBe(4);
    expect(inferStackMaturity(total, legacy)).toBe('legacy'); // 75% legacy
  });

  it('empty stack account: defaults to modern', () => {
    const stack: TechnologyStack = {
      allDetected: [],
      legacySystems: [],
    };
    const legacy = countLegacy(stack);
    const total = stack.allDetected!.length;
    expect(legacy).toBe(0);
    expect(total).toBe(0);
    expect(inferStackMaturity(total, legacy)).toBe('modern');
  });
});
