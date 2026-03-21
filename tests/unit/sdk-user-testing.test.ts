/**
 * SDK App User Testing — Comprehensive component and adapter validation.
 *
 * Tests the full data flow from raw API responses through adapters to
 * the shapes components expect. Simulates what a user would see.
 *
 * @author @agentspeak (AX Designer)
 */

import { describe, it, expect } from 'vitest';

// ─── Adapter imports ────────────────────────────────────────────────────
import {
  transformBriefingResponse,
} from '../../apps/sanity-data-sdk/src/lib/adapters/briefing';
import {
  transformJob,
  transformJobs,
  type BackendJob,
} from '../../apps/sanity-data-sdk/src/lib/adapters/job';
import {
  transformSnapshotAccount,
  transformSnapshotAccounts,
  sortAccountsForSelector,
  type SnapshotAccount,
} from '../../apps/sanity-data-sdk/src/lib/adapters/account';
import {
  buildPipelineStages,
  calculatePipelineProgress,
  mapBackendStatus,
} from '../../apps/sanity-data-sdk/src/lib/adapters/pipeline';
import {
  deriveAllModuleGlanceProps,
  MODULE_CONFIGS,
} from '../../apps/sanity-data-sdk/src/lib/adapters/module-glance';
import type {
  Account,
  GlanceContext,
  TransformedBriefing,
  RawGoodMorningResponse,
  ModuleActiveJob,
} from '../../apps/sanity-data-sdk/src/lib/adapters/types';
import {
  calculateInterval,
} from '../../apps/sanity-data-sdk/src/components/command-center/useJobPolling';

// ─── View state imports ─────────────────────────────────────────────────
import {
  isView,
  readViewFromSearch,
  NAV,
} from '../../apps/sanity-data-sdk/src/lib/view-state';

// ═══════════════════════════════════════════════════════════════════════
// 1. NAVIGATION — Can the user reach all views?
// ═══════════════════════════════════════════════════════════════════════

