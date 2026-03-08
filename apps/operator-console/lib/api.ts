import type {
  AccountDetail,
  AgentDefinition,
  ConsoleSnapshot,
  CopilotQueryResult,
  CopilotState,
  FunctionDefinition,
} from './types';

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.message || 'Request failed');
  }
  return payload.data as T;
}

export async function fetchSnapshot(): Promise<ConsoleSnapshot> {
  return readJson<ConsoleSnapshot>('/api/console/snapshot', {
    cache: 'no-store',
  });
}

export async function fetchAccountDetail(accountId: string): Promise<AccountDetail> {
  return readJson<AccountDetail>(`/api/console/account/${encodeURIComponent(accountId)}`, {
    cache: 'no-store',
  });
}

export async function runCommand(command: string, extra: Record<string, unknown> = {}) {
  return readJson<Record<string, unknown>>('/api/console/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      command,
      ...extra,
    }),
  });
}

export async function runSimulation(input: { fixtureId?: string; domain?: string; signals?: string[] }) {
  return readJson<Record<string, unknown>>('/api/console/simulate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function runDiagnostic(diagnosticId: string) {
  return readJson<Record<string, unknown>>('/api/console/diagnostics', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ diagnosticId }),
  });
}

export async function fetchCopilotState(context: {
  section?: string;
  accountId?: string | null;
  accountName?: string | null;
}) {
  const url = new URL('/api/console/copilot', window.location.origin);
  if (context.section) url.searchParams.set('section', context.section);
  if (context.accountId) url.searchParams.set('accountId', context.accountId);
  if (context.accountName) url.searchParams.set('accountName', context.accountName);
  return readJson<CopilotState>(url.toString(), {
    cache: 'no-store',
  });
}

export async function queryCopilot(prompt: string, context: Record<string, unknown> = {}) {
  return readJson<CopilotQueryResult>('/api/console/copilot/query', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prompt, context }),
  });
}

export async function explainCopilot(input: Record<string, unknown>) {
  return readJson<Record<string, unknown>>('/api/console/copilot/explain', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function runCopilotAction(command: string, confirmed: boolean = false) {
  return readJson<Record<string, unknown>>('/api/console/copilot/action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ command, confirmed }),
  });
}

export async function streamCopilotQuery(
  prompt: string,
  context: Record<string, unknown>,
  handlers: {
    onChunk: (chunk: string) => void;
    onResult: (result: CopilotQueryResult) => void;
  },
) {
  const response = await fetch('/api/console/copilot/stream', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
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
  return readJson<{ functions: FunctionDefinition[]; grouped: Record<string, FunctionDefinition[]> }>('/api/console/functions', {
    cache: 'no-store',
  });
}

export async function fetchAgentRegistry() {
  return readJson<{ agents: AgentDefinition[] }>('/api/console/agents', {
    cache: 'no-store',
  });
}
