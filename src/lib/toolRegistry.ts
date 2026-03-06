/**
 * MoltBot Skill Tool Registry
 * Loads tool configuration from Sanity, with a local fallback.
 */

import { assertSanityConfigured, groqQuery } from '../sanity-client.js';

const DEFAULT_TOOL_TIMEOUT_MS = 15000;
const DEFAULT_TOOL_RETRIES = 1;

function buildToolEndpoint(env: any, fallbackPath: string, envKey?: string) {
  if (envKey && env?.[envKey]) return String(env[envKey]);
  const baseUrl = env?.MOLT_TOOL_BASE_URL ? String(env.MOLT_TOOL_BASE_URL).replace(/\/$/, '') : '';
  if (!baseUrl) return '';
  return `${baseUrl}${fallbackPath}`;
}

function buildDefaultConfig(env: any) {
  return {
    _type: 'moltbot.config',
    name: 'MoltBot v1',
    mission: 'Orchestrate skills/tools with explicit control flow.',
    moltStage: 'v1',
    personaName: 'MoltBot',
    values: ['safety_first', 'draft_only', 'traceable'],
    toneRules: ['direct', 'concise', 'evidence-based'],
    forbiddenActions: ['auto-message', 'auto-post', 'linkedin-scrape'],
    operatingRules: [
      'deterministic',
      'inspectable',
      'approval-gated for dangerous actions',
    ],
    toolRegistry: [
      {
        name: 'research',
        description: 'Primary research worker for web and company intelligence.',
        endpoint: buildToolEndpoint(env, '/research', 'MOLT_RESEARCH_TOOL_URL'),
        riskLevel: 'safe',
        allowedActions: ['research'],
        approvalRequiredActions: [],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: ['query'] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'gmail',
        description: 'Gmail read/draft/send gateway.',
        endpoint: buildToolEndpoint(env, '/tools/gmail', 'MOLT_GMAIL_TOOL_URL'),
        riskLevel: 'restricted',
        allowedActions: ['read', 'draft', 'send', 'composeLink'],
        approvalRequiredActions: ['send'],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: [] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'calendar',
        description: 'Calendar read/propose/create gateway.',
        endpoint: buildToolEndpoint(env, '/tools/calendar', 'MOLT_CALENDAR_TOOL_URL'),
        riskLevel: 'restricted',
        allowedActions: ['read', 'proposeEvent', 'createEvent'],
        approvalRequiredActions: ['createEvent'],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: [] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'slack',
        description: 'Slack draft/post gateway.',
        endpoint: buildToolEndpoint(env, '/tools/slack', 'MOLT_SLACK_TOOL_URL'),
        riskLevel: 'restricted',
        allowedActions: ['draft', 'post'],
        approvalRequiredActions: ['post'],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: ['channel', 'text'] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'webSearch',
        description: 'Web search + extraction gateway.',
        endpoint: buildToolEndpoint(env, '/tools/webSearch', 'MOLT_WEB_SEARCH_TOOL_URL'),
        riskLevel: 'safe',
        allowedActions: ['search'],
        approvalRequiredActions: [],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: ['query'] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'summarize',
        description: 'Summarize URL/PDF/YT.',
        endpoint: buildToolEndpoint(env, '/tools/summarize', 'MOLT_SUMMARIZE_TOOL_URL'),
        riskLevel: 'safe',
        allowedActions: ['summarize'],
        approvalRequiredActions: [],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: ['source'] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'memorySearch',
        description: 'Hybrid memory search (BM25 + vectors + rerank).',
        endpoint: buildToolEndpoint(env, '/tools/memorySearch', 'MOLT_MEMORY_SEARCH_TOOL_URL'),
        riskLevel: 'safe',
        allowedActions: ['search'],
        approvalRequiredActions: [],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: ['query'] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'whisperTranscribe',
        description: 'Audio -> transcript pipeline.',
        endpoint: buildToolEndpoint(env, '/tools/whisperTranscribe', 'MOLT_WHISPER_TOOL_URL'),
        riskLevel: 'safe',
        allowedActions: ['transcribe'],
        approvalRequiredActions: [],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: ['audioUrl'] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'github',
        description: 'GitHub operations (approval gated).',
        endpoint: buildToolEndpoint(env, '/tools/github', 'MOLT_GITHUB_TOOL_URL'),
        riskLevel: 'dangerous',
        allowedActions: ['createIssue', 'createPr', 'comment'],
        approvalRequiredActions: ['createIssue', 'createPr', 'comment'],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: [] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'wrangler',
        description: 'Wrangler agent bridge (ChatGPT-style).',
        endpoint: buildToolEndpoint(env, '/tools/wrangler', 'MOLT_WRANGLER_TOOL_URL'),
        riskLevel: 'safe',
        allowedActions: ['chat'],
        approvalRequiredActions: [],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: ['prompt'] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'salesforce',
        description: 'Salesforce read/write gateway.',
        endpoint: buildToolEndpoint(env, '/salesforce', 'MOLT_SF_BASE_URL'),
        riskLevel: 'restricted',
        allowedActions: ['query', 'createTask'],
        approvalRequiredActions: ['createTask'],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: [] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
      {
        name: 'outreach',
        description: 'Outreach draft/enroll gateway.',
        endpoint: buildToolEndpoint(env, '/outreach', 'MOLT_OUTREACH_BASE_URL'),
        riskLevel: 'restricted',
        allowedActions: ['createDraft', 'enrollSequence'],
        approvalRequiredActions: ['enrollSequence'],
        inputSchema: {
          required: ['traceId', 'tool', 'action', 'input'],
          properties: { input: { required: [] } },
        },
        outputSchema: { required: ['traceId', 'status', 'output'] },
        timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
        retries: DEFAULT_TOOL_RETRIES,
      },
    ],
    approvalPolicy: {
      defaultWriteMode: 'draft_only',
      dangerousActionsRequireApproval: true,
    },
  };
}

function normalizeToolEntry(tool: any) {
  return {
    ...tool,
    allowedActions: Array.isArray(tool.allowedActions) ? tool.allowedActions : [],
    approvalRequiredActions: Array.isArray(tool.approvalRequiredActions) ? tool.approvalRequiredActions : [],
    inputSchema: tool.inputSchema || { required: ['traceId', 'tool', 'action', 'input'] },
    outputSchema: tool.outputSchema || { required: ['traceId', 'status', 'output'] },
    timeoutMs: Number.isFinite(tool.timeoutMs) ? tool.timeoutMs : DEFAULT_TOOL_TIMEOUT_MS,
    retries: Number.isFinite(tool.retries) ? tool.retries : DEFAULT_TOOL_RETRIES,
  };
}

export class ToolRegistry {
  env: any;
  config: any;

  constructor(env: any) {
    this.env = env;
    this.config = null;
  }

  async loadConfig() {
    const client = assertSanityConfigured(this.env);
    const query = '*[_type == "moltbot.config"] | order(_updatedAt desc)[0]';
    const result = await groqQuery(client, query);
    const fallback = buildDefaultConfig(this.env);

    if (!result) {
      this.config = fallback;
      return this.config;
    }

    const merged = {
      ...fallback,
      ...result,
      toolRegistry: Array.isArray(result.toolRegistry) && result.toolRegistry.length > 0
        ? result.toolRegistry
        : fallback.toolRegistry,
      approvalPolicy: {
        ...fallback.approvalPolicy,
        ...(result.approvalPolicy || {}),
      },
    };

    merged.toolRegistry = merged.toolRegistry.map(normalizeToolEntry);
    this.config = merged;
    return this.config;
  }

  getTool(name: string) {
    if (!this.config || !Array.isArray(this.config.toolRegistry)) return null;
    return this.config.toolRegistry.find((tool: any) => tool.name === name) || null;
  }
}

export function getDefaultToolRegistryConfig(env: any) {
  return buildDefaultConfig(env);
}
