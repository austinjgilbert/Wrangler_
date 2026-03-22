/**
 * Contact Consensus Engine
 *
 * Scores and ranks multi-source contact data (emails, phones) to determine
 * the "best" primary contact for a person. Pure computation — no Sanity
 * writes, no side effects.
 *
 * Scoring factors (weights sum to 1.0):
 *   - Cross-source frequency (0.30): same value seen across multiple sources
 *   - Source reliability (0.30): CRM > professional platform > sales tool > web scrape
 *   - Recency (0.25): more recent sightings score higher
 *   - Format validity (0.15): well-formed email/phone formats score higher
 *
 * @module contactConsensus
 */

// ── Source Reliability Tiers ────────────────────────────────────────────────

/**
 * Source reliability scores (0-1). Higher = more trustworthy.
 * Tier 0: User override (always wins)
 * Tier 1: CRM systems (user-entered, maintained)
 * Tier 2: Professional platforms (verified identities)
 * Tier 3: Sales tools (semi-structured)
 * Tier 4: Web discovery (unverified)
 */
const SOURCE_RELIABILITY = {
  // Tier 0 — user override
  user_override: 1.0,
  user_pinned: 1.0,
  manual: 1.0,

  // Tier 1 — CRM systems
  salesforce: 0.9,
  hubspot: 0.9,

  // Tier 2 — professional platforms
  linkedin: 0.7,
  outreach: 0.7,

  // Tier 3 — sales tools
  nooks: 0.5,
  commonroom: 0.5,
  apollo: 0.5,
  zoominfo: 0.5,
  '6sense': 0.5,

  // Tier 4 — web discovery
  google: 0.3,
  extension: 0.3,
  chrome_extension: 0.3,
  enrichment: 0.3,
  legacy: 0.3,
};

const DEFAULT_SOURCE_RELIABILITY = 0.3;

// ── Scoring Weights ─────────────────────────────────────────────────────────

const WEIGHTS = {
  crossSourceFrequency: 0.30,
  sourceReliability: 0.30,
  recency: 0.25,
  formatValidity: 0.15,
};

// ── Recency Thresholds ──────────────────────────────────────────────────────

const RECENCY_THRESHOLDS_MS = {
  fresh: 30 * 24 * 60 * 60 * 1000,   // 30 days
  recent: 90 * 24 * 60 * 60 * 1000,  // 90 days
  stale: 180 * 24 * 60 * 60 * 1000,  // 180 days
};

// ── Format Validators ───────────────────────────────────────────────────────

/**
 * Basic email format validation.
 * Not exhaustive — catches obvious garbage without rejecting valid edge cases.
 */
function isValidEmail(value) {
  if (!value || typeof value !== 'string') return false;
  // Must have exactly one @, non-empty local and domain parts, domain has a dot
  const trimmed = value.trim().toLowerCase();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (!domain.includes('.')) return false;
  if (domain.endsWith('.')) return false;
  // Reject obvious garbage
  if (/\s/.test(trimmed)) return false;
  if (local.length > 64 || domain.length > 253) return false;
  return true;
}

/**
 * Phone format validation.
 * Accepts E.164 (+1234567890), common formats with dashes/parens/spaces.
 * Rejects strings that are clearly not phone numbers.
 */
function isValidPhone(value) {
  if (!value || typeof value !== 'string') return false;
  const digits = value.replace(/[^0-9]/g, '');
  // Phone numbers have 7-15 digits
  return digits.length >= 7 && digits.length <= 15;
}

// ── Scoring Functions ───────────────────────────────────────────────────────

/**
 * Score cross-source frequency for a single contact value.
 * Groups all entries by normalized value, returns 0-1 based on unique source count.
 *
 * @param {string} value - The contact value to score
 * @param {Array} allEntries - All entries of the same type (email or phone)
 * @returns {number} 0-1 score
 */
