/**
 * Research / Enrichment adapter.
 *
 * Replaces direct worker-api.ts calls in EnrichmentView.tsx with the
 * standard fetch-worker.ts adapter layer (header-based auth, typed responses).
 *
 * Migration: EnrichmentView.tsx should import from here (or from adapters/index.ts)
 * instead of from '../lib/worker-api'.
 *
 * @see worker-api.ts (deprecated — query-string auth, no typed responses)
 */

import { workerGet, workerPost, WorkerApiError } from './fetch-worker';
import { hasWorkerConfig, WORKER_URL, WORKER_API_KEY } from '../app-env';

// ─── Types ──────────────────────────────────────────────────────────────

export interface EnrichStatus {
  status?: string;
  progress?: number;
  currentStage?: string;
  jobId?: string;
  completedAt?: string;
}

export interface QueueEnrichmentParams {
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
}

export interface QueueEnrichmentResult {
  ok: boolean;
  jobId?: string;
  message?: string;
}

// ─── Adapter Functions ──────────────────────────────────────────────────

/**
 * Check if the Worker is configured and reachable.
 */
export function hasWorker(): boolean {
  return hasWorkerConfig();
}

/**
 * Check Worker reachability via /health endpoint.
 */
export async function fetchWorkerHealth(): Promise<boolean> {
  if (!hasWorkerConfig()) return false;
  try {
    await workerGet<{ ok: boolean }>('/health');
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch enrichment status for an account.
 *
 * Worker response shape: { ok: true, data: { status: { status, progress, currentStage, ... } } }
 */
export async function fetchEnrichStatus(accountKey: string): Promise<EnrichStatus> {
  if (!hasWorkerConfig()) return {};
  try {
    const response = await workerGet<{ status?: EnrichStatus }>(
      `/enrich/status?accountKey=${encodeURIComponent(accountKey)}`,
    );
    const status = response.data?.status;
    return typeof status === 'object' && status !== null ? status : { status: status as string | undefined };
  } catch {
    return {};
  }
}

/**
 * Advance enrichment by one stage for an account.
 */
export async function advanceEnrichment(accountKey: string): Promise<EnrichStatus> {
  if (!hasWorkerConfig()) return {};
  try {
    const response = await workerPost<{ status?: EnrichStatus }>(
      '/enrich/advance',
      { accountKey },
    );
    const status = response.data?.status;
    return typeof status === 'object' && status !== null ? status : { status: status as string | undefined };
  } catch {
    return {};
  }
}

/**
 * Queue enrichment for an account.
 */
export async function queueEnrichment(params: QueueEnrichmentParams): Promise<QueueEnrichmentResult> {
  try {
    const response = await workerPost<{
      queued?: boolean;
      jobId?: string;
      message?: string;
    }>('/enrich/queue', {
      accountId: params.accountId,
      accountKey: params.accountKey,
      canonicalUrl: params.canonicalUrl,
      requestedStages: params.stages,
      mode: params.mode || 'standard',
      options: params.options,
      selfHeal: params.selfHeal !== false,
    });
    return {
      ok: response.ok && (response.data?.queued === true),
      jobId: response.data?.jobId,
      message: response.data?.message,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof WorkerApiError ? `Worker error: ${err.status}` : 'Failed to queue enrichment',
    };
  }
}

/**
 * Build URL for "View research" link.
 *
 * NOTE: This is the ONE place where query-string auth is still used — it's a
 * direct browser navigation (<a href>), so we can't set headers. The Worker
 * still accepts ?apiKey= for backward compat.
 *
 * TODO(Phase 3): Replace with a short-lived token or proxy through the SDK app.
 */
export function getResearchSetUrl(accountKey: string): string {
  if (!hasWorkerConfig()) return '#';
  const url = new URL(`${WORKER_URL}/enrich/research`);
  url.searchParams.set('accountKey', accountKey);
  if (WORKER_API_KEY) url.searchParams.set('apiKey', WORKER_API_KEY);
  return url.toString();
}
