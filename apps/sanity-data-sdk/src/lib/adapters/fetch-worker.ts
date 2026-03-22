/**
 * Worker API fetch utilities — all communication with the Cloudflare Worker.
 *
 * Every worker request goes through fetchFromWorker(), which handles:
 * - Base URL resolution
 * - API key injection (X-API-Key header)
 * - Error wrapping with WorkerApiError
 * - Response parsing
 */

// ─── Configuration ──────────────────────────────────────────────────────
// Re-use app-env.ts which handles placeholder detection, sanitization,
// and the ImportMeta type cast. WORKER_URL already strips trailing slashes.

import { WORKER_URL, WORKER_API_KEY } from '../app-env';

const WORKER_BASE_URL = WORKER_URL;

// ─── Error Type ─────────────────────────────────────────────────────────

export class WorkerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'WorkerApiError';
  }
}

// ─── Core Fetch ─────────────────────────────────────────────────────────

interface WorkerResponse<T> {
  ok: boolean;
  data: T;
  status: number;
}

async function fetchFromWorker<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<WorkerResponse<T>> {
  const url = `${WORKER_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(WORKER_API_KEY ? { 'X-API-Key': WORKER_API_KEY } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new WorkerApiError(
      `Worker API error: ${response.status} ${response.statusText}`,
      response.status,
      endpoint,
    );
  }

  // Worker endpoints return { ok: true, data: <payload> } (via createSuccessResponse).
  // Unwrap the Worker envelope so callers get the payload directly as T.
  // Exception: /health returns raw JSON without a data wrapper — but no caller
  // accesses .data on the health response, so this is safe.
  const json = await response.json() as { ok?: boolean; data?: T } & Record<string, unknown>;
  const data = (json.data !== undefined ? json.data : json) as T;
  return { ok: json.ok !== false, data, status: response.status };
}

// ─── Convenience Methods ────────────────────────────────────────────────

export async function workerGet<T>(endpoint: string): Promise<WorkerResponse<T>> {
  return fetchFromWorker<T>(endpoint, { method: 'GET' });
}

export async function workerPost<T>(endpoint: string, body: unknown): Promise<WorkerResponse<T>> {
  return fetchFromWorker<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
