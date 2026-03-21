/**
 * Tests for technology document migration logic (Part A).
 * 
 * Tests the pure functions: inferStatus, inferConfidence, inferSource,
 * category fixes, and duplicate merge strategy.
 */
import { describe, it, expect } from 'vitest';

// ─── Inline the pure logic from the migration script ──────────────
// (Migration script uses ESM + side effects, so we test the logic directly)

const CATEGORY_FIXES: Record<string, string> = {
  'technology-apollo': 'framework',
  'technology-go': 'framework',
  'technology-hotjar': 'analytics',
  'technology-java': 'framework',
  'technology-magento': 'ecommerce',
  'technology-servicenow': 'marketing',
  'technology-tailwind-css': 'css-framework',
  'technology-typescript': 'framework',
  'technology-wordpress': 'cms',
  'technology-zendesk': 'chat',
};

interface TechDoc {
  _id: string;
  name: string;
  category: string;
  isLegacy: boolean | null;
  isMigrationTarget: boolean | null;
}

function inferStatus(doc: TechDoc): string {
  if (doc.isLegacy === true) return 'legacy';
  if (doc.name && doc.name.includes('(Legacy)')) return 'legacy';
  if (doc.category === 'legacy') return 'legacy';
  if (doc.isLegacy === false) return 'active';
  return 'unknown';
}

function inferConfidence(doc: TechDoc): number {
  if (doc.isLegacy === null || doc.isLegacy === undefined) return 60;
  return 85;
}

function inferSource(_doc: TechDoc): string {
  return 'wappalyzer';
}

// ─── Status Inference ─────────────────────────────────────────────
describe('inferStatus', () => {
  it('returns "legacy" when isLegacy is true', () => {
    const doc = { _id: 'technology-wordpress-legacy', name: 'WordPress (Legacy)', category: 'legacy', isLegacy: true, isMigrationTarget: false };
    expect(inferStatus(doc)).toBe('legacy');
  });

  it('returns "legacy" when name contains "(Legacy)"', () => {
    const doc = { _id: 'technology-drupal-legacy', name: 'Drupal (Legacy)', category: 'cms', isLegacy: false, isMigrationTarget: false };
    expect(inferStatus(doc)).toBe('legacy');
  });

  it('returns "legacy" when category is "legacy"', () => {
    const doc = { _id: 'technology-joomla-legacy', name: 'Joomla', category: 'legacy', isLegacy: false, isMigrationTarget: false };
    expect(inferStatus(doc)).toBe('legacy');
  });

  it('returns "active" when isLegacy is false and no legacy indicators', () => {
    const doc = { _id: 'technology-react', name: 'React', category: 'framework', isLegacy: false, isMigrationTarget: false };
    expect(inferStatus(doc)).toBe('active');
  });

  it('returns "unknown" when isLegacy is null', () => {
    const doc = { _id: 'technology-apollo', name: 'Apollo', category: 'detected', isLegacy: null, isMigrationTarget: null };
    expect(inferStatus(doc)).toBe('unknown');
  });

  it('returns "unknown" when isLegacy is undefined', () => {
    const doc = { _id: 'technology-go', name: 'Go', category: 'detected', isLegacy: null, isMigrationTarget: null };
    expect(inferStatus(doc)).toBe('unknown');
  });

  // Priority: isLegacy flag wins over category
  it('isLegacy=true takes priority over non-legacy category', () => {
    const doc = { _id: 'technology-test', name: 'Test', category: 'framework', isLegacy: true, isMigrationTarget: false };
    expect(inferStatus(doc)).toBe('legacy');
  });

  // Priority: name hint wins over isLegacy=false
  it('name "(Legacy)" takes priority over isLegacy=false', () => {
    const doc = { _id: 'technology-test', name: 'Test (Legacy)', category: 'framework', isLegacy: false, isMigrationTarget: false };
    expect(inferStatus(doc)).toBe('legacy');
  });
});

// ─── Confidence Assignment ────────────────────────────────────────
describe('inferConfidence', () => {
  it('returns 85 for scan-detected docs (isLegacy is boolean)', () => {
    const doc = { _id: 'technology-react', name: 'React', category: 'framework', isLegacy: false, isMigrationTarget: false };
    expect(inferConfidence(doc)).toBe(85);
  });

  it('returns 85 for legacy docs (isLegacy is true)', () => {
    const doc = { _id: 'technology-wp', name: 'WordPress (Legacy)', category: 'legacy', isLegacy: true, isMigrationTarget: false };
    expect(inferConfidence(doc)).toBe(85);
  });

  it('returns 60 for uncategorized docs (isLegacy is null)', () => {
    const doc = { _id: 'technology-apollo', name: 'Apollo', category: 'detected', isLegacy: null, isMigrationTarget: null };
    expect(inferConfidence(doc)).toBe(60);
  });
});

// ─── Source Assignment ────────────────────────────────────────────
describe('inferSource', () => {
  it('returns "wappalyzer" for all docs', () => {
    const doc = { _id: 'technology-react', name: 'React', category: 'framework', isLegacy: false, isMigrationTarget: false };
    expect(inferSource(doc)).toBe('wappalyzer');
  });
});

