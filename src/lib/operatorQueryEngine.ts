import {
  fetchActionCandidateById,
  fetchActionCandidates,
  fetchAccounts,
  fetchDocumentsByType,
  fetchPatternByType,
  fetchPeople,
  fetchSignals,
  fetchSignalsForActionCandidate,
} from './sanity.ts';
import { explainOpportunityScore, explainPatternMatch } from './scoreExplanationService.ts';
import { rerankActions, queueAntiDriftMaintenance } from './superuserInterface.ts';
import { runScenarioFixture } from './scenarioRegressionService.ts';
import { scenarioFixtures } from './scenarioFixtures.ts';

export async function executeOperatorQuery(env: any, input: {
  prompt: string;
  context?: {
    section?: string;
    accountId?: string | null;
    accountName?: string | null;
  };
}) {
  const prompt = String(input.prompt || '').trim();
  const lower = prompt.toLowerCase();
  const intent = classifyIntent(lower);

  const [accounts, people, signals, actionCandidates, patterns] = await Promise.all([
    fetchAccounts(env),
    fetchPeople(env),
    fetchSignals(env),
    fetchActionCandidates(env),
    fetchDocumentsByType(env, 'molt.pattern', 80).catch(() => []),
  ]);

  if (intent === 'search') {
    const matchingAccounts = accounts.filter((account: any) => matchesPrompt(prompt, [
      account.companyName,
      account.name,
      account.domain,
      ...(account.technologyStack?.cms || []),
      ...(account.technologyStack?.frameworks || []),
      ...(account.technologyStack?.legacySystems || []),
      account.industry,
    ]));
    const matchingActions = actionCandidates.filter((candidate: any) => matchesPrompt(prompt, [
      candidate.patternMatch,
      candidate.actionType,
      candidate.whyNow,
      ...(candidate.signals || []),
      ...(candidate.evidence || []),
    ]));
    return {
      intent,
      response: `Found ${matchingAccounts.length} matching accounts and ${matchingActions.length} matching action candidates.`,
      results: {
        accounts: matchingAccounts.slice(0, 12).map((account: any) => ({
          id: account._id,
          name: account.companyName || account.name || account.domain || account._id,
          domain: account.domain || account.rootDomain || null,
          opportunityScore: account.opportunityScore || 0,
        })),
        actions: matchingActions.slice(0, 12).map((candidate: any) => ({
          id: candidate._id,
          actionType: candidate.actionType,
          patternMatch: candidate.patternMatch,
          opportunityScore: candidate.opportunityScore,
          confidence: candidate.confidence,
        })),
      },
    };
  }

  if (intent === 'explain') {
    const accountExplanation = buildAccountAwareExplanation({
      prompt,
      accounts,
      people,
      signals,
      actionCandidates,
      context: input.context,
    });
    if (accountExplanation) {
      return {
        intent,
        response: accountExplanation.summary,
        explanation: accountExplanation,
      };
    }

    const candidate = resolveCandidate(prompt, actionCandidates, input.context);
    if (candidate) {
      const relatedSignals = await fetchSignalsForActionCandidate(env, {
        accountRef: candidate.account?._ref || null,
        personRef: candidate.person?._ref || null,
      });
      return {
        intent,
        response: `This action is high priority because its score is driven by explainable components and current evidence.`,
        explanation: explainOpportunityScore({
          actionCandidate: candidate,
          signals: relatedSignals,
        }),
      };
    }

    const pattern = patterns.find((item: any) => matchesPrompt(prompt, [item.patternType, item.summary]));
    if (pattern) {
      return {
        intent,
        response: `Pattern ${pattern.patternType || pattern._id} is currently ${pattern.lifecycleState || 'active'}.`,
        explanation: {
          patternId: pattern._id,
          summary: pattern.summary,
          matchFrequency: pattern.matchFrequency || 0,
          conversionAssociation: pattern.conversionAssociation || 0,
          recommendedMoves: pattern.recommendedMoves || [],
        },
      };
    }
  }

  if (intent === 'run_job') {
    if (lower.includes('research') || lower.includes('enrich')) {
      const domain = resolveDomain(prompt, input.context, accounts);
      return {
        intent,
        response: `Queued research flow for ${domain || 'the selected context'}.`,
        action: {
          type: 'command',
          command: domain ? `queue research ${domain}` : 'refresh stale entities',
          requiresConfirmation: !!domain && domain.split(',').length > 20,
        },
      };
    }
    if (lower.includes('scores') || lower.includes('opportunit')) {
      return {
        intent,
        response: 'Recalculation should refresh score freshness and queue ordering.',
        action: {
          type: 'command',
          command: 'recalculate scores',
        },
      };
    }
    if (lower.includes('maintenance') || lower.includes('diagnostic')) {
      return {
        intent,
        response: 'This will queue the anti-drift maintenance suite.',
        action: {
          type: 'command',
          command: 'queue anti drift maintenance',
          requiresConfirmation: true,
        },
      };
    }
  }

  if (intent === 'generate_actions') {
    const account = resolveAccount(prompt, accounts, input.context);
    return {
      intent,
      response: account
        ? `I can help generate outreach context for ${account.companyName || account.name || account.domain}.`
        : 'I can refresh the execution queue and highlight the best actions this week.',
      action: {
        type: 'command',
        command: 'generate sdr actions',
      },
    };
  }

  if (intent === 'analyze_patterns') {
    const topPatterns = patterns
      .slice()
      .sort((left: any, right: any) => Number(right.conversionAssociation || 0) - Number(left.conversionAssociation || 0))
      .slice(0, 6)
      .map((pattern: any) => ({
        id: pattern._id,
        patternType: pattern.patternType,
        conversionAssociation: pattern.conversionAssociation || 0,
        matchFrequency: pattern.matchFrequency || 0,
      }));
    return {
      intent,
      response: `Here are the strongest active patterns by conversion association.`,
      results: {
        patterns: topPatterns,
      },
    };
  }

  if (intent === 'system_diagnostics') {
    const rerankPreview = await rerankActions(env, { dailyLimit: 25, pageSize: 25 });
    return {
      intent,
      response: 'The opportunity engine and queue generation paths are responding normally.',
      results: {
        queueGeneratedAt: rerankPreview.queue.generatedAt,
        queueSize: rerankPreview.queue.actions.length,
        topActions: rerankPreview.topActionsToday.actions.slice(0, 5),
      },
    };
  }

  if (intent === 'scenario_simulation') {
    const fixture = scenarioFixtures.find((item) => matchesPrompt(prompt, [item.id, item.name]));
    if (fixture) {
      return {
        intent,
        response: `Ran simulation for ${fixture.name}.`,
        results: runScenarioFixture(fixture),
      };
    }
  }

  return {
    intent: 'search',
    response: 'I can explain outputs, suggest actions, search accounts, run jobs, analyze patterns, or run diagnostics.',
    results: {
      hints: [
        'Why is this account high priority?',
        'Find ecommerce companies evaluating CMS',
        'Run research on fleetfeet.com',
        'Show top opportunities this week',
        'Explain pattern success rate',
      ],
    },
  };
}

