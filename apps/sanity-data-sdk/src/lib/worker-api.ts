/**
 * Worker API client for DataViewer SDK app.
 * Uses SDK app env for enrichment, snapshot, and live data.
 */

import { getWorkerConfigMessage, hasWorkerConfig, WORKER_API_KEY, WORKER_URL } from './app-env';

export function getWorkerUrl(): string {
  return WORKER_URL;
}

function assertWorkerConfig(action: string): void {
  const message = getWorkerConfigMessage(action);
  if (message) {
    throw new Error(message);
  }
}

/**
 * URL to fetch research set for an account (for "View research" link).
 * NOTE: This is the ONE place query-string auth is still used — it's a direct
 * browser navigation (<a href>), so we can't set headers. The Worker still
 * accepts ?apiKey= for backward compat. Phase 2: replace with a short-lived
 * token or proxy through the SDK app.
 */
export function getResearchSetUrl(accountKey: string): string {
  if (getWorkerConfigMessage('open research')) return '#';
  const url = new URL(`${WORKER_URL}/enrich/research`);
  url.searchParams.set('accountKey', accountKey);
  if (WORKER_API_KEY) url.searchParams.set('apiKey', WORKER_API_KEY);
  return url.toString();
}

export function hasWorker(): boolean {
  return hasWorkerConfig();
}

/** Check worker reachability (e.g. for diagnostic display). */
export async function fetchWorkerHealth(): Promise<boolean> {
  if (!hasWorkerConfig()) return false;
  try {
    const res = await fetch(`${WORKER_URL}/health`, { method: 'GET', headers: workerHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

export interface SnapshotResponse {
  ok?: boolean;
  data?: {
    overview?: {
      intelligenceStatus?: {
        accountsIndexed?: number;
        peopleIndexed?: number;
        signalsToday?: number;
        activeOpportunities?: number;
        systemCompletion?: number;
      };
    };
    entities?: {
      accounts?: Array<{
        id: string;
        name: string;
        domain: string | null;
        completion: number;
        opportunityScore: number;
        missing?: string[];
        nextStages?: string[];
        technologies?: string[];
      }>;
      people?: Array<{ id: string; name: string; title?: string | null; accountName?: string | null }>;
    };
    signals?: {
      recent?: Array<{
        id: string;
        signalType: string;
        accountName: string;
        timestamp: string;
        source?: string;
        uncertaintyState?: string;
      }>;
    };
    jobs?: {
      running?: number;
      queued?: number;
      recent?: Array<{
        id: string;
        jobType?: string;
        targetEntity?: string | null;
        status?: string;
        updatedAt?: string;
        currentStage?: string | number | null;
        error?: string | null;
      }>;
    };
  };
}

function workerHeaders(options?: { includeJsonContentType?: boolean }): Record<string, string> {
  const h: Record<string, string> = {};
  if (options?.includeJsonContentType) {
    h['Content-Type'] = 'application/json';
  }
  // Always send API key via header (never query string — keys in URLs leak via
  // server logs, browser history, Referer headers). See: security Finding 8.
  if (WORKER_API_KEY) {
    h['X-API-Key'] = WORKER_API_KEY;
  }
  return h;
}

async function parseWorkerJson<T>(request: Promise<Response>, fallbackMessage: string): Promise<{ response: Response; json: T }> {
  let response: Response;
  try {
    response = await request;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`${fallbackMessage}. Network request to worker failed (${msg}). Check VITE_WORKER_URL and CORS.`);
  }

  const json: T = await response.json().catch(() => ({}) as T);
  if (response.status === 401) {
    const err = (json as { error?: { message?: string } })?.error?.message;
    throw new Error(err || `${fallbackMessage}. Worker returned 401. Set VITE_WORKER_API_KEY in .env if the worker requires auth.`);
  }
  return { response, json };
}

export async function fetchSnapshot(): Promise<SnapshotResponse['data']> {
  assertWorkerConfig('load dashboard data');
  const { response, json } = await parseWorkerJson<SnapshotResponse>(
    fetch(`${WORKER_URL}/operator/console/snapshot?surface=sdk`, { headers: workerHeaders() }),
    'Failed to load dashboard snapshot'
  );
  if (!response.ok) {
    const err = (json as { error?: { message?: string } })?.error?.message || `Snapshot failed: ${response.status}`;
    throw new Error(err);
  }
  return (json as SnapshotResponse)?.data ?? (json as Record<string, unknown>);
}

export async function fetchEnrichStatus(accountKey: string): Promise<{
  status?: string;
  progress?: number;
  currentStage?: string;
  jobId?: string;
  completedAt?: string;
}> {
  assertWorkerConfig('load enrichment status');
  const { response, json } = await parseWorkerJson<{ data?: { status?: unknown }; status?: unknown }>(
    fetch(
      `${WORKER_URL}/enrich/status?accountKey=${encodeURIComponent(accountKey)}`,
      { headers: workerHeaders() }
    ),
    'Failed to load enrichment status'
  );
  if (!response.ok) return {};
  const status = json?.data?.status ?? json?.status;
  return typeof status === 'object' && status !== null ? (status as Record<string, unknown>) : { status: status as string | undefined };
}

export async function advanceEnrichment(accountKey: string): Promise<{
  status?: string;
  progress?: number;
  currentStage?: string;
  jobId?: string;
  completedAt?: string;
  advanceError?: string;
}> {
  assertWorkerConfig('advance enrichment');
  const { response, json } = await parseWorkerJson<{ data?: { status?: unknown }; status?: unknown }>(
    fetch(`${WORKER_URL}/enrich/advance`, {
      method: 'POST',
      headers: workerHeaders({ includeJsonContentType: true }),
      body: JSON.stringify({ accountKey }),
    }),
    'Failed to advance enrichment'
  );
  if (!response.ok) return {};
  const status = json?.data?.status ?? json?.status;
  return typeof status === 'object' && status !== null ? (status as Record<string, unknown>) : { status: status as string | undefined };
}

export async function queueEnrichment(params: {
  accountId?: string;
  accountKey: string;
  canonicalUrl?: string;
  stages?: string[];
  mode?: 'standard' | 'restart' | 'deep';
  options?: {
    maxDepth?: number;
    budget?: number;
    includeLinkedIn?: boolean;
    includeBrief?: boolean;
    includeVerification?: boolean;
  };
  selfHeal?: boolean;
}): Promise<{ ok?: boolean; jobId?: string; message?: string }> {
  assertWorkerConfig('queue enrichment');
  const { response, json } = await parseWorkerJson<{ ok?: boolean; data?: { queued?: boolean; jobId?: string; message?: string }; jobId?: string; message?: string }>(
    fetch(`${WORKER_URL}/enrich/queue`, {
      method: 'POST',
      headers: workerHeaders({ includeJsonContentType: true }),
      body: JSON.stringify({
        accountId: params.accountId,
        accountKey: params.accountKey,
        canonicalUrl: params.canonicalUrl,
        requestedStages: params.stages,
        mode: params.mode || 'standard',
        options: params.options,
        selfHeal: params.selfHeal !== false,
      }),
    }),
    'Failed to queue enrichment'
  );
  return {
    ok: response.ok && (json?.ok === true || json?.data?.queued === true),
    jobId: json?.data?.jobId ?? json?.jobId,
    message: json?.data?.message ?? json?.message,
  };
}