function scoreCrossSourceFrequency(value, allEntries) {
  if (!value || !allEntries?.length) return 0;

  const normalizedTarget = normalizeContactValue(value);
  const sourcesForValue = new Set();

  for (const entry of allEntries) {
    if (normalizeContactValue(entry.value) === normalizedTarget) {
      sourcesForValue.add((entry.source || 'unknown').toLowerCase());
    }
  }

  const sourceCount = sourcesForValue.size;
  if (sourceCount <= 1) return 0.2;
  if (sourceCount === 2) return 0.5;
  if (sourceCount === 3) return 0.75;
  return 1.0; // 4+ sources
}

/**
 * Score source reliability for a contact entry.
 * @param {string} source - Source identifier
 * @returns {number} 0-1 score
 */
function scoreSourceReliability(source) {
  const key = (source || 'unknown').toLowerCase().trim();
  return SOURCE_RELIABILITY[key] ?? DEFAULT_SOURCE_RELIABILITY;
}

/**
 * Score recency based on lastSeenAt timestamp.
 * @param {string|null} lastSeenAt - ISO timestamp
 * @param {number} [now] - Current time in ms (for testing)
 * @returns {number} 0-1 score
 */
function scoreRecency(lastSeenAt, now = Date.now()) {
  if (!lastSeenAt) return 0.1; // No timestamp = low confidence

  const seenAt = new Date(lastSeenAt).getTime();
  if (isNaN(seenAt)) return 0.1;

  const ageMs = now - seenAt;
  if (ageMs < 0) return 1.0; // Future date = treat as fresh
  if (ageMs <= RECENCY_THRESHOLDS_MS.fresh) return 1.0;
  if (ageMs <= RECENCY_THRESHOLDS_MS.recent) return 0.7;
  if (ageMs <= RECENCY_THRESHOLDS_MS.stale) return 0.4;
  return 0.2; // Older than 180 days
}

/**
 * Score format validity for a contact value.
 * @param {string} value - Contact value
 * @param {'email'|'phone'} type - Contact type
 * @returns {number} 0-1 score
 */
function scoreFormatValidity(value, type) {
  if (!value) return 0;
  if (type === 'email') return isValidEmail(value) ? 1.0 : 0.1;
  if (type === 'phone') return isValidPhone(value) ? 1.0 : 0.1;
  return 0.5; // Unknown type
}

// ── Normalization ───────────────────────────────────────────────────────────

/**
 * Normalize a contact value for comparison/dedup.
 * Emails: lowercase, trim. Phones: digits only.
 */
function normalizeContactValue(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  // If it looks like an email, lowercase it
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  // Otherwise treat as phone — extract digits
  return trimmed.replace(/[^0-9+]/g, '');
}

// ── Core API ────────────────────────────────────────────────────────────────

/**
 * Score an array of contact entries and return them ranked by confidence.
 *
 * @param {ContactEntry[]} entries - Array of contact entries
 * @param {'email'|'phone'} type - Contact type for format validation
 * @param {number} [now] - Current time in ms (for testing)
 * @returns {ScoredContact[]} Entries with computed `confidence` score, sorted descending
 *
 * @typedef {Object} ContactEntry
 * @property {string} value - The email or phone value
 * @property {string} source - Source identifier (salesforce, linkedin, etc.)
 * @property {string} [firstSeenAt] - ISO timestamp of first sighting
 * @property {string} [lastSeenAt] - ISO timestamp of most recent sighting
 * @property {boolean} [isPrimary] - Whether this is the current primary
 * @property {boolean} [userPinned] - Whether user explicitly chose this
 *
 * @typedef {ContactEntry & { confidence: number }} ScoredContact
 */
