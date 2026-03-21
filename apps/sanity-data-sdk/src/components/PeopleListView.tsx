import { useDocuments } from '@sanity/sdk-react';
import { Suspense, useMemo, useState } from 'react';
import { useNavigation } from '../lib/navigation';

// ── Types ───────────────────────────────────────────────────────────

interface PersonDoc {
  documentId: string;
  documentType: string;
  name?: string;
  title?: string;
  currentTitle?: string;
  currentCompany?: string;
  email?: string;
  roleCategory?: string;
  seniorityLevel?: string;
  linkedinUrl?: string;
  linkedInUrl?: string;  // Both casings exist in production data
}

// ── Garbage Detection ───────────────────────────────────────────────

/**
 * Detect person records that are garbage data — hex hashes, UUIDs,
 * single characters, or purely numeric strings used as names.
 * These leak through from enrichment pipelines and should be filtered
 * from user-facing views.
 */
function isGarbagePerson(doc: PersonDoc): boolean {
  const name = (doc.name || '').trim();

  // No name at all
  if (!name) return true;

  // Single character
  if (name.length <= 1) return true;

  // Hex hash (8+ hex chars, possibly with separators)
  if (/^[a-f0-9]{8,}$/i.test(name.replace(/[\s.\-_]/g, ''))) return true;

  // UUID pattern
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(name)) return true;

  // Purely numeric
  if (/^\d+$/.test(name)) return true;

  // Looks like a document ID (account-xxx, person-xxx)
  if (/^(account|person|doc)[.\-_]/i.test(name)) return true;

  return false;
}

// ── Components ──────────────────────────────────────────────────────

function PeopleListInner() {
  const { data, hasMore, loadMore, isPending } = useDocuments({
    documentType: 'person',
    batchSize: 100,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const { navigateToView } = useNavigation();
  const [search, setSearch] = useState('');

  const allDocs = (data || []) as PersonDoc[];

  // Filter garbage, then apply search
  const filtered = useMemo(() => {
    const clean = allDocs.filter((doc) => !isGarbagePerson(doc));

    if (!search.trim()) return clean;

    const q = search.toLowerCase().trim();
    return clean.filter((doc) => {
      const fields = [
        doc.name,
        doc.currentTitle ?? doc.title,
        doc.currentCompany,
        doc.email,
        doc.roleCategory,
        doc.seniorityLevel,
      ];
      return fields.some((f) => f && f.toLowerCase().includes(q));
    });
  }, [allDocs, search]);

  const garbageCount = allDocs.length - allDocs.filter((doc) => !isGarbagePerson(doc)).length;

  return (
    <div className="entity-list">
      <div className="section-header">
        <h3>People</h3>
        <span className="section-meta">
          {filtered.length} contacts
          {garbageCount > 0 && ` · ${garbageCount} filtered`}
        </span>
      </div>

      {/* Search input — PL-3 */}
      <div className="search-bar" style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name, title, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--border, #334155)',
            background: 'var(--surface, #1e293b)',
            color: 'inherit',
            fontSize: 14,
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="muted">
          {search ? 'No contacts match your search.' : 'No contacts found yet. Run research to discover key people.'}
        </p>
      ) : (
        <div className="contact-grid">
          {filtered.map((doc) => {
            const linkedIn = doc.linkedinUrl || doc.linkedInUrl;
            return (
              <div className="contact-card" key={doc.documentId}>
                <strong>{doc.name ?? doc.currentTitle ?? doc.documentId}</strong>
                <p>
                  {doc.currentCompany ? (
                    <span
                      className="activity-account-link"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigateToView('accounts')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateToView('accounts') }}
                    >
                      {[doc.currentTitle ?? doc.title, doc.currentCompany]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  ) : (
                    [doc.currentTitle ?? doc.title, doc.currentCompany]
                      .filter(Boolean)
                      .join(' · ') || '—'
                  )}
                </p>
                <div className="chip-row">
                  {doc.roleCategory ? <span className="chip">{doc.roleCategory}</span> : null}
                  {doc.seniorityLevel ? <span className="chip">{doc.seniorityLevel}</span> : null}
                </div>
                <div className="contact-meta">
                  {doc.email && <span>{doc.email}</span>}
                  {/* LinkedIn link — PL-2 */}
                  {linkedIn && (
                    <a
                      href={linkedIn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="linkedin-link"
                      style={{
                        color: 'var(--accent, #f59e0b)',
                        textDecoration: 'none',
                        fontSize: 13,
                      }}
                    >
                      LinkedIn ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
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
