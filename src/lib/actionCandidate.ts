import type {
  Account,
  ActionCandidate,
  ActionCandidateDraftStatus,
  ActionCandidateType,
  ActionCandidateUrgency,
  ConfidenceBreakdown,
  Person,
  SanityReference,
  UncertaintyState,
} from '../../shared/types.ts';

type CreateActionCandidateInput = {
  id?: string;
  account: SanityReference;
  person?: SanityReference | null;
  signals?: string[];
  signalRefs?: SanityReference[];
  patternMatch?: string;
  opportunityScore?: number;
  confidence?: number;
  confidenceBreakdown?: ConfidenceBreakdown;
  observedAt?: string;
  lastValidatedAt?: string;
  staleAfter?: string;
  refreshPriority?: number;
  uncertaintyState?: UncertaintyState;
  scoringVersion?: string;
  patternVersion?: string;
  draftPolicyVersion?: string;
  strategyVersion?: string;
  rankingPolicyVersion?: string;
  scenarioFixtureId?: string;
  actionType: ActionCandidateType;
  urgency?: ActionCandidateUrgency;
  whyNow: string;
  evidence?: string[];
  evidenceRefs?: SanityReference[];
  draftStatus?: ActionCandidateDraftStatus;
  recommendedNextStep: string;
  missingData?: string[];
  expirationTime?: string;
  lifecycleStatus?: 'active' | 'expired' | 'completed';
};

