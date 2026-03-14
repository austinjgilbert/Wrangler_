import { useDocuments } from '@sanity/sdk-react';
import { Suspense } from 'react';

function TechnologiesListInner() {
  const { data, hasMore, loadMore, isPending } = useDocuments({
    documentType: 'technology',
    batchSize: 100,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const list = (data || []) as Array<{
    documentId: string;
    documentType: string;
    name?: string;
    slug?: string;
    category?: string;
    vendor?: string;
    accountCount?: number;
  }>;

  return (
    <div className="entity-list">
      <div className="section-header">
        <h3>Technologies</h3>
        <span className="section-meta">{list.length} loaded</span>
      </div>
      {list.length === 0 ? (
        <p className="muted">No technologies in dataset.</p>
      ) : (
        <div className="tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {list.map((doc) => (
            <div className="tech-card" key={doc.documentId}>
              <strong>{doc.name ?? doc.slug ?? doc.documentId}</strong>
              <span className="tech-meta">
                {[doc.category, doc.vendor].filter(Boolean).join(' · ') || '—'}
              </span>
              {doc.accountCount != null && (
                <span className="tech-count">{doc.accountCount} accounts</span>
              )}
            </div>
          ))}
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          className="sidebar-load-more"
          disabled={isPending}
          onClick={() => loadMore()}
          style={{ marginTop: 12 }}
        >
          {isPending ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

export function TechnologiesListView() {
  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">DataView</p>
          <h2>Technologies</h2>
          <p className="detail-meta">
            Technology stack and vendor data from Sanity.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="loading-state">Loading technologies…</div>}>
        <TechnologiesListInner />
      </Suspense>
    </section>
  );
}
