/**
 * Bridge — Clean interface to existing Wrangler_ services.
 *
 * The chat module imports ONLY from this bridge (never directly from src/lib/
 * or src/services/). Exceptions: llm.ts and sanity-client.js are stable
 * utilities imported directly where needed.
 *
 * Every wrapper:
 *  - Uses dynamic imports for cold-start optimization
 *  - Returns null/empty on error (never throws)
 *  - Includes timing metadata
 *
 * @module chat/bridge
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BridgeResult<T> {
  data: T | null;
  timeMs: number;
  error?: string;
}

// ─── Timing helper ──────────────────────────────────────────────────────────

async function timed<T>(fn: () => Promise<T>): Promise<BridgeResult<T>> {
  const start = Date.now();
  try {
    const data = await fn();
    return { data, timeMs: Date.now() - start };
  } catch (err: any) {
    console.error('[chat/bridge] Error:', err?.message || err);
    return { data: null, timeMs: Date.now() - start, error: err?.message || String(err) };
  }
}

// ─── Opportunity Engine ─────────────────────────────────────────────────────

/**
 * Get the top-ranked action queue from the opportunity engine.
 * Wraps `generateTopActionQueue` from src/lib/opportunityEngine.ts.
 */
export async function getTopActions(
  env: any,
  limit: number = 10,
): Promise<BridgeResult<any>> {
  return timed(async () => {
    const { generateTopActionQueue } = await import('../lib/opportunityEngine.ts');
    const { fetchAccounts, fetchPeople, fetchSignals, fetchActionCandidates } =
      await import('../lib/sanity.ts');

    const [accounts, people, signals, candidates] = await Promise.all([
      fetchAccounts(env),
      fetchPeople(env),
      fetchSignals(env),
      fetchActionCandidates(env),
    ]);

    const result = generateTopActionQueue({
      candidates,
      accounts,
      people,
      signals,
      dailyLimit: limit,
    });

    return result;
  });
}

// ─── Morning Briefing ───────────────────────────────────────────────────────

/**
 * Generate the SDR morning briefing / routing plan.
 * Wraps `generateGoodMorningRouting` from src/services/sdr-good-morning-service.js.
 */
export async function getMorningBriefing(env: any): Promise<BridgeResult<any>> {
  return timed(async () => {
    const { generateGoodMorningRouting } = await import(
      '../services/sdr-good-morning-service.js'
    );
    const { groqQuery, initSanityClient } = await import('../sanity-client.js');

    const client = initSanityClient(env);
    const boundGroqQuery = (query: string, params?: Record<string, any>) =>
      groqQuery(client, query, params);

    const result = await generateGoodMorningRouting(
      { groqQuery: boundGroqQuery, client, requestId: crypto.randomUUID() },
      { maxCalls: 25, maxLinkedIn: 15, maxEmails: 10 },
    );

    return result;
  });
}

// ─── Signal Correlator ──────────────────────────────────────────────────────

/**
 * Run cross-account signal correlation analysis.
 * Wraps `runSignalCorrelation` from src/lib/signalCorrelator.ts.
 *
 * @param accountId - Optional: filter results to a specific account
 */
export async function getSignalCorrelations(
  env: any,
  accountId?: string,
): Promise<BridgeResult<any>> {
  return timed(async () => {
    const { runSignalCorrelation } = await import('../lib/signalCorrelator.ts');
    const result = await runSignalCorrelation(env);

    // If accountId provided, filter compound signals to those involving this account
    if (accountId && result?.compoundSignals) {
      return {
        ...result,
        compoundSignals: result.compoundSignals.filter(
          (s: any) => s.accountIds?.includes(accountId),
        ),
      };
    }

    return result;
  });
}

// ─── Insight Engine ─────────────────────────────────────────────────────────

/**
 * Generate copilot insights from workspace data.
 * Wraps `generateInsights` from src/lib/insightEngine.ts.
 */
export async function getInsights(
  env: any,
  data: {
    accounts: any[];
    signals: any[];
    patterns: any[];
    actionCandidates: any[];
    operatorFeedback?: any[];
  },
): Promise<BridgeResult<any>> {
  return timed(async () => {
    const { generateInsights } = await import('../lib/insightEngine.ts');
    return generateInsights({
      ...data,
      operatorFeedback: data.operatorFeedback || [],
    });
  });
}

// ─── Operator Suggestions ───────────────────────────────────────────────────

/**
 * Generate operator suggestions for the current workspace state.
 * Wraps `generateOperatorSuggestions` from src/lib/operatorSuggestionService.ts.
 */
export async function getSuggestions(
  env: any,
  data: {
    accounts: any[];
    people: any[];
    signals: any[];
    actionCandidates: any[];
    patterns: any[];
    jobs?: any[];
  },
  context?: { section?: string; accountId?: string | null; accountName?: string | null },
): Promise<BridgeResult<any>> {
  return timed(async () => {
    const { generateOperatorSuggestions } = await import(
      '../lib/operatorSuggestionService.ts'
    );
    return generateOperatorSuggestions({
      ...data,
      jobs: data.jobs || [],
      context,
    });
  });
}

// ─── Score Explanation ──────────────────────────────────────────────────────

/**
 * Explain the opportunity score for a specific action candidate.
 * Wraps `explainActionCandidate` from src/lib/operatorQueryEngine.ts.
 */
export async function explainScore(
  env: any,
  actionId: string,
): Promise<BridgeResult<any>> {
  return timed(async () => {
    const { explainActionCandidate } = await import('../lib/operatorQueryEngine.ts');
    return explainActionCandidate(env, actionId);
  });
}

// ─── Command Execution ──────────────────────────────────────────────────────

/**
 * Execute an operator command via the safe-assist action system.
 * Wraps `safeAssistAction` from src/lib/operatorQueryEngine.ts.
 *
 * @param command   - Natural-language or structured command
 * @param confirmed - Whether the user has confirmed a destructive action
 */
export async function executeCommand(
  env: any,
  command: string,
  confirmed: boolean = false,
): Promise<BridgeResult<any>> {
  return timed(async () => {
    const { safeAssistAction } = await import('../lib/operatorQueryEngine.ts');
    return safeAssistAction(env, command, confirmed);
  });
}
