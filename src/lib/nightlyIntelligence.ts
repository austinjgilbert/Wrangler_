import type {
  Account,
  ActionCandidate,
  Person,
  SdrTopActionsTodayView,
  SignalEvent,
  TopActionQueue,
} from '../../shared/types.ts';
import { buildEventDoc } from './events.ts';
import { generateTopActionQueue, rankActionCandidates } from './opportunityEngine.ts';
import { buildTopActionsTodayView } from './sdrCommandInterface.ts';
import { calculateDecayedSignalStrength } from './signalIngestion.ts';
import {
  createDailyBriefing,
  createEnrichJob,
  createMetricSnapshot,
  createMoltEvent,
  fetchAccounts,
  fetchActionCandidates,
  fetchPatternByType,
  fetchPeople,
  fetchSignals,
  patchEntity,
  updateActionCandidate,
  upsertMoltPattern,
} from './sanity.ts';
import { ensureBaselinePolicyVersions, getActivePolicyContext } from './policyVersioningService.ts';
import {
  recalculateSignalSourceReliability,
  recomputeDriftMetrics,
  retireStalePatterns,
} from './driftMonitoringService.ts';
import { enqueueAntiDriftMaintenanceJobs } from './jobs.ts';

type NightlyPipelineOptions = {
  now?: string;
  dailyLimit?: number;
  maxPerAccount?: number;
};

type ElevatedAccount = {
  accountRef: string;
  accountKey: string;
  companyName: string;
  previousScore: number;
  newScore: number;
  strongestDrivers: string[];
  candidateRef: string;
};

type EmergingPattern = {
  key: string;
  label: string;
  signalCount: number;
  avgStrength: number;
  accountCount: number;
  weightedScore: number;
};

type MorningBriefingSummary = {
  date: string;
  generatedAt: string;
  policyContext?: {
    scoringVersion?: string;
    patternVersion?: string;
    draftPolicyVersion?: string;
    strategyVersion?: string;
    rankingPolicyVersion?: string;
  };
  newlyElevatedAccounts: ElevatedAccount[];
  strongestSignals: Array<{
    signalRef: string;
    signalType: string;
    accountRef: string | null;
    accountName: string;
    strength: number;
    timestamp: string;
    summary: string;
  }>;
  patternsDetected: EmergingPattern[];
  actionsReady: Array<{
    rank: number;
    actionCandidateRef: string;
    accountRef: string;
    accountName: string;
    actionType: string;
    score: number;
    whyNow: string;
  }>;
  topActionsToday: SdrTopActionsTodayView;
  stats: {
    rescoredCandidates: number;
    decayedSignals: number;
    backfillJobsQueued: number;
    emergingPatterns: number;
    queuedActions: number;
  };
};

