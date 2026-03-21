import { useDocuments } from '@sanity/sdk-react';
import { Suspense, useEffect, useState } from 'react';
import { fetchRecentSignals, type WorkerSignal } from '../lib/adapters/signals';
import { humanizeSignalType, formatTimestamp } from '../lib/formatters';
import { useNavigation } from '../lib/navigation';

// ── Types ───────────────────────────────────────────────────────────
// SignalDoc removed — signals now come from Worker snapshot via WorkerSignal

interface InteractionDoc {
  documentId: string;
  documentType: string;
  title?: string;
  companyName?: string;
  domain?: string;
  source?: string;
  eventSummary?: string;
  timestamp?: string;
  accountName?: string;
}

// ── Components ──────────────────────────────────────────────────────

function SignalList() {
  const [signals, setSignals] = useState<WorkerSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const { navigateToView } = useNavigation();

  useEffect(() => {
    fetchRecentSignals()
      .then(setSignals)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="activity-list">
      <div className="section-header">
        <h3>Signals</h3>
        <span className="section-meta">{signals.length} loaded</span>
      </div>
      {loading ? (
        <p className="muted">Loading signals…</p>
      ) : signals.length === 0 ? (
        <p className="muted">No buying signals detected yet — run enrichment to generate signals.</p>
      ) : (
        signals.map((signal) => (
          <div className="activity-card" key={signal.id}>
            <strong>{humanizeSignalType(signal.signalType)}</strong>
            {signal.accountName ? (
              <span
                className="activity-account-link"
                role="button"
                tabIndex={0}
                onClick={() => navigateToView('accounts')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateToView('accounts') }}
              >
                {signal.accountName}
              </span>
            ) : (
              <span>{signal.summary ?? signal.source ?? signal.id}</span>
            )}
            <span className="activity-meta">
              {[signal.source, formatTimestamp(signal.timestamp)].filter(Boolean).join(' · ')}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function InteractionList() {
  const { data, hasMore, loadMore, isPending } = useDocuments({
    documentType: 'interaction',
    batchSize: 50,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const { navigateToView } = useNavigation();
  const list = (data || []) as InteractionDoc[];

  return (
    <div className="activity-list">
      <div className="section-header">
        <h3>Interactions</h3>
        <span className="section-meta">{list.length} loaded</span>
      </div>
      {list.length === 0 ? (
        <p className="muted">No interactions yet.</p>
      ) : (
        list.map((doc) => (
          <div className="activity-card" key={doc.documentId}>
            <strong>
              {doc.companyName ? (
                <span
                  className="activity-account-link"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigateToView('accounts')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateToView('accounts') }}
                >
                  {doc.companyName}
                </span>
              ) : (
                doc.title ?? doc.documentId
              )}
            </strong>
            <span>{doc.domain ?? doc.source ?? ''}</span>
            {doc.eventSummary && (
              <p className="activity-summary">{doc.eventSummary}</p>
            )}
            <span className="activity-meta">
              {formatTimestamp(doc.timestamp)}
            </span>
          </div>
        ))
      )}
      {hasMore && (
        <button
          type="button"
          className="sidebar-load-more"
          disabled={isPending}
          onClick={() => loadMore()}
        >
          {isPending ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

export function ActivityView() {
  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Activity &amp; Events</p>
          <h2>Signals &amp; interactions</h2>
          <p className="detail-meta">
            Signals and interactions across your accounts.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="loading-state">Loading activity…</div>}>
        <SignalList />
        <div style={{ marginTop: 24 }} />
        <InteractionList />
      </Suspense>
    </section>
  );
}
