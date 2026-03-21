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
import { humanizeJobStatus, jobStatusCssClass } from '../lib/formatters';
import {
  getAccountKeyFromId,
  getActiveJobAccountKeys,
  getJobAccountKey,
  getJobCanonicalUrl,
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

function getAccountLabel(account: AccountDoc | ResearchAccountLike | null | undefined): string {
  return account ? getAccountDisplayName(account) : 'Unknown account';
}

function getJobIntentLabel(job: JobDoc, accountMap: Map<string, AccountDoc | ResearchAccountLike>): string {
  const accountId = typeof job.targetEntity === 'string' && job.targetEntity.startsWith('account')
    ? job.targetEntity
    : null;
  const accountKey = getAccountKeyFromId(accountId) || job.accountKey || getAccountKeyFromId(job.targetEntity || undefined);
  const account =
    (accountId ? accountMap.get(accountId) : null)
    || (accountKey ? accountMap.get(`account-${accountKey}`) || accountMap.get(`account.${accountKey}`) : null);
  const accountLabel = getAccountLabel(account);
  return `Research ${accountLabel}`;
}

function getStageDisplay(
  liveStage: string | number | null | undefined,
  jobStage: string | number | null | undefined,
  liveStatus: string | undefined,
  jobStatus: string | undefined,
): string {
  if (liveStage != null) {
    const label = getStageLabel(liveStage);
    if (label) return label;
  }
  if (jobStage != null) {
    const label = getStageLabel(jobStage);
    if (label) return label;
  }
  const status = liveStatus ?? jobStatus;
  if (status === 'complete' || status === 'completed' || status === 'done') return 'Complete';
  if (status === 'failed') return 'Failed';
  if (status === 'in_progress' || status === 'running') return 'Processing…';
  return 'Queued';
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
          <p className="eyebrow">Research</p>
          <h2>Account Research</h2>
          <p className="detail-meta">
            Run multi-stage research on target accounts — scanning, crawling, extraction, LinkedIn, and verification.
          </p>
          <p className="detail-meta worker-status" data-status={workerStatus}>
            {workerStatus === 'checking' ? '⏳ Connecting to research engine…' : workerStatus === 'ok' ? '🟢 Research engine online' : '🔴 Research engine offline'}
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

      <Suspense fallback={<div className="loading-state panel">Loading research jobs…</div>}>
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
                    <span className="job-stage-label">
                      {getStageDisplay(live?.currentStage, job.currentStage, live?.status, job.status)}
                    </span>
                    <span className={`job-status status-${jobStatusCssClass(live?.status ?? job.status)}`}>
                      {humanizeJobStatus(live?.status ?? job.status)}
                    </span>
                    {(live?.progress != null && live.progress > 0 && live.progress < 100) && (
                      <div className="job-progress-inline">
                        <div className="job-progress-bar" style={{ width: `${live.progress}%` }} />
                        <span className="job-progress-text">{live.progress}%</span>
                      </div>
                    )}
                  </div>
                  {(live?.advanceError || live?.selfHealingScheduled) && (
                    <div className="job-diagnostic-row">
                      {live?.advanceError && (
                        <span className="job-error">Error: {live.advanceError}</span>
                      )}
                      {live?.selfHealingScheduled && (
                        <span className="job-diagnostic-meta">Self-heal scheduled</span>
                      )}
                    </div>
                  )}
                  {accountKey && (
                    <div className="job-card-actions">
                      <div className="job-diagnostic-actions">
                        <button
                          type="button"
                          className="btn btn--enrich"
                          disabled={!hasWorker() || isBusy || props.workerStatus !== 'ok'}
                          onClick={() => refreshJobStatus(accountKey)}
                        >
                          {isBusy ? '…' : '↻ Refresh'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--enrich"
                          disabled={!hasWorker() || isBusy || props.workerStatus !== 'ok'}
                          onClick={() => advanceJob(accountKey)}
                        >
                          ▶ Advance
                        </button>
                        <button
                          type="button"
                          className="btn btn--enrich"
                          disabled={!hasWorker() || props.queuing !== null}
                          onClick={() => props.onQueue(accountKey, canonicalUrl, 'restart')}
                        >
                          ↺ Restart
                        </button>
                        <button
                          type="button"
                          className="btn btn--enrich"
                          disabled={!hasWorker() || props.queuing !== null}
                          onClick={() => props.onQueue(accountKey, canonicalUrl, 'deep')}
                        >
                          🔍 Deep research
                        </button>
                        {((live?.status === 'complete') || job.status === 'complete') && (
                          <a
                            href={getResearchSetUrl(accountKey)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn--enrich view-research-link"
                          >
                            📄 View results
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="insight-section">
        <div className="section-header">
          <h3>Start new research</h3>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Pick an account to research. Standard runs the full pipeline; deep research adds extra crawling.
        </p>
        <div className="queue-account-list">
          {accounts.length === 0 ? (
            <p className="muted">No accounts found. Add accounts to your portfolio to start research.</p>
          ) : (
            accounts.slice(0, 30).map((account) => {
              const accountId = account.documentId;
              const accountKey = getAccountKeyFromId(accountId) || accountId;
              const isActive = activeAccountKeys.includes(accountKey);
              const canonicalUrl =
                account.canonicalUrl
                || (account.domain ? `https://${account.domain.replace(/^https?:\/\//, '')}` : '')
                || (account.rootDomain ? `https://${account.rootDomain.replace(/^https?:\/\//, '')}` : '')
                || `https://${accountKey}`;

              return (
                <div className={`queue-account-card${isActive ? ' queue-account-card--active' : ''}`} key={accountId}>
                  <div className="queue-account-info">
                    <strong>{getAccountLabel(account)}</strong>
                    <span className="queue-account-domain">{getAccountDomainLabel(account) || 'Website not set'}</span>
                    {isActive && <span className="queue-account-badge">Active</span>}
                  </div>
                  <div className="queue-actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--enrich"
                      disabled={!hasWorker() || props.queuing === `${accountKey}:standard`}
                      onClick={() => props.onQueue(accountKey, canonicalUrl, 'standard')}
                    >
                      {props.queuing === `${accountKey}:standard` ? 'Queuing…' : '▶ Research'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--enrich"
                      disabled={!hasWorker() || props.queuing === `${accountKey}:restart`}
                      onClick={() => props.onQueue(accountKey, canonicalUrl, 'restart')}
                    >
                      {props.queuing === `${accountKey}:restart` ? 'Queuing…' : '↺ Restart'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--enrich"
                      disabled={!hasWorker() || props.queuing === `${accountKey}:deep`}
                      onClick={() => props.onQueue(accountKey, canonicalUrl, 'deep')}
                    >
                      {props.queuing === `${accountKey}:deep` ? 'Queuing…' : '🔍 Deep'}
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