export async function explainActionCandidate(env: any, actionId: string) {
  const actionCandidate = await fetchActionCandidateById(env, actionId);
  if (!actionCandidate) return null;
  const signals = await fetchSignalsForActionCandidate(env, {
    accountRef: actionCandidate.account?._ref || null,
    personRef: actionCandidate.person?._ref || null,
  });
  return explainOpportunityScore({
    actionCandidate,
    signals,
  });
}

export async function explainPatternById(env: any, patternId: string) {
  const pattern = await fetchPatternByType(env, patternId).catch(() => null);
  if (pattern) return pattern;
  const patterns = await fetchDocumentsByType(env, 'molt.pattern', 80).catch(() => []);
  return patterns.find((item: any) => item._id === patternId || item.patternType === patternId) || null;
}

export async function safeAssistAction(env: any, command: string, confirmed: boolean) {
  const lower = String(command || '').toLowerCase();
  const sensitive = lower.includes('refresh stale entities')
    || lower.includes('queue anti drift maintenance')
    || lower.includes('run nightly jobs');

  if (sensitive && !confirmed) {
    return {
      requiresConfirmation: true,
      command,
      confirmationMessage: `Are you sure you want to run "${command}"?`,
    };
  }

  if (lower.includes('recalculate') || lower.includes('generate sdr actions')) {
    return rerankActions(env, { dailyLimit: 50, pageSize: 50 });
  }
  if (lower.includes('maintenance') || lower.includes('refresh stale entities')) {
    return queueAntiDriftMaintenance(env, { includeHeavyJobs: true });
  }
  return { ok: true, command };
}

function classifyIntent(lower: string) {
  if (/\bwhy\b|\bexplain\b/.test(lower)) return 'explain';
  if (/\bfind\b|\bshow\b|\blist\b/.test(lower)) return 'search';
  if (/\brun\b|\bqueue\b|\brefresh\b/.test(lower)) return 'run_job';
  if (/\bgenerate\b|\boutreach\b|\bactions?\b/.test(lower)) return 'generate_actions';
  if (/\bpattern\b/.test(lower)) return 'analyze_patterns';
  if (/\bdiagnostic\b|\bhealth\b|\bstatus\b/.test(lower)) return 'system_diagnostics';
  if (/\bsimulate\b|\bscenario\b/.test(lower)) return 'scenario_simulation';
  return 'search';
}