export function scoreContacts(entries, type = 'email', now = Date.now()) {
  if (!entries?.length) return [];

  // Dedup by normalized value — merge sources, keep best timestamps
  const merged = deduplicateEntries(entries);

  const scored = merged.map((entry) => {
    // User-pinned entries always get max confidence
    if (entry.userPinned) {
      return { ...entry, confidence: 1.0 };
    }

    const frequency = scoreCrossSourceFrequency(entry.value, entries);
    const reliability = scoreSourceReliability(entry.source);
    const recency = scoreRecency(entry.lastSeenAt, now);
    const validity = scoreFormatValidity(entry.value, type);

    const confidence = Math.round((
      frequency * WEIGHTS.crossSourceFrequency +
      reliability * WEIGHTS.sourceReliability +
      recency * WEIGHTS.recency +
      validity * WEIGHTS.formatValidity
    ) * 1000) / 1000; // Round to 3 decimal places

    return { ...entry, confidence };
  });

  // Sort by confidence descending, then by lastSeenAt descending for ties
  scored.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    return bTime - aTime;
  });

  return scored;
}

/**
 * Pick the primary contact from a scored list.
 * Respects user overrides — if any entry has `userPinned: true`, it wins.
 * Otherwise, highest confidence wins.
 *
 * @param {ScoredContact[]} scored - Scored and sorted contacts
 * @returns {ScoredContact|null} The primary contact, or null if empty
 */
export function pickPrimary(scored) {
  if (!scored?.length) return null;

  // User-pinned always wins
  const pinned = scored.find((e) => e.userPinned);
  if (pinned) return pinned;

  // Highest confidence (already sorted)
  return scored[0];
}

/**
 * Reconcile legacy flat email/phone fields with the new contactEmails[]/contactPhones[] arrays.
 * Handles the lazy migration case: if arrays are empty but flat fields exist,
 * promotes them to array format.
 *
 * @param {Object} person - Person document (partial)
 * @param {string} [person.email] - Legacy flat email
 * @param {string} [person.phone] - Legacy flat phone
 * @param {ContactEntry[]} [person.contactEmails] - New structured email array
 * @param {ContactEntry[]} [person.contactPhones] - New structured phone array
 * @param {string} [person.updatedAt] - Person's last update timestamp
 * @returns {{ emails: ContactEntry[], phones: ContactEntry[] }} Reconciled arrays
 */
export function reconcileLegacy(person) {
  if (!person) return { emails: [], phones: [] };

  const emails = Array.isArray(person.contactEmails) ? [...person.contactEmails] : [];
  const phones = Array.isArray(person.contactPhones) ? [...person.contactPhones] : [];

  const fallbackTimestamp = person.updatedAt || person._updatedAt || new Date().toISOString();

  // Promote legacy email if not already in the array
  if (person.email && isValidEmail(person.email)) {
    const normalizedLegacy = normalizeContactValue(person.email);
    const alreadyPresent = emails.some(
      (e) => normalizeContactValue(e.value) === normalizedLegacy
    );
    if (!alreadyPresent) {
      emails.push({
        value: person.email.trim(),
        source: 'legacy',
        firstSeenAt: fallbackTimestamp,
        lastSeenAt: fallbackTimestamp,
        confidence: 0.5,
        isPrimary: emails.length === 0, // Primary if it's the only one
        userPinned: false,
      });
    }
  }

  // Promote legacy phone if not already in the array
  if (person.phone && isValidPhone(person.phone)) {
    const normalizedLegacy = normalizeContactValue(person.phone);
    const alreadyPresent = phones.some(
      (e) => normalizeContactValue(e.value) === normalizedLegacy
    );
    if (!alreadyPresent) {
      phones.push({
        value: person.phone.trim(),
        source: 'legacy',
        firstSeenAt: fallbackTimestamp,
        lastSeenAt: fallbackTimestamp,
        confidence: 0.5,
        isPrimary: phones.length === 0,
        userPinned: false,
      });
    }
  }

  return { emails, phones };
}

/**
 * Full pipeline: reconcile legacy → score → pick primary → return results.
 * This is the main entry point for callers.
 *
 * @param {Object} person - Person document
 * @returns {{ emails: ScoredContact[], phones: ScoredContact[], primaryEmail: ScoredContact|null, primaryPhone: ScoredContact|null }}
 */
