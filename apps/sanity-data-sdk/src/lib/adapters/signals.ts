/**
 * signals.ts — Signal data adapter.
 *
 * Signals do NOT exist as standalone Sanity documents (the `signal` type
 * has 0 docs in production). Signal data comes from two sources:
 *
 *   1. Worker snapshot: /operator/console/snapshot → signals.recent[]
 *      (system-wide, computed from various enrichment sources)
 *
 *   2. Account-level: account.signals[] (string arrays per account)
 *      (flat text, no structured fields — Phase 2 will add typed signal docs)
 *
 * This adapter provides a single fetch function for the Worker snapshot
 * signals, replacing the dead `useDocuments({ documentType: 'signal' })`
 * calls on Dashboard, Activity, and AccountExplorer pages.
 *
 * See: DB-1, AE-1, AV-1 in data-query-audit
 */

import { workerGet } from './fetch-worker';

// ── Types ───────────────────────────────────────────────────────────

export interface WorkerSignal {
  id: string;
  signalType: string;
  accountId: string | null;   // Sanity _ref (e.g., "account.abc123") — matches Account._id
  accountName: string;        // Display only — do NOT use for matching (brittle)
  timestamp: string;
  source?: string;
  summary?: string;
  uncertaintyState?: string;
}

interface SnapshotResponse {
  signals: {
    recent: WorkerSignal[];
  };
}

// ── Fetch ───────────────────────────────────────────────────────────

/**
 * Fetch recent signals from the Worker snapshot endpoint.
 * Returns an empty array on failure — signals are supplementary,
 * not critical to page load.
 */
export async function fetchRecentSignals(): Promise<WorkerSignal[]> {
  try {
    const res = await workerGet<SnapshotResponse>('/operator/console/snapshot');
    const recent = res.data?.signals?.recent;
    if (!Array.isArray(recent)) return [];
    return recent;
  } catch {
    return [];
  }
}

// ── Display Helpers ─────────────────────────────────────────────────

/** Count signals for a specific account by Sanity _id (exact match). */
export function countSignalsForAccount(signals: WorkerSignal[], accountId: string): number {
  return signals.filter((s) => s.accountId === accountId).length;
}
