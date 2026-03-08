import type {
  Account,
  ActionCandidate,
  DraftingOutput,
  Person,
  SignalEvent,
} from '../../shared/types.ts';
import { calculateOpportunityScore } from './opportunityEngine.ts';

export function explainOpportunityScore(input: {
  actionCandidate: ActionCandidate;
  account?: Account | null;
  person?: Person | null;
  signals?: SignalEvent[];
}) {
  const score = calculateOpportunityScore({
    candidate: input.actionCandidate,
    account: input.account,
    person: input.person,
    signals: input.signals || [],
  });

  return {
    actionCandidateId: input.actionCandidate._id,
    scoringVersion: input.actionCandidate.scoringVersion || 'scoring.default',
    rankingPolicyVersion: input.actionCandidate.rankingPolicyVersion || 'ranking.default',
    total: score.total,
    strongestDrivers: score.strongestDrivers,
    components: {
      patternStrength: score.patternStrength,
      signalUrgency: score.signalUrgency,
      personaInfluence: score.personaInfluence,
      techRelevance: score.techRelevance,
      accountPriority: score.accountPriority,
      evidenceConfidence: score.evidenceConfidence,
      recencyWeight: score.recencyWeight,
      actionabilityWeight: score.actionabilityWeight,
    },
    confidenceBreakdown: input.actionCandidate.confidenceBreakdown || null,
  };
}

export function explainPatternMatch(input: {
  actionCandidate: ActionCandidate;
}) {
  return {
    actionCandidateId: input.actionCandidate._id,
    patternMatch: input.actionCandidate.patternMatch || 'no_pattern',
    patternVersion: input.actionCandidate.patternVersion || 'pattern.default',
    uncertaintyState: input.actionCandidate.uncertaintyState || 'likely',
    evidence: input.actionCandidate.evidence || [],
    signalRefs: input.actionCandidate.signalRefs || [],
  };
}

export function explainDraftGeneration(input: {
  actionCandidate: ActionCandidate;
  draft: DraftingOutput;
}) {
  return {
    actionCandidateId: input.actionCandidate._id,
    promptVersion: input.draft.draftPolicyVersion || input.actionCandidate.draftPolicyVersion || 'draft.default',
    strategyVersion: input.draft.strategyVersion || input.actionCandidate.strategyVersion || 'strategy.default',
    confidenceBreakdown: input.draft.confidenceBreakdown || input.actionCandidate.confidenceBreakdown || null,
    evidenceReference: input.draft.evidenceReference,
    whyNow: input.actionCandidate.whyNow,
    recommendedNextStep: input.actionCandidate.recommendedNextStep,
  };
}
