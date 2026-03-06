/**
 * LLM Client — supports Anthropic (Claude) and OpenAI-compatible APIs.
 *
 * Auto-detects provider from LLM_PROVIDER env var or from the base URL.
 *
 * Env vars:
 *   LLM_API_KEY       — Required. API key for the LLM provider.
 *   LLM_PROVIDER      — Optional. "anthropic" or "openai" (auto-detected from base URL if not set).
 *   LLM_BASE_URL      — Optional. Override the base URL.
 *                        Anthropic default: https://api.anthropic.com
 *                        OpenAI default:    https://api.openai.com/v1
 *   LLM_MODEL         — Optional. Model name.
 *                        Anthropic default: claude-sonnet-4-20250514
 *                        OpenAI default:    gpt-4o-mini
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

export interface LlmOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** When true, instruct the API to return JSON. */
  json?: boolean;
}

export interface LlmResult {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ─── Provider detection ─────────────────────────────────────────────────────

function detectProvider(env: any): 'anthropic' | 'openai' {
  const explicit = (env.LLM_PROVIDER || '').toLowerCase().trim();
  if (explicit === 'anthropic' || explicit === 'claude') return 'anthropic';
  if (explicit === 'openai' || explicit === 'groq' || explicit === 'together' || explicit === 'openrouter') return 'openai';

  const baseUrl = (env.LLM_BASE_URL || '').toLowerCase();
  if (baseUrl.includes('anthropic')) return 'anthropic';

  // If ANTHROPIC_API_KEY is set but LLM_API_KEY isn't, assume Anthropic
  if (env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY) return 'anthropic';

  return 'openai';
}

// ─── Anthropic Messages API ─────────────────────────────────────────────────

async function callAnthropic(
  env: any,
  messages: LlmMessage[],
  options: LlmOptions,
): Promise<LlmResult> {
  const apiKey = env.LLM_API_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('LLM not configured: set LLM_API_KEY (or ANTHROPIC_API_KEY) in env/secrets.');
  }

  const baseUrl = (env.LLM_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const model = options.model || env.LLM_MODEL || 'claude-sonnet-4-20250514';

  // Anthropic separates system from messages. Extract system message.
  let systemPrompt = '';
  const anthropicMessages: Array<{ role: string; content: any }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt += (typeof msg.content === 'string' ? msg.content : '') + '\n';
      continue;
    }

    // Convert content to Anthropic format
    if (typeof msg.content === 'string') {
      anthropicMessages.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      // Convert image_url blocks to Anthropic's image format
      const blocks: any[] = [];
      for (const part of msg.content) {
        if (part.type === 'text') {
          blocks.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const dataUrl = part.image_url.url;
          // Parse data URL: data:image/png;base64,<data>
          const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
          if (match) {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: match[1],
                data: match[2],
              },
            });
          } else {
            // URL-based image — Anthropic supports URL sources
            blocks.push({
              type: 'image',
              source: { type: 'url', url: dataUrl },
            });
          }
        }
      }
      anthropicMessages.push({ role: msg.role, content: blocks });
    }
  }

  // If json mode requested, add instruction to system prompt
  if (options.json) {
    systemPrompt += '\nYou MUST respond with valid JSON only. No text before or after the JSON object.';
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens || 4096,
    messages: anthropicMessages,
  };
  if (systemPrompt.trim()) {
    body.system = systemPrompt.trim();
  }
  if (options.temperature != null) {
    body.temperature = options.temperature;
  }

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${errorBody.slice(0, 500)}`);
  }

  const data = (await res.json()) as any;
  const textBlock = (data.content || []).find((b: any) => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('Anthropic returned empty response');
  }

  return {
    content: textBlock.text,
    model: data.model || model,
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

// ─── OpenAI-compatible API ──────────────────────────────────────────────────

async function callOpenAI(
  env: any,
  messages: LlmMessage[],
  options: LlmOptions,
): Promise<LlmResult> {
  const apiKey = env.LLM_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('LLM not configured: set LLM_API_KEY (or OPENAI_API_KEY) in env/secrets.');
  }

  const baseUrl = (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = options.model || env.LLM_MODEL || 'gpt-4o-mini';

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.json) body.response_format = { type: 'json_object' };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${errorBody.slice(0, 500)}`);
  }

  const data = (await res.json()) as any;
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('LLM returned empty response');
  }

  return {
    content: choice.message.content,
    model: data.model || model,
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Call an LLM. Auto-detects Anthropic vs OpenAI from env vars.
 */
export async function callLlm(
  env: any,
  messages: LlmMessage[],
  options: LlmOptions = {},
): Promise<LlmResult> {
  const provider = detectProvider(env);
  if (provider === 'anthropic') {
    return callAnthropic(env, messages, options);
  }
  return callOpenAI(env, messages, options);
}

/**
 * Extract text from a screenshot image by sending it to a vision-capable model.
 */
export async function extractTextFromImage(
  env: any,
  imageDataUrl: string,
): Promise<string> {
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content:
        'You are an OCR assistant. Extract all readable text from the provided screenshot image. ' +
        'Preserve structure (headings, bullets, tables become plain text). ' +
        'If the image contains no text, respond with "No text found."',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract all text from this screenshot:' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];

  const visionModel = env.LLM_VISION_MODEL || env.LLM_MODEL || undefined;

  const result = await callLlm(env, messages, {
    model: visionModel,
    temperature: 0,
    maxTokens: 2000,
  });

  return result.content;
}
