/**
 * MoltBot Approval Handling
 * Executes gated actions only after explicit approval.
 */

import {
  getMoltbotApproval,
  updateMoltbotApproval,
  updateMoltbotRequest,
  createMoltbotArtifact,
} from './sanity.ts';

import { ToolRegistry } from './toolRegistry.ts';
import { ToolClient } from './toolClient.ts';
import {
  fetchMoltApprovalById,
  updateMoltApproval,
  fetchProposalById,
  updateEnrichProposal,
  patchEntity,
  createMoltEvent,
} from './sanity.ts';
import { applyPatchesToDocument } from './proposals.ts';
import { buildEventDoc } from './events.ts';

interface ApprovalDecisionParams {
  env: any;
  approvalId: string;
  decision: string;
  traceId?: string;
}

interface UnifiedApprovalDecisionParams {
  env: any;
  approvalId: string;
  decision: string;
}

interface ApprovalResult {
  status: string;
  artifactId?: string;
}

interface ToolCallInput {
  traceId?: string;
  tool: string;
  action: string;
  input: any;
}

export async function handleApprovalDecision({ env, approvalId, decision, traceId }: ApprovalDecisionParams): Promise<ApprovalResult> {
  const approval = await getMoltbotApproval(env, approvalId);
  if (!approval) {
    throw new Error('Approval not found');
  }

  const now = new Date().toISOString();
  if (decision === 'reject') {
    await updateMoltbotApproval(env, approvalId, {
      status: 'rejected',
      resolvedAt: now,
    });
    if (approval.requestRef?._ref) {
      await updateMoltbotRequest(env, approval.requestRef._ref, { status: 'done' });
    }
    return { status: 'rejected' };
  }

  const toolRegistry = new ToolRegistry(env);
  await toolRegistry.loadConfig();
  const toolClient = new ToolClient(toolRegistry);

  let result: any = null;
  const actionPayload: any = approval.actionPayload || {};
  if (approval.actionType === 'proposed_action' && actionPayload.proposedAction) {
    const proposed: any = actionPayload.proposedAction;
    result = await toolClient.callTool({
      traceId: traceId || proposed.payload?.traceId,
      tool: proposed.tool || proposed.toolName,
      action: proposed.action || proposed.actionName,
      input: proposed.input || proposed.payload,
    });
  } else if (approval.actionType === 'tool_call' && actionPayload.toolName) {
    result = await toolClient.callTool({
      traceId: traceId || actionPayload.payload?.traceId,
      tool: actionPayload.tool || actionPayload.toolName,
      action: actionPayload.action || actionPayload.actionName,
      input: actionPayload.payload || actionPayload.input,
    });
  } else if (approval.actionType === 'tool_plan' && Array.isArray(actionPayload.toolPlan?.steps)) {
    for (const step of actionPayload.toolPlan.steps) {
      result = await toolClient.callTool({
        traceId: traceId || step.input?.traceId,
        tool: step.toolName || step.tool,
        action: step.actionName || step.action,
        input: step.input,
      });
    }
  }

  await updateMoltbotApproval(env, approvalId, {
    status: 'approved',
    resolvedAt: now,
  });

  if (approval.requestRef?._ref) {
    await updateMoltbotRequest(env, approval.requestRef._ref, { status: 'done' });
  }

  const artifactId = `moltbot.artifact.${traceId || approvalId}`;
  const artifactDoc = {
    _type: 'moltbot.artifact',
    _id: artifactId,
    artifactType: 'summary',
    content: result?.output || 'Approved action executed.',
    citations: result?.citations || [],
    createdFrom: approval.requestRef || null,
    nextActions: result?.suggestedNextActions || [],
    createdAt: now,
  };
  await createMoltbotArtifact(env, artifactDoc);

  return { status: 'approved', artifactId };
}

export async function handleUnifiedApprovalDecision({ env, approvalId, decision }: UnifiedApprovalDecisionParams): Promise<ApprovalResult> {
  const approval = await fetchMoltApprovalById(env, approvalId);
  if (!approval) {
    throw new Error('Unified approval not found');
  }

  const now = new Date().toISOString();
  if (decision === 'reject') {
    await updateMoltApproval(env, approvalId, { status: 'rejected', resolvedAt: now });
    const eventDoc = buildEventDoc({
      type: 'approval.rejected',
      text: `Rejected action ${approvalId}`,
      channel: 'system',
      actor: 'austin',
      entities: approval.relatedEntities?.map((r: any) => ({ _ref: r._ref || r, entityType: 'account' })) || [],
      tags: ['approval'],
      traceId: approval.traceId || null,
      idempotencyKey: `approval.rejected.${approvalId}`,
    });
    await createMoltEvent(env, eventDoc);
    return { status: 'rejected' };
  }

  if (approval.actionType === 'enrich.apply') {
    const proposalId: string | undefined = approval.actionPayload?.proposalId;
    const proposal = await fetchProposalById(env, proposalId);
    if (!proposal) throw new Error('Proposal not found');
    const entityId: string | undefined = proposal.entityRef?._ref;
    if (!entityId) throw new Error('Proposal missing entityRef');
    const updated = applyPatchesToDocument({}, proposal.patches);
    await patchEntity(env, entityId, updated);
    await updateEnrichProposal(env, proposalId, { status: 'applied' });
  }

  await updateMoltApproval(env, approvalId, { status: 'approved', resolvedAt: now });
  const eventDoc = buildEventDoc({
    type: 'approval.approved',
    text: `Approved action ${approvalId}`,
    channel: 'system',
    actor: 'austin',
    entities: approval.relatedEntities?.map((r: any) => ({ _ref: r._ref || r, entityType: 'account' })) || [],
    tags: ['approval'],
    traceId: approval.traceId || null,
    idempotencyKey: `approval.approved.${approvalId}`,
  });
  await createMoltEvent(env, eventDoc);
  return { status: 'approved' };
}
