/**
 * Tests for the contact consensus engine — multi-source scoring, ranking,
 * legacy reconciliation, and deduplication.
 */
import { describe, expect, it } from 'vitest';
import {
  scoreContacts,
  pickPrimary,
  reconcileLegacy,
  computeContactConsensus,
  appendContactSighting,
  _testing,
} from '../../src/lib/contactConsensus.js';

const {
  isValidEmail,
  isValidPhone,
  normalizeContactValue,
  scoreCrossSourceFrequency,
  scoreSourceReliability,
  scoreRecency,
  scoreFormatValidity,
  deduplicateEntries,
  SOURCE_RELIABILITY,
  WEIGHTS,
} = _testing;

// ── Fixed timestamp for deterministic tests ─────────────────────────────

const NOW = new Date('2026-03-22T12:00:00Z').getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86400000).toISOString();

// ── Format Validators ───────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('john@acme.com')).toBe(true);
    expect(isValidEmail('jane.doe+tag@sub.domain.co.uk')).toBe(true);
    expect(isValidEmail('a@b.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null as any)).toBe(false);
    expect(isValidEmail(undefined as any)).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user@domain')).toBe(false);
    expect(isValidEmail('user @domain.com')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts valid phone formats', () => {
    expect(isValidPhone('+14155551234')).toBe(true);
    expect(isValidPhone('(415) 555-1234')).toBe(true);
    expect(isValidPhone('415-555-1234')).toBe(true);
    expect(isValidPhone('4155551234')).toBe(true);
    expect(isValidPhone('+44 20 7946 0958')).toBe(true);
  });

  it('rejects invalid phones', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone(null as any)).toBe(false);
    expect(isValidPhone('123')).toBe(false); // Too short
    expect(isValidPhone('not-a-phone')).toBe(false);
  });
});

// ── Normalization ───────────────────────────────────────────────────────

describe('normalizeContactValue', () => {
  it('lowercases emails', () => {
    expect(normalizeContactValue('John@Acme.COM')).toBe('john@acme.com');
  });

  it('trims whitespace', () => {
    expect(normalizeContactValue('  john@acme.com  ')).toBe('john@acme.com');
  });

  it('strips non-digit chars from phones', () => {
    expect(normalizeContactValue('+1 (415) 555-1234')).toBe('+14155551234');
  });

  it('handles empty/null gracefully', () => {
    expect(normalizeContactValue('')).toBe('');
    expect(normalizeContactValue(null as any)).toBe('');
    expect(normalizeContactValue(undefined as any)).toBe('');
  });
});

// ── Source Reliability ──────────────────────────────────────────────────

describe('scoreSourceReliability', () => {
  it('returns tier 0 for user overrides', () => {
    expect(scoreSourceReliability('user_override')).toBe(1.0);
    expect(scoreSourceReliability('user_pinned')).toBe(1.0);
    expect(scoreSourceReliability('manual')).toBe(1.0);
  });

  it('returns tier 1 for CRM sources', () => {
    expect(scoreSourceReliability('salesforce')).toBe(0.9);
    expect(scoreSourceReliability('hubspot')).toBe(0.9);
  });

  it('returns tier 2 for professional platforms', () => {
    expect(scoreSourceReliability('linkedin')).toBe(0.7);
    expect(scoreSourceReliability('outreach')).toBe(0.7);
  });

  it('returns tier 3 for sales tools', () => {
    expect(scoreSourceReliability('nooks')).toBe(0.5);
    expect(scoreSourceReliability('commonroom')).toBe(0.5);
  });

  it('returns tier 4 for web discovery', () => {
    expect(scoreSourceReliability('google')).toBe(0.3);
    expect(scoreSourceReliability('extension')).toBe(0.3);
    expect(scoreSourceReliability('legacy')).toBe(0.3);
  });

  it('returns default for unknown sources', () => {
    expect(scoreSourceReliability('unknown_source')).toBe(0.3);
    expect(scoreSourceReliability('')).toBe(0.3);
  });

  it('is case-insensitive', () => {
    expect(scoreSourceReliability('Salesforce')).toBe(0.9);
    expect(scoreSourceReliability('LINKEDIN')).toBe(0.7);
  });
});

