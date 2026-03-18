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
  status?: 'queued' | 'running' | 'complete' | 'failed';
  startedAt?: string;
  estimatedSeconds?: number;
  mode?: string;
  jobType?: string;
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
    status: backendJob.status || 'queued',
    stageNumber,
    stageLabel: getStageLabel(stageNumber),
    startedAt: backendJob.startedAt || new Date().toISOString(),
    estimatedSeconds: backendJob.estimatedSeconds,
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
