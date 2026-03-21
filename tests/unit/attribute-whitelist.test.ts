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
    expect(paths).toContain('technologies');
    expect(paths).not.toContain('technologies._key');
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

  // ── NEW: Prefix wildcard matching ──

  it('allows paths matching wildcard prefixes (technologyStack.*)', () => {
    const result = checkPathsAgainstWhitelist('account', [
      'name', 'technologyStack', 'technologyStack.cms',
      'technologyStack.allDetected', 'technologyStack.allDetected.name',
    ]);
    expect(result.allowed).toBe(true);
    expect(result.unknownPaths).toEqual([]);
  });

  it('allows deeply nested paths under wildcard (history.*)', () => {
    const result = checkPathsAgainstWhitelist('accountPack', [
      'history', 'history.data', 'history.data.aiReadiness',
      'history.data.aiReadiness.score', 'history.storedAt', 'history.type',
    ]);
    expect(result.allowed).toBe(true);
  });

  it('allows competitorResearch comparison.* paths', () => {
    const result = checkPathsAgainstWhitelist('competitorResearch', [
      'accountKey', 'comparison', 'comparison.account',
      'comparison.account.name', 'comparison.account.technologyStack.cms',
    ]);
    expect(result.allowed).toBe(true);
  });

  it('allows brief data.* paths', () => {
    const result = checkPathsAgainstWhitelist('brief', [
      'accountKey', 'personKey', 'data',
      'data.executiveSummary', 'data.topRoiPlays',
      'data.opportunityConfidence', 'data.opportunityConfidence.score',
    ]);
    expect(result.allowed).toBe(true);
  });

  it('allows person profileAnalysis.* paths', () => {
    const result = checkPathsAgainstWhitelist('person', [
      'name', 'headline', 'profileAnalysis',
      'profileAnalysis.summary', 'profileAnalysis.skills',
    ]);
    expect(result.allowed).toBe(true);
  });

  it('allows actionCandidate confidenceBreakdown.* paths', () => {
    const result = checkPathsAgainstWhitelist('actionCandidate', [
      'confidence', 'confidenceBreakdown',
      'confidenceBreakdown.actionConfidence',
      'confidenceBreakdown.dataConfidence',
      'confidenceBreakdown.notes',
      'confidenceBreakdown.updatedAt',
    ]);
    expect(result.allowed).toBe(true);
  });

  // ── NEW: molt.event paths ──

  it('allows molt.event existing + new index fields', () => {
    const result = checkPathsAgainstWhitelist('molt.event', [
      // Existing fields (dual-write backward compat)
      'type', 'actor', 'channel', 'timestamp', 'traceId',
      'idempotencyKey', 'outcome', 'tags',
      'payload', 'payload.text',
      'entities',
      // New index fields
      'eventType', 'status', 'source', 'accountKey', 'category',
      // Blob
      'eventData',
    ]);
    expect(result.allowed).toBe(true);
    expect(result.unknownPaths).toEqual([]);
  });

  it('allows molt.event entities.* nested paths', () => {
    const result = checkPathsAgainstWhitelist('molt.event', [
      'entities', 'entities.entityType', 'entities.entityRef',
      'entities.entityRef._ref', 'entities.entityRef._type',
    ]);
    // Note: _ref and _type are Sanity internals, stripped by extractFieldPaths
    // But entities.entityType and entities.entityRef are covered by entities.*
    expect(result.allowed).toBe(true);
  });

  it('rejects unknown molt.event paths', () => {
    const result = checkPathsAgainstWhitelist('molt.event', [
      'eventType', 'status', 'sneakyField', 'deeply.nested.thing',
    ]);
    expect(result.allowed).toBe(false);
    expect(result.unknownPaths).toContain('sneakyField');
    expect(result.unknownPaths).toContain('deeply.nested.thing');
  });

  it('allows orchestrationJob data.* and options.* paths', () => {
    const result = checkPathsAgainstWhitelist('orchestrationJob', [
      'jobId', 'status', 'data', 'data.scanResult',
      'data.scanResult.technologyStack', 'options', 'options.maxDepth',
    ]);
    expect(result.allowed).toBe(true);
  });
});