export async function runNightlyIntelligencePipeline(env: any, options: NightlyPipelineOptions = {}) {
  const now = options.now || new Date().toISOString();
  await ensureBaselinePolicyVersions(env, {
    actor: 'nightly',
    reason: 'Ensure baseline anti-drift policy versions exist before nightly processing.',
    now,
  }).catch(() => null);
  const accounts = (await fetchAccounts(env)) as Account[];
  const people = (await fetchPeople(env)) as Person[];
  const actionCandidates = (await fetchActionCandidates(env)) as ActionCandidate[];
  const signals = (await fetchSignals(env)) as SignalEvent[];
  const scoringOverrides = await loadScoringOverrides(env);

  const rescored = await rescoreAllActionCandidates(env, {
    accounts,
    people,
    actionCandidates,
    signals,
    now,
    ...scoringOverrides,
  });
  const decayedSignals = await decayStaleSignals(env, { signals, now });
  const backfill = await backfillMissingEntityFields(env, { accounts, people, now });
  const emerging = await detectEmergingPatterns(env, { signals, accounts, now });
  const queue = await generateTomorrowPriorityQueue(env, {
    candidates: rescored.ranked.map((item) => item.candidate),
    accounts,
    people,
    signals,
    now,
    dailyLimit: options.dailyLimit,
    maxPerAccount: options.maxPerAccount,
    ...scoringOverrides,
  });
  const briefing = await produceMorningBriefing(env, {
    accounts,
    signals,
    newlyElevatedAccounts: rescored.newlyElevatedAccounts,
    emergingPatterns: emerging.patterns,
    priorityQueue: queue,
    stats: {
      rescoredCandidates: rescored.updatedCount,
      decayedSignals: decayedSignals.updatedCount,
      backfillJobsQueued: backfill.jobsQueued.length,
      emergingPatterns: emerging.patterns.length,
      queuedActions: queue.actions.length,
    },
    now,
  });
  const [driftMetrics, retiredPatterns, signalReliabilityMetrics] = await Promise.all([
    recomputeDriftMetrics(env, now).catch(() => []),
    retireStalePatterns(env, now).catch(() => []),
    recalculateSignalSourceReliability(env, now).catch(() => []),
  ]);
  const maintenanceJobs = await enqueueAntiDriftMaintenanceJobs(env, {
    now,
    includeHeavyJobs: true,
  }).catch(() => []);

  const eventDoc = buildEventDoc({
    type: 'intelligence.nightly',
    text: `Nightly intelligence pipeline completed for ${now.slice(0, 10)}`,
    channel: 'system',
    actor: 'moltbot',
    entities: [],
    tags: ['nightly', 'intelligence', 'briefing'],
    traceId: `nightly-intelligence.${now}`,
    idempotencyKey: `nightly-intelligence.${now.slice(0, 10)}`,
  });
  await createMoltEvent(env, eventDoc);

  return {
    rescoredCandidates: rescored.updatedCount,
    decayedSignals: decayedSignals.updatedCount,
    backfillJobsQueued: backfill.jobsQueued.length,
    emergingPatterns: emerging.patterns.length,
    queueSize: queue.actions.length,
    briefingId: briefing._id,
    driftMetricCount: driftMetrics.length,
    retiredPatternCount: retiredPatterns.length,
    signalReliabilityMetricCount: signalReliabilityMetrics.length,
    maintenanceJobsQueued: maintenanceJobs.length,
    topElevatedAccounts: briefing.summaryJson.newlyElevatedAccounts.slice(0, 5),
  };
}

export async function rescoreAllActionCandidates(env: any, input: {
  accounts: Account[];
  people: Person[];
  actionCandidates: ActionCandidate[];
  signals: SignalEvent[];
  now: string;
  signalWeightOverrides?: Record<string, number>;
  patternStrengthOverrides?: Record<string, { score?: number } | number>;
}) {
  const priorScores = new Map(input.actionCandidates.map((candidate) => [candidate._id, Number(candidate.opportunityScore || 0)]));
  const ranked = rankActionCandidates({
    candidates: input.actionCandidates,
    accounts: input.accounts,
    people: input.people,
    signals: input.signals,
    now: input.now,
    signalWeightOverrides: input.signalWeightOverrides,
    patternStrengthOverrides: input.patternStrengthOverrides,
  });

  const elevatedByAccount = new Map<string, ElevatedAccount>();
  for (const item of ranked) {
    const previousScore = priorScores.get(item.candidate._id) || 0;
    const nextScore = Number(item.score.total || 0);
    await updateActionCandidate(env, item.candidate._id, {
      opportunityScore: nextScore,
      updatedAt: input.now,
    });

    const crossedThreshold = previousScore < 70 && nextScore >= 70;
    if (!crossedThreshold || !item.account?._id) continue;

    const current = elevatedByAccount.get(item.account._id);
    if (current && current.newScore >= nextScore) continue;
    elevatedByAccount.set(item.account._id, {
      accountRef: item.account._id,
      accountKey: item.account.accountKey,
      companyName: item.account.companyName || item.account.name || item.account.domain || item.account.accountKey,
      previousScore,
      newScore: nextScore,
      strongestDrivers: item.score.strongestDrivers,
      candidateRef: item.candidate._id,
    });
  }

  return {
    updatedCount: ranked.length,
    ranked,
    newlyElevatedAccounts: [...elevatedByAccount.values()].sort((a, b) => b.newScore - a.newScore),
  };
}

