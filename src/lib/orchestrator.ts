/**
 * MoltBot Orchestrator
 * Minimal, inspectable orchestration loop.
 */

import {
  createMoltbotRequest,
  updateMoltbotRequest,
  createMoltbotArtifact,
  createMoltbotApproval,
  createMoltbotTask,
  fetchContextArtifacts,
  createMoltApproval,
} from './sanity.ts';

import { ToolRegistry } from './toolRegistry.ts';
import { ToolClient } from './toolClient.ts';
import { evaluateRisk } from './riskEngine.ts';
import { buildProposedAction } from './proposedAction.ts';
import { notify } from './notify.ts';

const DANGEROUS_ACTION_PATTERNS: RegExp[] = [
  /send\s+email/i,
  /post\s+tweet/i,
  /publish/i,
  /push\s+code/i,
  /deploy/i,
  /modify\s+production/i,
];

interface ToolPlanStep {
  toolName: string;
  actionName?: string;
  purpose: string;
  expectedOutput: string;
  input: any;
}

interface ToolPlan {
  steps: ToolPlanStep[];
}

interface ArtifactData {
  artifactType: string;
  content: string;
  citations: any[];
  nextActions: any[];
}

interface RunMoltBotParams {
  env: any;
  requestText: string;
  mode?: string;
  entityHints?: string[];
  requireApproval?: boolean;
  traceId: string;
}

interface RunMoltBotResult {
  requestId: string;
  artifactId?: string;
  status: string;
  summary?: string;
  approvalId?: string;
}

function inferMode(requestText: string): string {
  const text = (requestText || '').toLowerCase();
  if (/(draft|write|outreach|email|message)/.test(text)) return 'draft';
  if (/(plan|roadmap|strategy)/.test(text)) return 'plan';
  if (/(summarize|summary|reflect)/.test(text)) return 'reflect';
  if (/(research|investigate|analyze|compare|lookup)/.test(text)) return 'research';
  return 'research';
}

function detectDangerousIntent(requestText: string): boolean {
  const text = requestText || '';
  return DANGEROUS_ACTION_PATTERNS.some((pattern) => pattern.test(text));
}

function buildToolPlan(mode: string, requestText: string): ToolPlanStep[] {
  const steps: ToolPlanStep[] = [];
  const text = (requestText || '').toLowerCase();
  if (mode === 'research' || mode === 'draft' || mode === 'plan' || mode === 'reflect') {
    steps.push({
      toolName: 'research',
      actionName: 'research',
      purpose: 'Collect structured research for the request.',
      expectedOutput: 'researchBrief',
      input: {
        query: requestText,
        constraints: mode === 'draft' ? ['focus on messaging inputs'] : [],
        outputFormat: 'markdown',
      },
    });
  }
  if (text.includes('outreach') || text.includes('sequence')) {
    steps.push({
      toolName: 'outreach',
      actionName: 'createDraft',
      purpose: 'Create draft outreach content.',
      expectedOutput: 'outreachDraft',
      input: {
        subject: 'Draft outreach',
        body: 'Draft outreach content based on research.',
      },
    });
  }
  if (text.includes('enroll') || text.includes('sequence')) {
    steps.push({
      toolName: 'outreach',
      actionName: 'enrollSequence',
      purpose: 'Enroll contact in outreach sequence.',
      expectedOutput: 'sequenceEnrollment',
      input: {
        sequenceId: 'seq_placeholder',
        contactId: 'contact_placeholder',
      },
    });
  }
  if (text.includes('salesforce')) {
    steps.push({
      toolName: 'salesforce',
      actionName: 'query',
      purpose: 'Query Salesforce for relevant account data.',
      expectedOutput: 'salesforceQuery',
      input: {
        soql: 'SELECT Id, Name FROM Account LIMIT 5',
      },
    });
  }
  return steps;
}

function normalizeArtifact(mode: string, toolResult: any, requestText: string): ArtifactData {
  const artifactTypeMap: Record<string, string> = {
    research: 'researchBrief',
    draft: 'outreachDraft',
    plan: 'plan',
    reflect: 'summary',
  };

  const content =
    toolResult?.output ||
    toolResult?.result ||
    `# Notes\n\n${requestText}`;

  return {
    artifactType: artifactTypeMap[mode] || 'summary',
    content: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    citations: toolResult?.citations || [],
    nextActions: toolResult?.suggestedNextActions || [],
  };
}

function summarizeContent(content: string): string {
  if (!content || typeof content !== 'string') return '';
  const firstLine = content.split('\n').find((line: string) => line.trim().length > 0);
  return firstLine ? firstLine.slice(0, 140) : '';
}

