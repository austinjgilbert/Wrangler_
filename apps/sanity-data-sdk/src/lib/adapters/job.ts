/**
 * Job adapter — transforms backend osintJob/enrichmentJob documents into UI Job type.
 */

import type { Job } from './types';

const STAGE_LABELS: Record<number, string> = {
  0: 'Queued',
  1: 'Scanning website...',
  2: 'Discovering pages...',
  3: 'Crawling content...',
  4: 'Extracting evidence...',
  5: 'Enriching LinkedIn...',
  6: 'Generating brief...',
  7: 'Verifying claims...',
};

function getStageLabel(stageNumber: number): string {
  return STAGE_LABELS[stageNumber] ?? 'Processing...';
}

/**
 * Normalize backend job status to UI status.
 * Live API returns: done, in_progress, pending (confirmed by L4 smoke test).
 * Some paths also return: queued, running, complete, failed, not_started.
 * This map normalizes ALL known values to UI enum.
 */
type UIJobStatus = Job['status'];
const JOB_STATUS_MAP: Record<string, UIJobStatus> = {
  // Live API values (confirmed by smoke test)
  done:         'complete',
  in_progress:  'running',
  pending:      'queued',
  failed:       'failed',
  // Legacy/alternate values (defensive)
  queued:       'queued',
  running:      'running',
  complete:     'complete',
  completed:    'complete',
  not_started:  'queued',
};

function normalizeJobStatus(raw: string | undefined): UIJobStatus {
  if (!raw) return 'queued';
  return JOB_STATUS_MAP[raw] ?? 'queued';
}

/**
 * Derive progress from status when the API doesn't return a numeric progress.
 * /enrich/jobs returns no progress field — only /enrich/status does.
 * Phase 2: merge /enrich/status per active job for real-time progress.
 */
function deriveProgress(status: UIJobStatus, rawProgress: number | undefined): number {
  if (rawProgress != null) return rawProgress;
  switch (status) {
    case 'complete': return 100;
    case 'running':  return 50;
    case 'failed':   return 100;
    case 'queued':   return 0;
    default:         return 0;
  }
}

/**
 * Derive which UI module a job belongs to based on its type/mode.
 * Uses CANONICAL module keys (post-rename).
 */
function deriveModuleKey(job: BackendJob): string {
  const mode = job.mode || job.jobType || '';
  switch (mode) {
    case 'deep':
    case 'standard':
    case 'restart':
      return 'research';
    case 'competitors':
      return 'competitors';
    case 'linkedin':
      return 'people';       // ← FIX #5: was 'linkedin'
    case 'gap-fill':
      return 'approach';     // ← FIX #5: was 'gaps'
    default:
      return 'research';
  }
}

/**
 * Extract accountKey from entityId.
 * Bulk /enrich/jobs returns entityId = "account-{accountKey}" — strip the prefix.
 * Filtered /enrich/jobs?accountKey=x returns accountKey directly (no entityId).
 */
function extractAccountKey(entityId: string | undefined): string {
  if (!entityId) return '';
  return entityId.startsWith('account-') ? entityId.slice(8) : entityId;
}

/** Raw backend job document (subset of fields we use). */
export interface BackendJob {
  _id: string;
  accountKey?: string;
  entityId?: string;            // Bulk endpoint: "account-{accountKey}". Use extractAccountKey().
  stage?: number;
  progress?: number;            // Only present from /enrich/status, not /enrich/jobs
  status?: string;              // Raw status — normalized by JOB_STATUS_MAP
  startedAt?: string;
  _createdAt?: string;          // Sanity system field — fallback for startedAt
  estimatedSeconds?: number;
  mode?: string;
  jobType?: string;
  goal?: string;                // Job goal — can derive module from this
  scope?: string;               // Job scope
  advanceError?: string;        // Error message when enrichment is stuck
}

export function transformJob(backendJob: BackendJob, accountName: string): Job {
  if (!backendJob._id) {
    throw new Error('transformJob: missing _id');
  }

  const status = normalizeJobStatus(backendJob.status);
  const stageNumber = backendJob.stage ?? 0;

  return {
    id: backendJob._id,
    accountKey: backendJob.accountKey || extractAccountKey(backendJob.entityId),
    accountName,
    label: `🔬 ${accountName}`,
    moduleKey: deriveModuleKey(backendJob),
    progress: deriveProgress(status, backendJob.progress),
    status,
    stageNumber,
    stageLabel: getStageLabel(stageNumber),
    startedAt: backendJob.startedAt || backendJob._createdAt || new Date().toISOString(),
    estimatedSeconds: backendJob.estimatedSeconds,
    advanceError: backendJob.advanceError,
  };
}

export function transformJobs(
  backendJobs: BackendJob[],
  resolveAccountName: (accountKey: string) => string,
): Job[] {
  const jobs: Job[] = [];
  for (const job of backendJobs) {
    try {
      const key = job.accountKey || extractAccountKey(job.entityId);
      const name = resolveAccountName(key);
      jobs.push(transformJob(job, name));
    } catch (err) {
      console.warn('[adapters/job]', (err as Error).message);
    }
  }
  return jobs;
}

export function getStageLabels(): Readonly<Record<number, string>> {
  return STAGE_LABELS;
}