export function computeContactConsensus(person) {
  const { emails, phones } = reconcileLegacy(person);

  const scoredEmails = scoreContacts(emails, 'email');
  const scoredPhones = scoreContacts(phones, 'phone');

  const primaryEmail = pickPrimary(scoredEmails);
  const primaryPhone = pickPrimary(scoredPhones);

  // Mark isPrimary on the winners
  for (const e of scoredEmails) {
    e.isPrimary = primaryEmail ? normalizeContactValue(e.value) === normalizeContactValue(primaryEmail.value) : false;
  }
  for (const p of scoredPhones) {
    p.isPrimary = primaryPhone ? normalizeContactValue(p.value) === normalizeContactValue(primaryPhone.value) : false;
  }

  return {
    emails: scoredEmails,
    phones: scoredPhones,
    primaryEmail,
    primaryPhone,
  };
}

/**
 * Append a new contact sighting to an existing array.
 * Deduplicates by normalized value — if already present, updates lastSeenAt and
 * adds source to the sighting history. If new, creates a fresh entry.
 *
 * @param {ContactEntry[]} existing - Current contact array
 * @param {string} value - New contact value
 * @param {string} source - Source of this sighting
 * @param {string} [timestamp] - ISO timestamp (defaults to now)
 * @returns {ContactEntry[]} Updated array (new reference, does not mutate input)
 */
export function appendContactSighting(existing, value, source, timestamp) {
  if (!value || typeof value !== 'string') return existing || [];

  const normalizedNew = normalizeContactValue(value);
  if (!normalizedNew) return existing || [];

  const ts = timestamp || new Date().toISOString();
  const entries = Array.isArray(existing) ? [...existing] : [];

  const existingIdx = entries.findIndex(
    (e) => normalizeContactValue(e.value) === normalizedNew
  );

  if (existingIdx >= 0) {
    // Update existing entry — bump lastSeenAt, keep earliest firstSeenAt
    const entry = { ...entries[existingIdx] };
    entry.lastSeenAt = ts;
    if (!entry.firstSeenAt || new Date(ts) < new Date(entry.firstSeenAt)) {
      entry.firstSeenAt = ts;
    }
    // If this is a higher-tier source, upgrade the source field
    const existingReliability = scoreSourceReliability(entry.source);
    const newReliability = scoreSourceReliability(source);
    if (newReliability > existingReliability) {
      entry.source = source;
    }
    entries[existingIdx] = entry;
  } else {
    // New contact value
    entries.push({
      value: value.trim(),
      source: source || 'unknown',
      firstSeenAt: ts,
      lastSeenAt: ts,
      confidence: 0, // Will be computed by scoreContacts()
      isPrimary: false,
      userPinned: false,
    });
  }

  return entries;
}

// ── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Deduplicate entries by normalized value.
 * When duplicates exist, keeps the one with the highest source reliability
 * and merges timestamps (earliest firstSeenAt, latest lastSeenAt).
 */
function deduplicateEntries(entries) {
  const map = new Map();

  for (const entry of entries) {
    const key = normalizeContactValue(entry.value);
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...entry });
      continue;
    }

    // Merge: keep higher-reliability source, merge timestamps
    const existingReliability = scoreSourceReliability(existing.source);
    const newReliability = scoreSourceReliability(entry.source);

    if (newReliability > existingReliability) {
      existing.source = entry.source;
    }

    // Keep earliest firstSeenAt
    if (entry.firstSeenAt && (!existing.firstSeenAt || new Date(entry.firstSeenAt) < new Date(existing.firstSeenAt))) {
      existing.firstSeenAt = entry.firstSeenAt;
    }

    // Keep latest lastSeenAt
    if (entry.lastSeenAt && (!existing.lastSeenAt || new Date(entry.lastSeenAt) > new Date(existing.lastSeenAt))) {
      existing.lastSeenAt = entry.lastSeenAt;
    }

    // Preserve user pin
    if (entry.userPinned) existing.userPinned = true;
  }

  return [...map.values()];
}

// ── Exports for testing ─────────────────────────────────────────────────────

export const _testing = {
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
};
