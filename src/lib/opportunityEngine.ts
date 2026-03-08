import type {
  Account,
  ActionCandidate,
  ConfidenceBreakdown,
  OpportunityScoreBreakdown,
  Person,
  RankedActionCandidate,
  SignalEvent,
  TopActionQueue,
} from '../../shared/types.ts';
import { calculateDecayedSignalStrength } from './signalIngestion.ts';

const OPPORTUNITY_WEIGHTS = {
  patternStrength: 0.16,
  signalUrgency: 0.18,
  personaInfluence: 0.12,
  techRelevance: 0.12,
  accountPriority: 0.12,
  evidenceConfidence: 0.12,
  recencyWeight: 0.10,
  actionabilityWeight: 0.08,
} as const;

type OpportunityInput = {
  candidate: ActionCandidate;
  account?: Account | null;
  person?: Person | null;
  signals?: SignalEvent[];
  now?: string;
  signalWeightOverrides?: Record<string, number>;
  patternStrengthOverrides?: Record<string, { score?: number } | number>;
};

type RankActionCandidateInput = {
  candidates: ActionCandidate[];
  accounts?: Account[];
  people?: Person[];
  signals?: SignalEvent[];
  now?: string;
  signalWeightOverrides?: Record<string, number>;
  patternStrengthOverrides?: Record<string, { score?: number } | number>;
};

type TopActionQueueInput = RankActionCandidateInput & {
  dailyLimit?: number;
  maxPerAccount?: number;
};

export function calculateOpportunityScore(input: OpportunityInput): OpportunityScoreBreakdown {
  const now = input.now || new Date().toISOString();
  const signals = relevantSignals(input.candidate, input.signals || []);
  const components = {
    patternStrength: scorePatternStrength(input.candidate, signals, input.patternStrengthOverrides),
    signalUrgency: scoreSignalUrgency(signals, now, input.signalWeightOverrides),
    personaInfluence: scorePersonaInfluence(input.person),
    techRelevance: scoreTechRelevance(input.account, input.candidate),
    accountPriority: scoreAccountPriority(input.account),
    evidenceConfidence: scoreEvidenceConfidence(input.candidate, signals),
    recencyWeight: scoreRecencyWeight(input.account, signals, now),
    actionabilityWeight: scoreActionabilityWeight(input.candidate, input.person),
  };

  const total = Math.round(100 * (
    components.patternStrength * OPPORTUNITY_WEIGHTS.patternStrength +
    components.signalUrgency * OPPORTUNITY_WEIGHTS.signalUrgency +
    components.personaInfluence * OPPORTUNITY_WEIGHTS.personaInfluence +
    components.techRelevance * OPPORTUNITY_WEIGHTS.techRelevance +
    components.accountPriority * OPPORTUNITY_WEIGHTS.accountPriority +
    components.evidenceConfidence * OPPORTUNITY_WEIGHTS.evidenceConfidence +
    components.recencyWeight * OPPORTUNITY_WEIGHTS.recencyWeight +
    components.actionabilityWeight * OPPORTUNITY_WEIGHTS.actionabilityWeight
  ));

  const strongestDrivers = Object.entries(components)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key);

  return {
    ...components,
    total: clamp(total / 100, 0, 1) * 100,
    strongestDrivers,
    updatedAt: now,
    scoringVersion: input.candidate.scoringVersion || 'scoring.default',
    rankingPolicyVersion: input.candidate.rankingPolicyVersion || 'ranking.default',
  };
}

export function rankActionCandidates(input: RankActionCandidateInput): RankedActionCandidate[] {
  const accountMap = new Map((input.accounts || []).map((account) => [account._id, account]));
  const personMap = new Map((input.people || []).map((person) => [person._id, person]));

  const ranked = input.candidates.map((candidate) => {
    const account = candidate.account?._ref ? accountMap.get(candidate.account._ref) || null : null;
    const person = candidate.person?._ref ? personMap.get(candidate.person._ref) || null : null;
    const signals = relevantSignals(candidate, input.signals || []);
    const score = calculateOpportunityScore({
      candidate,
      account,
      person,
      signals,
      now: input.now,
      signalWeightOverrides: input.signalWeightOverrides,
      patternStrengthOverrides: input.patternStrengthOverrides,
    });

    return {
      rank: 0,
      candidate: {
        ...candidate,
        opportunityScore: score.total,
        confidenceBreakdown: buildConfidenceBreakdownFromScore(candidate, score),
        updatedAt: input.now || new Date().toISOString(),
      },
      account,
      person,
      signals,
      score,
    };
  });

  ranked.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    if ((b.candidate.confidence || 0) !== (a.candidate.confidence || 0)) return (b.candidate.confidence || 0) - (a.candidate.confidence || 0);
    return new Date(b.candidate.updatedAt || 0).getTime() - new Date(a.candidate.updatedAt || 0).getTime();
  });

  return ranked.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