export function createActionCandidate(input: CreateActionCandidateInput): ActionCandidate {
  const now = new Date().toISOString();
  const id = input.id || `actionCandidate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    _type: 'actionCandidate',
    _id: id,
    id,
    observedAt: input.observedAt || now,
    lastValidatedAt: input.lastValidatedAt || now,
    staleAfter: input.staleAfter || defaultStaleAfter(input.actionType),
    refreshPriority: input.refreshPriority ?? deriveRefreshPriority(input.opportunityScore ?? 0, input.missingData || []),
    uncertaintyState: input.uncertaintyState || deriveUncertaintyState(input.missingData || [], input.confidence ?? 0.5),
    confidenceBreakdown: input.confidenceBreakdown || buildConfidenceBreakdown(input.confidence ?? 0.5, input.missingData || []),
    scoringVersion: input.scoringVersion || 'scoring.default',
    patternVersion: input.patternVersion || 'pattern.default',
    draftPolicyVersion: input.draftPolicyVersion || 'draft.default',
    strategyVersion: input.strategyVersion || 'strategy.default',
    rankingPolicyVersion: input.rankingPolicyVersion || 'ranking.default',
    scenarioFixtureId: input.scenarioFixtureId,
    account: normalizeRef(input.account),
    person: input.person ? normalizeRef(input.person) : null,
    signals: uniqueStrings(input.signals || []),
    signalRefs: normalizeRefs(input.signalRefs || []),
    patternMatch: input.patternMatch || inferPatternMatch(input),
    opportunityScore: clampNumber(input.opportunityScore ?? 0, 0, 100),
    confidence: clampNumber(input.confidence ?? 0.5, 0, 1),
    actionType: input.actionType,
    urgency: input.urgency || deriveUrgency(input.opportunityScore ?? 0, input.missingData || []),
    whyNow: String(input.whyNow || '').trim(),
    evidence: uniqueStrings(input.evidence || []),
    evidenceRefs: normalizeRefs(input.evidenceRefs || []),
    draftStatus: input.draftStatus || 'not_started',
    recommendedNextStep: String(input.recommendedNextStep || '').trim(),
    missingData: uniqueStrings(input.missingData || []),
    expirationTime: input.expirationTime || defaultExpirationForAction(input.actionType),
    lifecycleStatus: input.lifecycleStatus || 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function updateActionCandidateScore(
  candidate: ActionCandidate,
  updates: {
    opportunityScore?: number;
    confidence?: number;
    whyNow?: string;
    evidence?: string[];
    signals?: string[];
    missingData?: string[];
  },
): ActionCandidate {
  const nextScore = clampNumber(updates.opportunityScore ?? candidate.opportunityScore, 0, 100);
  const nextMissing = uniqueStrings(updates.missingData ?? candidate.missingData ?? []);
  return {
    ...candidate,
    opportunityScore: nextScore,
    confidence: clampNumber(updates.confidence ?? candidate.confidence, 0, 1),
    confidenceBreakdown: candidate.confidenceBreakdown || buildConfidenceBreakdown(updates.confidence ?? candidate.confidence, nextMissing),
    lastValidatedAt: new Date().toISOString(),
    staleAfter: candidate.staleAfter || defaultStaleAfter(candidate.actionType),
    refreshPriority: deriveRefreshPriority(nextScore, nextMissing),
    uncertaintyState: deriveUncertaintyState(nextMissing, updates.confidence ?? candidate.confidence),
    urgency: deriveUrgency(nextScore, nextMissing),
    whyNow: updates.whyNow ? String(updates.whyNow).trim() : candidate.whyNow,
    evidence: uniqueStrings([...(candidate.evidence || []), ...(updates.evidence || [])]),
    signals: uniqueStrings([...(candidate.signals || []), ...(updates.signals || [])]),
    missingData: nextMissing,
    lifecycleStatus: candidate.lifecycleStatus === 'expired' && !isExpired(candidate.expirationTime) ? 'active' : candidate.lifecycleStatus,
    updatedAt: new Date().toISOString(),
  };
}

export function expireActionCandidate(
  candidate: ActionCandidate,
  expiredAt: string = new Date().toISOString(),
): ActionCandidate {
  return {
    ...candidate,
    expirationTime: expiredAt,
    uncertaintyState: 'stale',
    draftStatus: candidate.draftStatus === 'approved' ? candidate.draftStatus : 'expired',
    lifecycleStatus: 'expired',
    updatedAt: new Date().toISOString(),
  };
}

export function createActionCandidatesFromScanResult(input: {
  account: Account;
  person?: Person | null;
  scanResult?: any;
  signals?: string[];
}): ActionCandidate[] {
  const { account, person = null, scanResult = null } = input;
  const opportunityScore = clampNumber(
    scanResult?.opportunityScore
      ?? scanResult?.technologyStack?.opportunityScore
      ?? account.opportunityScore
      ?? 0,
    0,
    100,
  );
  const scanSignals = uniqueStrings([
    ...(input.signals || []),
    ...(account.signals || []),
    ...((scanResult?.technologyStack?.migrationOpportunities || []).map((item: string) => `migration:${item}`)),
    ...((scanResult?.technologyStack?.painPoints || []).map((item: string) => `pain:${item}`)),
  ]);
  const evidence = buildEvidenceFromScan(account, scanResult);
  const missingData = buildMissingData(account, person, scanResult);
  const personRef = person?._id ? { _ref: person._id, _type: 'reference' as const } : null;

  const actionType: ActionCandidateType = personRef && opportunityScore >= 85 && isHighInfluenceContact(person)
    ? 'make_call'
    : personRef && opportunityScore >= 70 && !person?.email && !!person?.linkedinUrl
      ? 'send_linkedin_message'
      : personRef && opportunityScore >= 70
        ? 'send_email'
        : opportunityScore >= 55
          ? 'run_targeted_research'
          : 'create_followup_task';

  const recommendedNextStep = actionType === 'send_email'
    ? `Draft outreach to ${person?.name || 'the best visible stakeholder'} with the strongest scan-backed angle.`
    : actionType === 'make_call'
      ? `Call ${person?.name || 'the best visible stakeholder'} with a tight evidence-backed opening.`
    : actionType === 'send_linkedin_message'
      ? `Send a short LinkedIn message to ${person?.name || 'the best visible stakeholder'} using the freshest signal.`
    : actionType === 'run_targeted_research'
      ? 'Fill the highest-value data gaps before outbound execution.'
      : 'Review this account manually and decide whether to queue deeper research.';

  const whyNow = buildWhyNow(account, person, opportunityScore, scanSignals, scanResult);
  const candidate = createActionCandidate({
    account: { _ref: account._id, _type: 'reference' },
    person: personRef,
    signals: scanSignals,
    patternMatch: inferPatternMatch({ opportunityScore, missingData, signals: scanSignals }),
    opportunityScore,
    confidence: deriveConfidence(opportunityScore, evidence, missingData),
    confidenceBreakdown: buildConfidenceBreakdown(deriveConfidence(opportunityScore, evidence, missingData), missingData),
    actionType,
    whyNow,
    evidence,
    draftStatus: actionType === 'send_email' ? 'ready' : 'not_started',
    recommendedNextStep,
    missingData,
  });

  return [candidate];
}

function buildEvidenceFromScan(account: Account, scanResult: any): string[] {
  const evidence: string[] = [];
  if (account.domain) evidence.push(`Account domain: ${account.domain}`);
  if (account.industry) evidence.push(`Industry: ${account.industry}`);
  for (const item of scanResult?.technologyStack?.migrationOpportunities || []) evidence.push(`Migration opportunity: ${item}`);
  for (const item of scanResult?.technologyStack?.painPoints || []) evidence.push(`Pain point: ${item}`);
  if (scanResult?.technologyStack?.opportunityScore != null) evidence.push(`Scan opportunity score: ${scanResult.technologyStack.opportunityScore}`);
  return uniqueStrings(evidence).slice(0, 8);
}

function buildMissingData(account: Account, person: Person | null, scanResult: any): string[] {
  const gaps = new Set<string>(account.profileCompleteness?.gaps || []);
  if (!person?._id) gaps.add('target_person');
  if (!account.description) gaps.add('account_description');
  if (!(account.technologies || []).length && !(scanResult?.technologyStack?.allDetected || []).length) gaps.add('technology_validation');
  return Array.from(gaps).slice(0, 8);
}

function buildWhyNow(account: Account, person: Person | null, opportunityScore: number, signals: string[], scanResult: any): string {
  const parts = [];
  if (opportunityScore >= 70) parts.push(`The account is currently scoring ${opportunityScore}/100 for opportunity.`);
  if ((scanResult?.technologyStack?.migrationOpportunities || []).length) parts.push('The latest scan found modernization or migration signals.');
  if ((scanResult?.technologyStack?.painPoints || []).length) parts.push('The scan surfaced execution pain points that can support outreach.');
  if (person?.name) parts.push(`${person.name} is already associated with this account, which lowers execution friction.`);
  if (signals.length > 0) parts.push(`Active signals: ${signals.slice(0, 3).join(', ')}.`);
  if (parts.length === 0) parts.push('The account has enough structured evidence to justify a concrete next SDR action.');
  return parts.join(' ');
}

function inferPatternMatch(input: { opportunityScore?: number; missingData?: string[]; signals?: string[]; patternMatch?: string }): string {
  if (input.patternMatch) return input.patternMatch;
  if ((input.opportunityScore ?? 0) >= 70 && (input.missingData || []).length <= 2) return 'scan.execution_ready';
  if ((input.signals || []).some((item) => item.includes('migration:'))) return 'scan.migration_signal';
  return 'scan.follow_up_required';
}

function deriveConfidence(opportunityScore: number, evidence: string[], missingData: string[]): number {
  let score = 0.35;
  if (opportunityScore >= 70) score += 0.25;
  else if (opportunityScore >= 50) score += 0.15;
  score += Math.min(evidence.length, 4) * 0.08;
  score -= Math.min(missingData.length, 4) * 0.05;
  return clampNumber(score, 0.2, 0.98);
}

function buildConfidenceBreakdown(confidence: number, missingData: string[]): ConfidenceBreakdown {
  const value = clampNumber(confidence, 0, 1);
  const missingPenalty = Math.min(missingData.length, 4) * 0.08;
  return {
    dataConfidence: clampNumber(value - missingPenalty, 0, 1),
    entityConfidence: clampNumber(value - (missingData.includes('target_person') ? 0.15 : 0.05), 0, 1),
    patternConfidence: clampNumber(value - (missingData.length > 2 ? 0.12 : 0.03), 0, 1),
    actionConfidence: clampNumber(value, 0, 1),
    draftConfidence: clampNumber(value - (missingData.includes('technology_validation') ? 0.12 : 0.04), 0, 1),
    updatedAt: new Date().toISOString(),
    notes: missingData.length ? [`Missing data: ${missingData.join(', ')}`] : ['Confidence derived from current action evidence.'],
  };
}

function deriveUrgency(opportunityScore: number, missingData: string[]): ActionCandidateUrgency {
  if (opportunityScore >= 85 && missingData.length <= 1) return 'critical';
  if (opportunityScore >= 70) return 'high';
  if (opportunityScore >= 45) return 'medium';
  return 'low';
}

function defaultExpirationForAction(actionType: ActionCandidateType): string {
  const hours = actionType === 'make_call'
    ? 24
    : actionType === 'send_linkedin_message'
      ? 48
      : actionType === 'send_email'
        ? 72
        : actionType === 'run_targeted_research'
          ? 24
          : 120;
  return new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString();
}

function defaultStaleAfter(actionType: ActionCandidateType): string {
  const hours = actionType === 'make_call' ? 24 : actionType === 'send_email' ? 72 : 96;
  return new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString();
}

function deriveRefreshPriority(opportunityScore: number, missingData: string[]): number {
  return clampNumber(Math.round(opportunityScore + (missingData.length * 6)), 20, 100);
}

function deriveUncertaintyState(missingData: string[], confidence: number): UncertaintyState {
  const normalized = clampNumber(confidence, 0, 1);
  if (missingData.length >= 4) return 'needs_validation';
  if (normalized < 0.4) return 'weakly_inferred';
  if (normalized < 0.7) return 'likely';
  return 'confirmed';
}

function isHighInfluenceContact(person: Person | null): boolean {
  if (!person) return false;
  if (person.isDecisionMaker) return true;
  if (person.seniorityLevel === 'c-suite' || person.seniorityLevel === 'vp' || person.seniorityLevel === 'director') return true;
  const title = `${person.currentTitle || ''} ${person.title || ''}`.toLowerCase();
  return /chief|cxo|vp|vice president|head|director/.test(title);
}

function normalizeRef(ref: SanityReference): SanityReference {
  return {
    _ref: ref._ref,
    _type: 'reference',
  };
}

function normalizeRefs(refs: SanityReference[]): SanityReference[] {
  return (refs || []).filter((ref) => !!ref?._ref).map(normalizeRef);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function isExpired(expirationTime: string): boolean {
  return new Date(expirationTime).getTime() <= Date.now();
}