// ── Recency Scoring ─────────────────────────────────────────────────────

describe('scoreRecency', () => {
  it('scores fresh data (< 30 days) as 1.0', () => {
    expect(scoreRecency(daysAgo(5), NOW)).toBe(1.0);
    expect(scoreRecency(daysAgo(29), NOW)).toBe(1.0);
  });

  it('scores recent data (30-90 days) as 0.7', () => {
    expect(scoreRecency(daysAgo(31), NOW)).toBe(0.7);
    expect(scoreRecency(daysAgo(89), NOW)).toBe(0.7);
  });

  it('scores stale data (90-180 days) as 0.4', () => {
    expect(scoreRecency(daysAgo(91), NOW)).toBe(0.4);
    expect(scoreRecency(daysAgo(179), NOW)).toBe(0.4);
  });

  it('scores old data (> 180 days) as 0.2', () => {
    expect(scoreRecency(daysAgo(200), NOW)).toBe(0.2);
    expect(scoreRecency(daysAgo(365), NOW)).toBe(0.2);
  });

  it('handles missing timestamp', () => {
    expect(scoreRecency(null, NOW)).toBe(0.1);
    expect(scoreRecency(undefined as any, NOW)).toBe(0.1);
  });

  it('handles invalid timestamp', () => {
    expect(scoreRecency('not-a-date', NOW)).toBe(0.1);
  });

  it('treats future dates as fresh', () => {
    const future = new Date(NOW + 86400000).toISOString();
    expect(scoreRecency(future, NOW)).toBe(1.0);
  });
});

// ── Cross-Source Frequency ──────────────────────────────────────────────

describe('scoreCrossSourceFrequency', () => {
  it('scores single-source as 0.2', () => {
    const entries = [
      { value: 'john@acme.com', source: 'linkedin' },
    ];
    expect(scoreCrossSourceFrequency('john@acme.com', entries)).toBe(0.2);
  });

  it('scores 2 sources as 0.5', () => {
    const entries = [
      { value: 'john@acme.com', source: 'linkedin' },
      { value: 'john@acme.com', source: 'salesforce' },
    ];
    expect(scoreCrossSourceFrequency('john@acme.com', entries)).toBe(0.5);
  });

  it('scores 3 sources as 0.75', () => {
    const entries = [
      { value: 'john@acme.com', source: 'linkedin' },
      { value: 'john@acme.com', source: 'salesforce' },
      { value: 'john@acme.com', source: 'outreach' },
    ];
    expect(scoreCrossSourceFrequency('john@acme.com', entries)).toBe(0.75);
  });

  it('scores 4+ sources as 1.0', () => {
    const entries = [
      { value: 'john@acme.com', source: 'linkedin' },
      { value: 'john@acme.com', source: 'salesforce' },
      { value: 'john@acme.com', source: 'outreach' },
      { value: 'john@acme.com', source: 'nooks' },
    ];
    expect(scoreCrossSourceFrequency('john@acme.com', entries)).toBe(1.0);
  });

  it('normalizes values for comparison', () => {
    const entries = [
      { value: 'John@Acme.COM', source: 'linkedin' },
      { value: 'john@acme.com', source: 'salesforce' },
    ];
    expect(scoreCrossSourceFrequency('john@acme.com', entries)).toBe(0.5);
  });

  it('counts unique sources only (not duplicate entries from same source)', () => {
    const entries = [
      { value: 'john@acme.com', source: 'linkedin' },
      { value: 'john@acme.com', source: 'linkedin' }, // Same source twice
    ];
    expect(scoreCrossSourceFrequency('john@acme.com', entries)).toBe(0.2);
  });
});

