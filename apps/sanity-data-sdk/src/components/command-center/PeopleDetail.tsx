/**
 * PeopleDetail — Expanded detail view for the People module.
 *
 * Shows contacts grouped by seniority: decision makers (C-suite, VP, Director)
 * vs. other contacts. Each person shows name, title, seniority badge, and
 * LinkedIn link.
 *
 * Queries Sanity directly via useDocuments filtered by relatedAccountKey.
 * No worker endpoint needed — person data lives in Sanity.
 */

import { Suspense, useMemo } from 'react';
import { useDocuments } from '@sanity/sdk-react';

import './PeopleDetail.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface PersonDoc {
  documentId: string;
  name?: string;
  currentTitle?: string;
  linkedinUrl?: string;
  seniorityLevel?: string;
  roleCategory?: string;
  email?: string;
  currentCompany?: string;
}

// ─── Props ──────────────────────────────────────────────────────────────

export interface PeopleDetailProps {
  accountKey: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────

const DECISION_MAKER_LEVELS = new Set(['c-suite', 'vp', 'director', 'c_suite']);

function isDecisionMaker(seniority?: string): boolean {
  if (!seniority) return false;
  return DECISION_MAKER_LEVELS.has(seniority.toLowerCase().replace(/[\s-]+/g, '_'));
}

function seniorityBadgeClass(seniority?: string): string {
  if (!seniority) return 'people-detail__seniority--unknown';
  const normalized = seniority.toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'c_suite' || normalized === 'c-suite') return 'people-detail__seniority--csuite';
  if (normalized === 'vp') return 'people-detail__seniority--vp';
  if (normalized === 'director') return 'people-detail__seniority--director';
  if (normalized === 'manager') return 'people-detail__seniority--manager';
  return 'people-detail__seniority--other';
}

function formatSeniority(seniority?: string): string {
  if (!seniority) return 'Unknown';
  return seniority
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Sub-component ──────────────────────────────────────────────────────

function PersonCard({ person }: { person: PersonDoc }) {
  const displayTitle = person.currentTitle;
  return (
    <div className="people-detail__card">
      <div className="people-detail__card-main">
        <span className="people-detail__card-name">{person.name ?? person.documentId}</span>
        {displayTitle && (
          <span className="people-detail__card-title">{displayTitle}</span>
        )}
      </div>
      <div className="people-detail__card-meta">
        <span className={`people-detail__seniority ${seniorityBadgeClass(person.seniorityLevel)}`}>
          {formatSeniority(person.seniorityLevel)}
        </span>
        {person.linkedinUrl && (
          <a
            href={person.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="people-detail__linkedin"
            title="View LinkedIn profile"
          >
            🔗 LinkedIn
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Inner component (Suspense boundary) ────────────────────────────────

function PeopleDetailInner({ accountKey }: PeopleDetailProps) {
  const { data, isPending } = useDocuments({
    documentType: 'person',
    filter: 'relatedAccountKey == $accountKey',
    params: { accountKey },
    batchSize: 100,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });

  const people = (data || []) as PersonDoc[];

  // Group by decision maker vs. other
  const { decisionMakers, otherContacts } = useMemo(() => {
    const dm: PersonDoc[] = [];
    const other: PersonDoc[] = [];
    for (const p of people) {
      if (isDecisionMaker(p.seniorityLevel)) {
        dm.push(p);
      } else {
        other.push(p);
      }
    }
    return { decisionMakers: dm, otherContacts: other };
  }, [people]);

  // Loading state (initial load before Suspense resolves)
  if (isPending && people.length === 0) {
    return <div className="people-detail__loading">Loading people data...</div>;
  }

  // Empty state
  if (people.length === 0) {
    return (
      <div className="people-detail__empty">
        No contacts found for this account. Run LinkedIn enrichment to discover people.
      </div>
    );
  }

  // Results
  return (
    <div className="people-detail__results">
      {/* Summary stats */}
      <div className="people-detail__summary">
        <div className="people-detail__stat">
          <span className="people-detail__stat-value">{people.length}</span>
          <span className="people-detail__stat-label">Total Contacts</span>
        </div>
        <div className="people-detail__stat">
          <span className="people-detail__stat-value">{decisionMakers.length}</span>
          <span className="people-detail__stat-label">Decision Makers</span>
        </div>
        <div className="people-detail__stat">
          <span className="people-detail__stat-value">
            {people.filter((p) => p.linkedinUrl).length}
          </span>
          <span className="people-detail__stat-label">LinkedIn Profiles</span>
        </div>
      </div>

      {/* Decision makers */}
      {decisionMakers.length > 0 && (
        <div className="people-detail__group">
          <h4 className="people-detail__group-title">
            Decision Makers
            <span className="people-detail__group-count">{decisionMakers.length}</span>
          </h4>
          <div className="people-detail__card-list">
            {decisionMakers.map((person) => (
              <PersonCard key={person.documentId} person={person} />
            ))}
          </div>
        </div>
      )}

      {/* Other contacts */}
      {otherContacts.length > 0 && (
        <div className="people-detail__group">
          <h4 className="people-detail__group-title">
            Other Contacts
            <span className="people-detail__group-count">{otherContacts.length}</span>
          </h4>
          <div className="people-detail__card-list">
            {otherContacts.map((person) => (
              <PersonCard key={person.documentId} person={person} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────

export function PeopleDetail({ accountKey }: PeopleDetailProps) {
  return (
    <div className="people-detail">
      <Suspense fallback={<div className="people-detail__loading">Loading people data...</div>}>
        <PeopleDetailInner accountKey={accountKey} />
      </Suspense>
    </div>
  );
}
