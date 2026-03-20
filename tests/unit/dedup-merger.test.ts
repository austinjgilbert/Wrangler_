/**
 * Tests for the dedup merger — merging duplicate clusters.
 */
import { describe, expect, it, vi } from 'vitest';
import { mergeAccountCluster, mergePersonCluster } from '../../src/services/dedup-merger.js';

// ── Mock helpers ─────────────────────────────────────────────────────────

function createMockGroqQuery(docs: Record<string, any>) {
  return vi.fn().mockImplementation(async (_client: any, query: string, params?: any) => {
    // Handle *[_id in $ids] queries
    if (query.includes('_id in $ids') && params?.ids) {
      return params.ids.map((id: string) => docs[id]).filter(Boolean);
    }
    // Handle *[references($loserId)] queries
    if (query.includes('references($loserId)') && params?.loserId) {
      return Object.values(docs).filter((d: any) => {
        const json = JSON.stringify(d);
        return json.includes(params.loserId);
      });
    }
    // Handle *[_type == "networkPerson" && personRef._ref == $loserId]
    if (query.includes('networkPerson') && params?.loserId) {
      return Object.values(docs).filter((d: any) =>
        d._type === 'networkPerson' && d.personRef?._ref === params.loserId
      );
    }
    // Handle *[_type == "account" && references($loserId)]
    if (query.includes('_type == "account"') && query.includes('references') && params?.loserId) {
      return Object.values(docs).filter((d: any) =>
        d._type === 'account' && JSON.stringify(d).includes(params.loserId)
      );
    }
    // Handle accountKey queries
    if (query.includes('accountKey == $ak') && params?.ak) {
      return Object.values(docs).filter((d: any) =>
        d.accountKey === params.ak && d._id !== params.winnerId
      );
    }
    // Handle personKey queries
    if (query.includes('personKey == $pk') && params?.pk) {
      return Object.values(docs).filter((d: any) =>
        d.personKey === params.pk && d._id !== params.winnerId
      );
    }
    return [];
  });
}

const mockClient = {};

// ── Account merger tests ─────────────────────────────────────────────────

describe('mergeAccountCluster', () => {
  it('dry run returns merge plan without executing', async () => {
    const docs: Record<string, any> = {
      'account.winner': {
        _id: 'account.winner', _type: 'account', accountKey: 'winner',
        companyName: 'Example Inc', domain: 'example.com', rootDomain: 'example.com',
        technologyStack: { cms: ['WordPress'] }, opportunityScore: 80,
      },
      'account.loser': {
        _id: 'account.loser', _type: 'account', accountKey: 'loser',
        companyName: 'Example', domain: 'example.com',
        benchmarks: { estimatedRevenue: '$10M' },
      },
    };

    const groqQuery = createMockGroqQuery(docs);
    const mutate = vi.fn();

    const cluster = {
      domain: 'example.com',
      winner: { _id: 'account.winner', accountKey: 'winner' },
      losers: [{ _id: 'account.loser', accountKey: 'loser' }],
    };

    const result = await mergeAccountCluster(groqQuery, mockClient, mutate, cluster, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.winnerId).toBe('account.winner');
    expect(result.loserIds).toEqual(['account.loser']);
    expect(result.totalMutations).toBeGreaterThan(0);
    expect(mutate).not.toHaveBeenCalled(); // Dry run — no mutations
  });

  it('execute mode calls mutate with merged data + deletes', async () => {
    const docs: Record<string, any> = {
      'account.winner': {
        _id: 'account.winner', _type: 'account', accountKey: 'winner',
        companyName: 'Example Inc', domain: 'example.com',
        technologyStack: { cms: ['WordPress'] },
      },
      'account.loser': {
        _id: 'account.loser', _type: 'account', accountKey: 'loser',
        companyName: 'Example', domain: 'example.com',
        technologyStack: { frameworks: ['React'] },
        benchmarks: { estimatedRevenue: '$10M' },
        signals: ['CMS: WordPress'],
      },
    };

    const groqQuery = createMockGroqQuery(docs);
    const mutate = vi.fn().mockResolvedValue({});

    const cluster = {
      domain: 'example.com',
      winner: { _id: 'account.winner', accountKey: 'winner' },
      losers: [{ _id: 'account.loser', accountKey: 'loser' }],
    };

    const result = await mergeAccountCluster(groqQuery, mockClient, mutate, cluster, { dryRun: false });

    expect(result.executed).toBe(true);
    expect(result.winnerId).toBe('account.winner');
    expect(mutate).toHaveBeenCalledTimes(1);

    // Check mutations include createOrReplace (merged winner) and delete (loser)
    const mutations = mutate.mock.calls[0][1];
    const createOrReplace = mutations.find((m: any) => m.createOrReplace);
    const deleteMutation = mutations.find((m: any) => m.delete);

    expect(createOrReplace).toBeDefined();
    expect(createOrReplace.createOrReplace._id).toBe('account.winner');
    // Merged data should include loser's benchmarks
    expect(createOrReplace.createOrReplace.benchmarks?.estimatedRevenue).toBe('$10M');
    // Merged data should include loser's frameworks
    expect(createOrReplace.createOrReplace.technologyStack?.frameworks).toContain('React');

    expect(deleteMutation).toBeDefined();
    expect(deleteMutation.delete.id).toBe('account.loser');
  });

  it('returns error when winner document not found', async () => {
    const groqQuery = createMockGroqQuery({});
    const mutate = vi.fn();

    const cluster = {
      domain: 'missing.com',
      winner: { _id: 'account.missing' },
      losers: [{ _id: 'account.other' }],
    };

    const result = await mergeAccountCluster(groqQuery, mockClient, mutate, cluster, { dryRun: true });
    expect(result.error).toContain('not found');
  });
});

