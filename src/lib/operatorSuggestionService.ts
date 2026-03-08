import { generateTopActionQueue } from './opportunityEngine.ts';

export type OperatorSuggestion = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  actionCommand: string;
  priority: number;
  category: 'enrichment' | 'research' | 'ranking' | 'pattern' | 'system';
  riskLevel: 'low' | 'medium' | 'high';
  estimatedCount?: number;
  requiresConfirmation?: boolean;
  context?: Record<string, unknown>;
};

export function generateOperatorSuggestions(input: {
  accounts: any[];
  people: any[];
  signals: any[];
  actionCandidates: any[];
  patterns: any[];
  jobs: any[];
  driftMetrics?: Record<string, any[]>;
  context?: {
    section?: string;
    accountId?: string | null;
    accountName?: string | null;
  };
}) {
  const suggestions: OperatorSuggestion[] = [];
  const staleEvidenceMetric = input.driftMetrics?.staleEvidence?.[0];
  const duplicateActionMetric = input.driftMetrics?.duplicateAction?.[0];
  const lowCompletionAccounts = input.accounts.filter((account) => Number(account.profileCompleteness?.score || 0) < 50);
  const staleActionCandidates = input.actionCandidates.filter((candidate) => {
    const staleAfter = candidate.staleAfter || candidate.expirationTime;
    return staleAfter ? new Date(staleAfter).getTime() < Date.now() : false;
  });
  const noBriefAccounts = input.accounts.filter((account) => Number(account.opportunityScore || 0) >= 70 && Number(account.profileCompleteness?.score || 0) < 80);
  const idlePatterns = input.patterns.filter((pattern) => Number(pattern.matchFrequency || 0) <= 1);
  const queuedJobs = input.jobs.filter((job) => job.status === 'queued');
  const highSignalAccounts = summarizeHighSignalAccounts(input.signals);

  if (lowCompletionAccounts.length > 0) {
    suggestions.push({
      id: 'enrich-incomplete-accounts',
      title: `Run enrichment on ${lowCompletionAccounts.length} incomplete accounts`,
      description: 'Accounts below 50% completion are suppressing the opportunity engine and hiding reachable actions.',
      actionLabel: 'Run enrichment',
      actionCommand: 'refresh stale entities',
      priority: 94,
      category: 'enrichment',
      riskLevel: 'medium',
      estimatedCount: lowCompletionAccounts.length,
      requiresConfirmation: lowCompletionAccounts.length >= 100,
    });
  }

  if (noBriefAccounts.length > 0) {
    suggestions.push({
      id: 'generate-briefs-high-signal',
      title: `Generate briefs for ${noBriefAccounts.length} high-signal accounts`,
      description: 'These accounts already score well but still lack enough structured synthesis for fast SDR execution.',
      actionLabel: 'Generate briefs',
      actionCommand: 'run nightly jobs',
      priority: 89,
      category: 'research',
      riskLevel: 'medium',
      estimatedCount: noBriefAccounts.length,
      requiresConfirmation: noBriefAccounts.length >= 75,
    });
  }

  if (staleActionCandidates.length > 0) {
    suggestions.push({
      id: 'recalculate-stale-scores',
      title: `Review ${staleActionCandidates.length} stale opportunity scores`,
      description: 'Stale opportunity windows reduce confidence calibration and create silent drift in the action queue.',
      actionLabel: 'Recalculate scores',
      actionCommand: 'recalculate scores',
      priority: 86,
      category: 'ranking',
      riskLevel: staleActionCandidates.length > 50 ? 'medium' : 'low',
      estimatedCount: staleActionCandidates.length,
    });
  }

  if (highSignalAccounts.length > 0) {
    suggestions.push({
      id: 'investigate-high-signal-cluster',
      title: `Investigate ${highSignalAccounts.length} high-signal clusters`,
      description: 'Recent pricing, docs, and intent activity clusters likely support execution-ready actions right now.',
      actionLabel: 'Open actions',
      actionCommand: 'generate sdr actions',
      priority: 91,
      category: 'ranking',
      riskLevel: 'low',
      estimatedCount: highSignalAccounts.length,
    });
  }

  if (idlePatterns.length > 0) {
    suggestions.push({
      id: 'review-unused-patterns',
      title: `Review ${idlePatterns.length} underused patterns`,
      description: 'Low-frequency patterns may be outdated, mis-scoped, or ready for retirement.',
      actionLabel: 'Inspect patterns',
      actionCommand: 'queue anti drift maintenance',
      priority: 78,
      category: 'pattern',
      riskLevel: 'low',
      estimatedCount: idlePatterns.length,
    });
  }

  if (queuedJobs.length > 25) {
    suggestions.push({
      id: 'job-queue-pressure',
      title: `Queued job pressure is rising (${queuedJobs.length} queued)`,
      description: 'The queue is accumulating enough work that operator-visible freshness and action timing may degrade.',
      actionLabel: 'Run diagnostics',
      actionCommand: 'run nightly jobs',
      priority: 75,
      category: 'system',
      riskLevel: queuedJobs.length > 75 ? 'high' : 'medium',
      estimatedCount: queuedJobs.length,
    });
  }

  if (staleEvidenceMetric && Number(staleEvidenceMetric.value || 0) >= 0.15) {
    suggestions.push({
      id: 'stale-evidence-warning',
      title: 'Stale evidence rate is creeping up',
      description: `Current stale evidence percentage is ${Math.round(Number(staleEvidenceMetric.value || 0) * 100)}%. Freshness refresh is warranted.`,
      actionLabel: 'Refresh stale entities',
      actionCommand: 'refresh stale entities',
      priority: 82,
      category: 'system',
      riskLevel: staleEvidenceMetric.severity === 'high' ? 'high' : 'medium',
    });
  }

  if (duplicateActionMetric && Number(duplicateActionMetric.value || 0) >= 0.15) {
    suggestions.push({
      id: 'duplicate-action-warning',
      title: 'Duplicate action rate needs review',
      description: 'The queue is beginning to over-produce similar actions and may need reranking or pattern cleanup.',
      actionLabel: 'Re-rank actions',
      actionCommand: 'generate sdr actions',
      priority: 77,
      category: 'ranking',
      riskLevel: duplicateActionMetric.severity === 'high' ? 'high' : 'medium',
    });
  }

  const contextual = buildContextualSuggestions(input);
  suggestions.push(...contextual);

  return suggestions
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 8);
}

