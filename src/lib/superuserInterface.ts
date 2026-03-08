import type {
  Account,
  ActionCandidate,
  Person,
  SignalEvent,
  SuperuserCapability,
  SuperuserInterfaceState,
  SuperuserWeakDataItem,
} from '../../shared/types.ts';
import { generateEmailDraft } from './draftingEngine.ts';
import { buildEventDoc } from './events.ts';
import { generateTopActionQueue } from './opportunityEngine.ts';
import { generateTomorrowPriorityQueue, rescoreAllActionCandidates } from './nightlyIntelligence.ts';
import {
  buildScoringPolicyVersion,
  buildStrategyInstructionVersion,
  createPatternVersionRecord,
  ensureBaselinePolicyVersions,
} from './policyVersioningService.ts';
import { buildTopActionsTodayView } from './sdrCommandInterface.ts';
import {
  createScoringPolicyVersion,
  createStrategyInstructionVersion,
  createEnrichJob,
  createMetricSnapshot,
  createMoltEvent,
  createStrategyBrief,
  fetchAccounts,
  fetchActionCandidates,
  fetchLatestMoltbotConfig,
  fetchPeople,
  fetchPatternByType,
  fetchSignals,
  fetchSignalsForActionCandidate,
  updateMoltbotConfig,
  upsertMoltPattern,
} from './sanity.ts';
import { enqueueActionCandidateJob, enqueueAntiDriftMaintenanceJobs } from './jobs.ts';
import { saveDraftRecord } from '../services/gmail-workflow.ts';

const SUPERUSER_CAPABILITIES: SuperuserCapability[] = [
  {
    id: 'adjust_signal_weights',
    label: 'Adjust Signal Weights',
    description: 'Change how strongly different signal types influence ranking and urgency.',
  },
  {
    id: 'add_pattern',
    label: 'Add Pattern',
    description: 'Inject a new interpretable pattern with conditions and recommended moves.',
  },
  {
    id: 'trigger_reanalysis',
    label: 'Trigger Re-analysis',
    description: 'Queue reinterpretation jobs for affected accounts and people.',
  },
  {
    id: 'inspect_weak_data',
    label: 'Inspect Weak Data',
    description: 'Review low-confidence candidates, weak signals, and sparse entities.',
  },
  {
    id: 'inject_strategy_updates',
    label: 'Inject Strategy Updates',
    description: 'Update strategy rules and automatically trigger reinterpretation, draft regeneration, and reranking.',
  },
  {
    id: 'rerank_actions',
    label: 'Re-rank Actions',
    description: 'Recalculate action scores and rebuild the SDR queue.',
  },
];

export async function getSuperuserInterfaceState(env: any): Promise<SuperuserInterfaceState> {
  const weakData = await inspectWeakData(env, { limit: 20 });
  const [accounts, people, actionCandidates, signals] = await Promise.all([
    fetchAccounts(env) as Promise<Account[]>,
    fetchPeople(env) as Promise<Person[]>,
    fetchActionCandidates(env) as Promise<ActionCandidate[]>,
    fetchSignals(env) as Promise<SignalEvent[]>,
  ]);
  const previewQueue = generateTopActionQueue({
    candidates: actionCandidates,
    accounts,
    people,
    signals,
    dailyLimit: 100,
    maxPerAccount: 3,
    now: new Date().toISOString(),
  });
  const latestConfig = await fetchLatestMoltbotConfig(env);

  return {
    title: 'SUPERUSER',
    capabilities: SUPERUSER_CAPABILITIES,
    actionsToday: buildTopActionsTodayView({ queue: previewQueue, page: 1, pageSize: 50 }),
    weakData: weakData.items,
    latestStrategyUpdateAt: latestConfig?._updatedAt || latestConfig?._createdAt || null,
  };
}