function buildConfidenceBreakdownFromScore(candidate: ActionCandidate, score: OpportunityScoreBreakdown): ConfidenceBreakdown {
  const base = clamp((score.total || 0) / 100, 0, 1);
  return {
    dataConfidence: clamp(score.evidenceConfidence, 0, 1),
    entityConfidence: clamp((score.personaInfluence + score.accountPriority) / 2, 0, 1),
    patternConfidence: clamp(score.patternStrength, 0, 1),
    actionConfidence: clamp((score.actionabilityWeight + base) / 2, 0, 1),
    draftConfidence: clamp(((candidate.draftStatus === 'ready' || candidate.draftStatus === 'drafted') ? base : base - 0.1), 0, 1),
    updatedAt: score.updatedAt,
    notes: score.strongestDrivers.map((driver) => `Top driver: ${driver}`),
  };
}

export function generateTopActionQueue(input: TopActionQueueInput): TopActionQueue {
  const generatedAt = input.now || new Date().toISOString();
  const limit = clampInt(input.dailyLimit ?? 100, 50, 200);
  const maxPerAccount = clampInt(input.maxPerAccount ?? 3, 1, 10);
  const ranked = rankActionCandidates(input);
  const active = ranked.filter((item) =>
    item.candidate.lifecycleStatus !== 'expired' &&
    new Date(item.candidate.expirationTime).getTime() > new Date(generatedAt).getTime(),
  );

  const actions: RankedActionCandidate[] = [];
  const accountCounts = new Map<string, number>();

  for (const item of active) {
    const accountRef = item.candidate.account?._ref || 'unknown';
    const count = accountCounts.get(accountRef) || 0;
    if (count >= maxPerAccount) continue;
    accountCounts.set(accountRef, count + 1);
    actions.push({
      ...item,
      rank: actions.length + 1,
    });
    if (actions.length >= limit) break;
  }

  return {
    date: generatedAt.split('T')[0],
    limit,
    generatedAt,
    actions,
  };
}

function scorePatternStrength(
  candidate: ActionCandidate,
  signals: SignalEvent[],
  overrides: Record<string, { score?: number } | number> = {},
): number {
  const pattern = String(candidate.patternMatch || '').toLowerCase();
  const overrideEntry = overrides[candidate.patternMatch || ''];
  if (typeof overrideEntry === 'number') return clamp(overrideEntry, 0, 1);
  if (typeof overrideEntry?.score === 'number') return clamp(overrideEntry.score, 0, 1);
  if (pattern.includes('execution_ready')) return 0.95;
  if (pattern.includes('migration_signal')) return 0.82;
  if (pattern.includes('follow_up_required')) return 0.62;
  const evidenceBoost = Math.min((candidate.evidence || []).length, 4) * 0.08;
  const signalBoost = Math.min(signals.length, 3) * 0.06;
  return clamp(0.45 + evidenceBoost + signalBoost, 0, 1);
}

function scoreSignalUrgency(signals: SignalEvent[], now: string, overrides: Record<string, number> = {}): number {
  if (signals.length === 0) return 0.2;
  const weighted = signals.map((signal) => {
    const decayed = calculateDecayedSignalStrength({
      baseStrength: signal.metadata?.baseStrength ?? signal.strength ?? 0.5,
      signalType: signal.signalType,
      timestamp: signal.timestamp,
      now,
    });
    const override = typeof overrides[signal.signalType] === 'number' ? overrides[signal.signalType] : 1;
    return decayed * signalUrgencyMultiplier(signal.signalType) * override;
  });
  return clamp(Math.max(...weighted), 0, 1);
}