export async function decayStaleSignals(env: any, input: {
  signals: SignalEvent[];
  now: string;
}) {
  let updatedCount = 0;
  for (const signal of input.signals) {
    if (!signal?._id || !signal.timestamp) continue;
    const baseStrength = typeof signal.metadata?.baseStrength === 'number'
      ? signal.metadata.baseStrength
      : signal.strength;
    const decayedStrength = calculateDecayedSignalStrength({
      baseStrength,
      signalType: signal.signalType,
      timestamp: signal.timestamp,
      now: input.now,
    });
    const priorStrength = typeof signal.metadata?.decayedStrength === 'number'
      ? signal.metadata.decayedStrength
      : signal.strength;
    if (Math.abs(decayedStrength - priorStrength) < 0.02) continue;

    await patchEntity(env, signal._id, {
      strength: decayedStrength,
      metadata: {
        ...(signal.metadata || {}),
        baseStrength,
        decayedStrength,
        normalizedAt: input.now,
      },
    });
    updatedCount += 1;
  }
  return { updatedCount };
}

export async function backfillMissingEntityFields(env: any, input: {
  accounts: Account[];
  people: Person[];
  now: string;
}) {
  const jobsQueued: string[] = [];

  for (const account of input.accounts) {
    const missing = [
      !account.name && !account.companyName ? 'name' : '',
      !account.domain ? 'domain' : '',
      !account.industry ? 'industry' : '',
      !account.description ? 'description' : '',
    ].filter(Boolean);
    const staleDays = daysSince(account.lastEnrichedAt || account.updatedAt);
    if (missing.length === 0 && staleDays < 14) continue;

    const priority = Math.min(95, 55 + (missing.length * 8) + Math.min(staleDays, 21));
    const job = {
      _type: 'enrich.job',
      _id: `enrich.job.nightly.account.${account._id}.${input.now.slice(0, 10)}`,
      findingRef: null,
      entityType: 'account',
      entityId: account._id,
      goal: `Backfill missing account fields: ${(missing.join(', ') || 'refresh stale enrichment')}`,
      scope: { maxDepth: 1, maxPages: 5 },
      priority,
      status: 'queued',
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: input.now,
      leaseExpiresAt: null,
      createdAt: input.now,
    };
    const storedJob = await createEnrichJob(env, job);
    jobsQueued.push(storedJob._id);
  }

  for (const person of input.people) {
    const missing = [
      !person.name ? 'name' : '',
      !person.currentTitle && !person.title ? 'title' : '',
      !person.currentCompany ? 'company' : '',
      !person.linkedinUrl ? 'linkedinUrl' : '',
    ].filter(Boolean);
    const staleDays = daysSince(person.updatedAt);
    if (missing.length === 0 && staleDays < 21) continue;

    const priority = Math.min(90, 50 + (missing.length * 8) + Math.min(staleDays, 14));
    const job = {
      _type: 'enrich.job',
      _id: `enrich.job.nightly.person.${person._id}.${input.now.slice(0, 10)}`,
      findingRef: null,
      entityType: 'person',
      entityId: person._id,
      goal: `Backfill missing person fields: ${(missing.join(', ') || 'refresh stale enrichment')}`,
      scope: { maxDepth: 1, maxPages: 3 },
      priority,
      status: 'queued',
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: input.now,
      leaseExpiresAt: null,
      createdAt: input.now,
    };
    const storedJob = await createEnrichJob(env, job);
    jobsQueued.push(storedJob._id);
  }

  return { jobsQueued };
}

