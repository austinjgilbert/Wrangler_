/**
 * Tests for the dedup scanner — duplicate detection for accounts and persons.
 */
import { describe, expect, it, vi } from 'vitest';
import { scanAccountDuplicates, scanPersonDuplicates } from '../../src/services/dedup-scanner.js';

// ── Mock helpers ─────────────────────────────────────────────────────────

function mockGroqQuery(data: any[]) {
  return vi.fn().mockResolvedValue(data);
}

const mockClient = {};

// ── Account scanner tests ────────────────────────────────────────────────

describe('scanAccountDuplicates', () => {
  it('returns empty clusters when no accounts exist', async () => {
    const groqQuery = mockGroqQuery([]);
    const result = await scanAccountDuplicates(groqQuery, mockClient);
    expect(result.clusters).toEqual([]);
    expect(result.totalAccounts).toBe(0);
    expect(result.totalDuplicates).toBe(0);
  });

  it('returns empty clusters when all accounts are unique', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'account.a', domain: 'apple.com', accountKey: 'a', companyName: 'Apple' },
      { _id: 'account.b', domain: 'google.com', accountKey: 'b', companyName: 'Google' },
      { _id: 'account.c', domain: 'microsoft.com', accountKey: 'c', companyName: 'Microsoft' },
    ]);
    const result = await scanAccountDuplicates(groqQuery, mockClient);
    expect(result.clusters).toEqual([]);
    expect(result.totalAccounts).toBe(3);
    expect(result.totalDuplicates).toBe(0);
  });

  it('detects duplicates by domain', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'account.a1', domain: 'example.com', accountKey: 'a1', companyName: 'Example Inc', technologyStack: { cms: ['WordPress'] }, lastEnrichedAt: '2026-03-18' },
      { _id: 'account.placeholder.example-com', domain: 'example.com', accountKey: null, companyName: null },
      { _id: 'account.b', domain: 'other.com', accountKey: 'b', companyName: 'Other' },
    ]);
    const result = await scanAccountDuplicates(groqQuery, mockClient);
    expect(result.clusters).toHaveLength(1);
    expect(result.totalDuplicates).toBe(1);

    const cluster = result.clusters[0];
    expect(cluster.domain).toBe('example.com');
    expect(cluster.winner._id).toBe('account.a1'); // More complete
    expect(cluster.losers).toHaveLength(1);
    expect(cluster.losers[0]._id).toBe('account.placeholder.example-com');
  });

  it('normalizes www prefix for domain matching', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'account.a', domain: 'www.example.com', accountKey: 'a', companyName: 'Example' },
      { _id: 'account.b', domain: 'example.com', accountKey: 'b', companyName: 'Example Inc', technologyStack: { cms: ['Sanity'] } },
    ]);
    const result = await scanAccountDuplicates(groqQuery, mockClient);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].domain).toBe('example.com');
  });

  it('picks the most complete account as winner', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'account.sparse', domain: 'test.com', accountKey: 'sparse', companyName: 'Test' },
      {
        _id: 'account.rich', domain: 'test.com', accountKey: 'rich', companyName: 'Test Corp',
        technologyStack: { cms: ['WordPress'] }, leadership: [{ _ref: 'person.1' }],
        opportunityScore: 85, lastEnrichedAt: '2026-03-18', benchmarks: { estimatedRevenue: '$10M' },
      },
      { _id: 'account.placeholder.test-com', domain: 'test.com' },
    ]);
    const result = await scanAccountDuplicates(groqQuery, mockClient);
    expect(result.clusters[0].winner._id).toBe('account.rich');
    expect(result.clusters[0].losers).toHaveLength(2);
  });

  it('sorts clusters by size (biggest first)', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'a1', domain: 'small.com', accountKey: 'a1' },
      { _id: 'a2', domain: 'small.com', accountKey: 'a2' },
      { _id: 'b1', domain: 'big.com', accountKey: 'b1' },
      { _id: 'b2', domain: 'big.com', accountKey: 'b2' },
      { _id: 'b3', domain: 'big.com', accountKey: 'b3' },
    ]);
    const result = await scanAccountDuplicates(groqQuery, mockClient);
    expect(result.clusters).toHaveLength(2);
    expect(result.clusters[0].domain).toBe('big.com');
    expect(result.clusters[0].totalDocs).toBe(3);
    expect(result.clusters[1].domain).toBe('small.com');
    expect(result.clusters[1].totalDocs).toBe(2);
  });

  it('uses rootDomain as fallback for domain matching', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'a1', rootDomain: 'fallback.com', accountKey: 'a1', companyName: 'Fallback' },
      { _id: 'a2', rootDomain: 'fallback.com', accountKey: 'a2', companyName: 'Fallback Inc' },
    ]);
    const result = await scanAccountDuplicates(groqQuery, mockClient);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].domain).toBe('fallback.com');
  });
});