describe('Navigation — all views reachable', () => {
  it('NAV has all 7 views', () => {
    expect(NAV).toHaveLength(7);
    const ids = NAV.map(n => n.id);
    expect(ids).toContain('command-center');
    expect(ids).toContain('dashboard');
    expect(ids).toContain('accounts');
    expect(ids).toContain('enrichment');
    expect(ids).toContain('activity');
    expect(ids).toContain('people');
    expect(ids).toContain('technologies');
  });

  it('command-center is the first nav item', () => {
    expect(NAV[0].id).toBe('command-center');
  });

  it('all NAV items have labels', () => {
    for (const item of NAV) {
      expect(item.label).toBeTruthy();
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it('readViewFromSearch defaults to dashboard', () => {
    expect(readViewFromSearch('')).toBe('command-center');
    expect(readViewFromSearch('?foo=bar')).toBe('command-center');
  });

  it('readViewFromSearch parses valid views', () => {
    expect(readViewFromSearch('?view=command-center')).toBe('command-center');
    expect(readViewFromSearch('?view=accounts')).toBe('accounts');
  });

  it('readViewFromSearch rejects invalid views', () => {
    expect(readViewFromSearch('?view=nonexistent')).toBe('command-center');
    expect(readViewFromSearch('?view=admin')).toBe('command-center');
  });

  it('isView validates all known views', () => {
    for (const item of NAV) {
      expect(isView(item.id)).toBe(true);
    }
    expect(isView('nonexistent')).toBe(false);
    expect(isView(null)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. MORNING BRIEFING — Does the landing page render correctly?
// ═══════════════════════════════════════════════════════════════════════

describe('Morning Briefing — landing page data flow', () => {
  // Realistic API response shape (from L4 smoke test)
  const REAL_API_RESPONSE: RawGoodMorningResponse = {
    date: '2026-03-18',
    winCondition: 'Complete 0 calls from priority list and book 1 meeting',
    top10Accounts: [
      {
        account: 'Sanity.io',
        accountKey: '4aff4689adaa7961',
        canonicalUrl: 'https://www.sanity.io',
        score: 85,
        whyNow: 'Active evaluation phase',
        bestNextAction: 'Schedule demo',
        owner: 'Austin',
        contact: null,
      },
      {
        account: 'FullStory',
        accountKey: 'abc123def456',
        canonicalUrl: 'https://www.fullstory.com',
        score: 72,
        whyNow: 'Contract renewal in 30 days',
        bestNextAction: 'Send case study',
        owner: 'TBD',
        contact: null,
      },
      {
        account: 'Acme Corp',
        accountKey: 'deadbeef1234',
        canonicalUrl: 'https://www.acme.com',
        score: 45,
        whyNow: 'New CTO hire',
        bestNextAction: 'Research competitors',
        owner: 'TBD',
        contact: null,
      },
    ],
    linkedInQueue: [
      {
        person: 'Jane Smith',
        account: 'Sanity.io',
        accountKey: '4aff4689adaa7961',
        state: 'not_connected',
        action: 'connect',
        personalization: 'Noticed your team is evaluating structured content platforms',
        linkedInUrl: 'https://linkedin.com/in/janesmith',
      },
    ],
    emailQueue: [],
    callList: [],
    schedule: {
      block1_calls: null,
      block2_calls: null,
      linkedin_block: '11:00 AM - 11:30 AM',
      admin_block: '4:00 PM - 4:30 PM',
      email_block: null,
    },
    assumptionRefresh: null,
    stats: {
      totalAccounts: 267,
      qualifiedAccounts: 45,
      callsQueued: 0,
      linkedInQueued: 2,
      emailsQueued: 0,
    },
  };

  it('transforms real API response without crashing', () => {
    const result = transformBriefingResponse({ ok: true, data: REAL_API_RESPONSE });
    expect(result).toBeDefined();
    expect(result.enrichedAccounts).toHaveLength(3);
  });

  it('enrichedAccounts have urgency derived from score', () => {
    const result = transformBriefingResponse({ ok: true, data: REAL_API_RESPONSE });
    const sanity = result.enrichedAccounts.find(a => a.account === 'Sanity.io');
    const fullstory = result.enrichedAccounts.find(a => a.account === 'FullStory');
    const acme = result.enrichedAccounts.find(a => a.account === 'Acme Corp');

    expect(sanity?.urgency).toBe('urgent');     // score 85 >= 80
    expect(fullstory?.urgency).toBe('attention'); // score 72 >= 60
    expect(acme?.urgency).toBe('opportunity');   // score 45 < 60
  });

  it('stats are computed from enrichedAccounts, not raw API stats', () => {
    const result = transformBriefingResponse({ ok: true, data: REAL_API_RESPONSE });
    // totalAccounts should be 3 (from enrichedAccounts), not 267 (from API stats)
    expect(result.stats.totalAccounts).toBe(3);
    expect(result.stats.hotAccounts).toBe(1); // only Sanity.io is urgent
    expect(result.stats.avgScore).toBe(67);   // (85+72+45)/3 = 67.33 → 67
  });

  it('prefers API winCondition over computed', () => {
    const result = transformBriefingResponse({ ok: true, data: REAL_API_RESPONSE });
    expect(result.stats.winCondition).toBe('Complete 0 calls from priority list and book 1 meeting');
  });

  it('falls back to computed winCondition when API has none', () => {
    const noWinCondition = { ...REAL_API_RESPONSE, winCondition: undefined };
    const result = transformBriefingResponse({ ok: true, data: noWinCondition });
    expect(result.stats.winCondition).toBeTruthy();
    expect(result.stats.winCondition).not.toBe('');
  });

  it('handles empty API response gracefully', () => {
    const result = transformBriefingResponse({ ok: true, data: {} });
    expect(result.enrichedAccounts).toHaveLength(0);
    expect(result.stats.totalAccounts).toBe(0);
    expect(result.stats.avgScore).toBe(0);
    expect(result.stats.winCondition).toBeTruthy();
  });

  it('linkedInQueue passes through correctly', () => {
    const result = transformBriefingResponse({ ok: true, data: REAL_API_RESPONSE });
    expect(result.linkedInQueue).toHaveLength(1);
    expect(result.linkedInQueue[0].person).toBe('Jane Smith');
    expect(result.linkedInQueue[0].personalization).toContain('structured content');
  });

  it('account cards have all fields needed for onClick navigation', () => {
    const result = transformBriefingResponse({ ok: true, data: REAL_API_RESPONSE });
    for (const account of result.enrichedAccounts) {
      expect(account.accountKey).toBeTruthy();
      expect(account.account).toBeTruthy();
      expect(account.score).toBeDefined();
      expect(account.whyNow).toBeTruthy();
      expect(account.bestNextAction).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. ACCOUNT SELECTOR — Can the user pick an account?
// ═══════════════════════════════════════════════════════════════════════

describe('Account Selector — snapshot transform', () => {
  const SNAPSHOT_ACCOUNTS: SnapshotAccount[] = [
    {
      id: 'account.4aff4689adaa7961',
      accountKey: '4aff4689adaa7961',
      name: 'Sanity.io',
      domain: 'sanity.io',
      canonicalUrl: 'https://www.sanity.io',
      completion: 85,
      opportunityScore: 92,
      missing: [],
      nextStages: [],
      technologies: ['React', 'TypeScript', 'Node.js'],
    },
    {
      id: 'account.abc123def456',
      accountKey: 'abc123def456',
      name: 'FullStory',
      domain: 'fullstory.com',
      canonicalUrl: 'https://www.fullstory.com',
      completion: 60,
      opportunityScore: 72,
      missing: ['linkedin', 'brief'],
      nextStages: ['linkedin'],
      technologies: ['React'],
    },
    {
      id: 'account.deadbeef1234',
      accountKey: 'deadbeef1234',
      name: '',
      domain: null,
      canonicalUrl: null,
      completion: 10,
      opportunityScore: 0,
      missing: ['everything'],
      nextStages: ['initial_scan'],
      technologies: [],
    },
  ];

  it('transforms snapshot accounts into UI Account type', () => {
    const accounts = transformSnapshotAccounts(SNAPSHOT_ACCOUNTS);
    expect(accounts).toHaveLength(3);
    expect(accounts[0].companyName).toBe('Sanity.io');
    expect(accounts[0].rootDomain).toBe('sanity.io');
    expect(accounts[0].hot).toBe(true); // score 92 >= 70
  });

  it('handles missing name gracefully — falls back to domain', () => {
    const accounts = transformSnapshotAccounts(SNAPSHOT_ACCOUNTS);
    const noName = accounts.find(a => a.accountKey === 'deadbeef1234');
    expect(noName?.companyName).toBe('Unknown'); // no name, no domain
  });

  it('sorts by completeness then score', () => {
    const accounts = transformSnapshotAccounts(SNAPSHOT_ACCOUNTS);
    const sorted = sortAccountsForSelector(accounts);
    expect(sorted[0].accountKey).toBe('4aff4689adaa7961'); // 85% complete
    expect(sorted[1].accountKey).toBe('abc123def456');      // 60% complete
    expect(sorted[2].accountKey).toBe('deadbeef1234');      // 10% complete
  });

  it('preserves completeness from snapshot', () => {
    const accounts = transformSnapshotAccounts(SNAPSHOT_ACCOUNTS);
    expect(accounts[0].completeness).toBe(85);
    expect(accounts[1].completeness).toBe(60);
  });

  it('rejects accounts without accountKey', () => {
    const bad: SnapshotAccount[] = [
      { id: 'bad', accountKey: '', name: 'Bad', domain: null, canonicalUrl: null, completion: 0, opportunityScore: 0, missing: [], nextStages: [], technologies: [] },
    ];
    const accounts = transformSnapshotAccounts(bad);
    expect(accounts).toHaveLength(0); // filtered out
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. MODULE GRID — Do all 9 modules render with correct data?
// ═══════════════════════════════════════════════════════════════════════

describe('Module Grid — glance derivation', () => {
  it('MODULE_CONFIGS has exactly 9 modules', () => {
    expect(MODULE_CONFIGS).toHaveLength(9);
  });

  it('MODULE_CONFIGS has correct canonical keys', () => {
    const keys = MODULE_CONFIGS.map(c => c.key);
    expect(keys).toEqual([
      'profile', 'opportunity', 'approach',
      'research', 'people', 'signals',
      'competitors', 'techstack', 'outreach',
    ]);
  });

  it('all modules have icon, label, and color', () => {
    for (const config of MODULE_CONFIGS) {
      expect(config.icon).toBeTruthy();
      expect(config.label).toBeTruthy();
      expect(config.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('derives glance props for all 9 modules with no account', () => {
    const ctx: GlanceContext = {
      account: null,
      briefing: null,
      pipelineStages: buildPipelineStages({}),
      activeJobs: new Map(),
      signals: [],
    };
    const glanceMap = deriveAllModuleGlanceProps(ctx);
    expect(glanceMap.size).toBe(9);

    // All modules should have valid props
    for (const [key, props] of glanceMap) {
      expect(props.moduleKey).toBe(key);
      expect(props.primaryActionLabel).toBeTruthy();
      expect(typeof props.progress).toBe('number');
      expect(Array.isArray(props.gaps)).toBe(true);
      expect(typeof props.insight).toBe('string');
    }
  });

  it('derives glance props with a selected account', () => {
    const account: Account = {
      _id: 'account.4aff4689adaa7961',
      accountKey: '4aff4689adaa7961',
      companyName: 'Sanity.io',
      canonicalUrl: 'https://www.sanity.io',
      rootDomain: 'sanity.io',
      opportunityScore: 92,
      hot: true,
    };

    const ctx: GlanceContext = {
      account,
      briefing: null,
      pipelineStages: buildPipelineStages({}),
      activeJobs: new Map(),
      signals: [],
    };
    const glanceMap = deriveAllModuleGlanceProps(ctx);

    // Profile should show company name
    const profile = glanceMap.get('profile')!;
    expect(profile.insight).toContain('Sanity.io');
    expect(profile.gaps).toHaveLength(0); // has name, url, domain

    // Opportunity should show score
    const opportunity = glanceMap.get('opportunity')!;
    expect(opportunity.insight).toContain('92');
    expect(opportunity.progress).toBe(92);
  });

  it('shows active job overlay on module', () => {
    const activeJobs = new Map<string, ModuleActiveJob>();
    activeJobs.set('research', { status: 'running', progress: 50, stageLabel: 'Discovering pages...' });

    const ctx: GlanceContext = {
      account: {
        _id: 'account.test',
        accountKey: 'test',
        companyName: 'Test',
        canonicalUrl: 'https://test.com',
        rootDomain: 'test.com',
      },
      briefing: null,
      pipelineStages: buildPipelineStages({}),
      activeJobs,
      signals: [],
    };
    const glanceMap = deriveAllModuleGlanceProps(ctx);
    const research = glanceMap.get('research')!;
    expect(research.activeJob).toBeDefined();
    expect(research.activeJob!.status).toBe('running');
    expect(research.activeJob!.progress).toBe(50);
  });

  it('stub modules show Phase 2 message', () => {
    // signals, techstack, opportunity, approach, outreach are stubs in CommandCenter
    // But the glance derivers still produce valid props for them
    const ctx: GlanceContext = {
      account: null,
      briefing: null,
      pipelineStages: buildPipelineStages({}),
      activeJobs: new Map(),
      signals: [],
    };
    const glanceMap = deriveAllModuleGlanceProps(ctx);
    const signals = glanceMap.get('signals')!;
    expect(signals.gaps).toContain('No buying signals detected yet');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. JOB TRACKING — Does the job tracker show correct status?
// ═══════════════════════════════════════════════════════════════════════

describe('Job Tracking — adapter and polling', () => {
  it('transforms backend job with live API status values', () => {
    const backendJob: BackendJob = {
      _id: 'virtual.4aff4689adaa7961',
      accountKey: '4aff4689adaa7961',
      status: 'in_progress',
      stage: 2,
      progress: 14,
      startedAt: '2026-03-18T10:00:00Z',
      mode: 'deep',
    };
    const job = transformJob(backendJob, 'Sanity.io');
    expect(job.status).toBe('running');       // in_progress → running
    expect(job.moduleKey).toBe('research');   // deep → research
    expect(job.stageLabel).toBe('Discovering pages...');
    expect(job.progress).toBe(14);
    expect(job.accountName).toBe('Sanity.io');
  });

  it('maps all known backend status values', () => {
    const statuses: Record<string, string> = {
      done: 'complete',
      in_progress: 'running',
      pending: 'queued',
      failed: 'failed',
      queued: 'queued',
      running: 'running',
      complete: 'complete',
      completed: 'complete',
      not_started: 'queued',
    };

    for (const [backend, expected] of Object.entries(statuses)) {
      const job = transformJob(
        { _id: 'test', status: backend, mode: 'standard' },
        'Test',
      );
      expect(job.status).toBe(expected);
    }
  });

  it('derives progress when API returns none', () => {
    const running = transformJob({ _id: 'test', status: 'in_progress', mode: 'standard' }, 'Test');
    expect(running.progress).toBe(50); // running default

    const queued = transformJob({ _id: 'test', status: 'pending', mode: 'standard' }, 'Test');
    expect(queued.progress).toBe(0); // queued default

    const complete = transformJob({ _id: 'test', status: 'done', mode: 'standard' }, 'Test');
    expect(complete.progress).toBe(100); // complete default
  });

  it('extracts accountKey from entityId with prefix', () => {
    const job = transformJob(
      { _id: 'test', entityId: 'account-4aff4689adaa7961', mode: 'standard' },
      'Test',
    );
    expect(job.accountKey).toBe('4aff4689adaa7961');
  });

  it('prefers accountKey over entityId', () => {
    const job = transformJob(
      { _id: 'test', accountKey: 'direct-key', entityId: 'account-entity-key', mode: 'standard' },
      'Test',
    );
    expect(job.accountKey).toBe('direct-key');
  });

  it('includes advanceError when present', () => {
    const job = transformJob(
      {
        _id: 'test',
        status: 'in_progress',
        mode: 'standard',
        advanceError: 'Sanity API error: 400 - Total attribute/datatype count 2017 exceeds limit of 2000',
      },
      'Test',
    );
    expect(job.advanceError).toContain('attribute/datatype count');
  });

  it('derives correct module keys from mode', () => {
    const cases: Record<string, string> = {
      deep: 'research',
      standard: 'research',
      restart: 'research',
      competitors: 'competitors',
      linkedin: 'people',
      'gap-fill': 'approach',
    };

    for (const [mode, expectedModule] of Object.entries(cases)) {
      const job = transformJob({ _id: 'test', mode }, 'Test');
      expect(job.moduleKey).toBe(expectedModule);
    }
  });

  it('falls back startedAt to _createdAt', () => {
    const job = transformJob(
      { _id: 'test', _createdAt: '2026-03-18T10:00:00Z', mode: 'standard' },
      'Test',
    );
    expect(job.startedAt).toBe('2026-03-18T10:00:00Z');
  });

  it('batch transform skips invalid jobs', () => {
    const jobs = transformJobs(
      [
        { _id: 'good', status: 'done', mode: 'standard' },
        { _id: '', status: 'done', mode: 'standard' }, // will throw
        { _id: 'also-good', status: 'pending', mode: 'deep' },
      ],
      () => 'Test',
    );
    expect(jobs).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. PIPELINE — Does the pipeline bar show correct stages?
// ═══════════════════════════════════════════════════════════════════════

describe('Pipeline — stage rendering', () => {
  it('builds 7 pipeline stages', () => {
    const stages = buildPipelineStages({});
    expect(stages).toHaveLength(7);
  });

  it('all stages start as pending with no data', () => {
    const stages = buildPipelineStages({});
    for (const stage of stages) {
      expect(stage.status).toBe('pending');
      expect(stage.hasData).toBe(false);
    }
  });

  it('maps backend status correctly', () => {
    expect(mapBackendStatus('queued')).toBe('pending');
    expect(mapBackendStatus('running')).toBe('active');
    expect(mapBackendStatus('complete')).toBe('done');
    expect(mapBackendStatus('failed')).toBe('failed');
  });

  it('falls back unknown status to pending', () => {
    expect(mapBackendStatus('unknown')).toBe('pending');
  });

  it('calculates progress from completed stages with data', () => {
    const stages = buildPipelineStages({
      initial_scan: { status: 'complete', hasData: true },
      discovery: { status: 'complete', hasData: true },
      crawl: { status: 'running', hasData: false },
    });
    const progress = calculatePipelineProgress(stages);
    // initial_scan (15) + discovery (6) = 21 out of 57 total weight
    expect(progress).toBe(Math.round((21 / 57) * 100));
  });

  it('stages completed without data do not count toward progress', () => {
    const stages = buildPipelineStages({
      initial_scan: { status: 'complete', hasData: false }, // no data!
    });
    const progress = calculatePipelineProgress(stages);
    expect(progress).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. POLLING INTERVALS — Adaptive behavior
// ═══════════════════════════════════════════════════════════════════════

describe('Polling intervals — adaptive behavior', () => {
  it('30s when no active jobs', () => {
    expect(calculateInterval(0, null)).toBe(30_000);
  });

  it('3s for 1-2 active jobs', () => {
    expect(calculateInterval(1, null)).toBe(3_000);
    expect(calculateInterval(2, null)).toBe(3_000);
  });

  it('5s for 3-5 active jobs', () => {
    expect(calculateInterval(3, null)).toBe(5_000);
    expect(calculateInterval(5, null)).toBe(5_000);
  });

  it('8s for 6+ active jobs', () => {
    expect(calculateInterval(6, null)).toBe(8_000);
    expect(calculateInterval(10, null)).toBe(8_000);
  });

  it('escalates to 10s after 1 minute', () => {
    const oneMinAgo = new Date(Date.now() - 61_000).toISOString();
    expect(calculateInterval(1, oneMinAgo)).toBe(10_000);
  });

  it('escalates to 15s after 3 minutes', () => {
    const threeMinAgo = new Date(Date.now() - 181_000).toISOString();
    expect(calculateInterval(1, threeMinAgo)).toBe(15_000);
  });

  it('escalates to 30s after 10 minutes (likely stuck)', () => {
    const tenMinAgo = new Date(Date.now() - 601_000).toISOString();
    expect(calculateInterval(1, tenMinAgo)).toBe(30_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. EDGE CASES — Things that break in production
// ═══════════════════════════════════════════════════════════════════════

describe('Edge cases — production resilience', () => {
  it('briefing with null/undefined fields', () => {
    const result = transformBriefingResponse({
      ok: true,
      data: {
        top10Accounts: undefined,
        emailQueue: undefined,
        linkedInQueue: undefined,
        callList: undefined,
        assumptionRefresh: null,
      },
    });
    expect(result.enrichedAccounts).toHaveLength(0);
    expect(result.emailQueue).toHaveLength(0);
    expect(result.linkedInQueue).toHaveLength(0);
    expect(result.callList).toHaveLength(0);
  });

  it('account with score exactly at thresholds', () => {
    const result = transformBriefingResponse({
      ok: true,
      data: {
        top10Accounts: [
          { account: 'A', accountKey: 'a', score: 80, whyNow: 'x', bestNextAction: 'y' },
          { account: 'B', accountKey: 'b', score: 60, whyNow: 'x', bestNextAction: 'y' },
          { account: 'C', accountKey: 'c', score: 59, whyNow: 'x', bestNextAction: 'y' },
        ],
      },
    });
    expect(result.enrichedAccounts[0].urgency).toBe('urgent');     // 80 >= 80
    expect(result.enrichedAccounts[1].urgency).toBe('attention');  // 60 >= 60
    expect(result.enrichedAccounts[2].urgency).toBe('opportunity'); // 59 < 60
  });

  it('job with unknown status defaults to queued', () => {
    const job = transformJob({ _id: 'test', status: 'banana', mode: 'standard' }, 'Test');
    expect(job.status).toBe('queued');
  });

  it('job with no status defaults to queued', () => {
    const job = transformJob({ _id: 'test', mode: 'standard' }, 'Test');
    expect(job.status).toBe('queued');
  });

  it('job with no mode defaults to research module', () => {
    const job = transformJob({ _id: 'test' }, 'Test');
    expect(job.moduleKey).toBe('research');
  });

  it('snapshot account with zero score is not hot', () => {
    const account = transformSnapshotAccount({
      id: 'test',
      accountKey: 'test',
      name: 'Test',
      domain: 'test.com',
      canonicalUrl: null,
      completion: 0,
      opportunityScore: 0,
      missing: [],
      nextStages: [],
      technologies: [],
    });
    expect(account.hot).toBe(false);
  });

  it('snapshot account with score 70 is hot', () => {
    const account = transformSnapshotAccount({
      id: 'test',
      accountKey: 'test',
      name: 'Test',
      domain: 'test.com',
      canonicalUrl: null,
      completion: 0,
      opportunityScore: 70,
      missing: [],
      nextStages: [],
      technologies: [],
    });
    expect(account.hot).toBe(true);
  });

  it('glance context with empty briefing shows appropriate messages', () => {
    const ctx: GlanceContext = {
      account: {
        _id: 'account.test',
        accountKey: 'test',
        companyName: 'Test Corp',
        canonicalUrl: 'https://test.com',
        rootDomain: 'test.com',
      },
      briefing: {
        enrichedAccounts: [],
        emailQueue: [],
        linkedInQueue: [],
        callList: [],
        stats: { totalAccounts: 0, hotAccounts: 0, avgScore: 0, winCondition: 'Build pipeline' },
        assumptionRefresh: null,
      },
      pipelineStages: buildPipelineStages({}),
      activeJobs: new Map(),
      signals: [],
    };
    const glanceMap = deriveAllModuleGlanceProps(ctx);

    // Outreach should show no actions
    const outreach = glanceMap.get('outreach')!;
    expect(outreach.gaps).toContain('No outreach queued for this account');

    // Approach should show no recommended approach
    const approach = glanceMap.get('approach')!;
    expect(approach.gaps).toContain('No recommended approach');
  });
});