export async function detectEmergingPatterns(env: any, input: {
  signals: SignalEvent[];
  accounts: Account[];
  now: string;
}) {
  const periodStart = new Date(new Date(input.now).getTime() - (24 * 60 * 60 * 1000));
  const recentSignals = input.signals.filter((signal) => new Date(signal.timestamp).getTime() >= periodStart.getTime());
  const grouped = new Map<string, SignalEvent[]>();
  for (const signal of recentSignals) {
    const key = String(signal.signalType || 'unknown');
    const list = grouped.get(key) || [];
    list.push(signal);
    grouped.set(key, list);
  }

  const patterns = [...grouped.entries()]
    .map(([key, items]) => {
      const accountRefs = new Set(items.map((item) => item.account?._ref).filter(Boolean));
      const avgStrength = round(items.reduce((sum, item) => sum + (item.strength || 0), 0) / Math.max(items.length, 1));
      const weightedScore = round((items.length * 0.5) + (avgStrength * 2) + (accountRefs.size * 0.35));
      return {
        key,
        label: humanizeSignalType(key),
        signalCount: items.length,
        avgStrength,
        accountCount: accountRefs.size,
        weightedScore,
      };
    })
    .filter((pattern) => pattern.signalCount >= 2 || pattern.weightedScore >= 2.2)
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 10);

  const accountMap = new Map(input.accounts.map((account) => [account._id, account]));
  const recommendations = patterns.map((pattern) => {
    const exampleSignal = recentSignals.find((signal) => signal.signalType === pattern.key);
    const exampleAccount = exampleSignal?.account?._ref ? accountMap.get(exampleSignal.account._ref) : null;
    return `Pattern ${pattern.label} is rising across ${pattern.accountCount} accounts. Prioritize ${exampleAccount?.companyName || exampleAccount?.name || 'those accounts'} while the signal is fresh.`;
  });

  const existing = await fetchPatternByType(env, 'nightly.emergingPatterns');
  const doc = {
    _type: 'molt.pattern',
    _id: existing?._id || 'molt.pattern.nightly.emergingPatterns',
    patternType: 'nightly.emergingPatterns',
    summary: `Detected ${patterns.length} emerging signal patterns in the last 24 hours.`,
    conditions: { value: JSON.stringify({ date: input.now.slice(0, 10) }) },
    recommendedMoves: recommendations,
    evidenceEvents: [],
    successStats: {
      latestRunAt: input.now,
      patterns,
    },
    lastUpdated: input.now,
  };
  await upsertMoltPattern(env, doc);

  return { patterns, patternDocId: doc._id };
}

export async function generateTomorrowPriorityQueue(env: any, input: {
  candidates: ActionCandidate[];
  accounts: Account[];
  people: Person[];
  signals: SignalEvent[];
  now: string;
  dailyLimit?: number;
  maxPerAccount?: number;
  signalWeightOverrides?: Record<string, number>;
  patternStrengthOverrides?: Record<string, { score?: number } | number>;
}) {
  const policyContext = await getActivePolicyContext(env).catch(() => ({
    scoringVersion: 'scoring.default',
    patternVersion: 'pattern.default',
    draftPolicyVersion: 'draft.default',
    strategyVersion: 'strategy.default',
    rankingPolicyVersion: 'ranking.default',
  }));
  const queue = generateTopActionQueue({
    candidates: input.candidates,
    accounts: input.accounts,
    people: input.people,
    signals: input.signals,
    now: input.now,
    dailyLimit: input.dailyLimit ?? 100,
    maxPerAccount: input.maxPerAccount ?? 2,
    signalWeightOverrides: input.signalWeightOverrides,
    patternStrengthOverrides: input.patternStrengthOverrides,
  });
  queue.policyContext = policyContext;

  await createMetricSnapshot(env, {
    _type: 'molt.metricSnapshot',
    _id: `molt.metricSnapshot.priorityQueue.${queue.date}`,
    dateRange: {
      from: input.now,
      to: new Date(new Date(input.now).getTime() + (24 * 60 * 60 * 1000)).toISOString(),
    },
    aggregates: {
      queue,
      policyContext,
    },
    generatedAt: input.now,
  });

  return queue;
}