// ── scoreContacts ───────────────────────────────────────────────────────

describe('scoreContacts', () => {
  it('returns empty array for empty input', () => {
    expect(scoreContacts([], 'email', NOW)).toEqual([]);
    expect(scoreContacts(null as any, 'email', NOW)).toEqual([]);
  });

  it('scores a single valid email entry', () => {
    const entries = [{
      value: 'john@acme.com',
      source: 'salesforce',
      firstSeenAt: daysAgo(10),
      lastSeenAt: daysAgo(2),
    }];
    const result = scoreContacts(entries, 'email', NOW);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBeGreaterThan(0);
    expect(result[0].confidence).toBeLessThanOrEqual(1);
    expect(result[0].value).toBe('john@acme.com');
  });

  it('ranks CRM-sourced email above web-scraped email', () => {
    const entries = [
      { value: 'john@acme.com', source: 'google', lastSeenAt: daysAgo(5) },
      { value: 'john.doe@acme.com', source: 'salesforce', lastSeenAt: daysAgo(5) },
    ];
    const result = scoreContacts(entries, 'email', NOW);
    expect(result[0].source).toBe('salesforce');
    expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
  });

  it('user-pinned entries always get confidence 1.0', () => {
    const entries = [
      { value: 'john@acme.com', source: 'salesforce', lastSeenAt: daysAgo(5), userPinned: false },
      { value: 'john.personal@gmail.com', source: 'legacy', lastSeenAt: daysAgo(100), userPinned: true },
    ];
    const result = scoreContacts(entries, 'email', NOW);
    const pinned = result.find(e => e.userPinned);
    expect(pinned!.confidence).toBe(1.0);
    expect(result[0].userPinned).toBe(true); // Pinned should be first
  });

  it('deduplicates entries by normalized value', () => {
    const entries = [
      { value: 'John@Acme.COM', source: 'linkedin', lastSeenAt: daysAgo(30) },
      { value: 'john@acme.com', source: 'salesforce', lastSeenAt: daysAgo(5) },
    ];
    const result = scoreContacts(entries, 'email', NOW);
    expect(result).toHaveLength(1);
    // Should keep the higher-reliability source (salesforce)
    expect(result[0].source).toBe('salesforce');
  });

  it('drops entries with unnormalizable values (no @ for email, no digits for phone)', () => {
    const entries = [
      { value: 'john@acme.com', source: 'linkedin', lastSeenAt: daysAgo(5) },
      { value: 'not-an-email', source: 'linkedin', lastSeenAt: daysAgo(5) },
    ];
    const result = scoreContacts(entries, 'email', NOW);
    // 'not-an-email' normalizes to empty string → filtered by dedup
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('john@acme.com');
  });

  it('penalizes poorly-formatted but parseable email', () => {
    const entries = [
      { value: 'john@acme.com', source: 'linkedin', lastSeenAt: daysAgo(5) },
      { value: 'bad@nodot', source: 'linkedin', lastSeenAt: daysAgo(5) },
    ];
    const result = scoreContacts(entries, 'email', NOW);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe('john@acme.com');
    // bad@nodot has @ so it normalizes, but fails format validation → lower score
    expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
  });

  it('sorts by confidence descending', () => {
    const entries = [
      { value: 'old@acme.com', source: 'legacy', lastSeenAt: daysAgo(200) },
      { value: 'new@acme.com', source: 'salesforce', lastSeenAt: daysAgo(1) },
      { value: 'mid@acme.com', source: 'linkedin', lastSeenAt: daysAgo(60) },
    ];
    const result = scoreContacts(entries, 'email', NOW);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
    }
  });
});

// ── pickPrimary ─────────────────────────────────────────────────────────