export async function adjustSignalWeights(env: any, input: {
  weights: Record<string, number>;
  note?: string;
}) {
  const now = new Date().toISOString();
  await ensureBaselinePolicyVersions(env, {
    actor: 'superuser',
    reason: input.note || 'Initialize baseline versions before adjusting signal weights.',
    now,
  }).catch(() => null);
  const existing = await fetchPatternByType(env, 'operator.signalWeights');
  const current = { ...(existing?.successStats?.weights || {}) };
  const nextWeights: Record<string, number> = {};
  for (const [signalType, value] of Object.entries(input.weights || {})) {
    nextWeights[signalType] = clamp(round(value), 0.1, 3);
  }

  const doc = {
    _type: 'molt.pattern',
    _id: existing?._id || 'molt.pattern.operator.signalWeights',
    patternType: 'operator.signalWeights',
    summary: input.note || 'Superuser-adjusted signal weights.',
    conditions: {},
    recommendedMoves: Object.keys(nextWeights).map((key) => `Weight ${key} => ${nextWeights[key]}`),
    evidenceEvents: [],
    successStats: {
      ...(existing?.successStats || {}),
      weights: {
        ...current,
        ...nextWeights,
      },
      overriddenBy: 'superuser',
      updatedAt: now,
    },
    lastUpdated: now,
  };
  await upsertMoltPattern(env, doc);
  await createScoringPolicyVersion(env, buildScoringPolicyVersion({
    versionId: `scoring.superuser.${now.slice(0, 10)}.${Object.keys(nextWeights).length}`,
    changedBy: 'superuser',
    changedAt: now,
    reason: input.note || 'Superuser-adjusted signal weights.',
    previousVersion: 'scoring.default',
    expectedImpact: 'Re-rank actions using adjusted signal-type reliability.',
    activationStatus: 'active',
    weights: doc.successStats.weights,
    thresholds: { minimumSampleSize: 1 },
  }));
  await auditSuperuserEvent(env, 'superuser.adjust_signal_weights', {
    updatedWeights: nextWeights,
    note: input.note || null,
  }, now);

  return {
    patternId: doc._id,
    weights: doc.successStats.weights,
  };
}

export async function addPattern(env: any, input: {
  patternKey: string;
  summary: string;
  conditions?: Record<string, any>;
  recommendedMoves?: string[];
}) {
  const now = new Date().toISOString();
  const patternKey = sanitizeKey(input.patternKey);
  const doc = {
    _type: 'molt.pattern',
    _id: `molt.pattern.superuser.${patternKey}`,
    patternType: `superuser.custom.${patternKey}`,
    summary: String(input.summary || '').trim(),
    conditions: { value: JSON.stringify(input.conditions || {}) },
    recommendedMoves: Array.isArray(input.recommendedMoves) ? input.recommendedMoves : [],
    evidenceEvents: [],
    successStats: {
      createdBy: 'superuser',
      createdAt: now,
    },
    lastUpdated: now,
  };
  await upsertMoltPattern(env, doc);
  await createPatternVersionRecord(env, {
    patternKey,
    changedBy: 'superuser',
    reason: `Add superuser pattern ${patternKey}.`,
    expectedImpact: 'Enable explicit strategist-owned pattern tracking and lifecycle management.',
    conditions: input.conditions || {},
    recommendedMoves: input.recommendedMoves || [],
    now,
  });
  await auditSuperuserEvent(env, 'superuser.add_pattern', {
    patternType: doc.patternType,
    summary: doc.summary,
  }, now);

  return {
    patternId: doc._id,
    patternType: doc.patternType,
  };
}