export async function produceMorningBriefing(env: any, input: {
  accounts: Account[];
  signals: SignalEvent[];
  newlyElevatedAccounts: ElevatedAccount[];
  emergingPatterns: EmergingPattern[];
  priorityQueue: TopActionQueue;
  stats: MorningBriefingSummary['stats'];
  now: string;
}) {
  const accountMap = new Map(input.accounts.map((account) => [account._id, account]));
  const strongestSignals = input.signals
    .slice()
    .sort((a, b) => (b.strength || 0) - (a.strength || 0))
    .slice(0, 8)
    .map((signal) => {
      const account = signal.account?._ref ? accountMap.get(signal.account._ref) : null;
      return {
        signalRef: signal._id,
        signalType: signal.signalType,
        accountRef: signal.account?._ref || null,
        accountName: account?.companyName || account?.name || account?.domain || 'Unattached',
        strength: round(signal.strength || 0),
        timestamp: signal.timestamp,
        summary: String(signal.metadata?.summary || '').trim() || `${signal.signalType} from ${signal.source}`,
      };
    });

  const actionsReady = input.priorityQueue.actions.slice(0, 12).map((item) => ({
    rank: item.rank,
    actionCandidateRef: item.candidate._id,
    accountRef: item.candidate.account._ref,
    accountName: item.account?.companyName || item.account?.name || item.account?.domain || item.candidate.account._ref,
    actionType: item.candidate.actionType,
    score: round(item.score.total),
    whyNow: truncate(item.candidate.whyNow, 220),
  }));
  const topActionsToday = buildTopActionsTodayView({
    queue: input.priorityQueue,
    page: 1,
    pageSize: Math.min(Math.max(input.priorityQueue.actions.length, 50), 200),
  });

  const summaryJson: MorningBriefingSummary = {
    date: nextDate(input.now),
    generatedAt: input.now,
    policyContext: input.priorityQueue.policyContext,
    newlyElevatedAccounts: input.newlyElevatedAccounts.slice(0, 10),
    strongestSignals,
    patternsDetected: input.emergingPatterns.slice(0, 8),
    actionsReady,
    topActionsToday,
    stats: input.stats,
  };

  const briefingDoc = {
    _type: 'operatorDailyBriefing',
    _id: `operatorDailyBriefing.${summaryJson.date}`,
    date: input.now,
    periodStart: new Date(new Date(input.now).getTime() - (24 * 60 * 60 * 1000)).toISOString(),
    periodEnd: input.now,
    summaryJson,
    summaryMarkdown: buildMorningBriefingMarkdown(summaryJson),
    suggestedCodeChanges: [],
    suggestedWorkflowImprovements: [
      'Work the highest-ranked actions first while strongest signals are still fresh.',
      'Start with newly elevated accounts before net-new prospecting.',
    ],
    accountRefs: uniqueRefs([
      ...summaryJson.newlyElevatedAccounts.map((account) => account.accountRef),
      ...summaryJson.actionsReady.map((action) => action.accountRef),
    ]),
    learningRefs: [],
    patternRefs: input.emergingPatterns.length > 0 ? [{ _type: 'reference', _ref: 'molt.pattern.nightly.emergingPatterns' }] : [],
  };
  await createDailyBriefing(env, briefingDoc);
  return briefingDoc;
}