function matchesPrompt(prompt: string, values: Array<string | undefined | null>) {
  const lower = prompt.toLowerCase();
  return values.some((value) => String(value || '').toLowerCase().includes(lower));
}

function resolveCandidate(prompt: string, candidates: any[], context?: { accountId?: string | null }) {
  if (context?.accountId) {
    const contextual = candidates.find((candidate) => candidate.account?._ref === context.accountId);
    if (contextual) return contextual;
  }
  return candidates.find((candidate) => matchesPrompt(prompt, [
    candidate._id,
    candidate.patternMatch,
    candidate.whyNow,
    candidate.actionType,
  ]));
}

function resolveAccount(prompt: string, accounts: any[], context?: { accountId?: string | null; accountName?: string | null }) {
  if (context?.accountId) {
    return accounts.find((account) => account._id === context.accountId);
  }
  return accounts.find((account) => matchesPrompt(prompt, [
    account._id,
    account.companyName,
    account.name,
    account.domain,
  ]));
}

function resolveDomain(prompt: string, context: any, accounts: any[]) {
  const domainMatch = prompt.match(/([a-z0-9-]+\.[a-z]{2,})/i);
  if (domainMatch?.[1]) return domainMatch[1].toLowerCase();
  const account = resolveAccount(prompt, accounts, context);
  return account?.domain || account?.rootDomain || context?.accountName || null;
}

function buildAccountAwareExplanation(input: {
  prompt: string;
  accounts: any[];
  people: any[];
  signals: any[];
  actionCandidates: any[];
  context?: {
    accountId?: string | null;
    accountName?: string | null;
  };
}) {
  const lower = input.prompt.toLowerCase();
  const account = resolveAccount(input.prompt, input.accounts, input.context);
  if (!account) return null;
  if (!/\baccount\b|\bscore\b|\bpriority\b|\bhigh\b|\bwhy\b|\bthis\b/.test(lower) && !input.context?.accountId) {
    return null;
  }

  const accountSignals = input.signals
    .filter((signal) => signal.account?._ref === account._id)
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime());
  const accountActions = input.actionCandidates
    .filter((candidate) => candidate.account?._ref === account._id)
    .sort((left, right) => Number(right.opportunityScore || 0) - Number(left.opportunityScore || 0));
  const relevantPeople = input.people.filter((person) => person.companyRef?._ref === account._id || person.currentCompany === account._id);
  const topAction = accountActions[0];
  const topSignals = accountSignals.slice(0, 3).map((signal) => ({
    signalType: signal.signalType,
    strength: signal.strength || 0,
    timestamp: signal.timestamp,
    summary: signal.metadata?.summary || `${signal.signalType} from ${signal.source}`,
  }));

  const summaryParts = [
    `${account.companyName || account.name || account.domain} is currently ${Number(account.opportunityScore || 0) >= 70 ? 'elevated' : 'not yet strongly elevated'} because the system sees ${topSignals.length} relevant signals`,
  ];
  if (topAction) {
    summaryParts.push(`and the strongest current action is ${topAction.actionType} at score ${Math.round(Number(topAction.opportunityScore || 0))}.`);
  } else {
    summaryParts.push('but it does not yet have an execution-ready action candidate.');
  }

  return {
    accountId: account._id,
    accountName: account.companyName || account.name || account.domain || account._id,
    summary: summaryParts.join(' '),
    opportunityScore: Number(account.opportunityScore || 0),
    completionScore: Number(account.profileCompleteness?.score || 0),
    topAction: topAction ? {
      id: topAction._id,
      actionType: topAction.actionType,
      opportunityScore: topAction.opportunityScore,
      confidence: topAction.confidence,
      whyNow: topAction.whyNow,
      uncertaintyState: topAction.uncertaintyState,
    } : null,
    topSignals,
    missingData: topAction?.missingData || account.profileCompleteness?.gaps || [],
    recommendedValidations: [
      ...(topAction?.missingData || []),
      ...(Number(account.profileCompleteness?.score || 0) < 50 ? ['entity_enrichment'] : []),
      ...((account.technologyStack?.cms || []).length === 0 ? ['cms_validation'] : []),
    ].filter(Boolean).slice(0, 5),
    people: relevantPeople.slice(0, 4).map((person) => ({
      id: person._id,
      name: person.name,
      title: person.currentTitle || person.title || null,
      seniority: person.seniorityLevel || null,
    })),
  };
}