export async function triggerReanalysis(env: any, input: {
  accountRefs?: string[];
  personRefs?: string[];
  maxAccounts?: number;
}) {
  const accounts = (await fetchAccounts(env)) as Account[];
  const targetAccounts = resolveTargetAccounts(accounts, input.accountRefs, input.maxAccounts ?? 25);
  const jobsQueued: string[] = [];
  const now = new Date().toISOString();

  for (const account of targetAccounts) {
    const job = await enqueueActionCandidateJob({
      env,
      accountRef: account._id,
      traceId: `superuser.reanalysis.${Date.now()}`,
      priority: 90,
    });
    jobsQueued.push(job._id);
  }

  for (const personRef of (input.personRefs || []).slice(0, 25)) {
    const job = {
      _type: 'enrich.job',
      _id: `enrich.job.superuser.person.${personRef}.${Date.now()}`,
      findingRef: null,
      entityType: 'person',
      entityId: personRef,
      goal: 'Superuser-triggered person re-analysis',
      scope: { maxDepth: 1, maxPages: 3 },
      priority: 80,
      status: 'queued',
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: now,
      leaseExpiresAt: null,
      createdAt: now,
    };
    await createEnrichJob(env, job);
    jobsQueued.push(job._id);
  }

  await auditSuperuserEvent(env, 'superuser.trigger_reanalysis', {
    accountRefs: targetAccounts.map((account) => account._id),
    personRefs: input.personRefs || [],
    jobsQueued,
  });

  return {
    jobsQueued,
    accountCount: targetAccounts.length,
    personCount: (input.personRefs || []).length,
  };
}

export async function inspectWeakData(env: any, input: {
  limit?: number;
}) {
  const limit = Math.max(5, Math.min(input.limit ?? 25, 100));
  const [accounts, people, actionCandidates, signals] = await Promise.all([
    fetchAccounts(env) as Promise<Account[]>,
    fetchPeople(env) as Promise<Person[]>,
    fetchActionCandidates(env) as Promise<ActionCandidate[]>,
    fetchSignals(env) as Promise<SignalEvent[]>,
  ]);

  const items: SuperuserWeakDataItem[] = [];

  for (const candidate of actionCandidates) {
    const confidence = normalizeConfidence(candidate.confidence);
    if (confidence >= 55 && (candidate.missingData || []).length <= 2) continue;
    items.push({
      type: 'action_candidate',
      refId: candidate._id,
      label: `${candidate.actionType} | ${candidate.patternMatch || 'unknown pattern'}`,
      reason: `Confidence ${confidence} with missing data: ${(candidate.missingData || []).slice(0, 3).join(', ') || 'none listed'}`,
      severity: confidence < 35 ? 'high' : 'medium',
    });
  }

  for (const account of accounts) {
    const completeness = Number(account.profileCompleteness?.score || 0);
    if (completeness >= 45 && account.description && account.industry) continue;
    items.push({
      type: 'account',
      refId: account._id,
      label: account.companyName || account.name || account.domain || account.accountKey,
      reason: `Completeness ${completeness}; missing core context such as description/industry/domain.`,
      severity: completeness < 25 ? 'high' : 'medium',
    });
  }

  for (const person of people) {
    if ((person.currentTitle || person.title) && person.currentCompany && person.linkedinUrl) continue;
    items.push({
      type: 'person',
      refId: person._id,
      label: person.name,
      reason: 'Missing title, company, or LinkedIn URL needed for confident outreach.',
      severity: 'medium',
    });
  }

  for (const signal of signals) {
    if ((signal.strength || 0) >= 0.3) continue;
    items.push({
      type: 'signal',
      refId: signal._id,
      label: String(signal.signalType || 'unknown'),
      reason: `Weak signal strength ${(signal.strength || 0).toFixed(2)} may need validation or de-prioritization.`,
      severity: (signal.strength || 0) < 0.15 ? 'high' : 'low',
    });
  }

  const ranked = items
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, limit);

  return {
    items: ranked,
    total: items.length,
  };
}

