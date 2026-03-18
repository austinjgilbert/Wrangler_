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
 * /enrich/jobs returns Sanity docs with 'queued'/'running'/'complete'/'failed'.
 * /enrich/status returns 'in_progress'/'not_started'/'complete'.
 * This map handles both.
 */
type UIJobStatus = Job['status'];
const JOB_STATUS_MAP: Record<string, UIJobStatus> = {
  queued:       'queued',
  running:      'running',
  complete:     'complete',
  failed:       'failed',
  in_progress:  'running',
  not_started:  'queued',
  completed:    'complete',   // defensive — some paths use past tense
};

function normalizeJobStatus(raw: string | undefined): UIJobStatus {
  if (!raw) return 'queued';
  return JOB_STATUS_MAP[raw] ?? 'queued';
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

/** Raw backend job document (subset of fields we use). */
export interface BackendJob {
  _id: string;
  accountKey?: string;
  stage?: number;
  progress?: number;
  status?: string;              // Raw status — normalized by JOB_STATUS_MAP
  startedAt?: string;
  estimatedSeconds?: number;
  mode?: string;
  jobType?: string;
  advanceError?: string;        // Error message when enrichment is stuck
}

export function transformJob(backendJob: BackendJob, accountName: string): Job {
  if (!backendJob._id) {
    throw new Error('transformJob: missing _id');
  }

  const stageNumber = backendJob.stage ?? 0;

  return {
    id: backendJob._id,
    accountKey: backendJob.accountKey || '',
    accountName,
    label: `🔬 ${accountName}`,
    moduleKey: deriveModuleKey(backendJob),
    progress: backendJob.progress ?? 0,
    status: normalizeJobStatus(backendJob.status),
    stageNumber,
    stageLabel: getStageLabel(stageNumber),
    startedAt: backendJob.startedAt || new Date().toISOString(),
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
      const name = resolveAccountName(job.accountKey || '');
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