function summarizeHighSignalAccounts(signals: any[]) {
  const grouped = new Map<string, { count: number; totalStrength: number }>();
  for (const signal of signals || []) {
    const accountId = signal.account?._ref;
    if (!accountId) continue;
    const current = grouped.get(accountId) || { count: 0, totalStrength: 0 };
    current.count += 1;
    current.totalStrength += Number(signal.strength || 0);
    grouped.set(accountId, current);
  }
  return [...grouped.entries()].filter(([, value]) => value.count >= 2 && value.totalStrength >= 1.4);
}

function buildContextualSuggestions(input: {
  accounts: any[];
  people: any[];
  signals: any[];
  actionCandidates: any[];
  context?: {
    section?: string;
    accountId?: string | null;
    accountName?: string | null;
  };
}) {
  const context = input.context || {};
  if (!context.accountId) return [];

  const account = input.accounts.find((item) => item._id === context.accountId);
  const accountSignals = input.signals.filter((signal) => signal.account?._ref === context.accountId);
  const actions = input.actionCandidates.filter((candidate) => candidate.account?._ref === context.accountId);
  const suggestions: OperatorSuggestion[] = [];
  const accountName = context.accountName || account?.companyName || account?.name || context.accountId;

  suggestions.push({
    id: `context-generate-outreach-${context.accountId}`,
    title: `Generate outreach for ${accountName}`,
    description: 'Use current evidence and pattern state to produce a fresh action view for the selected account.',
    actionLabel: 'Generate action',
    actionCommand: 'generate sdr actions',
    priority: 88,
    category: 'research',
    riskLevel: 'low',
  });

  if ((account?.technologyStack?.cms || []).length === 0) {
    suggestions.push({
      id: `context-confirm-tech-${context.accountId}`,
      title: `Confirm CMS technology for ${accountName}`,
      description: 'Technology uncertainty is still limiting the quality of the recommended next action.',
      actionLabel: 'Queue research',
      actionCommand: `queue research ${account?.domain || accountName}`,
      priority: 84,
      category: 'research',
      riskLevel: 'low',
    });
  }

  if (accountSignals.some((signal) => /hiring|job_posting/i.test(String(signal.signalType || '')))) {
    suggestions.push({
      id: `context-analyze-hiring-${context.accountId}`,
      title: `Analyze hiring signals for ${accountName}`,
      description: 'Recent hiring activity may materially strengthen the expansion or displacement narrative.',
      actionLabel: 'Explain account',
      actionCommand: `explain action ${actions[0]?._id || ''}`.trim(),
      priority: 79,
      category: 'pattern',
      riskLevel: 'low',
    });
  }

  return suggestions;
}

export function buildSuggestionPreview(input: {
  accounts: any[];
  people: any[];
  signals: any[];
  actionCandidates: any[];
}) {
  const queue = generateTopActionQueue({
    accounts: input.accounts,
    people: input.people,
    signals: input.signals,
    candidates: input.actionCandidates,
    now: new Date().toISOString(),
    dailyLimit: 25,
    maxPerAccount: 2,
  });
  return {
    totalActions: queue.actions.length,
    topCandidateId: queue.actions[0]?.candidate?._id || null,
  };
}