export async function injectStrategyUpdates(env: any, input: {
  title?: string;
  operatingRules?: string[];
  toneRules?: string[];
  values?: string[];
  accountRefs?: string[];
  note?: string;
}) {
  const now = new Date().toISOString();
  await ensureBaselinePolicyVersions(env, {
    actor: 'superuser',
    reason: input.note || 'Initialize baseline versions before injecting strategy updates.',
    now,
  }).catch(() => null);
  const config = await fetchLatestMoltbotConfig(env);
  if (!config?._id) {
    throw new Error('Missing moltbot.config');
  }

  const operatingRules = uniqueStrings([...(config.operatingRules || []), ...(input.operatingRules || [])]).slice(-60);
  const toneRules = uniqueStrings([...(config.toneRules || []), ...(input.toneRules || [])]).slice(-40);
  const values = uniqueStrings([...(config.values || []), ...(input.values || [])]).slice(-30);

  await updateMoltbotConfig(env, config._id, {
    operatingRules,
    toneRules,
    values,
  });
  await createStrategyInstructionVersion(env, buildStrategyInstructionVersion({
    versionId: `strategy.superuser.${now.slice(0, 10)}.${sanitizeKey(input.title || 'update')}`,
    changedBy: 'superuser',
    changedAt: now,
    reason: input.note || 'Superuser strategy update.',
    previousVersion: 'strategy.default',
    expectedImpact: 'Reinterpret accounts, regenerate drafts, and rerank queue under updated strategy.',
    activationStatus: 'active',
    operatingRules,
    toneRules,
    values,
  }));

  const strategyId = `molt.strategyBrief.superuser.${Date.now()}`;
  const strategyDoc = {
    _type: 'molt.strategyBrief',
    _id: strategyId,
    date: now,
    cadence: 'ad_hoc',
    markdown: buildStrategyMarkdown(input, now),
    doubleDown: input.operatingRules || [],
    stopDoing: [],
    nextSkillFocus: input.note || 'Apply updated strategy to interpretation, drafts, and ranking.',
    generatedAt: now,
  };
  await createStrategyBrief(env, strategyDoc);

  const reinterpretation = await triggerReanalysis(env, {
    accountRefs: input.accountRefs,
    maxAccounts: 25,
  });
  const draftRegeneration = await regenerateDraftsFromStrategyUpdate(env, {
    accountRefs: input.accountRefs,
    strategyNote: input.note || input.title || 'Apply the latest superuser strategy update.',
    limit: 10,
  });
  const priorityRecalculation = await rerankActions(env, {
    pageSize: 50,
    dailyLimit: 100,
  });

  const impactPreview = await previewStrategyImpact(env, input.accountRefs);

  await createMetricSnapshot(env, {
    _type: 'molt.metricSnapshot',
    _id: `molt.metricSnapshot.superuser.strategyUpdate.${Date.now()}`,
    dateRange: { from: now, to: now },
    aggregates: {
      strategyId,
      impactPreview,
      reinterpretation,
      draftRegeneration,
      priorityRecalculation: {
        queueSize: priorityRecalculation.queue.actions.length,
        generatedAt: priorityRecalculation.queue.generatedAt,
      },
    },
    generatedAt: now,
  });

  await auditSuperuserEvent(env, 'superuser.inject_strategy_updates', {
    strategyId,
    operatingRulesAdded: input.operatingRules || [],
    toneRulesAdded: input.toneRules || [],
    valuesAdded: input.values || [],
  }, now);

  return {
    strategyId,
    configId: config._id,
    impactPreview,
    triggers: {
      entityReinterpretation: reinterpretation,
      draftRegeneration,
      priorityRecalculation: {
        topActionsToday: priorityRecalculation.topActionsToday,
        queueGeneratedAt: priorityRecalculation.queue.generatedAt,
      },
    },
  };
}

export async function previewStrategyUpdates(env: any, input: {
  accountRefs?: string[];
}) {
  return await previewStrategyImpact(env, input.accountRefs);
}

export async function queueAntiDriftMaintenance(env: any, input: {
  includeHeavyJobs?: boolean;
  now?: string;
}) {
  const now = input.now || new Date().toISOString();
  const jobs = await enqueueAntiDriftMaintenanceJobs(env, {
    now,
    includeHeavyJobs: input.includeHeavyJobs !== false,
  });
  await auditSuperuserEvent(env, 'superuser.queueAntiDriftMaintenance', {
    includeHeavyJobs: input.includeHeavyJobs !== false,
    jobs: jobs.map((job) => ({ id: job._id, jobType: job.jobType })),
  }, now);
  return {
    queued: jobs.length,
    jobs: jobs.map((job) => ({ id: job._id, jobType: job.jobType })),
  };
}

