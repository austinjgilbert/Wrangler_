import type {
  DraftPolicyVersion,
  PatternVersion,
  PolicyContext,
  ScoringPolicyVersion,
  StrategyInstructionVersion,
} from '../../shared/types.ts';
import {
  createDraftPolicyVersion,
  createPatternVersion,
  createScoringPolicyVersion,
  createStrategyInstructionVersion,
  fetchLatestDocumentByType,
  fetchLatestMoltbotConfig,
} from './sanity.ts';

const DEFAULT_SCORING_WEIGHTS: Record<string, number> = {
  patternStrength: 0.16,
  signalUrgency: 0.18,
  personaInfluence: 0.12,
  techRelevance: 0.12,
  accountPriority: 0.12,
  evidenceConfidence: 0.12,
  recencyWeight: 0.1,
  actionabilityWeight: 0.08,
};

export async function getActivePolicyContext(env: any): Promise<PolicyContext> {
  const [scoringPolicy, draftPolicy, strategyInstruction, patternVersion] = await Promise.all([
    fetchLatestDocumentByType(env, 'scoringPolicyVersion'),
    fetchLatestDocumentByType(env, 'draftPolicyVersion'),
    fetchLatestDocumentByType(env, 'strategyInstructionVersion'),
    fetchLatestDocumentByType(env, 'patternVersion'),
  ]);

  return {
    scoringVersion: scoringPolicy?.versionId || 'scoring.default',
    patternVersion: patternVersion?.versionId || 'pattern.default',
    draftPolicyVersion: draftPolicy?.versionId || 'draft.default',
    strategyVersion: strategyInstruction?.versionId || 'strategy.default',
    rankingPolicyVersion: scoringPolicy?.versionId || 'ranking.default',
  };
}

export async function ensureBaselinePolicyVersions(env: any, input: {
  actor?: string;
  reason?: string;
  now?: string;
}) {
  const now = input.now || new Date().toISOString();
  const actor = input.actor || 'system';
  const reason = input.reason || 'Initialize baseline anti-drift policy versions.';

  const [existingScoring, existingDraft, existingStrategy] = await Promise.all([
    fetchLatestDocumentByType(env, 'scoringPolicyVersion'),
    fetchLatestDocumentByType(env, 'draftPolicyVersion'),
    fetchLatestDocumentByType(env, 'strategyInstructionVersion'),
  ]);

  const config = await fetchLatestMoltbotConfig(env).catch(() => null);

  const scoringPolicy = existingScoring || await createScoringPolicyVersion(env, buildScoringPolicyVersion({
    versionId: `scoring.${now.slice(0, 10)}`,
    changedBy: actor,
    changedAt: now,
    reason,
    previousVersion: null,
    expectedImpact: 'Establish explicit scoring lineage for ranking and regression tracking.',
    activationStatus: 'active',
    weights: DEFAULT_SCORING_WEIGHTS,
    thresholds: { queueThreshold: 70, criticalActionThreshold: 85 },
  }));

  const draftPolicy = existingDraft || await createDraftPolicyVersion(env, buildDraftPolicyVersion({
    versionId: `draft.${now.slice(0, 10)}`,
    changedBy: actor,
    changedAt: now,
    reason,
    previousVersion: null,
    expectedImpact: 'Establish explicit drafting prompt lineage.',
    activationStatus: 'active',
    toneRules: config?.toneRules || [],
    operatingRules: config?.operatingRules || [],
    systemPrompt: 'Baseline SDR drafting policy.',
  }));

  const strategyInstruction = existingStrategy || await createStrategyInstructionVersion(env, buildStrategyInstructionVersion({
    versionId: `strategy.${now.slice(0, 10)}`,
    changedBy: actor,
    changedAt: now,
    reason,
    previousVersion: null,
    expectedImpact: 'Establish explicit strategy instruction lineage.',
    activationStatus: 'active',
    operatingRules: config?.operatingRules || [],
    toneRules: config?.toneRules || [],
    values: config?.values || [],
  }));

  return {
    scoringPolicy,
    draftPolicy,
    strategyInstruction,
  };
}

export async function createPatternVersionRecord(env: any, input: {
  patternKey: string;
  changedBy: string;
  reason: string;
  conditions?: Record<string, any>;
  recommendedMoves?: string[];
  expectedImpact?: string;
  activationStatus?: PatternVersion['activationStatus'];
  lifecycleState?: PatternVersion['lifecycleState'];
  now?: string;
}) {
  const now = input.now || new Date().toISOString();
  const previous = await fetchLatestDocumentByType(env, 'patternVersion');
  const doc = buildPatternVersion({
    versionId: `pattern.${input.patternKey}.${now.slice(0, 10)}`,
    changedBy: input.changedBy,
    changedAt: now,
    reason: input.reason,
    previousVersion: previous?.versionId || null,
    expectedImpact: input.expectedImpact || `Track lifecycle changes for pattern ${input.patternKey}.`,
    activationStatus: input.activationStatus || 'active',
    patternKey: input.patternKey,
    conditions: input.conditions || {},
    recommendedMoves: input.recommendedMoves || [],
    lifecycleState: input.lifecycleState || 'active',
  });
  return createPatternVersion(env, doc);
}

export function buildScoringPolicyVersion(input: Omit<ScoringPolicyVersion, '_type' | 'policyType'>): ScoringPolicyVersion {
  return { _type: 'scoringPolicyVersion', policyType: 'scoring', ...input };
}

export function buildPatternVersion(input: Omit<PatternVersion, '_type' | 'policyType'>): PatternVersion {
  return { _type: 'patternVersion', policyType: 'pattern', ...input };
}

export function buildDraftPolicyVersion(input: Omit<DraftPolicyVersion, '_type' | 'policyType'>): DraftPolicyVersion {
  return { _type: 'draftPolicyVersion', policyType: 'draft', ...input };
}

export function buildStrategyInstructionVersion(input: Omit<StrategyInstructionVersion, '_type' | 'policyType'>): StrategyInstructionVersion {
  return { _type: 'strategyInstructionVersion', policyType: 'strategy', ...input };
}
