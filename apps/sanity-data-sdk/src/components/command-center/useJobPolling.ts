/**
 * useJobPolling — Adaptive polling hook for enrichment job status.
 *
 * Adaptive intervals based on job count AND elapsed time:
 *   3s (1-2 jobs) → 5s (3-5) → 8s (5+)
 *   10s (>1min) → 15s (>3min) → 30s (>10min stuck)
 *
 * Key design decisions:
 *   - Ref pattern for ALL mutable values → poll() has zero deps, never recreated
 *   - inFlightRef guard prevents double-fire on mount
 *   - Visibility API pauses polling when tab is hidden
 *   - mergeStatus() for optimistic UI after action clicks
 *   - AbortController cleanup on unmount
 *
 * Performance budget: ≤6 req/min when idle
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job, ModuleActiveJob } from '../../lib/adapters';
import { transformJob, type BackendJob } from '../../lib/adapters';
import { workerGet } from '../../lib/adapters';

// ─── Interval Calculation ───────────────────────────────────────────────

function calculateInterval(activeCount: number, oldestStartedAt: string | null): number {
  // Duration-based escalation takes priority
  if (oldestStartedAt) {
    const elapsed = Date.now() - new Date(oldestStartedAt).getTime();
    if (elapsed > 10 * 60_000) return 30_000;  // >10 min → likely stuck
    if (elapsed > 3 * 60_000) return 15_000;
    if (elapsed > 60_000) return 10_000;
  }
  // Job-count based
  if (activeCount === 0) return 30_000;
  if (activeCount <= 2) return 3_000;
  if (activeCount <= 5) return 5_000;
  return 8_000;
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface UseJobPollingOptions {
  accountKeys: string[];
  resolveAccountName: (key: string) => string;
  workerStatus?: 'ok' | 'degraded' | 'down';
  enabled?: boolean;
}

export interface UseJobPollingResult {
  jobs: Job[];
  activeJobsByModule: Map<string, ModuleActiveJob>;
  polling: boolean;
  error: string | null;
  lastPollAt: number | null;
  refresh: () => void;
  mergeStatus: (moduleKey: string, status: ModuleActiveJob) => void;
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function useJobPolling({
  accountKeys,
  resolveAccountName,
  workerStatus = 'ok',
  enabled = true,
}: UseJobPollingOptions): UseJobPollingResult {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobsByModule, setActiveJobsByModule] = useState<Map<string, ModuleActiveJob>>(
    () => new Map(),
  );
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);

  // ── Refs for stable poll callback (FIX #1: no stale closures) ───────
  // All mutable values read from refs inside poll(), so poll() itself
  // has zero deps and never gets recreated. No teardown/restart cycle
  // on account switch. No stale keys in scheduled setTimeout callbacks.

  const accountKeysRef = useRef(accountKeys);
  accountKeysRef.current = accountKeys;

  const resolveRef = useRef(resolveAccountName);
  resolveRef.current = resolveAccountName;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const workerStatusRef = useRef(workerStatus);
  workerStatusRef.current = workerStatus;

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(true);
  const inFlightRef = useRef(false); // FIX #3: double-fire guard

  // ── Poll Function (stable — zero deps, reads from refs) ─────────────

  const poll = useCallback(async () => {
    // FIX #3: Skip if already in-flight (prevents double-fire on mount)
    if (inFlightRef.current) return;

    // Read all values from refs — never stale
    const keys = accountKeysRef.current;
    if (!enabledRef.current || keys.length === 0) return;
    if (workerStatusRef.current === 'down') return;
    if (!visibleRef.current) return;

    // Abort any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    inFlightRef.current = true;
    setPolling(true);
    setError(null);

    try {
      const params = keys.map(k => `accountKey=${encodeURIComponent(k)}`).join('&');
      const response = await workerGet<{ jobs: BackendJob[] }>(`/enrich/status?${params}`);

      if (controller.signal.aborted) return;

      const rawJobs = response.data?.jobs ?? [];
      const transformed = rawJobs
        .map(j => {
          try {
            return transformJob(j, resolveRef.current(j.accountKey || ''));
          } catch {
            return null;
          }
        })
        .filter((j): j is Job => j !== null);

      setJobs(transformed);
      setLastPollAt(Date.now());

      // Build module → activeJob map (new Map for React change detection)
      const moduleMap = new Map<string, ModuleActiveJob>();
      for (const job of transformed) {
        if (job.status === 'running' || job.status === 'queued') {
          const existing = moduleMap.get(job.moduleKey);
          if (!existing || job.progress > existing.progress) {
            moduleMap.set(job.moduleKey, {
              status: job.status,
              progress: job.progress,
              stageLabel: job.stageLabel,
            });
          }
        }
      }
      setActiveJobsByModule(moduleMap);

      // Calculate adaptive interval
      const activeJobs = transformed.filter(j => j.status === 'running' || j.status === 'queued');
      const oldestStart = activeJobs.length > 0
        ? activeJobs.reduce(
            (oldest, j) => (j.startedAt < oldest ? j.startedAt : oldest),
            activeJobs[0].startedAt,
          )
        : null;
      const interval = calculateInterval(activeJobs.length, oldestStart);
      timerRef.current = setTimeout(poll, interval);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to poll job status');
      timerRef.current = setTimeout(poll, 30_000);
    } finally {
      if (!controller.signal.aborted) {
        inFlightRef.current = false;
        setPolling(false);
      }
    }
  }, []); // Stable — zero deps, reads everything from refs

  // ── Visibility API ──────────────────────────────────────────────────

  useEffect(() => {
    const handleVisibility = () => {
      visibleRef.current = document.visibilityState === 'visible';
      if (visibleRef.current) {
        // Tab became visible — cancel scheduled poll and fire immediately
        if (timerRef.current) clearTimeout(timerRef.current);
        poll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [poll]);

  // ── Start/Stop Polling ──────────────────────────────────────────────
  // Since poll() is stable (zero deps), this effect only fires on
  // actual prop changes, not on every render.

  useEffect(() => {
    if (enabled && accountKeys.length > 0 && workerStatus !== 'down') {
      if (timerRef.current) clearTimeout(timerRef.current);
      poll();
    } else {
      // Disabled or no keys — stop polling, abort in-flight
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      inFlightRef.current = false;
    }

    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      inFlightRef.current = false;
    };
  }, [enabled, accountKeys, workerStatus, poll]);

  // ── Optimistic Merge ────────────────────────────────────────────────

  const mergeStatus = useCallback((moduleKey: string, status: ModuleActiveJob) => {
    setActiveJobsByModule(prev => {
      const next = new Map(prev);
      next.set(moduleKey, status);
      return next;
    });
  }, []);

  // ── Manual Refresh ──────────────────────────────────────────────────

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    inFlightRef.current = false; // Allow refresh even if guard is set
    poll();
  }, [poll]);

  return { jobs, activeJobsByModule, polling, error, lastPollAt, refresh, mergeStatus };
}