export async function rerankActions(env: any, input: {
  dailyLimit?: number;
  maxPerAccount?: number;
  page?: number;
  pageSize?: number;
}) {
  const now = new Date().toISOString();
  const [accounts, people, actionCandidates, signals] = await Promise.all([
    fetchAccounts(env) as Promise<Account[]>,
    fetchPeople(env) as Promise<Person[]>,
    fetchActionCandidates(env) as Promise<ActionCandidate[]>,
    fetchSignals(env) as Promise<SignalEvent[]>,
  ]);
  const [signalWeightsDoc, patternStrengthDoc] = await Promise.all([
    fetchPatternByType(env, 'operator.signalWeights'),
    fetchPatternByType(env, 'operator.patternStrength'),
  ]);
  const signalWeightOverrides = { ...(signalWeightsDoc?.successStats?.weights || {}) };
  const patternStrengthOverrides = { ...(patternStrengthDoc?.successStats?.strengths || {}) };

  const rescored = await rescoreAllActionCandidates(env, {
    accounts,
    people,
    actionCandidates,
    signals,
    now,
    signalWeightOverrides,
    patternStrengthOverrides,
  });
  const queue = await generateTomorrowPriorityQueue(env, {
    candidates: rescored.ranked.map((item) => item.candidate),
    accounts,
    people,
    signals,
    now,
    dailyLimit: input.dailyLimit ?? 100,
    maxPerAccount: input.maxPerAccount ?? 3,
    signalWeightOverrides,
    patternStrengthOverrides,
  });
  const topActionsToday = buildTopActionsTodayView({
    queue,
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 50,
  });

  await auditSuperuserEvent(env, 'superuser.rerank_actions', {
    queueSize: queue.actions.length,
    pageSize: topActionsToday.pageSize,
  }, now);

  return {
    queue,
    topActionsToday,
    newlyElevatedAccounts: rescored.newlyElevatedAccounts,
  };
}

async function regenerateDraftsFromStrategyUpdate(env: any, input: {
  accountRefs?: string[];
  strategyNote: string;
  limit: number;
}) {
  const [accounts, people, actionCandidates] = await Promise.all([
    fetchAccounts(env) as Promise<Account[]>,
    fetchPeople(env) as Promise<Person[]>,
    fetchActionCandidates(env) as Promise<ActionCandidate[]>,
  ]);

  const accountMap = new Map(accounts.map((account) => [account._id, account]));
  const personMap = new Map(people.map((person) => [person._id, person]));
  const targetSet = new Set((input.accountRefs || []).filter(Boolean));
  const candidates = actionCandidates
    .filter((candidate) => candidate.actionType === 'send_email')
    .filter((candidate) => targetSet.size === 0 || targetSet.has(candidate.account?._ref))
    .filter((candidate) => candidate.lifecycleStatus !== 'expired')
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
    .slice(0, input.limit);

  const drafts = [];
  for (const candidate of candidates) {
    const account = accountMap.get(candidate.account?._ref);
    const person = candidate.person?._ref ? personMap.get(candidate.person._ref) || null : null;
    const signals = await fetchSignalsForActionCandidate(env, {
      accountRef: candidate.account?._ref || null,
      personRef: candidate.person?._ref || null,
    }) as SignalEvent[];
    const draft = await generateEmailDraft(env, {
      actionCandidate: candidate,
      account: account || null,
      person,
      signals,
      objective: `Regenerate this draft using the updated strategy: ${input.strategyNote}`,
      tone: 'Strategic, specific, evidence-backed, concise.',
    });
    const saved = await saveDraftRecord(env, {
      draftId: `gmailDraft.superuser.${candidate._id}`,
      actionCandidateId: candidate._id,
      draftPolicyVersion: draft.draftPolicyVersion || candidate.draftPolicyVersion,
      strategyVersion: draft.strategyVersion || candidate.strategyVersion,
      confidenceBreakdown: draft.confidenceBreakdown || candidate.confidenceBreakdown,
      status: 'draft',
      accountName: account?.companyName || account?.name || account?.domain || '',
      recipientName: person?.name || '',
      recipientTitle: person?.currentTitle || person?.title || '',
      recipientCompany: account?.companyName || account?.name || account?.domain || '',
      subject: draft.subject,
      body: draft.shortEmailDraft,
      context: JSON.stringify({
        actionCandidateId: candidate._id,
        strategyNote: input.strategyNote,
        generatedAt: draft.generatedAt,
      }),
    });
    drafts.push({
      actionCandidateId: candidate._id,
      draftId: saved.draftId,
      subject: draft.subject,
    });
  }

  return {
    draftsRegenerated: drafts.length,
    drafts,
  };
}

