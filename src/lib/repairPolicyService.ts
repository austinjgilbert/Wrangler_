import type { AutonomyPolicy } from './autopilotTypes.ts';
import { createAutonomyPolicy, fetchLatestDocumentByType } from './sanity.ts';

const DEFAULT_POLICY: Omit<AutonomyPolicy, '_type' | '_id'> = {
  policyId: 'autopilot.default',
  version: '1.0.0',
  allowedRepairs: [
    'retry_job',
    'requeue_job',
    'refresh_stale_state',
    'rerun_enrichment',
    'regenerate_draft',
    'selector_fallback',
    'retry_api_call',
  ],
  approvalRequiredActions: [
    'schema_change',
    'scoring_formula_change',
    'prompt_policy_rewrite',
    'destructive_data_change',
    'entity_merge_high_impact',
    'strategy_mutation',
  ],
  monitorOnlyActions: [
    'latency_regression',
    'empty_state_warning',
    'confidence_drift',
  ],
  updatedAt: new Date().toISOString(),
};

export async function getAutonomyPolicy(env: any): Promise<AutonomyPolicy> {
  const existing = await fetchLatestDocumentByType(env, 'autonomyPolicy').catch(() => null);
  if (existing) return existing as AutonomyPolicy;
  const created: AutonomyPolicy = {
    _type: 'autonomyPolicy',
    _id: 'autonomyPolicy.default',
    ...DEFAULT_POLICY,
  };
  await createAutonomyPolicy(env, created).catch(() => null);
  return created;
}

export function classifyRepairAction(policy: AutonomyPolicy, action: string) {
  if (policy.allowedRepairs.includes(action)) return 'allowed';
  if (policy.approvalRequiredActions.includes(action)) return 'approval_required';
  return 'monitor_only';
}
