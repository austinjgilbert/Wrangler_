/**
 * Risk Engine
 * Determines if approval is required and enforces draft-only mode.
 */

export function evaluateRisk({
  tool,
  actionName,
  approvalPolicy,
  requireApproval,
}: {
  tool: any;
  actionName: string;
  approvalPolicy: any;
  requireApproval: boolean;
}) {
  const riskLevel = tool?.riskLevel || 'safe';
  const defaultWriteMode = approvalPolicy?.defaultWriteMode || 'draft_only';
  const approvalRequiredActions = tool?.approvalRequiredActions || [];

  const requiresApproval =
    !!requireApproval ||
    riskLevel === 'dangerous' ||
    approvalRequiredActions.includes(actionName);

  const forceDraft =
    riskLevel === 'restricted' && defaultWriteMode === 'draft_only';

  return {
    riskLevel,
    requiresApproval,
    forceDraft,
    reason: requiresApproval
      ? 'approval_required'
      : forceDraft
        ? 'draft_only_enforced'
        : 'allowed',
  };
}
