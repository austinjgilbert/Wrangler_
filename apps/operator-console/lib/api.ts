import type {
  AccountDetail,
  AgentDefinition,
  ConsoleSnapshot,
  CopilotQueryResult,
  CopilotState,
  FunctionDefinition,
} from './types';

// ── Worker connection config ────────────────────────────────────────────────
// When running inside Next.js (localhost / Vercel), API calls go through the
// Next.js proxy routes at /api/console/*.  When the app is loaded as a Sanity
// Application on sanity.io there is no Next.js server, so we call the
// Cloudflare Worker directly.  The detection is automatic: if the page origin
// is *not* localhost and NEXT_PUBLIC_WORKER_URL is set we go direct.

function resolveEndpoint(proxyPath: string, workerPath: string): string {
  const workerUrl = typeof window !== 'undefined'
    ? (window as any).__WORKER_URL ?? process.env.NEXT_PUBLIC_WORKER_URL
    : process.env.NEXT_PUBLIC_WORKER_URL;

  if (workerUrl) {
    // Direct-to-Worker mode (Sanity Application or any non-Next.js host)
    return `${workerUrl.replace(/\/$/, '')}${workerPath}`;
  }
  // Next.js proxy mode (local dev / Vercel)
  return proxyPath;
}

function authHeaders(): Record<string, string> {
  const key = typeof window !== 'undefined'
    ? (window as any).__WORKER_API_KEY ?? process.env.NEXT_PUBLIC_WORKER_API_KEY
    : process.env.NEXT_PUBLIC_WORKER_API_KEY;
  if (key) return { 'X-API-Key': key };
  return {};
}

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.message || 'Request failed');
  }
  return payload.data as T;
}

export async function fetchSnapshot(): Promise<ConsoleSnapshot> {
  return readJson<ConsoleSnapshot>(
    resolveEndpoint('/api/console/snapshot', '/operator/console/snapshot'),
    { cache: 'no-store' },
  );
}

export async function fetchAccountDetail(accountId: string): Promise<AccountDetail> {
  return readJson<AccountDetail>(
    resolveEndpoint(
      `/api/console/account/${encodeURIComponent(accountId)}`,
      `/operator/console/account/${encodeURIComponent(accountId)}`,
    ),
    { cache: 'no-store' },
  );
}

export async function runCommand(command: string, extra: Record<string, unknown> = {}) {
  return readJson<Record<string, unknown>>(
    resolveEndpoint('/api/console/command', '/operator/console/command'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command, ...extra }),
    },
  );
}

export async function runSimulation(input: { fixtureId?: string; domain?: string; signals?: string[] }) {
  return readJson<Record<string, unknown>>(
    resolveEndpoint('/api/console/simulate', '/operator/console/simulate'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export async function runDiagnostic(diagnosticId: string) {
  return readJson<Record<string, unknown>>(
    resolveEndpoint('/api/console/diagnostics', '/operator/console/diagnostics'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ diagnosticId }),
    },
  );
}

export async function fetchCopilotState(context: {
  section?: string;
  accountId?: string | null;
  accountName?: string | null;
}) {
  const base = resolveEndpoint('/api/console/copilot', '/operator/console/copilot');
  const url = new URL(base, window.location.origin);
  if (context.section) url.searchParams.set('section', context.section);
  if (context.accountId) url.searchParams.set('accountId', context.accountId);
  if (context.accountName) url.searchParams.set('accountName', context.accountName);
  return readJson<CopilotState>(url.toString(), { cache: 'no-store' });
}

export async function queryCopilot(prompt: string, context: Record<string, unknown> = {}) {
  return readJson<CopilotQueryResult>(
    resolveEndpoint('/api/console/copilot/query', '/operator/console/copilot/query'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, context }),
    },
  );
}

export async function explainCopilot(input: Record<string, unknown>) {
  return readJson<Record<string, unknown>>(
    resolveEndpoint('/api/console/copilot/explain', '/operator/console/copilot/explain'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export async function runCopilotAction(command: string, confirmed: boolean = false) {
  return readJson<Record<string, unknown>>(
    resolveEndpoint('/api/console/copilot/action', '/operator/console/copilot/action'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command, confirmed }),
    },
  );
}

export async function streamCopilotQuery(
  prompt: string,
  context: Record<string, unknown>,
  handlers: {
    onChunk: (chunk: string) => void;
    onResult: (result: CopilotQueryResult) => void;
  },
) {
  const endpoint = resolveEndpoint('/api/console/copilot/stream', '/operator/console/copilot/stream');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ prompt, context }),
  });

  if (!response.ok || !response.body) {
    throw new Error('Streaming query failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === 'message') {
        handlers.onChunk(String(event.chunk || ''));
      }
      if (event.type === 'result') {
        handlers.onResult(event.data as CopilotQueryResult);
      }
    }
  }
}

export async function fetchFunctionRegistry() {
  return readJson<{ functions: FunctionDefinition[]; grouped: Record<string, FunctionDefinition[]> }>(
    resolveEndpoint('/api/console/functions', '/operator/console/functions'),
    { cache: 'no-store' },
  );
}

export async function fetchAgentRegistry() {
  return readJson<{ agents: AgentDefinition[] }>(
    resolveEndpoint('/api/console/agents', '/operator/console/agents'),
    { cache: 'no-store' },
  );
}