export async function runMoltBot({
  env,
  requestText,
  mode = 'auto',
  entityHints = [],
  requireApproval = false,
  traceId,
}: RunMoltBotParams): Promise<RunMoltBotResult> {
  const resolvedMode = mode === 'auto' ? inferMode(requestText) : mode;
  const now = new Date().toISOString();

  const requestId = `moltbot.request.${traceId}`;
  const requestDoc = {
    _type: 'moltbot.request',
    _id: requestId,
    requestText,
    mode: resolvedMode,
    status: 'queued',
    entityHints,
    createdAt: now,
    traceId,
  };

  await createMoltbotRequest(env, requestDoc);

  try {
    const toolRegistry = new ToolRegistry(env);
    await toolRegistry.loadConfig();
    const toolClient = new ToolClient(toolRegistry);
    const approvalPolicy: any = toolRegistry.config?.approvalPolicy || {};

    const contextArtifacts = await fetchContextArtifacts(env, entityHints, 5);
    const toolPlanSteps = buildToolPlan(resolvedMode, requestText);
    const toolPlan: ToolPlan = { steps: toolPlanSteps };

    await updateMoltbotRequest(env, requestId, { toolPlan });

    const dangerousIntent = detectDangerousIntent(requestText);
    let toolResult: any = null;
    const draftActions: any[] = [];

    for (const step of toolPlanSteps) {
      const tool = toolRegistry.getTool(step.toolName);
      if (!tool) {
        throw new Error(`Tool not found in registry: ${step.toolName}`);
      }
      if (Array.isArray(tool.allowedActions) && tool.allowedActions.length > 0) {
        const actionName = step.actionName || step.toolName;
        if (!tool.allowedActions.includes(actionName)) {
          throw new Error(`Action not allowed for tool: ${step.toolName}`);
        }
      }
      const proposedAction = buildProposedAction({
        toolName: step.toolName,
        actionName: step.actionName || step.toolName,
        payload: step.input,
      });
      const risk = evaluateRisk({
        tool,
        actionName: step.actionName || step.toolName,
        approvalPolicy,
        requireApproval: requireApproval || dangerousIntent,
      });

      if (risk.requiresApproval) {
        const approvalId = `moltbot.approval.${traceId}`;
        const approvalDoc = {
          _type: 'moltbot.approval',
          _id: approvalId,
          requestRef: { _type: 'reference', _ref: requestId },
          actionType: 'proposed_action',
          actionPayload: { proposedAction },
          riskLevel: risk.riskLevel,
          preview: proposedAction.preview,
          relatedEntities: [],
          status: 'pending',
          createdAt: now,
        };
        await createMoltbotApproval(env, approvalDoc);
        await createMoltApproval(env, {
          _type: 'molt.approval',
          _id: `molt.approval.${approvalId}`,
          actionType: 'proposed_action',
          riskLevel: risk.riskLevel,
          preview: proposedAction.preview,
          actionPayload: { proposedAction },
          status: 'pending',
          relatedEntities: [],
          createdAt: now,
          audit: { source: 'molt.run' },
        });
        await updateMoltbotRequest(env, requestId, { status: 'needs_approval' });
        await notify('approval_required', 'MoltBot approval required', {
          approvalId,
          requestId,
          preview: proposedAction.preview,
        }, env);
        return {
          requestId,
          status: 'needs_approval',
          summary: 'Approval required before executing planned actions.',
          approvalId,
        };
      }

      if (risk.forceDraft) {
        draftActions.push(proposedAction);
        continue;
      }

      toolResult = await toolClient.callTool({
        traceId,
        tool: step.toolName,
        action: step.actionName || step.toolName,
        input: step.input,
        contextRefs: contextArtifacts.map((doc: any) => doc._id),
      });
    }

    const artifactData = normalizeArtifact(resolvedMode, toolResult, requestText);
    if (draftActions.length > 0) {
      const draftSection = draftActions.map((action: any) => `- ${action.preview}`).join('\n');
      artifactData.content = `${artifactData.content}\n\n## Draft Actions\n${draftSection}`;
    }
    const artifactId = `moltbot.artifact.${traceId}`;
    const artifactDoc = {
      _type: 'moltbot.artifact',
      _id: artifactId,
      artifactType: artifactData.artifactType,
      content: artifactData.content,
      citations: artifactData.citations,
      createdFrom: { _type: 'reference', _ref: requestId },
      nextActions: artifactData.nextActions,
      createdAt: now,
    };

    await createMoltbotArtifact(env, artifactDoc);

    if (Array.isArray(artifactData.nextActions) && artifactData.nextActions.length > 0) {
      for (const action of artifactData.nextActions.slice(0, 5)) {
        const taskDoc = {
          _type: 'moltbot.task',
          _id: `moltbot.task.${traceId}.${Math.random().toString(36).slice(2, 8)}`,
          taskText: action,
          status: 'open',
          linkedArtifact: { _type: 'reference', _ref: artifactId },
        };
        await createMoltbotTask(env, taskDoc);
      }
    }

    await updateMoltbotRequest(env, requestId, { status: 'done' });

    return {
      requestId,
      artifactId,
      status: 'done',
      summary: summarizeContent(artifactData.content),
    };
  } catch (error: any) {
    await updateMoltbotRequest(env, requestId, {
      status: 'error',
      error: error.message,
    });
    throw error;
  }
}
