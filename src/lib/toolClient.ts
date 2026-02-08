/**
 * MoltBot Tool Client
 * Calls registered tools with trace propagation, retries, and validation.
 */

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, options: any, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateRequiredFields(schema: any, data: any, label: string) {
  if (!schema || !Array.isArray(schema.required)) return;
  for (const key of schema.required) {
    if (data == null || !(key in data)) {
      throw new Error(`${label} is missing required field: ${key}`);
    }
  }
}

function validateNestedFields(schema: any, data: any, label: string) {
  if (!schema || !schema.properties) return;
  for (const [key, subSchema] of Object.entries(schema.properties)) {
    if (data && data[key] != null && subSchema && Array.isArray((subSchema as any).required)) {
      validateRequiredFields(subSchema, data[key], `${label}.${key}`);
    }
  }
}

function validateSchema(schema: any, data: any, label: string) {
  validateRequiredFields(schema, data, label);
  validateNestedFields(schema, data, label);
}

function buildToolResponse(traceId: string, output: any, status = 'ok', extras: any = {}) {
  return {
    traceId,
    status,
    output,
    ...extras,
  };
}

export class ToolClient {
  toolRegistry: any;

  constructor(toolRegistry: any) {
    this.toolRegistry = toolRegistry;
  }

  async callStub(request: any) {
    const traceId = request?.traceId || `trace-${Date.now()}`;
    const tool = request?.tool;
    const action = request?.action;
    const input = request?.input || {};

    switch (tool) {
      case 'gmail':
        if (action === 'read') {
          return buildToolResponse(traceId, { messages: [], query: input.query || null });
        }
        if (action === 'draft') {
          return buildToolResponse(traceId, { draftId: `gmail-draft-${Date.now()}`, status: 'draft', ...input });
        }
        if (action === 'send') {
          return buildToolResponse(traceId, { messageId: `gmail-msg-${Date.now()}`, status: 'sent', ...input });
        }
        break;
      case 'calendar':
        if (action === 'read') {
          return buildToolResponse(traceId, { events: [], range: input.range || null });
        }
        if (action === 'proposeEvent') {
          return buildToolResponse(traceId, { proposalId: `cal-proposal-${Date.now()}`, status: 'draft', ...input });
        }
        if (action === 'createEvent') {
          return buildToolResponse(traceId, { eventId: `cal-event-${Date.now()}`, status: 'created', ...input });
        }
        break;
      case 'slack':
        if (action === 'draft') {
          return buildToolResponse(traceId, { draftId: `slack-draft-${Date.now()}`, status: 'draft', ...input });
        }
        if (action === 'post') {
          return buildToolResponse(traceId, { ts: `${Date.now()}`, status: 'posted', ...input });
        }
        break;
      case 'webSearch':
        return buildToolResponse(traceId, { results: [], query: input.query || '' }, 'ok', { citations: [] });
      case 'summarize':
        return buildToolResponse(traceId, { summary: `Summary placeholder for ${input.source || 'source'}` }, 'ok');
      case 'memorySearch':
        return buildToolResponse(traceId, { matches: [], query: input.query || '' }, 'ok');
      case 'whisperTranscribe':
        return buildToolResponse(traceId, { transcript: 'Transcript placeholder', durationSec: 0 }, 'ok');
      case 'github':
        return buildToolResponse(traceId, { status: 'queued', ...input }, 'queued');
      case 'wrangler':
        return buildToolResponse(traceId, { response: 'Wrangler response placeholder', prompt: input.prompt }, 'ok');
      case 'research':
        return buildToolResponse(traceId, 'Research output placeholder', 'ok');
      case 'salesforce':
        if (action === 'query') {
          return buildToolResponse(traceId, { records: [], totalSize: 0 }, 'ok');
        }
        if (action === 'createTask') {
          return buildToolResponse(traceId, { id: 'sf-task-stub', status: 'draft' }, 'ok');
        }
        break;
      case 'outreach':
        if (action === 'createDraft') {
          return buildToolResponse(traceId, { id: 'outreach-draft-stub', status: 'draft' }, 'ok');
        }
        if (action === 'enrollSequence') {
          return buildToolResponse(traceId, { id: 'outreach-enroll-stub', status: 'enrolled' }, 'ok');
        }
        break;
      default:
        break;
    }

    throw new Error(`Tool endpoint not configured for: ${tool}.${action || 'unknown'}`);
  }

  async callTool(request: any, options: any = {}) {
    const toolName = request?.tool;
    const action = request?.action;
    if (!toolName || !action) {
      throw new Error('Tool request must include tool and action');
    }

    let tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      tool = this.toolRegistry.getTool(`${toolName}.${action}`);
    }
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    if (Array.isArray(tool.allowedActions) && tool.allowedActions.length > 0) {
      if (!tool.allowedActions.includes(action)) {
        throw new Error(`Action not allowed for tool: ${toolName}.${action}`);
      }
    }

    const traceId = request?.traceId || options.traceId || `trace-${Date.now()}`;
    const requestPayload = {
      traceId,
      tool: toolName,
      action,
      input: request.input || {},
      contextRefs: request.contextRefs || [],
      desiredOutput: request.desiredOutput || null,
    };

    validateSchema(tool.inputSchema, requestPayload, `tool:${toolName}.request`);

    if (!tool.endpoint) {
      return await this.callStub(requestPayload);
    }

    const timeoutMs = options.timeoutMs || tool.timeoutMs || 15000;
    const retries = Number.isFinite(options.retries) ? options.retries : (tool.retries || 0);

    let lastError: any = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchWithTimeout(tool.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Trace-Id': traceId,
          },
          body: JSON.stringify(requestPayload),
        }, timeoutMs);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Tool ${toolName} error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        validateSchema(tool.outputSchema, result, `tool:${toolName}.response`);

        if (result.traceId && result.traceId !== traceId) {
          throw new Error(`Tool ${toolName} traceId mismatch`);
        }

        return result;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await sleep(200 * (attempt + 1));
        }
      }
    }

    throw lastError || new Error(`Tool ${toolName} failed`);
  }
}
