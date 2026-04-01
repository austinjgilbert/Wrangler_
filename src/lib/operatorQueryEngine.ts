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
import { callLlm } from './llm.ts';

// ─── Data loading helper ───────────────────────────────────────────────────

async function loadWorkspaceData(env: any) {
  const [accounts, people, signals, actionCandidates, patterns] = await Promise.all([
    fetchAccounts(env),
    fetchPeople(env),
    fetchSignals(env),
    fetchActionCandidates(env),
    fetchDocumentsByType(env, 'molt.pattern', 80).catch(() => []),
  ]);
  return { accounts, people, signals, actionCandidates, patterns };
}

// ─── LLM-powered query engine ──────────────────────────────────────────────

function buildDataSummaryForLLM(data: {
  accounts: any[];
  people: any[];
  signals: any[];
  actionCandidates: any[];
  patterns: any[];
}, context?: { section?: string; accountId?: string | null; accountName?: string | null }) {
  // Build a compact data summary the LLM can reason over
  const topAccounts = data.accounts
    .slice()
    .sort((a: any, b: any) => Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0))
    .slice(0, 20);

  const topActions = data.actionCandidates
    .slice()
    .sort((a: any, b: any) => Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0))
    .slice(0, 15);

  const recentSignals = data.signals
    .slice()
    .sort((a: any, b: any) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, 20);

  const topPatterns = data.patterns
    .slice()
    .sort((a: any, b: any) => Number(b.conversionAssociation || 0) - Number(a.conversionAssociation || 0))
    .slice(0, 10);

  // Focused account context if viewing a specific account
  let focusedAccount = null;
  if (context?.accountId) {
    const acct = data.accounts.find((a: any) => a._id === context.accountId);
    if (acct) {
      const acctSignals = data.signals.filter((s: any) => s.account?._ref === acct._id).slice(0, 10);
      const acctActions = data.actionCandidates.filter((c: any) => c.account?._ref === acct._id);
      const acctPeople = data.people.filter((p: any) => p.companyRef?._ref === acct._id || p.currentCompany === acct._id);
      focusedAccount = {
        id: acct._id,
        name: acct.companyName || acct.name || acct.domain,
        domain: acct.domain || acct.rootDomain,
        opportunityScore: acct.opportunityScore || 0,
        completeness: acct.profileCompleteness?.score || 0,
        industry: acct.industry || null,
        cms: acct.technologyStack?.cms || [],
        signals: acctSignals.map((s: any) => ({ type: s.signalType, strength: s.strength, ts: s.timestamp })),
        actions: acctActions.map((c: any) => ({ id: c._id, action: c.actionType, score: c.opportunityScore, pattern: c.patternMatch, whyNow: c.whyNow })),
        people: acctPeople.slice(0, 5).map((p: any) => ({ name: p.name, title: p.currentTitle || p.title })),
      };
    }
  }

  return JSON.stringify({
    overview: {
      totalAccounts: data.accounts.length,
      totalPeople: data.people.length,
      totalSignals: data.signals.length,
      activeOpportunities: data.actionCandidates.length,
      activePatterns: data.patterns.length,
    },
    topAccounts: topAccounts.map((a: any) => ({
      id: a._id,
      name: a.companyName || a.name || a.domain,
      domain: a.domain || a.rootDomain,
      score: a.opportunityScore || 0,
      industry: a.industry || null,
      cms: (a.technologyStack?.cms || []).slice(0, 3),
    })),
    topActions: topActions.map((c: any) => ({
      id: c._id,
      account: c.accountName || c.account?._ref,
      action: c.actionType,
      score: c.opportunityScore || 0,
      confidence: c.confidence || 0,
      pattern: c.patternMatch,
      whyNow: c.whyNow,
    })),
    recentSignals: recentSignals.map((s: any) => ({
      type: s.signalType,
      account: s.accountName || s.account?._ref,
      strength: s.strength || 0,
      ts: s.timestamp,
    })),
    topPatterns: topPatterns.map((p: any) => ({
      id: p._id,
      type: p.patternType,
      frequency: p.matchFrequency || 0,
      conversion: p.conversionAssociation || 0,
      state: p.lifecycleState || 'active',
    })),
    focusedAccount,
    currentSection: context?.section || null,
  });
}