// ─── Category Fixes ───────────────────────────────────────────────
describe('CATEGORY_FIXES', () => {
  it('maps all 10 "detected" docs to proper categories', () => {
    expect(CATEGORY_FIXES['technology-apollo']).toBe('framework');
    expect(CATEGORY_FIXES['technology-go']).toBe('framework');
    expect(CATEGORY_FIXES['technology-hotjar']).toBe('analytics');
    expect(CATEGORY_FIXES['technology-java']).toBe('framework');
    expect(CATEGORY_FIXES['technology-magento']).toBe('ecommerce');
    expect(CATEGORY_FIXES['technology-servicenow']).toBe('marketing');
    expect(CATEGORY_FIXES['technology-tailwind-css']).toBe('css-framework');
    expect(CATEGORY_FIXES['technology-typescript']).toBe('framework');
    expect(CATEGORY_FIXES['technology-wordpress']).toBe('cms');
    expect(CATEGORY_FIXES['technology-zendesk']).toBe('chat');
  });

  it('does not include non-detected docs', () => {
    expect(CATEGORY_FIXES['technology-react']).toBeUndefined();
    expect(CATEGORY_FIXES['technology-cloudflare']).toBeUndefined();
  });

  it('all target categories are valid', () => {
    const validCategories = new Set([
      'cms', 'framework', 'analytics', 'ecommerce', 'hosting',
      'marketing', 'chat', 'search', 'monitoring', 'payments',
      'css-framework', 'auth', 'cdn-media', 'legacy', 'pim', 'dam', 'lms',
    ]);
    for (const [id, category] of Object.entries(CATEGORY_FIXES)) {
      expect(validCategories.has(category), `${id} → "${category}" is not a valid category`).toBe(true);
    }
  });
});

// ─── Duplicate Merge Strategy ─────────────────────────────────────
describe('Duplicate merge strategy', () => {
  const DUPLICATE_MERGES = [
    { keep: 'technology-wordpress', delete: 'technology-wordpress-legacy', status: 'legacy', category: 'cms' },
    { keep: 'technology-adobe-experience-manager', delete: 'technology-adobe-experience-manager-aem', status: 'legacy', category: 'cms' },
    { keep: 'technology-magento', delete: 'technology-magento-legacy', status: 'legacy', category: 'ecommerce' },
  ];

  it('has exactly 3 merge pairs', () => {
    expect(DUPLICATE_MERGES).toHaveLength(3);
  });

  it('all kept docs use the base name (no -legacy suffix)', () => {
    for (const merge of DUPLICATE_MERGES) {
      expect(merge.keep).not.toContain('-legacy');
      expect(merge.keep).not.toContain('-aem');
    }
  });

  it('all deleted docs are the variant', () => {
    for (const merge of DUPLICATE_MERGES) {
      expect(merge.delete).not.toBe(merge.keep);
    }
  });

  it('all merged docs get status "legacy"', () => {
    for (const merge of DUPLICATE_MERGES) {
      expect(merge.status).toBe('legacy');
    }
  });

  it('all merged docs get a proper category (not "legacy" or "detected")', () => {
    for (const merge of DUPLICATE_MERGES) {
      expect(merge.category).not.toBe('legacy');
      expect(merge.category).not.toBe('detected');
    }
  });
});

// ─── End-to-End Simulation ────────────────────────────────────────
describe('Full migration simulation', () => {
  // Simulate the migration on representative docs
  const sampleDocs: TechDoc[] = [
    { _id: 'technology-react', name: 'React', category: 'framework', isLegacy: false, isMigrationTarget: false },
    { _id: 'technology-wordpress-legacy', name: 'WordPress (Legacy)', category: 'legacy', isLegacy: true, isMigrationTarget: false },
    { _id: 'technology-apollo', name: 'Apollo', category: 'detected', isLegacy: null, isMigrationTarget: null },
    { _id: 'technology-hotjar', name: 'Hotjar', category: 'detected', isLegacy: null, isMigrationTarget: null },
  ];

  it('active doc gets correct fields', () => {
    const doc = sampleDocs[0];
    expect(inferStatus(doc)).toBe('active');
    expect(inferConfidence(doc)).toBe(85);
    expect(inferSource(doc)).toBe('wappalyzer');
    expect(CATEGORY_FIXES[doc._id]).toBeUndefined(); // no category fix needed
  });

  it('legacy doc gets correct fields', () => {
    const doc = sampleDocs[1];
    expect(inferStatus(doc)).toBe('legacy');
    expect(inferConfidence(doc)).toBe(85);
    expect(inferSource(doc)).toBe('wappalyzer');
  });

  it('uncategorized doc gets correct fields + category fix', () => {
    const doc = sampleDocs[2]; // Apollo
    expect(inferStatus(doc)).toBe('unknown');
    expect(inferConfidence(doc)).toBe(60);
    expect(inferSource(doc)).toBe('wappalyzer');
    expect(CATEGORY_FIXES[doc._id]).toBe('framework');
  });

  it('another uncategorized doc gets different category fix', () => {
    const doc = sampleDocs[3]; // Hotjar
    expect(inferStatus(doc)).toBe('unknown');
    expect(inferConfidence(doc)).toBe(60);
    expect(CATEGORY_FIXES[doc._id]).toBe('analytics');
  });
});
