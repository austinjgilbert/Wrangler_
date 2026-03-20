import { useDocuments } from '@sanity/sdk-react';
import { Suspense } from 'react';
import { dedupeAccounts, getAccountDisplayName } from '../lib/account-dedupe';
import { humanizeJobStatus, humanizeSignalType, formatTimestamp } from '../lib/formatters';

type CountDoc = {
  documentId: string;
  documentType: string;
  lifecycleStatus?: string;
  profileCompleteness?: { score?: number };
};

type JobDoc = {
  documentId: string;
  documentType: string;
  jobType?: string;
  accountKey?: string;
  targetEntity?: string | null;
  status?: string;
  currentStage?: string | number | null;
  error?: string | null;
};

type AccountDoc = {
  documentId: string;
  documentType: string;
  companyName?: string;
  name?: string;
  domain?: string | null;
};

type SignalDoc = {
  documentId: string;
  documentType: string;
  signalType?: string;
  type?: string;
  source?: string;
  timestamp?: string;
  accountName?: string;
  summary?: string;
};

function getAccountKeyFromId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.replace(/^account[.-]/, '');
}

function getAccountLabel(account: AccountDoc | null | undefined): string {
  return account ? getAccountDisplayName(account) : 'this account';
}

function getStageLabel(stage: string | number | null | undefined): string | null {
  switch (String(stage || '')) {
    case 'initial_scan':
      return 'Scanning the site';
    case 'discovery':
      return 'Finding useful pages';
    case 'crawl':
      return 'Reading important pages';
    case 'extraction':
      return 'Pulling out facts';
    case 'linkedin':
      return 'Checking LinkedIn';
    case 'brief':
      return 'Writing a research brief';
    case 'verification':
      return 'Checking claims';
    case 'complete':
      return 'Complete';
    default:
      return stage ? String(stage) : null;
  }
}

// Deduplicated — uses shared humanizeJobStatus from formatters.ts
const getJobStatusLabel = humanizeJobStatus;

function getJobIntentLabel(job: JobDoc, accountMap: Map<string, AccountDoc>): string {
  const accountId = typeof job.targetEntity === 'string' && job.targetEntity.startsWith('account')
    ? job.targetEntity
    : null;
  const accountKey = getAccountKeyFromId(accountId) || job.accountKey || getAccountKeyFromId(job.targetEntity || undefined);
  const account =
    (accountId ? accountMap.get(accountId) : null)
    || (accountKey ? accountMap.get(`account-${accountKey}`) || accountMap.get(`account.${accountKey}`) : null);
  const accountLabel = getAccountLabel(account);

  if (job.documentType === 'enrich.job' || String(job.jobType || '').toLowerCase().includes('enrich')) {
    return `Research and enrich ${accountLabel}`;
  }
  if (job.jobType) {
    return `${job.jobType} for ${accountLabel}`;
  }
  return `Background job for ${accountLabel}`;
}

function DashboardCountCard(props: {
  documentType: string;
  label: string;
  valueFormatter?: (docs: CountDoc[]) => string | number;
}) {
  const { data } = useDocuments({
    documentType: props.documentType,
    batchSize: 200,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const docs = ((data || []) as CountDoc[]);
  const value = props.valueFormatter ? props.valueFormatter(docs) : docs.length;

  return (
    <div className="summary-card">
      <span className="summary-label">{props.label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardJobSection() {
  const { data } = useDocuments({
    documentType: 'enrich.job',
    batchSize: 24,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const accountResult = useDocuments({
    documentType: 'account',
    batchSize: 200,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const jobs = ((data || []) as JobDoc[]);
  const accounts = dedupeAccounts((accountResult.data || []) as AccountDoc[]);
  const accountMap = new Map(accounts.map((account) => [account.documentId, account]));
  const running = jobs.filter((job) => job.status === 'in_progress').length;
  const queued = jobs.filter((job) => job.status === 'pending' || job.status === 'queued').length;

  return (
    <div className="insight-section">
      <div className="section-header">
        <p className="eyebrow">Jobs</p>
        <h3>Research jobs</h3>
        <span className="section-meta">
          {running} running, {queued} queued
        </span>
      </div>
      <div className="job-list">
        {jobs.length === 0 ? (
          <p className="muted">No recent research jobs.</p>
        ) : (
          jobs.slice(0, 12).map((job) => (
            <div className="job-card" key={job.documentId}>
              <strong>{getJobIntentLabel(job, accountMap)}</strong>
              <span>
                {job.currentStage != null
                  ? getStageLabel(job.currentStage)
                  : 'Waiting to start'}
              </span>
              <span className={`job-status status-${job.status ?? 'queued'}`}>
                {getJobStatusLabel(job.status)}
              </span>
              {job.currentStage != null && (
                <span className="job-stage">Now: {getStageLabel(job.currentStage)}</span>
              )}
              {job.error && <span className="job-error">{job.error}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DashboardSignalSection() {
  const { data } = useDocuments({
    documentType: 'signal',
    batchSize: 24,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const signals = ((data || []) as SignalDoc[]);

  return (
    <div className="insight-section">
      <div className="section-header">
        <p className="eyebrow">Activity</p>
        <h3>Recent signals</h3>
      </div>
      <div className="signal-list">
        {signals.length === 0 ? (
          <p className="muted">No recent signals.</p>
        ) : (
          signals.slice(0, 10).map((signal) => (
            <div className="signal-card" key={signal.documentId}>
              <strong>{humanizeSignalType(signal.signalType ?? signal.type)}</strong>
              <span>{signal.accountName ?? signal.summary ?? 'Unknown'}</span>
              <span className="signal-meta">
                {[signal.source, formatTimestamp(signal.timestamp)].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DashboardInner() {
  return (
    <>
      <div className="summary-grid">
        <DashboardCountCard
          documentType="account"
          label="Accounts"
          valueFormatter={(docs) => dedupeAccounts(docs).length}
        />
        <DashboardCountCard documentType="person" label="People" />
        <DashboardCountCard documentType="signal" label="Signals today" />
        <DashboardCountCard
          documentType="actionCandidate"
          label="Active opportunities"
          valueFormatter={(docs) => docs.filter((doc) => doc.lifecycleStatus !== 'completed').length}
        />
        <DashboardCountCard
          documentType="account"
          label="System completion"
          valueFormatter={(docs) => {
            const scores = dedupeAccounts(docs)
              .map((doc) => Number(doc.profileCompleteness?.score || 0))
              .filter((score) => Number.isFinite(score));
            if (scores.length === 0) return '—';
            return `${Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)}%`;
          }}
        />
      </div>

      <DashboardJobSection />
      <DashboardSignalSection />
    </>
  );
}

export function DashboardView() {
  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>Dashboard</h2>
          <p className="detail-meta">
            Live counts and recent activity across your portfolio.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="loading-state panel">Loading dashboard…</div>}>
        <DashboardInner />
      </Suspense>
    </section>
  );
}
