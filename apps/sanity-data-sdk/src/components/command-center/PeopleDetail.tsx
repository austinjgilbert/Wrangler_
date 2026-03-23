/**
 * PeopleDetail — Expanded detail view for the People module.
 *
 * Shows contacts grouped by seniority: decision makers (C-suite, VP, Director)
 * vs. other contacts. Each person shows name, title, seniority badge,
 * LinkedIn link, and collapsible contact data (emails/phones with source
 * badges, confidence bars, and pin controls).
 *
 * Queries Sanity directly via useDocuments filtered by relatedAccountKey.
 * Pin button calls PATCH /person/pin-contact to override primary contact.
 */

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useDocuments } from '@sanity/sdk-react';

import { formatRelativeTime } from '../../lib/formatters';
import { workerPatch } from '../../lib/adapters/fetch-worker';
import './PeopleDetail.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface ContactEntry {
  value: string;
  source: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  confidence: number;
  isPrimary: boolean;
  userPinned: boolean;
}

interface PersonDoc {
  documentId: string;
  name?: string;
  currentTitle?: string;
  linkedinUrl?: string;
  seniorityLevel?: string;
  roleCategory?: string;
  email?: string;
  phone?: string;
  currentCompany?: string;
  contactEmails?: ContactEntry[];
  contactPhones?: ContactEntry[];
}

interface PinContactResponse {
  pinned: boolean;
  personId: string;
  field: 'contactEmails' | 'contactPhones';
  value: string;
  contactEmails: ContactEntry[];
  contactPhones: ContactEntry[];
  primaryEmail: string | null;
  primaryPhone: string | null;
}

// ─── Props ──────────────────────────────────────────────────────────────

export interface PeopleDetailProps {
  accountKey: string;
}

// ─── Source Tier Helpers ────────────────────────────────────────────────

/**
 * Source reliability tiers — mirrors SOURCE_RELIABILITY from contactConsensus.js.
 * Used for badge coloring only (scoring happens server-side).
 */
type SourceTier = 'crm' | 'professional' | 'sales-tool' | 'web' | 'user';

function getSourceTier(source: string): SourceTier {
  const key = (source || 'unknown').toLowerCase().trim();
  if (key === 'user_override' || key === 'user_pinned' || key === 'manual') return 'user';
  if (key === 'salesforce' || key === 'hubspot') return 'crm';
  if (key === 'linkedin' || key === 'outreach') return 'professional';
  if (key === 'nooks' || key === 'commonroom' || key === 'apollo' || key === 'zoominfo' || key === '6sense') return 'sales-tool';
  return 'web';
}

function sourceBadgeClass(source: string): string {
  const tier = getSourceTier(source);
  return `contact-section__source--${tier}`;
}