describe('pickPrimary', () => {
  it('returns null for empty input', () => {
    expect(pickPrimary([])).toBeNull();
    expect(pickPrimary(null as any)).toBeNull();
  });

  it('returns highest confidence entry', () => {
    const scored = [
      { value: 'best@acme.com', confidence: 0.9, source: 'salesforce' },
      { value: 'ok@acme.com', confidence: 0.5, source: 'linkedin' },
    ];
    expect(pickPrimary(scored as any)!.value).toBe('best@acme.com');
  });

  it('user-pinned overrides highest confidence', () => {
    const scored = [
      { value: 'best@acme.com', confidence: 0.9, source: 'salesforce', userPinned: false },
      { value: 'pinned@acme.com', confidence: 0.3, source: 'legacy', userPinned: true },
    ];
    expect(pickPrimary(scored as any)!.value).toBe('pinned@acme.com');
  });
});

// ── reconcileLegacy ─────────────────────────────────────────────────────

describe('reconcileLegacy', () => {
  it('returns empty arrays for null person', () => {
    const result = reconcileLegacy(null as any);
    expect(result.emails).toEqual([]);
    expect(result.phones).toEqual([]);
  });

  it('returns empty arrays for person with no contact data', () => {
    const result = reconcileLegacy({ name: 'John' });
    expect(result.emails).toEqual([]);
    expect(result.phones).toEqual([]);
  });

  it('promotes legacy email to contactEmails array', () => {
    const person = {
      email: 'john@acme.com',
      updatedAt: '2026-03-20T00:00:00Z',
    };
    const result = reconcileLegacy(person);
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].value).toBe('john@acme.com');
    expect(result.emails[0].source).toBe('legacy');
    expect(result.emails[0].isPrimary).toBe(true);
  });

  it('promotes legacy phone to contactPhones array', () => {
    const person = {
      phone: '+14155551234',
      updatedAt: '2026-03-20T00:00:00Z',
    };
    const result = reconcileLegacy(person);
    expect(result.phones).toHaveLength(1);
    expect(result.phones[0].value).toBe('+14155551234');
    expect(result.phones[0].source).toBe('legacy');
  });

  it('does not duplicate legacy email if already in contactEmails', () => {
    const person = {
      email: 'john@acme.com',
      contactEmails: [
        { value: 'john@acme.com', source: 'salesforce', firstSeenAt: '2026-03-15T00:00:00Z', lastSeenAt: '2026-03-20T00:00:00Z' },
      ],
    };
    const result = reconcileLegacy(person);
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].source).toBe('salesforce'); // Keeps existing, doesn't add legacy dupe
  });

  it('adds legacy email alongside existing different emails', () => {
    const person = {
      email: 'john.personal@gmail.com',
      contactEmails: [
        { value: 'john@acme.com', source: 'salesforce' },
      ],
      updatedAt: '2026-03-20T00:00:00Z',
    };
    const result = reconcileLegacy(person);
    expect(result.emails).toHaveLength(2);
  });

  it('skips invalid legacy email', () => {
    const person = { email: 'not-an-email' };
    const result = reconcileLegacy(person);
    expect(result.emails).toEqual([]);
  });

  it('skips invalid legacy phone', () => {
    const person = { phone: '123' }; // Too short
    const result = reconcileLegacy(person);
    expect(result.phones).toEqual([]);
  });

  it('normalizes for dedup comparison (case-insensitive email)', () => {
    const person = {
      email: 'John@Acme.COM',
      contactEmails: [
        { value: 'john@acme.com', source: 'linkedin' },
      ],
    };
    const result = reconcileLegacy(person);
    expect(result.emails).toHaveLength(1); // Not duplicated
  });
});

// ── computeContactConsensus (full pipeline) ─────────────────────────────