function scorePersonaInfluence(person?: Person | null): number {
  if (!person) return 0.15;
  const title = `${person.currentTitle || ''} ${person.title || ''}`.toLowerCase();
  if (person.isDecisionMaker) return 0.95;
  if (person.seniorityLevel === 'c-suite' || person.seniorityLevel === 'vp') return 0.92;
  if (title.includes('chief') || title.includes('vp') || title.includes('head')) return 0.9;
  if (person.seniorityLevel === 'director' || title.includes('director')) return 0.78;
  if (person.seniorityLevel === 'manager' || title.includes('manager') || title.includes('architect')) return 0.62;
  return 0.38;
}

function scoreTechRelevance(account?: Account | null, candidate?: ActionCandidate): number {
  const signals = candidate?.signals || [];
  const evidence = candidate?.evidence || [];
  let score = 0.2;
  const tech = account?.technologyStack;
  if ((tech?.legacySystems || []).length > 0) score += 0.2;
  if ((tech?.migrationOpportunities || []).length > 0) score += 0.22;
  if ((tech?.painPoints || []).length > 0) score += 0.18;
  if (signals.some((item) => /migration|legacy|pain|pricing|intent/i.test(item))) score += 0.12;
  if (evidence.some((item) => /migration|legacy|pain|stack|technology/i.test(item))) score += 0.1;
  return clamp(score, 0, 1);
}

function scoreAccountPriority(account?: Account | null): number {
  if (!account) return 0.2;
  const opp = clamp((account.opportunityScore || 0) / 100, 0, 1);
  const completeness = clamp((account.profileCompleteness?.score || 0) / 100, 0, 1);
  const aiReadiness = clamp((account.aiReadiness?.score || 0) / 100, 0, 1);
  return clamp((opp * 0.55) + (completeness * 0.2) + (aiReadiness * 0.25), 0, 1);
}

function scoreEvidenceConfidence(candidate: ActionCandidate, signals: SignalEvent[]): number {
  let score = clamp(candidate.confidence || 0.35, 0, 1) * 0.6;
  score += Math.min((candidate.evidence || []).length, 5) * 0.06;
  const strongSignals = signals.filter((signal) => (signal.strength || 0) >= 0.6).length;
  score += Math.min(strongSignals, 3) * 0.05;
  return clamp(score, 0, 1);
}

function scoreRecencyWeight(account: Account | null | undefined, signals: SignalEvent[], now: string): number {
  const timestamps = [
    ...signals.map((signal) => signal.timestamp),
    account?.lastScannedAt,
    account?.updatedAt,
    account?.createdAt,
  ].filter(Boolean) as string[];
  if (timestamps.length === 0) return 0.2;
  const latestTs = timestamps
    .map((value) => new Date(value).getTime())
    .sort((a, b) => b - a)[0];
  const ageHours = Math.max(0, (new Date(now).getTime() - latestTs) / (1000 * 60 * 60));
  if (ageHours <= 24) return 1;
  if (ageHours <= 72) return 0.82;
  if (ageHours <= 24 * 7) return 0.6;
  if (ageHours <= 24 * 14) return 0.42;
  return 0.22;
}

function scoreActionabilityWeight(candidate: ActionCandidate, person?: Person | null): number {
  let score = 0.2;
  if (candidate.recommendedNextStep) score += 0.18;
  if (candidate.person?._ref || person?._id) score += 0.22;
  if (candidate.draftStatus === 'ready' || candidate.draftStatus === 'drafted') score += 0.2;
  score += Math.max(0, 0.2 - (Math.min((candidate.missingData || []).length, 4) * 0.05));
  return clamp(score, 0, 1);
}

function relevantSignals(candidate: ActionCandidate, signals: SignalEvent[]): SignalEvent[] {
  return signals.filter((signal) =>
    signal.account?._ref === candidate.account?._ref ||
    (!!candidate.person?._ref && signal.person?._ref === candidate.person._ref),
  );
}

function signalUrgencyMultiplier(signalType: string): number {
  if (signalType === 'signup') return 1;
  if (signalType === 'pricing_page_visit') return 0.95;
  if (signalType === 'intent_spike') return 0.9;
  if (signalType === 'mql') return 0.92;
  if (signalType === 'routing_signal') return 0.88;
  if (signalType === 'job_posting') return 0.6;
  return 0.7;
}

function clamp(value: number, min: number, max: number): number {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, numeric));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