// ── Person merger tests ──────────────────────────────────────────────────

describe('mergePersonCluster', () => {
  it('dry run returns merge plan for persons', async () => {
    const docs: Record<string, any> = {
      'person.winner': {
        _id: 'person.winner', _type: 'person', personKey: 'winner',
        name: 'John Doe', linkedInUrl: 'https://linkedin.com/in/johndoe',
        email: 'john@example.com', currentCompany: 'Acme',
        experience: [{ company: 'Acme', title: 'CTO' }],
      },
      'person.loser': {
        _id: 'person.loser', _type: 'person', personKey: 'loser',
        name: 'John', linkedInUrl: 'https://linkedin.com/in/johndoe',
        skills: ['JavaScript', 'TypeScript'],
        education: [{ school: 'MIT', degree: 'BS' }],
      },
    };

    const groqQuery = createMockGroqQuery(docs);
    const mutate = vi.fn();

    const cluster = {
      matchKey: 'https://www.linkedin.com/in/johndoe',
      matchType: 'linkedin',
      winner: { _id: 'person.winner', personKey: 'winner' },
      losers: [{ _id: 'person.loser', personKey: 'loser' }],
    };

    const result = await mergePersonCluster(groqQuery, mockClient, mutate, cluster, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.winnerId).toBe('person.winner');
    expect(result.loserIds).toEqual(['person.loser']);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('merges person fields correctly on execute', async () => {
    const docs: Record<string, any> = {
      'person.winner': {
        _id: 'person.winner', _type: 'person', personKey: 'winner',
        name: 'Jane Doe', linkedInUrl: 'https://linkedin.com/in/janedoe',
        currentCompany: 'BigCo',
      },
      'person.loser': {
        _id: 'person.loser', _type: 'person', personKey: 'loser',
        name: 'Jane Elizabeth Doe', // Longer name
        linkedInUrl: 'https://linkedin.com/in/janedoe',
        email: 'jane@bigco.com', // Winner doesn't have email
        skills: ['Python', 'ML'],
        roleCategory: 'engineering',
        seniorityLevel: 'director',
      },
    };

    const groqQuery = createMockGroqQuery(docs);
    const mutate = vi.fn().mockResolvedValue({});

    const cluster = {
      matchKey: 'https://www.linkedin.com/in/janedoe',
      matchType: 'linkedin',
      winner: { _id: 'person.winner', personKey: 'winner' },
      losers: [{ _id: 'person.loser', personKey: 'loser' }],
    };

    const result = await mergePersonCluster(groqQuery, mockClient, mutate, cluster, { dryRun: false });

    expect(result.executed).toBe(true);
    expect(mutate).toHaveBeenCalledTimes(1);

    const mutations = mutate.mock.calls[0][1];
    const createOrReplace = mutations.find((m: any) => m.createOrReplace);

    expect(createOrReplace).toBeDefined();
    const merged = createOrReplace.createOrReplace;
    expect(merged.name).toBe('Jane Elizabeth Doe'); // Longer name wins
    expect(merged.email).toBe('jane@bigco.com'); // Filled from loser
    expect(merged.skills).toContain('Python');
    expect(merged.roleCategory).toBe('engineering');
    expect(merged.seniorityLevel).toBe('director');
  });

  it('repoints networkPerson references', async () => {
    const docs: Record<string, any> = {
      'person.winner': {
        _id: 'person.winner', _type: 'person', personKey: 'winner',
        name: 'Bob', linkedInUrl: 'https://linkedin.com/in/bob',
      },
      'person.loser': {
        _id: 'person.loser', _type: 'person', personKey: 'loser',
        name: 'Bob Smith', linkedInUrl: 'https://linkedin.com/in/bob',
      },
      'networkPerson.1': {
        _id: 'networkPerson.1', _type: 'networkPerson',
        name: 'Bob Smith', personRef: { _type: 'reference', _ref: 'person.loser' },
      },
    };

    const groqQuery = createMockGroqQuery(docs);
    const mutate = vi.fn().mockResolvedValue({});

    const cluster = {
      matchKey: 'https://www.linkedin.com/in/bob',
      matchType: 'linkedin',
      winner: { _id: 'person.winner', personKey: 'winner' },
      losers: [{ _id: 'person.loser', personKey: 'loser' }],
    };

    const result = await mergePersonCluster(groqQuery, mockClient, mutate, cluster, { dryRun: false });

    expect(result.executed).toBe(true);
    const mutations = mutate.mock.calls[0][1];

    // Should have a patch to repoint networkPerson.personRef
    const npPatch = mutations.find((m: any) =>
      m.patch?.id === 'networkPerson.1' && m.patch?.set?.['personRef._ref'] === 'person.winner'
    );
    expect(npPatch).toBeDefined();
  });
});