// ── Person scanner tests ─────────────────────────────────────────────────

describe('scanPersonDuplicates', () => {
  it('returns empty clusters when no persons exist', async () => {
    const groqQuery = mockGroqQuery([]);
    const result = await scanPersonDuplicates(groqQuery, mockClient);
    expect(result.clusters).toEqual([]);
    expect(result.totalPersons).toBe(0);
    expect(result.totalDuplicates).toBe(0);
  });

  it('detects duplicates by LinkedIn URL', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'person.a', linkedInUrl: 'https://www.linkedin.com/in/johndoe', name: 'John Doe', personKey: 'a', experience: [{ company: 'Acme', title: 'CTO' }] },
      { _id: 'person.placeholder.123.abc', linkedInUrl: 'https://linkedin.com/in/johndoe/', name: 'Unknown', personKey: null },
    ]);
    const result = await scanPersonDuplicates(groqQuery, mockClient);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].matchType).toBe('linkedin');
    expect(result.clusters[0].winner._id).toBe('person.a'); // More complete
    expect(result.clusters[0].losers[0]._id).toBe('person.placeholder.123.abc');
  });

  it('normalizes LinkedIn URLs for matching', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'p1', linkedInUrl: 'https://www.linkedin.com/in/janedoe', name: 'Jane Doe', personKey: 'p1', email: 'jane@test.com' },
      { _id: 'p2', linkedInUrl: 'https://linkedin.com/in/janedoe/', name: 'Jane', personKey: 'p2' },
      { _id: 'p3', linkedInUrl: 'https://www.linkedin.com/in/janedoe/overlay/about-this-profile/', name: 'J. Doe', personKey: 'p3' },
    ]);
    const result = await scanPersonDuplicates(groqQuery, mockClient);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].totalDocs).toBe(3);
    expect(result.clusters[0].winner._id).toBe('p1'); // Has email + full name
  });

  it('detects duplicates by name+company for persons without LinkedIn', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'p1', name: 'Bob Smith', currentCompany: 'Acme Corp', personKey: 'p1', title: 'VP Engineering' },
      { _id: 'p2', name: 'Bob Smith', currentCompany: 'Acme Corp', personKey: 'p2' },
    ]);
    const result = await scanPersonDuplicates(groqQuery, mockClient);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].matchType).toBe('name+company');
    expect(result.clusters[0].winner._id).toBe('p1'); // Has title
  });

  it('does not group persons with same name but different companies', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'p1', name: 'John Smith', currentCompany: 'Apple', personKey: 'p1' },
      { _id: 'p2', name: 'John Smith', currentCompany: 'Google', personKey: 'p2' },
    ]);
    const result = await scanPersonDuplicates(groqQuery, mockClient);
    expect(result.clusters).toHaveLength(0);
  });

  it('prefers non-placeholder IDs as winners', async () => {
    const groqQuery = mockGroqQuery([
      { _id: 'person.placeholder.111.xyz', linkedInUrl: 'https://linkedin.com/in/test', name: 'Test User', personKey: null },
      { _id: 'person.abc123', linkedInUrl: 'https://linkedin.com/in/test', name: 'Test', personKey: 'abc123' },
    ]);
    const result = await scanPersonDuplicates(groqQuery, mockClient);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].winner._id).toBe('person.abc123'); // Non-placeholder wins
  });
});