async function llmQuery(env: any, prompt: string, dataSummary: string): Promise<{ response: string; intent: string; action?: any; results?: any }> {
  const systemPrompt = `You are the intelligence co-pilot for Wrangler, an operator console that tracks accounts, signals, patterns, and opportunities for sales intelligence.

You have access to a JSON summary of the current workspace data. Use it to answer the operator's question accurately and concisely.

Rules:
- Answer in 2-4 sentences. Be direct and specific.
- Reference actual account names, scores, and signal types from the data.
- If the user asks about "top opportunities" or "best accounts", sort by opportunityScore and list the top ones.
- If the user asks to run a command, include an "action" object: {"type":"command","command":"<command string>","requiresConfirmation":false}
- Available commands: "generate sdr actions", "recalculate scores", "run nightly jobs", "refresh stale entities", "queue anti drift maintenance", "queue research <domain>", "queue osint <domain>", "run autopilot"
- If the user asks about a specific account, use the focusedAccount data if available.
- Do NOT invent data. Only reference what's in the summary.

Respond with valid JSON only:
{
  "response": "Your natural language answer",
  "intent": "search|explain|run_job|generate_actions|analyze_patterns|system_diagnostics",
  "results": { ... optional structured data ... },
  "action": { ... optional command to execute ... }
}`;

  const result = await callLlm(env, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Workspace data:\n${dataSummary}\n\nOperator question: ${prompt}` },
  ], { json: true, maxTokens: 1024, temperature: 0.1 });

  try {
    const parsed = JSON.parse(result.content);
    return {
      response: parsed.response || 'I processed your request.',
      intent: parsed.intent || 'search',
      results: parsed.results || undefined,
      action: parsed.action || undefined,
    };
  } catch {
    // If JSON parsing fails, return the raw text
    return { response: result.content, intent: 'search' };
  }
}

// ─── Main entry point ──────────────────────────────────────────────────────

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

  const data = await loadWorkspaceData(env);

  // Try LLM-powered query first (if API key is configured)
  const hasLlm = !!(env.LLM_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
  if (hasLlm) {
    try {
      const dataSummary = buildDataSummaryForLLM(data, input.context);
      const llmResult = await llmQuery(env, prompt, dataSummary);
      return llmResult;
    } catch (llmError: any) {
      console.warn('LLM query failed, falling back to rule-based:', llmError.message);
      // Fall through to rule-based logic
    }
  }

  // ─── Rule-based fallback ─────────────────────────────────────────────────
  const { accounts, people, signals, actionCandidates, patterns } = data;
  const intent = classifyIntent(lower);

  if (intent === 'search') {
    // Improved search: tokenize prompt and match individual words
    const tokens = lower.split(/\s+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t));

    // If no meaningful search tokens, return top opportunities
    if (tokens.length === 0 || /\btop\b|\bbest\b|\bhighest\b|\bopportunit/.test(lower)) {
      const topActions = actionCandidates
        .slice()
        .sort((a: any, b: any) => Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0))
        .slice(0, 10);
      const topAccountsByScore = accounts
        .slice()
        .sort((a: any, b: any) => Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0))
        .slice(0, 10);
      return {
        intent: 'search',
        response: `Here are the top ${topActions.length} opportunities by score, across ${accounts.length} tracked accounts.`,
        results: {
          accounts: topAccountsByScore.map((account: any) => ({
            id: account._id,
            name: account.companyName || account.name || account.domain || account._id,
            domain: account.domain || account.rootDomain || null,
            opportunityScore: account.opportunityScore || 0,
          })),
          actions: topActions.map((candidate: any) => ({
            id: candidate._id,
            account: candidate.accountName || candidate.account?._ref,
            actionType: candidate.actionType,
            patternMatch: candidate.patternMatch,
            opportunityScore: candidate.opportunityScore,
            confidence: candidate.confidence,
            whyNow: candidate.whyNow,
          })),
        },
      };
    }

    const matchingAccounts = accounts.filter((account: any) => tokenMatch(tokens, [
      account.companyName,
      account.name,
      account.domain,
      ...(account.technologyStack?.cms || []),
      ...(account.technologyStack?.frameworks || []),
      ...(account.technologyStack?.legacySystems || []),
      account.industry,
    ]));
    const matchingActions = actionCandidates.filter((candidate: any) => tokenMatch(tokens, [
      candidate.patternMatch,
      candidate.actionType,
      candidate.whyNow,
      candidate.accountName,
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

    const pattern = patterns.find((item: any) => tokenMatch(lower.split(/\s+/).filter((t) => t.length > 2), [item.patternType, item.summary]));
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
    if (lower.includes('osint')) {
      const domain = resolveDomain(prompt, input.context, accounts);
      return {
        intent,
        response: `Queued OSINT intelligence pipeline for ${domain || 'the selected context'}.`,
        action: {
          type: 'command',
          command: domain ? `queue osint ${domain}` : 'queue osint',
          requiresConfirmation: true,
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
    const fixture = scenarioFixtures.find((item) => tokenMatch(lower.split(/\s+/), [item.id, item.name]));
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

// ─── Stop words for tokenized search ───────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'this', 'that', 'show', 'find', 'list', 'get', 'what', 'which',
  'are', 'for', 'and', 'with', 'from', 'all', 'can', 'how', 'our', 'their',
  'week', 'today', 'now', 'please', 'help', 'about', 'some', 'any',
]);

/**
 * Tokenized search: returns true if ANY of the search tokens appear in ANY of the values.
 * More forgiving than matchesPrompt (which requires the entire prompt to appear).
 */
function tokenMatch(tokens: string[], values: Array<string | undefined | null>): boolean {
  if (tokens.length === 0) return false;
  const haystack = values
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
    .join(' ');
  return tokens.some((token) => haystack.includes(token));
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
