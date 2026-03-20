import { useDocuments } from '@sanity/sdk-react';
import { Suspense } from 'react';

function PeopleListInner() {
  const { data, hasMore, loadMore, isPending } = useDocuments({
    documentType: 'person',
    batchSize: 100,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const list = (data || []) as Array<{
    documentId: string;
    documentType: string;
    name?: string;
    title?: string;
    currentTitle?: string;
    currentCompany?: string;
    email?: string;
    roleCategory?: string;
    seniorityLevel?: string;
  }>;

  return (
    <div className="entity-list">
      <div className="section-header">
        <h3>People</h3>
        <span className="section-meta">{list.length} loaded</span>
      </div>
      {list.length === 0 ? (
        <p className="muted">No contacts found yet. Run research to discover key people.</p>
      ) : (
        <div className="contact-grid">
          {list.map((doc) => (
            <div className="contact-card" key={doc.documentId}>
              <strong>{doc.name ?? doc.currentTitle ?? doc.documentId}</strong>
              <p>
                {[doc.currentTitle ?? doc.title, doc.currentCompany]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
              <div className="chip-row">
                {doc.roleCategory ? <span className="chip">{doc.roleCategory}</span> : null}
                {doc.seniorityLevel ? <span className="chip">{doc.seniorityLevel}</span> : null}
              </div>
              {doc.email && (
                <div className="contact-meta">
                  <span>{doc.email}</span>
                </div>
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

export function PeopleListView() {
  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Contacts</p>
          <h2>People</h2>
          <p className="detail-meta">
            Contacts and decision-makers across your portfolio.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="loading-state">Loading people…</div>}>
        <PeopleListInner />
      </Suspense>
    </section>
  );
}