describe('inferTypeFromId', () => {
  it('infers account type from both prefixes', () => {
    expect(inferTypeFromId('account.abc123')).toBe('account');
    expect(inferTypeFromId('account-abc123')).toBe('account');
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

  // ── NEW: 4 previously misclassified types ──

  it('infers interaction type', () => {
    expect(inferTypeFromId('interaction-abc123')).toBe('interaction');
  });

  it('infers brief type', () => {
    expect(inferTypeFromId('brief-abc123-1234')).toBe('brief');
  });

  it('infers competitorResearch type', () => {
    expect(inferTypeFromId('competitorResearch-abc123-1234')).toBe('competitorResearch');
  });

  it('infers gmailDraft type', () => {
    expect(inferTypeFromId('gmailDraft-abc123')).toBe('gmailDraft');
  });

  // ── NEW: molt.event type ──

  it('infers molt.event type from ID prefix', () => {
    expect(inferTypeFromId('molt.event.self-heal.2026-03-21T13')).toBe('molt.event');
    expect(inferTypeFromId('molt.event.enrich.applied.enrich.proposal.xyz')).toBe('molt.event');
    expect(inferTypeFromId('molt.event.1711036800.abc123')).toBe('molt.event');
  });

  it('returns null for unknown ID patterns', () => {
    expect(inferTypeFromId('random-id-123')).toBeNull();
    expect(inferTypeFromId(null)).toBeNull();
    expect(inferTypeFromId('')).toBeNull();
  });
});

describe('ATTRIBUTE_WHITELIST structure', () => {
  it('has whitelists for all 13 active types', () => {
    const expectedTypes = [
      'account', 'accountPack', 'person', 'technology',
      'userPattern', 'usageLog', 'actionCandidate', 'orchestrationJob',
      'interaction', 'brief', 'competitorResearch', 'gmailDraft',
      'molt.event',
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
    expect(ATTRIBUTE_WHITELIST._blocked.has('scanResult')).toBe(true);
    expect(ATTRIBUTE_WHITELIST._blocked.has('crawlResult')).toBe(true);
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

  it('account whitelist includes painPoints fields', () => {
    const a = ATTRIBUTE_WHITELIST.account;
    expect(a.has('painPoints')).toBe(true);
    expect(a.has('painPoints.category')).toBe(true);
    expect(a.has('painPoints.severity')).toBe(true);
  });

  it('person whitelist includes LinkedIn capture fields', () => {
    const p = ATTRIBUTE_WHITELIST.person;
    expect(p.has('currentCompany')).toBe(true);
    expect(p.has('currentTitle')).toBe(true);
    expect(p.has('headline')).toBe(true);
    expect(p.has('personKey')).toBe(true);
    expect(p.has('roleCategory')).toBe(true);
    expect(p.has('seniorityLevel')).toBe(true);
    expect(p.has('captureSource')).toBe(true);
    expect(p.has('capturedAt')).toBe(true);
    expect(p.has('openToWork')).toBe(true);
    expect(p.has('profileImageUrl')).toBe(true);
    expect(p.has('about')).toBe(true);
    expect(p.has('certifications')).toBe(true);
    expect(p.has('education')).toBe(true);
    expect(p.has('experience')).toBe(true);
    expect(p.has('languages')).toBe(true);
    expect(p.has('publications')).toBe(true);
    expect(p.has('volunteer')).toBe(true);
  });

  it('competitorResearch uses comparison.* wildcard', () => {
    const cr = ATTRIBUTE_WHITELIST.competitorResearch;
    expect(cr.has('comparison.*')).toBe(true);
  });

  // ── NEW: molt.event whitelist ──

  it('molt.event whitelist includes existing production fields', () => {
    const me = ATTRIBUTE_WHITELIST['molt.event'];
    expect(me.has('type')).toBe(true);
    expect(me.has('actor')).toBe(true);
    expect(me.has('channel')).toBe(true);
    expect(me.has('timestamp')).toBe(true);
    expect(me.has('traceId')).toBe(true);
    expect(me.has('idempotencyKey')).toBe(true);
    expect(me.has('outcome')).toBe(true);
    expect(me.has('tags')).toBe(true);
    expect(me.has('payload')).toBe(true);
    expect(me.has('payload.text')).toBe(true);
    expect(me.has('entities')).toBe(true);
    expect(me.has('entities.*')).toBe(true);
  });

  it('molt.event whitelist includes new Index+Blob fields', () => {
    const me = ATTRIBUTE_WHITELIST['molt.event'];
    expect(me.has('eventType')).toBe(true);
    expect(me.has('status')).toBe(true);
    expect(me.has('source')).toBe(true);
    expect(me.has('accountKey')).toBe(true);
    expect(me.has('category')).toBe(true);
    expect(me.has('eventData')).toBe(true);
  });
});
