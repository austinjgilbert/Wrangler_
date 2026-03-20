import { describe, it, expect } from 'vitest';
import {
  extractFieldPaths,
  checkPathsAgainstWhitelist,
  inferTypeFromId,
  ATTRIBUTE_WHITELIST,
} from '../../src/lib/attribute-whitelist.js';

describe('extractFieldPaths', () => {
  it('extracts flat fields', () => {
    const paths = extractFieldPaths({ name: 'Acme', domain: 'acme.com' });
    expect(paths).toEqual(['name', 'domain']);
  });

  it('extracts nested fields with dot notation', () => {
    const paths = extractFieldPaths({ payloadIndex: { hasScan: true, hasBrief: false } });
    expect(paths).toContain('payloadIndex');
    expect(paths).toContain('payloadIndex.hasScan');
    expect(paths).toContain('payloadIndex.hasBrief');
  });

  it('does not recurse into arrays', () => {
    const paths = extractFieldPaths({ tags: ['a', 'b'], signals: ['CMS: WordPress'] });
    expect(paths).toEqual(['tags', 'signals']);
    // Array items should NOT produce paths like 'tags.0'
  });

  it('skips Sanity internal fields', () => {
    const paths = extractFieldPaths({
      _id: 'account.abc',
      _type: 'account',
      _rev: 'xyz',
      _createdAt: '2026-01-01',
      _updatedAt: '2026-01-01',
      name: 'Acme',
    });
    expect(paths).toEqual(['name']);
  });

  it('handles deeply nested objects', () => {
    const paths = extractFieldPaths({
      profileCompleteness: {
        dimensionFlags: {
          scan: true,
          linkedin: false,
        },
      },
    });
    expect(paths).toContain('profileCompleteness');
    expect(paths).toContain('profileCompleteness.dimensionFlags');
    expect(paths).toContain('profileCompleteness.dimensionFlags.scan');
    expect(paths).toContain('profileCompleteness.dimensionFlags.linkedin');
  });

  it('returns empty array for null/undefined', () => {
    expect(extractFieldPaths(null)).toEqual([]);
    expect(extractFieldPaths(undefined)).toEqual([]);
    expect(extractFieldPaths('string')).toEqual([]);
  });

  it('handles mixed arrays and objects', () => {
    const paths = extractFieldPaths({
      technologies: [{ _key: 'react', _ref: 'tech-react', _type: 'reference' }],
      aiReadiness: { score: 25 },
    });
    // technologies is an array — just the parent path
    expect(paths).toContain('technologies');
    expect(paths).not.toContain('technologies._key');
    // aiReadiness is an object — recurse
    expect(paths).toContain('aiReadiness');
    expect(paths).toContain('aiReadiness.score');
  });
});

describe('checkPathsAgainstWhitelist', () => {
  it('allows known account paths', () => {
    const result = checkPathsAgainstWhitelist('account', [
      'name', 'domain', 'opportunityScore', 'aiReadiness.score',
    ]);
    expect(result.allowed).toBe(true);
    expect(result.unknownPaths).toEqual([]);
    expect(result.reason).toBeNull();
  });

  it('rejects unknown account paths', () => {
    const result = checkPathsAgainstWhitelist('account', [
      'name', 'domain', 'sneakyNewField', 'payload.deepNested.thing',
    ]);
    expect(result.allowed).toBe(false);
    expect(result.unknownPaths).toContain('sneakyNewField');
    expect(result.unknownPaths).toContain('payload.deepNested.thing');
    expect(result.reason).toContain('2 unknown path(s)');
  });

  it('blocks writes to legacy types', () => {
    const result = checkPathsAgainstWhitelist('enrichmentJob', ['status']);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
    expect(result.reason).toContain('legacy/duplicate');
  });

  it('allows unknown types through with warning', () => {
    const result = checkPathsAgainstWhitelist('someNewType', ['field1', 'field2']);
    expect(result.allowed).toBe(true);
    expect(result.unknownPaths).toEqual(['field1', 'field2']);
    expect(result.reason).toContain('no whitelist');
  });

  it('allows known accountPack paths (post-migration)', () => {
    const result = checkPathsAgainstWhitelist('accountPack', [
      'accountKey', 'payloadIndex', 'payloadIndex.hasScan', 'payloadData',
    ]);
    expect(result.allowed).toBe(true);
  });

  it('rejects old payload.* paths on accountPack', () => {
    const result = checkPathsAgainstWhitelist('accountPack', [
      'accountKey', 'payload', 'payload.scan', 'payload.scan.technologyStack',
    ]);
    expect(result.allowed).toBe(false);
    expect(result.unknownPaths).toContain('payload');
    expect(result.unknownPaths).toContain('payload.scan');
    expect(result.unknownPaths).toContain('payload.scan.technologyStack');
  });

  it('truncates long unknown path lists in reason', () => {
    const paths = Array.from({ length: 10 }, (_, i) => `unknown${i}`);
    const result = checkPathsAgainstWhitelist('account', paths);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('...');
    expect(result.reason).toContain('10 unknown path(s)');
  });
});

describe('inferTypeFromId', () => {
  it('infers account type', () => {
    expect(inferTypeFromId('account.abc123')).toBe('account');
  });

  it('infers accountPack type', () => {
    expect(inferTypeFromId('accountPack-abc123')).toBe('accountPack');
  });

  it('infers actionCandidate type', () => {
    expect(inferTypeFromId('actionCandidate-xyz')).toBe('actionCandidate');
  });

  it('infers orchestrationJob from unified- prefix', () => {
    expect(inferTypeFromId('unified-job-123')).toBe('orchestrationJob');
  });

  it('infers person type from both prefixes', () => {
    expect(inferTypeFromId('person-abc')).toBe('person');
    expect(inferTypeFromId('person.abc')).toBe('person');
  });

  it('returns null for unknown ID patterns', () => {
    expect(inferTypeFromId('random-id-123')).toBeNull();
    expect(inferTypeFromId(null)).toBeNull();
    expect(inferTypeFromId('')).toBeNull();
  });
});

describe('ATTRIBUTE_WHITELIST structure', () => {
  it('has whitelists for all core types', () => {
    const expectedTypes = [
      'account', 'accountPack', 'person', 'technology',
      'userPattern', 'usageLog', 'actionCandidate', 'orchestrationJob',
    ];
    for (const type of expectedTypes) {
      expect(ATTRIBUTE_WHITELIST[type]).toBeInstanceOf(Set);
      expect(ATTRIBUTE_WHITELIST[type].size).toBeGreaterThan(0);
    }
  });

  it('has a _blocked set with legacy types', () => {
    expect(ATTRIBUTE_WHITELIST._blocked).toBeInstanceOf(Set);
    expect(ATTRIBUTE_WHITELIST._blocked.has('enrichmentJob')).toBe(true);
    expect(ATTRIBUTE_WHITELIST._blocked.has('company')).toBe(true);
  });

  it('accountPack whitelist does NOT include payload or payload.*', () => {
    const ap = ATTRIBUTE_WHITELIST.accountPack;
    expect(ap.has('payload')).toBe(false);
    expect(ap.has('payload.scan')).toBe(false);
    expect(ap.has('payload.linkedin')).toBe(false);
  });

  it('accountPack whitelist includes payloadIndex and payloadData', () => {
    const ap = ATTRIBUTE_WHITELIST.accountPack;
    expect(ap.has('payloadIndex')).toBe(true);
    expect(ap.has('payloadData')).toBe(true);
    expect(ap.has('payloadIndex.hasScan')).toBe(true);
  });
});
