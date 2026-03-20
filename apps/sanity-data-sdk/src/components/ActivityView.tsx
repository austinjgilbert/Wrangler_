import { useDocuments } from '@sanity/sdk-react';
import { Suspense } from 'react';
import { humanizeSignalType, formatTimestamp } from '../lib/formatters';

type DocHandle = { documentId: string; documentType: string };

function SignalList() {
  const { data, hasMore, loadMore, isPending } = useDocuments({
    documentType: 'signal',
    batchSize: 50,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const list = (data || []) as Array<DocHandle & { signalType?: string; type?: string; summary?: string; source?: string; timestamp?: string; accountName?: string }>;
  return (
    <div className="activity-list">
      <div className="section-header">
        <h3>Signals</h3>
        <span className="section-meta">{list.length} loaded</span>
      </div>
      {list.length === 0 ? (
        <p className="muted">No signals yet.</p>
      ) : (
        list.map((doc) => (
          <div className="activity-card" key={doc.documentId}>
            <strong>{humanizeSignalType((doc as any).signalType ?? (doc as any).type)}</strong>
            <span>{(doc as any).summary ?? (doc as any).source ?? doc.documentId}</span>
            <span className="activity-meta">
              {[(doc as any).source, formatTimestamp((doc as any).timestamp)].filter(Boolean).join(' · ')}
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

function InteractionList() {
  const { data } = useDocuments({
    documentType: 'interaction',
    batchSize: 50,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const list = (data || []) as Array<DocHandle & { title?: string; companyName?: string; domain?: string; source?: string; eventSummary?: string }>;
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
            <strong>{(doc as any).title ?? (doc as any).companyName ?? doc.documentId}</strong>
            <span>{(doc as any).domain ?? (doc as any).source ?? ''}</span>
            {(doc as any).eventSummary && (
              <p className="activity-summary">{(doc as any).eventSummary}</p>
            )}
          </div>
        ))
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
