/**
 * PeopleDetail — Expanded detail view for the People module.
 *
 * Shows contacts grouped by seniority: decision makers (C-suite, VP, Director)
 * vs. other contacts. Each person shows name, title, seniority badge, and
 * LinkedIn link.
 *
 * Fetches from GET /operator/console/account/{accountId} on mount.
 * Uses the `people` array from the response.
 */

import { useEffect, useState } from 'react';
import { workerGet } from '../../lib/adapters';

import './PeopleDetail.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface Person {
  id: string;
  name: string;
  title?: string;
  linkedinUrl?: string;
  seniority?: string;
}

// ─── Props ──────────────────────────────────────────────────────────────

export interface PeopleDetailProps {
  accountKey: string;
  accountId: string; // e.g. "account.{accountKey}" — used for the endpoint path
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

function PersonCard({ person }: { person: Person }) {
  return (
    <div className="people-detail__card">
      <div className="people-detail__card-main">
        <span className="people-detail__card-name">{person.name}</span>
        {person.title && (
          <span className="people-detail__card-title">{person.title}</span>
        )}
      </div>
      <div className="people-detail__card-meta">
        <span className={`people-detail__seniority ${seniorityBadgeClass(person.seniority)}`}>
          {formatSeniority(person.seniority)}
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

// ─── Component ──────────────────────────────────────────────────────────

export function PeopleDetail({ accountKey, accountId }: PeopleDetailProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    workerGet<{ data: { people: Person[] } }>(
      `/operator/console/account/${encodeURIComponent(accountId)}`,
    )
      .then((res) => {
        const payload = (res.data as any)?.data ?? res.data ?? null;
        const peopleList = payload?.people ?? [];
        setPeople(peopleList);
      })
      .catch((err) => {
        if (err?.status === 404) {
          setPeople([]);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load people');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accountId]);

  // Group by decision maker vs. other
  const decisionMakers = people.filter((p) => isDecisionMaker(p.seniority));
  const otherContacts = people.filter((p) => !isDecisionMaker(p.seniority));

  return (
    <div className="people-detail">
      {/* Loading */}
      {loading && (
        <div className="people-detail__loading">Loading people data...</div>
      )}

      {/* Error */}
      {error && (
        <div className="people-detail__error">{error}</div>
      )}

      {/* Empty */}
      {!loading && !error && people.length === 0 && (
        <div className="people-detail__empty">
          No contacts found for this account. Run LinkedIn enrichment to discover people.
        </div>
      )}

      {/* Results */}
      {!loading && people.length > 0 && (
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
                  <PersonCard key={person.id} person={person} />
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
                  <PersonCard key={person.id} person={person} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
