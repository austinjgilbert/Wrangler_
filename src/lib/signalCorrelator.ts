/**
 * Cross-Account Signal Correlator
 *
 * Runs on the 15-min cron. Groups recent signals by type/vertical,
 * detects clusters (e.g. "3 healthcare companies all posted CMS migration roles this week"),
 * and emits compound signals + auto-triggers research on high-scoring accounts.
 */

import { fetchAccounts, fetchSignals, fetchActionCandidates, createMoltNotification } from './sanity.ts';
import { callLlm } from './llm.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompoundSignal {
  clusterType: string;
  description: string;
  strength: number;
  accountIds: string[];
  accountNames: string[];
  signalCount: number;
  timeWindow: string;
  detectedAt: string;
}

export interface CorrelationResult {
  compoundSignals: CompoundSignal[];
  autoResearchCandidates: Array<{
    accountId: string;
    accountName: string;
    domain: string;
    reason: string;
    score: number;
  }>;
  summary: string;
  ranAt: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const SIGNAL_WINDOW_HOURS = 168; // 7 days
const MIN_CLUSTER_SIZE = 2;      // minimum accounts to form a cluster
const AUTO_RESEARCH_SCORE_THRESHOLD = 90;
const MAX_AUTO_RESEARCH_PER_CYCLE = 5;

// ─── Cluster Detection ─────────────────────────────────────────────────────

interface SignalWithAccount {
  signalType: string;
  strength: number;
  timestamp: string;
  accountId: string;
  accountName: string;
  domain: string;
  industry: string;
}

function buildSignalIndex(signals: any[], accounts: any[]): SignalWithAccount[] {
  const accountMap = new Map<string, any>();
  for (const acct of accounts) {
    accountMap.set(acct._id, acct);
  }

  const cutoff = new Date(Date.now() - SIGNAL_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const recent: SignalWithAccount[] = [];

  for (const sig of signals) {
    if (!sig.timestamp || sig.timestamp < cutoff) continue;
    const acctRef = sig.account?._ref;
    if (!acctRef) continue;
    const acct = accountMap.get(acctRef);
    if (!acct) continue;

    recent.push({
      signalType: sig.signalType || 'unknown',
      strength: Number(sig.strength || 0),
      timestamp: sig.timestamp,
      accountId: acctRef,
      accountName: acct.companyName || acct.name || acct.domain || acctRef,
      domain: acct.domain || acct.rootDomain || '',
      industry: acct.industry || 'unknown',
    });
  }

  return recent;
}

function detectClusters(indexed: SignalWithAccount[]): CompoundSignal[] {
  const now = new Date().toISOString();
  const compounds: CompoundSignal[] = [];

  // ── Cluster by signal type ──────────────────────────────────────────────
  const byType = new Map<string, SignalWithAccount[]>();
  for (const sig of indexed) {
    const group = byType.get(sig.signalType) || [];
    group.push(sig);
    byType.set(sig.signalType, group);
  }

  for (const [signalType, sigs] of Array.from(byType)) {
    // Unique accounts for this signal type
    const accountSet = new Map<string, SignalWithAccount>();
    for (const sig of sigs) {
      if (!accountSet.has(sig.accountId) || sig.strength > (accountSet.get(sig.accountId)!.strength)) {
        accountSet.set(sig.accountId, sig);
      }
    }

    if (accountSet.size >= MIN_CLUSTER_SIZE) {
      const entries = Array.from(accountSet.values());
      const avgStrength = entries.reduce((sum, e) => sum + e.strength, 0) / entries.length;
      compounds.push({
        clusterType: `signal_type_cluster:${signalType}`,
        description: `${accountSet.size} accounts triggered "${signalType}" signals in the last 7 days: ${entries.map(e => e.accountName).join(', ')}`,
        strength: Math.min(1, avgStrength * (1 + Math.log2(accountSet.size))),
        accountIds: entries.map(e => e.accountId),
        accountNames: entries.map(e => e.accountName),
        signalCount: sigs.length,
        timeWindow: `${SIGNAL_WINDOW_HOURS}h`,
        detectedAt: now,
      });
    }
  }

  // ── Cluster by industry ─────────────────────────────────────────────────
  const byIndustry = new Map<string, SignalWithAccount[]>();
  for (const sig of indexed) {
    if (sig.industry === 'unknown') continue;
    const group = byIndustry.get(sig.industry) || [];
    group.push(sig);
    byIndustry.set(sig.industry, group);
  }

  for (const [industry, sigs] of Array.from(byIndustry)) {
    const accountSet = new Map<string, SignalWithAccount>();
    for (const sig of sigs) {
      if (!accountSet.has(sig.accountId)) accountSet.set(sig.accountId, sig);
    }
    if (accountSet.size >= MIN_CLUSTER_SIZE) {
      const entries = Array.from(accountSet.values());
      const totalSignals = sigs.length;
      // Industry clusters are interesting when there's high signal density
      if (totalSignals >= MIN_CLUSTER_SIZE * 2) {
        compounds.push({
          clusterType: `industry_wave:${industry}`,
          description: `${accountSet.size} ${industry} accounts are showing activity (${totalSignals} signals in 7d): ${entries.map(e => e.accountName).join(', ')}`,
          strength: Math.min(1, 0.4 + (totalSignals / (accountSet.size * 5))),
          accountIds: entries.map(e => e.accountId),
          accountNames: entries.map(e => e.accountName),
          signalCount: totalSignals,
          timeWindow: `${SIGNAL_WINDOW_HOURS}h`,
          detectedAt: now,
        });
      }
    }
  }

  // ── Cluster by multi-signal accounts (accounts with 3+ signal types) ───
  const accountSignalTypes = new Map<string, Set<string>>();
  const accountMeta = new Map<string, SignalWithAccount>();
  for (const sig of indexed) {
    if (!accountSignalTypes.has(sig.accountId)) {
      accountSignalTypes.set(sig.accountId, new Set());
    }
    accountSignalTypes.get(sig.accountId)!.add(sig.signalType);
    accountMeta.set(sig.accountId, sig);
  }

  const multiSignalAccounts: SignalWithAccount[] = [];
  for (const [accountId, types] of Array.from(accountSignalTypes)) {
    if (types.size >= 3) {
      multiSignalAccounts.push(accountMeta.get(accountId)!);
    }
  }

  if (multiSignalAccounts.length > 0) {
    compounds.push({
      clusterType: 'multi_signal_convergence',
      description: `${multiSignalAccounts.length} account(s) have 3+ distinct signal types firing this week: ${multiSignalAccounts.map(a => a.accountName).join(', ')}. These accounts show converging buy signals.`,
      strength: 0.9,
      accountIds: multiSignalAccounts.map(a => a.accountId),
      accountNames: multiSignalAccounts.map(a => a.accountName),
      signalCount: multiSignalAccounts.length,
      timeWindow: `${SIGNAL_WINDOW_HOURS}h`,
      detectedAt: now,
    });
  }

  // Sort by strength descending
  compounds.sort((a, b) => b.strength - a.strength);
  return compounds;
}

// ─── Auto-Research Identification ───────────────────────────────────────────

function identifyAutoResearchCandidates(
  accounts: any[],
  actionCandidates: any[],
  compoundSignals: CompoundSignal[],
): CorrelationResult['autoResearchCandidates'] {
  const candidates: CorrelationResult['autoResearchCandidates'] = [];
  const seen = new Set<string>();

  // Accounts that appear in compound signals AND have high scores
  const compoundAccountIds = new Set<string>();
  for (const cs of compoundSignals) {
    for (const id of cs.accountIds) compoundAccountIds.add(id);
  }

  // High-scoring accounts
  const sorted = accounts
    .slice()
    .sort((a: any, b: any) => Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0));

  for (const acct of sorted) {
    if (candidates.length >= MAX_AUTO_RESEARCH_PER_CYCLE) break;
    const score = Number(acct.opportunityScore || 0);
    if (score < AUTO_RESEARCH_SCORE_THRESHOLD) continue;

    const id = acct._id;
    if (seen.has(id)) continue;
    seen.add(id);

    const inCompound = compoundAccountIds.has(id);
    const completeness = Number(acct.profileCompleteness?.score || 0);
    const needsResearch = completeness < 60;

    if (inCompound || needsResearch) {
      candidates.push({
        accountId: id,
        accountName: acct.companyName || acct.name || acct.domain || id,
        domain: acct.domain || acct.rootDomain || '',
        reason: inCompound
          ? `Appears in compound signal cluster with score ${score}, profile completeness ${completeness}%`
          : `High opportunity score (${score}) but low profile completeness (${completeness}%)`,
        score,
      });
    }
  }

  return candidates;
}

// ─── LLM Synthesis (optional — enriches compound signals with narrative) ──

async function synthesizeWithLLM(
  env: any,
  compoundSignals: CompoundSignal[],
  autoResearchCandidates: CorrelationResult['autoResearchCandidates'],
): Promise<string> {
  const hasLlm = !!(env.LLM_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
  if (!hasLlm || compoundSignals.length === 0) {
    return `Detected ${compoundSignals.length} signal cluster(s) across the account universe. ${autoResearchCandidates.length} account(s) flagged for auto-research.`;
  }

  try {
    const result = await callLlm(env, [
      {
        role: 'system',
        content: `You are a competitive intelligence analyst. Summarize signal clusters into a 2-3 sentence executive brief. Be specific about what's happening and why it matters for sales. No fluff.`,
      },
      {
        role: 'user',
        content: `Signal clusters detected:\n${JSON.stringify(compoundSignals.slice(0, 8), null, 2)}\n\nAuto-research candidates:\n${JSON.stringify(autoResearchCandidates, null, 2)}`,
      },
    ], { maxTokens: 300, temperature: 0.2 });
    return result.content;
  } catch (err: any) {
    console.warn('[signalCorrelator] LLM synthesis failed, using fallback:', err?.message);
    return `Detected ${compoundSignals.length} signal cluster(s). ${autoResearchCandidates.length} account(s) flagged for auto-research. (LLM summary unavailable)`;
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function runSignalCorrelation(env: any): Promise<CorrelationResult> {
  const ranAt = new Date().toISOString();

  const [accounts, signals, actionCandidates] = await Promise.all([
    fetchAccounts(env),
    fetchSignals(env),
    fetchActionCandidates(env),
  ]);

  // Build index of recent signals with account context
  const indexed = buildSignalIndex(signals, accounts);

  // Detect clusters
  const compoundSignals = detectClusters(indexed);

  // Identify accounts that should be auto-researched
  const autoResearchCandidates = identifyAutoResearchCandidates(accounts, actionCandidates, compoundSignals);

  // Synthesize a brief
  const summary = await synthesizeWithLLM(env, compoundSignals, autoResearchCandidates);

  // Persist a notification for each high-strength compound signal (deduplicated per day)
  const today = ranAt.slice(0, 10); // YYYY-MM-DD
  for (const cs of compoundSignals.filter(c => c.strength >= 0.6)) {
    // Deterministic ID: same cluster type + same set of accounts + same day = same notification (upsert, no duplicates)
    const accountHash = cs.accountIds.slice().sort().join(',').slice(0, 80).replace(/[^a-zA-Z0-9._-]/g, '-');
    const notifId = `molt.notification.compound.${cs.clusterType.replace(/[^a-zA-Z0-9._-]/g, '-')}.${accountHash}.${today}`;
    await createMoltNotification(env, {
      _type: 'molt.notification',
      _id: notifId,
      type: 'compound_signal',
      message: cs.description,
      payload: cs,
      channel: 'internal',
      createdAt: ranAt,
    }).catch(() => null);
  }

  return {
    compoundSignals,
    autoResearchCandidates,
    summary,
    ranAt,
  };
}