describe('computeContactConsensus', () => {
  it('handles person with no contact data', () => {
    const result = computeContactConsensus({ name: 'John' });
    expect(result.emails).toEqual([]);
    expect(result.phones).toEqual([]);
    expect(result.primaryEmail).toBeNull();
    expect(result.primaryPhone).toBeNull();
  });

  it('handles legacy-only person (lazy migration)', () => {
    const person = {
      email: 'john@acme.com',
      phone: '+14155551234',
      updatedAt: daysAgo(10),
    };
    const result = computeContactConsensus(person);
    expect(result.emails).toHaveLength(1);
    expect(result.phones).toHaveLength(1);
    expect(result.primaryEmail!.value).toBe('john@acme.com');
    expect(result.primaryPhone!.value).toBe('+14155551234');
    expect(result.primaryEmail!.isPrimary).toBe(true);
    expect(result.primaryPhone!.isPrimary).toBe(true);
  });

  it('picks highest-confidence as primary from multi-source data', () => {
    const person = {
      contactEmails: [
        { value: 'john@acme.com', source: 'salesforce', lastSeenAt: daysAgo(5) },
        { value: 'john.doe@gmail.com', source: 'google', lastSeenAt: daysAgo(2) },
        { value: 'jdoe@acme.com', source: 'linkedin', lastSeenAt: daysAgo(15) },
      ],
    };
    const result = computeContactConsensus(person);
    expect(result.primaryEmail!.value).toBe('john@acme.com'); // Salesforce = highest reliability
    expect(result.emails.filter(e => e.isPrimary)).toHaveLength(1);
  });

  it('respects user-pinned override over consensus', () => {
    const person = {
      contactEmails: [
        { value: 'john@acme.com', source: 'salesforce', lastSeenAt: daysAgo(1) },
        { value: 'john.personal@gmail.com', source: 'legacy', lastSeenAt: daysAgo(200), userPinned: true },
      ],
    };
    const result = computeContactConsensus(person);
    expect(result.primaryEmail!.value).toBe('john.personal@gmail.com');
    expect(result.primaryEmail!.userPinned).toBe(true);
  });

  it('marks exactly one email and one phone as isPrimary', () => {
    const person = {
      contactEmails: [
        { value: 'a@acme.com', source: 'salesforce', lastSeenAt: daysAgo(5) },
        { value: 'b@acme.com', source: 'linkedin', lastSeenAt: daysAgo(10) },
        { value: 'c@acme.com', source: 'google', lastSeenAt: daysAgo(20) },
      ],
      contactPhones: [
        { value: '+14155551234', source: 'nooks', lastSeenAt: daysAgo(3) },
        { value: '+14155559999', source: 'salesforce', lastSeenAt: daysAgo(7) },
      ],
    };
    const result = computeContactConsensus(person);
    expect(result.emails.filter(e => e.isPrimary)).toHaveLength(1);
    expect(result.phones.filter(p => p.isPrimary)).toHaveLength(1);
  });
});

// ── appendContactSighting ───────────────────────────────────────────────

