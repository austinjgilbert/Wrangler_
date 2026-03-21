import { useDocuments } from '@sanity/sdk-react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { useNavigation } from '../lib/navigation';
import { humanizeFieldName } from '../lib/formatters';

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
  relatedAccountKey?: string;
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

// ── Seniority helpers ───────────────────────────────────────────────

const DECISION_MAKER_LEVELS = new Set(['c-suite', 'vp', 'director', 'c_suite']);

function isDecisionMaker(seniority?: string): boolean {
  if (!seniority) return false;
  return DECISION_MAKER_LEVELS.has(seniority.toLowerCase().replace(/[\s-]+/g, '_'));
}

/** Sort key: decision makers first, then by name */
function personSortKey(doc: PersonDoc): string {
  const dm = isDecisionMaker(doc.seniorityLevel) ? '0' : '1';
  return `${dm}-${(doc.name || 'zzz').toLowerCase()}`;
}

// ── Company grouping ────────────────────────────────────────────────

interface CompanyGroup {
  company: string;
  accountKey: string | null;
  people: PersonDoc[];
  decisionMakerCount: number;
}

/**
 * UX-29: Group people by company, sort decision-makers first within each group.
 * Groups with decision-makers sort before groups without.
 * Within each group, decision-makers appear first, then alphabetical.
 */
function groupByCompany(people: PersonDoc[]): CompanyGroup[] {
  const groupMap = new Map<string, { accountKey: string | null; people: PersonDoc[] }>();

  for (const person of people) {
    const company = (person.currentCompany || '').trim() || 'Unknown company';
    const key = company.toLowerCase();

    if (!groupMap.has(key)) {
      groupMap.set(key, { accountKey: person.relatedAccountKey || null, people: [] });
    }
    const group = groupMap.get(key)!;
    group.people.push(person);
    // Use the first non-null accountKey we find for this company
    if (!group.accountKey && person.relatedAccountKey) {
      group.accountKey = person.relatedAccountKey;
    }
  }

  const groups: CompanyGroup[] = [];
  for (const [, value] of groupMap) {
    // Sort people within group: decision-makers first, then alphabetical
    value.people.sort((a, b) => personSortKey(a).localeCompare(personSortKey(b)));
    const dmCount = value.people.filter((p) => isDecisionMaker(p.seniorityLevel)).length;
    groups.push({
      company: value.people[0].currentCompany?.trim() || 'Unknown company',
      accountKey: value.accountKey,
      decisionMakerCount: dmCount,
      people: value.people,
    });
  }

  // Sort groups: groups with decision-makers first, then by people count desc, then alphabetical
  groups.sort((a, b) => {
    if (a.decisionMakerCount > 0 && b.decisionMakerCount === 0) return -1;
    if (a.decisionMakerCount === 0 && b.decisionMakerCount > 0) return 1;
    if (b.people.length !== a.people.length) return b.people.length - a.people.length;
    return a.company.localeCompare(b.company);
  });

  return groups;
}

// ── Contact action components ───────────────────────────────────────

/** UX-30: Copy email button with feedback */
function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [email]);

  return (
    <button
      type="button"
      className={`contact-action-btn ${copied ? 'contact-action-btn--copied' : ''}`}
      onClick={handleCopy}
      title={`Copy ${email}`}
    >
      {copied ? '✓ Copied' : '✉ Copy email'}
    </button>
  );
}

// ── Person card ─────────────────────────────────────────────────────

function PersonCard({ doc }: { doc: PersonDoc }) {
  const linkedIn = doc.linkedinUrl || doc.linkedInUrl;

  return (
    <div className="contact-card" key={doc.documentId}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>{doc.name ?? doc.currentTitle ?? doc.documentId}</strong>
        {isDecisionMaker(doc.seniorityLevel) && (
          <span className="decision-maker-badge">★ Decision maker</span>
        )}
      </div>
      <p>
        {[doc.currentTitle ?? doc.title, doc.currentCompany]
          .filter(Boolean)
          .join(' · ') || '—'}
      </p>
      <div className="chip-row">
        {doc.roleCategory ? <span className="chip">{humanizeFieldName(doc.roleCategory)}</span> : null}
        {doc.seniorityLevel ? <span className="chip">{humanizeFieldName(doc.seniorityLevel)}</span> : null}
      </div>
      {/* UX-30: Contact actions */}
      <div className="contact-actions">
        {doc.email && <CopyEmailButton email={doc.email} />}
        {linkedIn && (
          <a
            href={linkedIn}
            target="_blank"
            rel="noopener noreferrer"
            className="contact-action-btn"
          >
            LinkedIn ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

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

  // UX-29: Group by company, decision-makers first
  const groups = useMemo(() => groupByCompany(filtered), [filtered]);

  const garbageCount = allDocs.length - allDocs.filter((doc) => !isGarbagePerson(doc)).length;
  const decisionMakerTotal = filtered.filter((doc) => isDecisionMaker(doc.seniorityLevel)).length;

  return (
    <div className="entity-list">
      <div className="section-header">
        <h3>People</h3>
        <span className="section-meta">
          {filtered.length} contacts
          {decisionMakerTotal > 0 && ` · ${decisionMakerTotal} decision makers`}
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
        /* UX-29: Grouped by company */
        groups.map((group) => (
          <div className="company-group" key={group.company}>
            <div className="company-group-header">
              <h4>{group.company}</h4>
              <span className="company-group-count">{group.people.length}</span>
              {/* UX-30: View Account link in group header */}
              {group.accountKey && (
                <button
                  type="button"
                  className="company-group-link"
                  onClick={() => navigateToView('accounts')}
                >
                  View account →
                </button>
              )}
            </div>
            <div className="contact-grid">
              {group.people.map((doc) => (
                <PersonCard doc={doc} key={doc.documentId} />
              ))}
            </div>
          </div>
        ))
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
            Contacts and decision-makers across your portfolio, grouped by company.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="loading-state">Loading people…</div>}>
        <PeopleListInner />
      </Suspense>
    </section>
  );
}