function buildMorningBriefingMarkdown(summary: MorningBriefingSummary): string {
  const lines = [
    '# Morning Briefing',
    `Date: ${summary.date}`,
    '',
  ];

  if (summary.policyContext) {
    lines.push('## Policy Context');
    lines.push(`- Scoring: ${summary.policyContext.scoringVersion || 'scoring.default'}`);
    lines.push(`- Pattern: ${summary.policyContext.patternVersion || 'pattern.default'}`);
    lines.push(`- Draft: ${summary.policyContext.draftPolicyVersion || 'draft.default'}`);
    lines.push(`- Strategy: ${summary.policyContext.strategyVersion || 'strategy.default'}`);
    lines.push('');
  }

  lines.push('## Newly Elevated Accounts');

  for (const account of summary.newlyElevatedAccounts) {
    lines.push(`- ${account.companyName} moved from ${round(account.previousScore)} to ${round(account.newScore)}.`);
    if (account.strongestDrivers.length > 0) lines.push(`  Drivers: ${account.strongestDrivers.join(', ')}`);
  }
  if (summary.newlyElevatedAccounts.length === 0) {
    lines.push('- No accounts crossed the elevation threshold overnight.');
  }

  lines.push('', '## Strongest Signals');
  for (const signal of summary.strongestSignals.slice(0, 5)) {
    lines.push(`- ${signal.accountName}: ${humanizeSignalType(signal.signalType)} (${signal.strength})`);
    lines.push(`  ${signal.summary}`);
  }
  if (summary.strongestSignals.length === 0) {
    lines.push('- No significant signals detected in the latest window.');
  }

  lines.push('', '## Patterns Detected');
  for (const pattern of summary.patternsDetected) {
    lines.push(`- ${pattern.label}: ${pattern.signalCount} signals across ${pattern.accountCount} accounts (score ${pattern.weightedScore}).`);
  }
  if (summary.patternsDetected.length === 0) {
    lines.push('- No emerging patterns cleared the detection threshold.');
  }

  lines.push('', '## Actions Ready');
  for (const action of summary.actionsReady.slice(0, 8)) {
    lines.push(`- #${action.rank} ${action.accountName} — ${action.actionType} (${action.score})`);
    lines.push(`  ${action.whyNow}`);
  }
  if (summary.actionsReady.length === 0) {
    lines.push('- No action candidates are currently ready.');
  }

  lines.push('', `## ${summary.topActionsToday.title}`);
  for (const row of summary.topActionsToday.actions.slice(0, 12)) {
    lines.push(`- #${row.rank} ${row.account} | ${row.person || 'No person'} | ${row.action}`);
    lines.push(`  Why now: ${row.whyNow}`);
    lines.push(`  Confidence: ${row.confidence} | Pattern: ${row.pattern} | Draft ready: ${row.draftReady ? 'yes' : 'no'}`);
  }
  if (summary.topActionsToday.actions.length === 0) {
    lines.push('- No SDR actions available.');
  }

  return lines.join('\n');
}

function uniqueRefs(refs: string[]) {
  const seen = new Set<string>();
  return refs
    .filter(Boolean)
    .filter((ref) => {
      if (seen.has(ref)) return false;
      seen.add(ref);
      return true;
    })
    .map((ref) => ({ _type: 'reference', _ref: ref }));
}

async function loadScoringOverrides(env: any) {
  const [signalWeightsDoc, patternStrengthDoc] = await Promise.all([
    fetchPatternByType(env, 'operator.signalWeights'),
    fetchPatternByType(env, 'operator.patternStrength'),
  ]);

  return {
    signalWeightOverrides: { ...(signalWeightsDoc?.successStats?.weights || {}) },
    patternStrengthOverrides: { ...(patternStrengthDoc?.successStats?.strengths || {}) },
  };
}

function nextDate(now: string): string {
  return new Date(new Date(now).getTime() + (24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function daysSince(value?: string) {
  if (!value) return 999;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)));
}

function humanizeSignalType(value: string) {
  return String(value || 'unknown').replace(/_/g, ' ');
}

function truncate(value: string, max: number) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function round(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
