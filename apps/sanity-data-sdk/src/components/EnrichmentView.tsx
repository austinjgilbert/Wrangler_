import { useDocuments } from '@sanity/sdk-react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  advanceEnrichment,
  fetchEnrichStatus,
  fetchWorkerHealth,
  getResearchSetUrl,
  hasWorker,
  queueEnrichment,
} from '../lib/worker-api';
import { getWorkerConfigMessage } from '../lib/app-env';
import { dedupeAccounts, getAccountDisplayName, getAccountDomainLabel } from '../lib/account-dedupe';
import {
  getAccountKeyFromId,
  getActiveJobAccountKeys,
  getJobAccountKey,
  getJobCanonicalUrl,
  getJobStatusLabel,
  getStageLabel,
  type ResearchAccountLike,
  type ResearchJobLike,
} from '../lib/research-jobs';

type JobDoc = {
  documentId: string;
  documentType: string;
  jobType?: string;
  accountKey?: string;
  targetEntity?: string | null;
  status?: string;
  currentStage?: string | number | null;
  updatedAt?: string;
  goalKey?: string;
};

type AccountDoc = {
  documentId: string;
  documentType: string;
  companyName?: string;
  name?: string;
  domain?: string | null;
  rootDomain?: string | null;
  canonicalUrl?: string | null;
};

function getAccountLabel(account: AccountDoc | null | undefined): string {
  return account ? getAccountDisplayName(account) : 'this account';
}

function getJobIntentLabel(job: JobDoc, accountMap: Map<string, AccountDoc>): string {
  const accountId = typeof job.targetEntity === 'string' && job.targetEntity.startsWith('account')
    ? job.targetEntity
    : null;
  const accountKey = getAccountKeyFromId(accountId) || job.accountKey || getAccountKeyFromId(job.targetEntity || undefined);
  const account =
    (accountId ? accountMap.get(accountId) : null)
    || (accountKey ? accountMap.get(`account-${accountKey}`) || accountMap.get(`account.${accountKey}`) : null);
  const accountLabel = getAccountLabel(account);
  return `Research and enrich ${accountLabel}`;
}

type LiveStatus = {
  jobId?: string;
  status?: string;
  progress?: number;
  currentStage?: string;
  advanceError?: string;
  selfHealingScheduled?: boolean;
  completedAt?: string;
};