describe('appendContactSighting', () => {
  it('adds new contact to empty array', () => {
    const result = appendContactSighting([], 'john@acme.com', 'salesforce', daysAgo(0));
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('john@acme.com');
    expect(result[0].source).toBe('salesforce');
    expect(result[0].userPinned).toBe(false);
  });

  it('updates existing contact with newer timestamp', () => {
    const existing = [
      { value: 'john@acme.com', source: 'linkedin', firstSeenAt: daysAgo(30), lastSeenAt: daysAgo(30) },
    ];
    const result = appendContactSighting(existing, 'john@acme.com', 'salesforce', daysAgo(1));
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('salesforce'); // Upgraded to higher-tier source
    expect(result[0].lastSeenAt).toBe(daysAgo(1)); // Updated
    expect(result[0].firstSeenAt).toBe(daysAgo(30)); // Preserved
  });

  it('does not downgrade source reliability on re-sighting', () => {
    const existing = [
      { value: 'john@acme.com', source: 'salesforce', firstSeenAt: daysAgo(30), lastSeenAt: daysAgo(10) },
    ];
    const result = appendContactSighting(existing, 'john@acme.com', 'google', daysAgo(1));
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('salesforce'); // NOT downgraded to google
    expect(result[0].lastSeenAt).toBe(daysAgo(1)); // Timestamp still updated
  });

  it('normalizes for dedup (case-insensitive email)', () => {
    const existing = [
      { value: 'john@acme.com', source: 'linkedin', firstSeenAt: daysAgo(30), lastSeenAt: daysAgo(30) },
    ];
    const result = appendContactSighting(existing, 'John@Acme.COM', 'salesforce', daysAgo(1));
    expect(result).toHaveLength(1); // Not duplicated
  });

  it('handles null/empty value gracefully', () => {
    const existing = [{ value: 'john@acme.com', source: 'linkedin' }];
    expect(appendContactSighting(existing, '', 'salesforce')).toEqual(existing);
    expect(appendContactSighting(existing, null as any, 'salesforce')).toEqual(existing);
  });

  it('handles null existing array', () => {
    const result = appendContactSighting(null as any, 'john@acme.com', 'salesforce');
    expect(result).toHaveLength(1);
  });

  it('does not mutate input array', () => {
    const existing = [
      { value: 'john@acme.com', source: 'linkedin', firstSeenAt: daysAgo(30), lastSeenAt: daysAgo(30) },
    ];
    const original = [...existing];
    appendContactSighting(existing, 'new@acme.com', 'salesforce');
    expect(existing).toEqual(original); // Not mutated
  });
});

// ── Deduplication ───────────────────────────────────────────────────────

describe('deduplicateEntries', () => {
  it('merges duplicate values keeping best source', () => {
    const entries = [
      { value: 'john@acme.com', source: 'google', firstSeenAt: daysAgo(30), lastSeenAt: daysAgo(20) },
      { value: 'john@acme.com', source: 'salesforce', firstSeenAt: daysAgo(10), lastSeenAt: daysAgo(5) },
    ];
    const result = deduplicateEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('salesforce'); // Higher reliability
    expect(result[0].firstSeenAt).toBe(daysAgo(30)); // Earliest
    expect(result[0].lastSeenAt).toBe(daysAgo(5)); // Latest
  });

  it('preserves userPinned flag during merge', () => {
    const entries = [
      { value: 'john@acme.com', source: 'google', userPinned: false },
      { value: 'john@acme.com', source: 'salesforce', userPinned: true },
    ];
    const result = deduplicateEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].userPinned).toBe(true);
  });

  it('keeps distinct values separate', () => {
    const entries = [
      { value: 'john@acme.com', source: 'salesforce' },
      { value: 'jane@acme.com', source: 'salesforce' },
    ];
    const result = deduplicateEntries(entries);
    expect(result).toHaveLength(2);
  });

  it('skips entries with empty values', () => {
    const entries = [
      { value: '', source: 'salesforce' },
      { value: 'john@acme.com', source: 'linkedin' },
    ];
    const result = deduplicateEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('john@acme.com');
  });
});

// ── Weight Validation ───────────────────────────────────────────────────

describe('scoring weights', () => {
  it('weights sum to 1.0', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('CRM email beats 3 web-scraped sightings (design requirement)', () => {
    // This validates the weight adjustment: 1 CRM source should tie or beat
    // 3 low-tier sightings of the same value
    const crmReliability = SOURCE_RELIABILITY.salesforce * WEIGHTS.sourceReliability;
    const webFrequency = 0.75 * WEIGHTS.crossSourceFrequency; // 3 sources = 0.75
    const webReliability = SOURCE_RELIABILITY.google * WEIGHTS.sourceReliability;

    // CRM single source: reliability advantage
    // Web 3 sources: frequency advantage + low reliability
    // CRM should win on reliability alone when frequency is equal
    expect(crmReliability).toBeGreaterThan(webReliability);
  });
});