function formatSourceLabel(source: string): string {
  if (!source) return 'Unknown';
  return source
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Seniority Helpers ──────────────────────────────────────────────────

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

// ─── ContactSection Sub-component ───────────────────────────────────────

interface ContactEntryRowProps {
  entry: ContactEntry;
  type: 'email' | 'phone';
  onPin: (field: 'contactEmails' | 'contactPhones', value: string) => void;
  pinning: boolean;
  pinError: string | null;
}

function ContactEntryRow({ entry, type, onPin, pinning, pinError }: ContactEntryRowProps) {
  const confidencePct = Math.round(entry.confidence * 100);
  const field = type === 'email' ? 'contactEmails' as const : 'contactPhones' as const;

  // 5 button states per copy spec:
  // 1. Already pinned (userPinned: true) — filled style, "Pinned as primary"
  // 2. Loading (pinning) — ⏳, "Pinning…"
  // 3. Error — 📌, "Pin failed — try again"
  // 4. Default — 📌, "Pin as primary"
  // 5. Success — transitions to state 1 via response update
  const isPinned = entry.userPinned;
  let pinIcon = '📌';
  let pinTitle = 'Pin as primary';
  let pinAriaLabel = `Pin ${entry.value} as primary`;
  let pinDisabled = false;

  if (pinning) {
    pinIcon = '⏳';
    pinTitle = 'Pinning…';
    pinAriaLabel = `Pinning ${entry.value}`;
    pinDisabled = true;
  } else if (isPinned) {
    pinTitle = 'Pinned as primary';
    pinAriaLabel = `Pinned — ${entry.value} is primary`;
    pinDisabled = true;
  } else if (pinError) {
    pinTitle = 'Pin failed — try again';
  }

  return (
    <div className={`contact-section__entry${entry.isPrimary ? ' contact-section__entry--primary' : ''}`}>
      <div className="contact-section__entry-main">
        <div className="contact-section__entry-value-row">
          {entry.isPrimary && (
            <span className="contact-section__primary-badge" title="Primary contact">
              {entry.userPinned ? '📌' : '⭐'}
            </span>
          )}
          <span className="contact-section__entry-value">
            {type === 'email' ? (
              <a href={`mailto:${entry.value}`} className="contact-section__email-link">{entry.value}</a>
            ) : (
              <a href={`tel:${entry.value}`} className="contact-section__phone-link">{entry.value}</a>
            )}
          </span>
          <span className={`contact-section__source ${sourceBadgeClass(entry.source)}`}>
            {formatSourceLabel(entry.source)}
          </span>
        </div>
        <div className="contact-section__entry-meta">
          <div className="contact-section__confidence" title={`Confidence: ${confidencePct}%`}>
            <div className="contact-section__confidence-bar">
              <div
                className="contact-section__confidence-fill"
                style={{ width: `${confidencePct}%` }}
              />
            </div>
            <span className="contact-section__confidence-label">{confidencePct}%</span>
          </div>
          {entry.lastSeenAt && (
            <span className="contact-section__last-seen" title={entry.lastSeenAt}>
              {formatRelativeTime(entry.lastSeenAt)}
            </span>
          )}
        </div>
      </div>
      <button
        className={`contact-section__pin-btn${isPinned ? ' contact-section__pin-btn--pinned' : ''}`}
        disabled={pinDisabled}
        title={pinTitle}
        aria-label={pinAriaLabel}
        onClick={() => onPin(field, entry.value)}
      >
        {pinIcon}
      </button>
    </div>
  );
}

function ContactSection({ person }: { person: PersonDoc }) {
  const [expanded, setExpanded] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null); // value being pinned
  const [pinError, setPinError] = useState<string | null>(null);
  // Local override arrays — updated from server response after successful pin
  const [localEmails, setLocalEmails] = useState<ContactEntry[] | null>(null);
  const [localPhones, setLocalPhones] = useState<ContactEntry[] | null>(null);

  const emails = localEmails ?? person.contactEmails ?? [];
  const phones = localPhones ?? person.contactPhones ?? [];
  const totalContacts = emails.length + phones.length;

  const handlePin = useCallback(async (field: 'contactEmails' | 'contactPhones', value: string) => {
    setPinning(value);
    setPinError(null);
    try {
      const res = await workerPatch<PinContactResponse>('/person/pin-contact', {
        personId: person.documentId,
        field,
        value,
      });
      // Update local state from server's recomputed consensus
      setLocalEmails(res.data.contactEmails);
      setLocalPhones(res.data.contactPhones);
    } catch {
      setPinError(value);
    } finally {
      setPinning(null);
    }
  }, [person.documentId]);

  // Nothing to show — fall back to legacy flat fields
  if (totalContacts === 0) {
    if (!person.email && !person.phone) return null;
    return (
      <div className="contact-section contact-section--legacy">
        {person.email && (
          <span className="contact-section__legacy-item">
            ✉️ <a href={`mailto:${person.email}`} className="contact-section__email-link">{person.email}</a>
          </span>
        )}
        {person.phone && (
          <span className="contact-section__legacy-item">
            📞 <a href={`tel:${person.phone}`} className="contact-section__phone-link">{person.phone}</a>
          </span>
        )}
      </div>
    );
  }

  // Sort by confidence descending (server already sorts, but defensive)
  const sortedEmails = [...emails].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const sortedPhones = [...phones].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  // Collapsed: show primary only
  const primaryEmail = sortedEmails.find((e) => e.isPrimary) ?? sortedEmails[0];
  const primaryPhone = sortedPhones.find((p) => p.isPrimary) ?? sortedPhones[0];

  return (
    <div className="contact-section">
      {/* Collapsed summary — always visible */}
      <div className="contact-section__summary">
        {primaryEmail && (
          <span className="contact-section__primary-preview">
            ✉️ <a href={`mailto:${primaryEmail.value}`} className="contact-section__email-link">{primaryEmail.value}</a>
          </span>
        )}
        {primaryPhone && (
          <span className="contact-section__primary-preview">
            📞 <a href={`tel:${primaryPhone.value}`} className="contact-section__phone-link">{primaryPhone.value}</a>
          </span>
        )}
        {totalContacts > 1 && (
          <button
            className="contact-section__expand-btn"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? '▾ Hide' : `▸ ${totalContacts} contacts`}
          </button>
        )}
      </div>

      {/* Expanded detail — all contacts with scoring */}
      {expanded && (
        <div className="contact-section__detail">
          {sortedEmails.length > 0 && (
            <div className="contact-section__group">
              <span className="contact-section__group-label">Emails</span>
              {sortedEmails.map((entry, i) => (
                <ContactEntryRow
                  key={`email-${entry.value}-${i}`}
                  entry={entry}
                  type="email"
                  onPin={handlePin}
                  pinning={pinning === entry.value}
                  pinError={pinError === entry.value ? 'Pin failed' : null}
                />
              ))}
            </div>
          )}
          {sortedPhones.length > 0 && (
            <div className="contact-section__group">
              <span className="contact-section__group-label">Phones</span>
              {sortedPhones.map((entry, i) => (
                <ContactEntryRow
                  key={`phone-${entry.value}-${i}`}
                  entry={entry}
                  type="phone"
                  onPin={handlePin}
                  pinning={pinning === entry.value}
                  pinError={pinError === entry.value ? 'Pin failed' : null}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PersonCard Sub-component ───────────────────────────────────────────

function PersonCard({ person }: { person: PersonDoc }) {
  const displayTitle = person.currentTitle;
  return (
    <div className="people-detail__card">
      <div className="people-detail__card-main">
        <span className="people-detail__card-name">{person.name ?? person.documentId}</span>
        {displayTitle && (
          <span className="people-detail__card-title">{displayTitle}</span>
        )}
        <ContactSection person={person} />
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
  const { decisionMakers, otherContacts, withContactInfo } = useMemo(() => {
    const dm: PersonDoc[] = [];
    const other: PersonDoc[] = [];
    let contactCount = 0;
    for (const p of people) {
      if (isDecisionMaker(p.seniorityLevel)) {
        dm.push(p);
      } else {
        other.push(p);
      }
      if ((p.contactEmails?.length ?? 0) > 0 || (p.contactPhones?.length ?? 0) > 0 || p.email || p.phone) {
        contactCount++;
      }
    }
    return { decisionMakers: dm, otherContacts: other, withContactInfo: contactCount };
  }, [people]);

  // Loading state (initial load before Suspense resolves)
  if (isPending && people.length === 0) {
    return <div className="people-detail__loading">Loading people data...</div>;
  }

  // Empty state
  if (people.length === 0) {
    return (
      <div className="people-detail__empty">
        No contacts found for this account. Run LinkedIn research to discover people.
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
          <span className="people-detail__stat-value">{withContactInfo}</span>
          <span className="people-detail__stat-label">With Contact Info</span>
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