export function EnrichmentView() {
  const [error, setError] = useState<string | null>(null);
  const [queuing, setQueuing] = useState<string | null>(null);
  const [workerStatus, setWorkerStatus] = useState<'checking' | 'ok' | 'unreachable'>('checking');

  useEffect(() => {
    if (!hasWorker()) {
      setWorkerStatus('unreachable');
      return;
    }
    let cancelled = false;
    fetchWorkerHealth().then((ok) => {
      if (!cancelled) setWorkerStatus(ok ? 'ok' : 'unreachable');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleQueue = async (
    accountKey: string,
    canonicalUrl: string,
    mode: 'standard' | 'restart' | 'deep' = 'standard'
  ) => {
    if (!hasWorker()) return;
    setQueuing(`${accountKey}:${mode}`);
    setError(null);
    try {
      const result = await queueEnrichment({
        accountKey,
        canonicalUrl,
        mode,
        selfHeal: true,
      });
      if (!result.ok) {
        setError(result.message || 'Failed to queue research');
        return;
      }
    } catch (error) {
      setError((error as Error)?.message || 'Failed to queue research');
    } finally {
      setQueuing(null);
    }
  };

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Research Pipeline</p>
          <h2>Research jobs</h2>
          <p className="detail-meta">
            Multi-stage research from Sanity. New runs ask the worker to fill gaps and self-heal. Use diagnostics per job to refresh status, advance one step, or rerun a job.
          </p>
          <p className="detail-meta worker-status" data-status={workerStatus}>
            Worker: {workerStatus === 'checking' ? 'Checking…' : workerStatus === 'ok' ? 'Reachable' : 'Unreachable — set VITE_WORKER_URL and check network'}
          </p>
        </div>
      </div>

      {!hasWorker() && (
        <div className="insight-section">
            <p className="detail-empty">{getWorkerConfigMessage('queue research')}</p>
        </div>
      )}

      {error && (
        <div className="insight-section">
          <p className="detail-empty">{error}</p>
        </div>
      )}

      <Suspense fallback={<div className="loading-state panel">Loading research jobs from Sanity…</div>}>
        <EnrichmentInner queuing={queuing} onQueue={handleQueue} workerStatus={workerStatus} />
      </Suspense>
    </section>
  );
}

function EnrichmentInner(props: {
  queuing: string | null;
  onQueue: (
    accountKey: string,
    canonicalUrl: string,
    mode?: 'standard' | 'restart' | 'deep'
  ) => Promise<void>;
  workerStatus: 'checking' | 'ok' | 'unreachable';
}) {
  const [liveStatusByKey, setLiveStatusByKey] = useState<Record<string, LiveStatus>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const jobsResult = useDocuments({
    documentType: 'enrich.job',
    batchSize: 50,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const accountsResult = useDocuments({
    documentType: 'account',
    batchSize: 50,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });

  const jobs = ((jobsResult.data || []) as JobDoc[]);
  const accounts = dedupeAccounts((accountsResult.data || []) as AccountDoc[]);
  const accountMap = new Map(accounts.map((account) => [account.documentId, account as ResearchAccountLike]));
  const running = jobs.filter((job) => job.status === 'in_progress').length;
  const queued = jobs.filter((job) => job.status === 'pending' || job.status === 'queued').length;
  const activeAccountKeys = useMemo(() => getActiveJobAccountKeys(jobs as ResearchJobLike[]), [jobs]);

  const refreshJobStatus = useCallback(async (accountKey: string) => {
    if (!hasWorker()) return;
    setLoadingKey((k) => k || accountKey);
    try {
      const status = await fetchEnrichStatus(accountKey);
      setLiveStatusByKey((prev) => ({ ...prev, [accountKey]: status as LiveStatus }));
    } finally {
      setLoadingKey((k) => (k === accountKey ? null : k));
    }
  }, []);

  const advanceJob = useCallback(async (accountKey: string) => {
    if (!hasWorker()) return;
    setLoadingKey((k) => k || accountKey);
    try {
      const status = await advanceEnrichment(accountKey);
      setLiveStatusByKey((prev) => ({ ...prev, [accountKey]: status as LiveStatus }));
    } finally {
      setLoadingKey((k) => (k === accountKey ? null : k));
    }
  }, []);

  useEffect(() => {
    if (!hasWorker() || props.workerStatus !== 'ok' || activeAccountKeys.length === 0) {
      return;
    }

    let cancelled = false;
    const pollStatuses = async () => {
      const results = await Promise.all(
        activeAccountKeys.map(async (accountKey) => {
          try {
            return [accountKey, (await fetchEnrichStatus(accountKey)) as LiveStatus] as const;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;

      setLiveStatusByKey((prev) => {
        const next = { ...prev };
        for (const result of results) {
          if (!result) continue;
          const [accountKey, status] = result;
          next[accountKey] = status;
        }
        return next;
      });
    };

    pollStatuses();
    const intervalId = window.setInterval(pollStatuses, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeAccountKeys, props.workerStatus]);

  return (
    <>
      <div className="insight-section">
        <div className="section-header">
          <h3>Recent jobs</h3>
          <span className="section-meta">
            {running} running · {queued} queued
          </span>
        </div>
        {(running > 0 || queued > 0) && (
          <p className="muted" style={{ marginBottom: 12 }}>
            Running jobs refresh automatically. Use refresh or advance only if a job looks stuck.
          </p>
        )}
        <div className="job-list">
          {jobs.length === 0 ? (
            <p className="muted">No jobs yet. Queue research for an account.</p>
          ) : (
            jobs.map((job) => {
              const accountKey = getJobAccountKey(job);
              const canonicalUrl = getJobCanonicalUrl(job, accountMap);
              const live = accountKey ? liveStatusByKey[accountKey] : null;
              const isBusy = accountKey && loadingKey === accountKey;
              return (
                <div className="job-card job-card-with-diagnostic" key={job.documentId}>
                  <div className="job-card-summary">
                    <strong>{getJobIntentLabel(job, accountMap)}</strong>
                    <span>
                      {live?.currentStage != null
                        ? getStageLabel(live.currentStage)
                        : job.currentStage != null
                          ? getStageLabel(job.currentStage)
                          : 'Waiting to start'}
                    </span>
                    <span className={`job-status status-${(live?.status ?? job.status) ?? 'queued'}`}>
                      {getJobStatusLabel(live?.status ?? job.status)}
                    </span>
                    {(live?.progress != null && live.progress < 100) && (
                      <span className="job-stage">Progress: {live.progress}%</span>
                    )}
                  </div>
                  <div className="job-card-diagnostic">
                    <div className="job-diagnostic-row">
                      <span className="job-diagnostic-meta">
                        Job ID: {live?.jobId ?? job.documentId}
                        {job.goalKey != null && ` · ${String(job.goalKey)}`}
                      </span>
                      {live?.advanceError && (
                        <span className="job-error">Error: {live.advanceError}</span>
                      )}
                      {live?.selfHealingScheduled && (
                        <span className="job-diagnostic-meta">Self-heal scheduled</span>
                      )}
                    </div>
                    {accountKey && (
                      <div className="job-diagnostic-actions">
                        <button
                          type="button"
                          className="btn btn--enrich"
                          disabled={!hasWorker() || isBusy || props.workerStatus !== 'ok'}
                          onClick={() => refreshJobStatus(accountKey)}
                        >
                          {isBusy ? '…' : 'Refresh status'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--enrich"
                          disabled={!hasWorker() || isBusy || props.workerStatus !== 'ok'}
                          onClick={() => advanceJob(accountKey)}
                        >
                          Advance step
                        </button>
                        <button
                          type="button"
                          className="btn btn--enrich"
                          disabled={!hasWorker() || props.queuing !== null}
                          onClick={() => props.onQueue(accountKey, canonicalUrl, 'restart')}
                        >
                          Run again
                        </button>
                        <button
                          type="button"
                          className="btn btn--enrich"
                          disabled={!hasWorker() || props.queuing !== null}
                          onClick={() => props.onQueue(accountKey, canonicalUrl, 'deep')}
                        >
                          Deep research
                        </button>
                        {((live?.status === 'complete') || job.status === 'complete') && (
                          <a
                            href={getResearchSetUrl(accountKey)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn--enrich view-research-link"
                          >
                            View research
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="insight-section">
        <div className="section-header">
          <h3>Queue by account</h3>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Accounts loaded directly from Sanity. Queue research through the worker.
        </p>
        <div className="queue-account-list">
          {accounts.length === 0 ? (
            <p className="muted">No accounts found in Sanity.</p>
          ) : (
            accounts.slice(0, 30).map((account) => {
              const accountId = account.documentId;
              const accountKey = getAccountKeyFromId(accountId) || accountId;
              const canonicalUrl =
                account.canonicalUrl
                || (account.domain ? `https://${account.domain.replace(/^https?:\/\//, '')}` : '')
                || (account.rootDomain ? `https://${account.rootDomain.replace(/^https?:\/\//, '')}` : '')
                || `https://${accountKey}`;

              return (
                <div className="queue-account-card" key={accountId}>
                  <strong>{getAccountLabel(account)}</strong>
                  <span>{getAccountDomainLabel(account) || 'Website not set'}</span>
                  <div className="queue-actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--enrich"
                      disabled={!hasWorker() || props.queuing === `${accountKey}:standard`}
                      onClick={() => props.onQueue(accountKey, canonicalUrl, 'standard')}
                    >
                      {props.queuing === `${accountKey}:standard` ? 'Queuing…' : 'Run research'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--enrich"
                      disabled={!hasWorker() || props.queuing === `${accountKey}:restart`}
                      onClick={() => props.onQueue(accountKey, canonicalUrl, 'restart')}
                    >
                      {props.queuing === `${accountKey}:restart` ? 'Queuing…' : 'Run again'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--enrich"
                      disabled={!hasWorker() || props.queuing === `${accountKey}:deep`}
                      onClick={() => props.onQueue(accountKey, canonicalUrl, 'deep')}
                    >
                      {props.queuing === `${accountKey}:deep` ? 'Queuing…' : 'Deep research'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