async function auditSuperuserEvent(env: any, type: string, details: Record<string, any>, now: string = new Date().toISOString()) {
  const eventDoc = buildEventDoc({
    type,
    text: `${type} executed`,
    channel: 'system',
    actor: 'superuser',
    entities: [],
    tags: ['superuser'],
    traceId: `${type}.${Date.now()}`,
    idempotencyKey: `${type}.${now}`,
    outcome: JSON.stringify(details).slice(0, 1200),
  });
  await createMoltEvent(env, eventDoc);
}

async function previewStrategyImpact(env: any, accountRefs?: string[]) {
  const [accounts, people, actionCandidates, signals] = await Promise.all([
    fetchAccounts(env) as Promise<Account[]>,
    fetchPeople(env) as Promise<Person[]>,
    fetchActionCandidates(env) as Promise<ActionCandidate[]>,
    fetchSignals(env) as Promise<SignalEvent[]>,
  ]);
  const target = new Set((accountRefs || []).filter(Boolean));
  const affectedCandidates = actionCandidates.filter((candidate) => target.size === 0 || target.has(candidate.account?._ref || ''));
  const queue = generateTopActionQueue({
    candidates: affectedCandidates,
    accounts,
    people,
    signals,
    dailyLimit: 100,
    maxPerAccount: 3,
    now: new Date().toISOString(),
  });
  return {
    affectedAccounts: [...new Set(affectedCandidates.map((candidate) => candidate.account?._ref).filter(Boolean))].length,
    rerankedActions: queue.actions.length,
    draftsToRegenerate: affectedCandidates.filter((candidate) => candidate.actionType === 'send_email').length,
    affectedPatterns: [...new Set(affectedCandidates.map((candidate) => candidate.patternMatch).filter(Boolean))].length,
  };
}

function resolveTargetAccounts(accounts: Account[], explicitRefs: string[] | undefined, maxAccounts: number) {
  if (Array.isArray(explicitRefs) && explicitRefs.length > 0) {
    const selected = new Set(explicitRefs);
    return accounts.filter((account) => selected.has(account._id)).slice(0, maxAccounts);
  }
  return accounts
    .slice()
    .sort((a, b) => Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0))
    .slice(0, maxAccounts);
}

function buildStrategyMarkdown(input: {
  title?: string;
  operatingRules?: string[];
  toneRules?: string[];
  values?: string[];
  note?: string;
}, now: string) {
  return [
    `# ${input.title || 'Superuser Strategy Update'}`,
    `Date: ${now}`,
    '',
    input.note || 'Applied a superuser strategy update.',
    '',
    '## Operating Rules',
    ...(input.operatingRules?.length ? input.operatingRules.map((rule) => `- ${rule}`) : ['- No operating rules added.']),
    '',
    '## Tone Rules',
    ...(input.toneRules?.length ? input.toneRules.map((rule) => `- ${rule}`) : ['- No tone rules added.']),
    '',
    '## Values',
    ...(input.values?.length ? input.values.map((rule) => `- ${rule}`) : ['- No values added.']),
  ].join('\n');
}

function sanitizeKey(value: string) {
  return String(value || 'custom').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function uniqueStrings(values: string[]) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeConfidence(value: number): number {
  const numeric = Number(value) || 0;
  if (numeric <= 1) return Math.round(numeric * 100);
  return Math.round(numeric);
}

function severityWeight(value: SuperuserWeakDataItem['severity']) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function clamp(value: number, min: number, max: number) {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, numeric));
}

function round(value: number) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
