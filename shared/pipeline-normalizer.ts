/**
 * Pipeline Normalizer — Master data cleaning and unification layer.
 *
 * Every data source flows through this before storage. It:
 *   1. Validates and rejects garbage data (IPs, tickers, state names)
 *   2. Normalizes field names to canonical schema
 *   3. Deduplicates and merges
 *   4. Adds timeseries buckets for pattern recognition
 *   5. Tracks data provenance
 *
 * Usage:
 *   import { normalizeAccount, normalizePerson, normalizeSignal } from '../shared/pipeline-normalizer';
 *   const clean = normalizeAccount(rawData, 'chrome_extension');
 *   if (!clean.valid) console.warn(clean.issues);
 */

import {
  type CanonicalAccount,
  type CanonicalPerson,
  type CanonicalSignal,
  type CaptureSource,
  type DataSource,
  type SignalSource,
  type SignalType,
  type UncertaintyState,
  deriveTimeseriesBuckets,
  buildEntityId,
} from './canonical-schema.ts';
import {
  normalizeAccountDisplayName,
  deriveCommonName,
} from './accountNameNormalizer.js';

// ═══════════════════════════════════════════════════════════════════════════
// Domain Validation — reject garbage before it enters the pipeline
// ═══════════════════════════════════════════════════════════════════════════

/** Revenue bucket strings that got imported as "domains" */
const REVENUE_BUCKET_PATTERN = /^\$[\d,]+[kmb]?[-–]?\$?[\d,]*[kmb]?\+?$/i;

/** IP address pattern */
const IP_ADDRESS_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Known stock tickers that are NOT domains */
const KNOWN_TICKERS = new Set([
  'aeo', 'agf', 'avlr', 'azn', 'biib', 'blk', 'bm', 'brc', 'byd',
  'cf', 'chgg', 'ci', 'cigi', 'clx', 'cmg', 'cnsl', 'crox', 'cslt',
  'dbrg', 'dbx', 'dgx', 'dis', 'dov', 'dxc', 'esrx', 'exr', 'fnf',
  'fsv', 'ftnt', 'gnw', 'go', 'gps', 'has', 'hli', 'hsic', 'iti',
  'jcp', 'jtv', 'kkr', 'kr', 'lh', 'lsxma', 'mdb', 'mga', 'mgm',
  'mitk', 'mitl', 'mscc', 'mu', 'nem', 'nrg', 'nvda', 'nxst', 'oge',
  'oi', 'on', 'otex', 'payc', 'pse', 'pypl', 'rh', 'sanm', 'sbh',
  'sbux', 'scty', 'sig', 'slqt', 'spls', 'spt', 'synh', 'ta', 'tac',
  'tex', 'tjx', 'txt', 'ul', 'unh', 'ups', 'vmw', 'vvnt', 'wern',
  'wpp',
]);

/** US states and Canadian provinces that are NOT domains */
const KNOWN_REGIONS = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
  'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'tennessee', 'texas',
  'utah', 'vermont', 'virginia', 'washington', 'wisconsin', 'wyoming',
  // Canadian provinces
  'alberta', 'ontario', 'quebec', 'victoria', 'karnataka',
]);

/** Generic words that are NOT meaningful domains */
const GENERIC_WORDS = new Set([
  'count', 'total', 'subtotal', 'type', 'website', 'www', 'media',
  'insurance', 'banks', 'materials', 'nonprofit', 'private', 'public',
  'prospect', 'retailing', 'transportation', 'utilities', 'fresh',
  'nile', 'camp', 'lab', 'we', 'w', 'zs',
]);

/** Bare country codes / TLDs that are NOT domains */
const BARE_TLDS = new Set([
  'au', 'ca', 'in', 'kr', 'us', 'uk', 'de', 'fr', 'jp',
]);

export interface ValidationResult<T> {
  valid: boolean;
  data: T | null;
  issues: string[];
  rejected: boolean;
  rejectionReason?: string;
}

/**
 * Check if a string looks like a valid domain (not garbage data).
 */
export function isValidDomain(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const lower = value.trim().toLowerCase();

  if (lower.length < 2) return false;
  if (REVENUE_BUCKET_PATTERN.test(lower)) return false;
  if (IP_ADDRESS_PATTERN.test(lower)) return false;
  if (KNOWN_TICKERS.has(lower)) return false;
  if (KNOWN_REGIONS.has(lower)) return false;
  if (GENERIC_WORDS.has(lower)) return false;
  if (BARE_TLDS.has(lower)) return false;

  // Must contain a dot (actual domain) OR be a known company name
  // Single words without dots are suspicious unless they're in overrides
  if (!lower.includes('.') && lower.length < 4) return false;

  return true;
}

/**
 * Classify why a domain-like string is invalid.
 */
export function classifyInvalidDomain(value: string): string {
  const lower = (value || '').trim().toLowerCase();
  if (REVENUE_BUCKET_PATTERN.test(lower)) return 'revenue_bucket';
  if (IP_ADDRESS_PATTERN.test(lower)) return 'ip_address';
  if (KNOWN_TICKERS.has(lower)) return 'stock_ticker';
  if (KNOWN_REGIONS.has(lower)) return 'region_name';
  if (GENERIC_WORDS.has(lower)) return 'generic_word';
  if (BARE_TLDS.has(lower)) return 'bare_tld';
  if (!lower.includes('.') && lower.length < 4) return 'too_short';
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// Domain Normalization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize a URL or domain string to a clean root domain.
 */
export function normalizeRootDomain(input: string): string | null {
  if (!input) return null;
  let cleaned = String(input).trim().toLowerCase();

  // Strip protocol
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  // Strip www
  cleaned = cleaned.replace(/^www\./i, '');
  // Strip trailing path
  cleaned = cleaned.split('/')[0];
  // Strip port
  cleaned = cleaned.split(':')[0];

  if (!cleaned || !isValidDomain(cleaned)) return null;
  return cleaned;
}

/**
 * Build a canonical URL from a domain.
 */
export function buildCanonicalUrl(domain: string): string {
  const root = normalizeRootDomain(domain);
  if (!root) return '';
  return `https://${root}`;
}

/**
 * Derive an account key from a domain.
 */
export function deriveAccountKey(domain: string): string {
  const root = normalizeRootDomain(domain);
  if (!root) return '';
  return root
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 80);
}

// ═══════════════════════════════════════════════════════════════════════════
// LinkedIn URL Normalization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize LinkedIn URL to consistent format.
 * Always uses lowercase `linkedinUrl` (not `linkedInUrl`).
 */
export function normalizeLinkedinUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  let cleaned = String(url).trim();

  // Ensure https
  if (cleaned.startsWith('http://')) {
    cleaned = cleaned.replace('http://', 'https://');
  }
  if (!cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }

  // Normalize www
  cleaned = cleaned.replace('://www.linkedin.com', '://linkedin.com');

  // Strip trailing slash
  cleaned = cleaned.replace(/\/+$/, '');

  // Strip query params
  cleaned = cleaned.split('?')[0];

  if (!cleaned.includes('linkedin.com')) return null;
  return cleaned;
}

// ═══════════════════════════════════════════════════════════════════════════
// Account Normalizer
// ═══════════════════════════════════════════════════════════════════════════

interface RawAccountInput {
  _id?: string;
  _type?: string;
  accountKey?: string;
  name?: string;
  companyName?: string;
  domain?: string;
  rootDomain?: string;
  canonicalUrl?: string;
  url?: string;
  website?: string;
  industry?: string;
  description?: string;
  about?: string;
  linkedinUrl?: string;
  linkedInUrl?: string;
  specialties?: string[];
  classification?: any;
  techStack?: string[];
  technologyStack?: any;
  technologies?: any[];
  leadership?: any[];
  painPoints?: any[];
  competitors?: any[];
  competitorResearch?: any;
  benchmarks?: any;
  opportunityScore?: number;
  aiReadiness?: any;
  aiReadinessScore?: number;
  performance?: any;
  performanceScore?: number;
  businessScale?: any;
  businessUnits?: any;
  profileCompleteness?: any;
  signals?: string[];
  observedAt?: string;
  lastValidatedAt?: string;
  staleAfter?: string;
  refreshPriority?: number;
  uncertaintyState?: UncertaintyState;
  createdAt?: string;
  updatedAt?: string;
  lastScannedAt?: string;
  lastEnrichedAt?: string;
  [key: string]: any;
}

export function normalizeAccount(
  raw: RawAccountInput,
  origin: CaptureSource = 'manual_entry',
): ValidationResult<CanonicalAccount> {
  const issues: string[] = [];

  // ── Resolve domain ──
  const domainSource = raw.domain || raw.rootDomain || raw.canonicalUrl || raw.url || raw.website || '';
  const rootDomain = normalizeRootDomain(domainSource);

  if (!rootDomain) {
    // Try to extract from accountKey or _id
    const fallbackDomain = normalizeRootDomain(raw.accountKey || raw._id || '');
    if (!fallbackDomain) {
      const reason = classifyInvalidDomain(domainSource);
      return {
        valid: false,
        data: null,
        issues: [`Invalid domain: "${domainSource}" (${reason})`],
        rejected: true,
        rejectionReason: reason,
      };
    }
  }

  const effectiveDomain = rootDomain || normalizeRootDomain(raw.accountKey || '') || '';
  if (!effectiveDomain) {
    return {
      valid: false,
      data: null,
      issues: ['No valid domain could be derived'],
      rejected: true,
      rejectionReason: 'no_domain',
    };
  }

  const accountKey = deriveAccountKey(effectiveDomain);
  const _id = buildEntityId('account', accountKey);
  const canonicalUrl = buildCanonicalUrl(effectiveDomain);

  // ── Display name ──
  const displayName = normalizeAccountDisplayName({
    companyName: raw.companyName,
    name: raw.name,
    domain: effectiveDomain,
    rootDomain: effectiveDomain,
    accountKey,
    _id,
  }) || effectiveDomain;

  // ── LinkedIn URL (normalize casing inconsistency) ──
  const linkedinUrl = normalizeLinkedinUrl(raw.linkedinUrl || raw.linkedInUrl);

  // ── Tech stack unification ──
  const techStack = unifyTechStack(raw);

  // ── Scores ──
  const opportunityScore = safeNumber(raw.opportunityScore);
  const aiReadinessScore = safeNumber(raw.aiReadinessScore || raw.aiReadiness?.score);
  const performanceScore = safeNumber(raw.performanceScore || raw.performance?.performanceScore);

  // ── Timestamps ──
  const now = new Date().toISOString();
  const observedAt = raw.observedAt || raw.createdAt || now;
  const timeBuckets = deriveTimeseriesBuckets(observedAt);

  // ── Validation warnings ──
  if (!raw.companyName && !raw.name) issues.push('missing_display_name');
  if (!raw.industry) issues.push('missing_industry');
  if (techStack.length === 0) issues.push('empty_tech_stack');
  if (opportunityScore === undefined) issues.push('missing_opportunity_score');

  const account: CanonicalAccount = {
    _type: 'account',
    _id,
    accountKey,
    displayName,
    canonicalUrl,
    rootDomain: effectiveDomain,
    industry: raw.industry || raw.classification?.industry,
    description: raw.description || raw.about,
    linkedinUrl: linkedinUrl || undefined,
    specialties: cleanStringArray(raw.specialties),
    classification: raw.classification,
    techStack,
    technologyRefs: normalizeRefs(raw.technologies),
    techBreakdown: normalizeTechBreakdown(raw.technologyStack),
    leadershipRefs: normalizeRefs(raw.leadership),
    painPoints: raw.painPoints,
    competitorRefs: normalizeRefs(raw.competitors),
    competitorResearch: raw.competitorResearch,
    benchmarks: raw.benchmarks,
    opportunityScore,
    aiReadinessScore,
    performanceScore,
    businessScale: normalizeBusinessScale(raw.businessScale || raw.businessUnits),
    profileCompleteness: raw.profileCompleteness,
    signalSummaries: cleanStringArray(raw.signals),
    sources: [{
      origin,
      capturedAt: now,
      confidence: 0.8,
    }],
    observedAt,
    lastValidatedAt: raw.lastValidatedAt || now,
    staleAfter: raw.staleAfter || addDays(now, 30),
    refreshPriority: raw.refreshPriority || 50,
    uncertaintyState: raw.uncertaintyState || 'needs_validation',
    ...timeBuckets,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };

  return {
    valid: true,
    data: account,
    issues,
    rejected: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Person Normalizer
// ═══════════════════════════════════════════════════════════════════════════

interface RawPersonInput {
  _id?: string;
  _type?: string;
  personKey?: string;
  name?: string;
  title?: string;
  headline?: string;
  linkedinUrl?: string;
  linkedInUrl?: string;
  profileUrl?: string;
  location?: string;
  about?: string;
  email?: string;
  companyRef?: any;
  currentCompany?: string;
  currentTitle?: string;
  relatedAccountKey?: string;
  rootDomain?: string;
  roleCategory?: any;
  seniorityLevel?: any;
  isDecisionMaker?: boolean;
  buyerPersona?: string;
  experience?: any[];
  education?: any[];
  skills?: string[];
  certifications?: any[];
  publications?: any[];
  languages?: any[];
  connections?: number | string | null;
  signals?: string[];
  observedAt?: string;
  lastValidatedAt?: string;
  staleAfter?: string;
  refreshPriority?: number;
  uncertaintyState?: UncertaintyState;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export function normalizePerson(
  raw: RawPersonInput,
  origin: CaptureSource = 'manual_entry',
): ValidationResult<CanonicalPerson> {
  const issues: string[] = [];

  // ── LinkedIn URL (fix casing inconsistency) ──
  const linkedinUrl = normalizeLinkedinUrl(raw.linkedinUrl || raw.linkedInUrl || raw.profileUrl);

  // ── Person key ──
  const personKey = raw.personKey || derivePersonKey(raw.name, linkedinUrl);
  if (!personKey) {
    return {
      valid: false,
      data: null,
      issues: ['Cannot derive person key: no name or LinkedIn URL'],
      rejected: true,
      rejectionReason: 'no_identity',
    };
  }

  const _id = buildEntityId('person', personKey);

  // ── Display name ──
  const displayName = cleanString(raw.name) || 'Unknown Person';

  // ── Connections (normalize string → number) ──
  const connections = typeof raw.connections === 'number'
    ? raw.connections
    : typeof raw.connections === 'string'
      ? parseInt(raw.connections.replace(/[^0-9]/g, ''), 10) || undefined
      : undefined;

  // ── Timestamps ──
  const now = new Date().toISOString();
  const observedAt = raw.observedAt || raw.createdAt || now;
  const timeBuckets = deriveTimeseriesBuckets(observedAt);

  // ── Validation warnings ──
  if (!raw.name) issues.push('missing_name');
  if (!linkedinUrl) issues.push('missing_linkedin_url');
  if (!raw.currentCompany) issues.push('missing_current_company');
  if (!raw.roleCategory) issues.push('missing_role_category');

  const person: CanonicalPerson = {
    _type: 'person',
    _id,
    personKey,
    displayName,
    title: raw.title,
    headline: raw.headline,
    linkedinUrl: linkedinUrl || undefined,
    location: raw.location,
    about: raw.about,
    email: raw.email,
    accountRef: raw.companyRef ? normalizeRef(raw.companyRef) : undefined,
    currentCompany: raw.currentCompany,
    currentTitle: raw.currentTitle || raw.title,
    relatedAccountKey: raw.relatedAccountKey,
    rootDomain: normalizeRootDomain(raw.rootDomain || '') || undefined,
    roleCategory: raw.roleCategory,
    seniorityLevel: raw.seniorityLevel,
    isDecisionMaker: raw.isDecisionMaker,
    buyerPersona: raw.buyerPersona,
    experience: raw.experience,
    education: raw.education,
    skills: cleanStringArray(raw.skills),
    certifications: raw.certifications,
    publications: raw.publications,
    languages: raw.languages,
    connections,
    signalSummaries: cleanStringArray(raw.signals),
    sources: [{
      origin,
      capturedAt: now,
      confidence: 0.8,
    }],
    observedAt,
    lastValidatedAt: raw.lastValidatedAt || now,
    staleAfter: raw.staleAfter || addDays(now, 30),
    refreshPriority: raw.refreshPriority || 50,
    uncertaintyState: raw.uncertaintyState || 'needs_validation',
    ...timeBuckets,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };

  return {
    valid: true,
    data: person,
    issues,
    rejected: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Signal Normalizer (timeseries-native)
// ═══════════════════════════════════════════════════════════════════════════

interface RawSignalInput {
  id?: string;
  _id?: string;
  source?: string;
  signalType?: string;
  type?: string;
  account?: any;
  person?: any;
  strength?: number;
  baseStrength?: number;
  timestamp?: string;
  observedAt?: string;
  metadata?: Record<string, any>;
  summary?: string;
  [key: string]: any;
}

/** Signal half-life in hours by type */
export const SIGNAL_HALF_LIFE_HOURS: Record<string, number> = {
  signup: 24,
  pricing_page_visit: 48,
  intent_spike: 72,
  job_posting: 24 * 14,
  website_scan: 24 * 7,
  linkedin_context: 24 * 5,
  mql: 24 * 3,
  slack_alert: 24,
  routing_signal: 24,
  operator_note: 24 * 7,
};

export function normalizeSignalEvent(
  raw: RawSignalInput,
  origin: CaptureSource = 'manual_entry',
): ValidationResult<CanonicalSignal> {
  const issues: string[] = [];

  // ── Source & type ──
  const source = resolveSignalSource(raw.source || '');
  const signalType = resolveSignalType(raw.signalType || raw.type || '', source, raw.metadata || {});

  // ── Timestamps ──
  const now = new Date().toISOString();
  const observedAt = raw.observedAt || raw.timestamp || now;
  const timeBuckets = deriveTimeseriesBuckets(observedAt);

  // ── Strength ──
  const halfLifeHours = SIGNAL_HALF_LIFE_HOURS[signalType] || (24 * 7);
  const baseStrength = clamp(raw.baseStrength ?? raw.strength ?? inferBaseStrength(signalType, source), 0, 1);
  const currentStrength = calculateDecay(baseStrength, observedAt, halfLifeHours, now);

  // ── Dedupe key ──
  const accountRef = raw.account ? normalizeRef(raw.account) : null;
  const personRef = raw.person ? normalizeRef(raw.person) : null;
  const dedupeKey = buildDedupeKey(source, signalType, accountRef?._ref, personRef?._ref, observedAt, raw.metadata || {});
  const signalId = raw.id || raw._id || `signal.${safeId(dedupeKey)}`;

  // ── Summary ──
  const summary = raw.summary || `${signalType} from ${source} | strength ${currentStrength.toFixed(2)}`;

  // ── Validation ──
  if (!accountRef && !personRef) issues.push('unattached_signal');
  if (baseStrength < 0.1) issues.push('very_weak_signal');

  const signal: CanonicalSignal = {
    _type: 'signal',
    _id: signalId,
    signalId,
    dedupeKey,
    source,
    signalType,
    accountRef,
    personRef,
    baseStrength,
    currentStrength,
    halfLifeHours,
    summary,
    metadata: {
      ...(raw.metadata || {}),
      normalizedAt: now,
    },
    sources: [{
      origin,
      capturedAt: now,
      confidence: baseStrength,
    }],
    observedAt,
    lastValidatedAt: now,
    staleAfter: addHours(observedAt, halfLifeHours * 3),
    refreshPriority: Math.max(25, Math.round(baseStrength * 100)),
    uncertaintyState: currentStrength > 0.6 ? 'likely' : currentStrength > 0.3 ? 'weakly_inferred' : 'stale',
    ...timeBuckets,
    createdAt: now,
    updatedAt: now,
  };

  return {
    valid: true,
    data: signal,
    issues,
    rejected: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Batch Normalizer — process a full ingest payload
// ═══════════════════════════════════════════════════════════════════════════

export interface BatchNormalizeResult {
  accounts: { accepted: CanonicalAccount[]; rejected: Array<{ raw: any; reason: string }> };
  people: { accepted: CanonicalPerson[]; rejected: Array<{ raw: any; reason: string }> };
  signals: { accepted: CanonicalSignal[]; rejected: Array<{ raw: any; reason: string }> };
  stats: {
    totalInput: number;
    totalAccepted: number;
    totalRejected: number;
    issues: string[];
  };
}

export function normalizeBatch(input: {
  accounts?: any[];
  people?: any[];
  signals?: any[];
  origin?: CaptureSource;
}): BatchNormalizeResult {
  const origin = input.origin || 'manual_entry';
  const allIssues: string[] = [];

  const accountResults = (input.accounts || []).map(raw => normalizeAccount(raw, origin));
  const personResults = (input.people || []).map(raw => normalizePerson(raw, origin));
  const signalResults = (input.signals || []).map(raw => normalizeSignalEvent(raw, origin));

  const acceptedAccounts = accountResults.filter(r => r.valid).map(r => r.data!);
  const rejectedAccounts = accountResults.filter(r => !r.valid).map((r, i) => ({
    raw: input.accounts![i],
    reason: r.rejectionReason || r.issues.join('; '),
  }));

  const acceptedPeople = personResults.filter(r => r.valid).map(r => r.data!);
  const rejectedPeople = personResults.filter(r => !r.valid).map((r, i) => ({
    raw: input.people![i],
    reason: r.rejectionReason || r.issues.join('; '),
  }));

  const acceptedSignals = signalResults.filter(r => r.valid).map(r => r.data!);
  const rejectedSignals = signalResults.filter(r => !r.valid).map((r, i) => ({
    raw: input.signals![i],
    reason: r.rejectionReason || r.issues.join('; '),
  }));

  // Collect all issues
  [...accountResults, ...personResults, ...signalResults].forEach(r => {
    allIssues.push(...r.issues);
  });

  const totalInput = (input.accounts?.length || 0) + (input.people?.length || 0) + (input.signals?.length || 0);
  const totalAccepted = acceptedAccounts.length + acceptedPeople.length + acceptedSignals.length;

  return {
    accounts: { accepted: acceptedAccounts, rejected: rejectedAccounts },
    people: { accepted: acceptedPeople, rejected: rejectedPeople },
    signals: { accepted: acceptedSignals, rejected: rejectedSignals },
    stats: {
      totalInput,
      totalAccepted,
      totalRejected: totalInput - totalAccepted,
      issues: [...new Set(allIssues)],
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════

function unifyTechStack(raw: RawAccountInput): string[] {
  const techs = new Set<string>();

  // From flat array
  if (Array.isArray(raw.techStack)) {
    raw.techStack.forEach(t => {
      if (typeof t === 'string' && t.trim()) techs.add(t.trim());
    });
  }

  // From nested object
  if (raw.technologyStack && typeof raw.technologyStack === 'object') {
    const ts = raw.technologyStack;
    for (const key of ['cms', 'frameworks', 'legacySystems', 'pimSystems', 'damSystems', 'lmsSystems', 'migrationOpportunities',
      'modernFrameworks', 'cmsSystems']) {
      if (Array.isArray(ts[key])) {
        ts[key].forEach((t: string) => {
          if (typeof t === 'string' && t.trim()) techs.add(t.trim());
        });
      }
    }
  }

  return Array.from(techs).sort();
}

function normalizeTechBreakdown(ts: any): CanonicalAccount['techBreakdown'] | undefined {
  if (!ts || typeof ts !== 'object') return undefined;
  return {
    cms: cleanStringArray(ts.cms || ts.cmsSystems),
    frameworks: cleanStringArray(ts.frameworks || ts.modernFrameworks),
    legacySystems: cleanStringArray(ts.legacySystems),
    pim: cleanStringArray(ts.pimSystems),
    dam: cleanStringArray(ts.damSystems),
    lms: cleanStringArray(ts.lmsSystems),
    migrationOpportunities: cleanStringArray(ts.migrationOpportunities),
    painPoints: cleanStringArray(ts.painPoints),
  };
}

function normalizeBusinessScale(bs: any): CanonicalAccount['businessScale'] | undefined {
  if (!bs || typeof bs !== 'object') return undefined;
  return {
    scale: bs.businessScale || bs.scale,
    estimatedAnnualRevenue: bs.estimatedAnnualRevenue,
    estimatedMonthlyTraffic: bs.estimatedMonthlyTraffic,
  };
}

function normalizeRefs(refs: any[] | undefined): any[] | undefined {
  if (!Array.isArray(refs)) return undefined;
  return refs.map(normalizeRef).filter(Boolean);
}

function normalizeRef(ref: any): any {
  if (!ref) return null;
  if (typeof ref === 'string') return { _type: 'reference', _ref: ref };
  if (ref._ref) return { _type: 'reference', _ref: ref._ref };
  return null;
}

function derivePersonKey(name?: string, linkedinUrl?: string | null): string {
  if (linkedinUrl) {
    const slug = linkedinUrl
      .replace(/^https?:\/\/(www\.)?linkedin\.com\/(in|pub)\//i, '')
      .replace(/\/+$/, '')
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase();
    return slug || '';
  }
  if (name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  return '';
}

function resolveSignalSource(source: string): SignalSource {
  const s = String(source || '').trim().toLowerCase();
  if (s.includes('website') || s.includes('scan')) return 'website_scan';
  if (s.includes('linkedin') || s.includes('sales navigator')) return 'linkedin_sales_navigator';
  if (s.includes('mql')) return 'mql_event';
  if (s.includes('intent')) return 'intent_platform';
  if (s.includes('signup') || s.includes('product')) return 'product_signup';
  if (s.includes('slack')) return 'slack_alert';
  if (s.includes('leandata') || s.includes('routing')) return 'leandata_routing';
  return 'manual_operator_note';
}

function resolveSignalType(raw: string, source: SignalSource, metadata: Record<string, any>): SignalType {
  const s = String(raw || metadata.signalType || metadata.eventType || '').trim().toLowerCase();
  if (s.includes('signup')) return 'signup';
  if (s.includes('pricing')) return 'pricing_page_visit';
  if (s.includes('intent')) return 'intent_spike';
  if (s.includes('job')) return 'job_posting';
  if (source === 'website_scan') return 'website_scan';
  if (source === 'linkedin_sales_navigator') return 'linkedin_context';
  if (source === 'mql_event') return 'mql';
  if (source === 'slack_alert') return 'slack_alert';
  if (source === 'leandata_routing') return 'routing_signal';
  return 'operator_note';
}

function inferBaseStrength(signalType: SignalType, source: SignalSource): number {
  if (signalType === 'signup') return 0.95;
  if (signalType === 'pricing_page_visit') return 0.85;
  if (signalType === 'intent_spike') return 0.8;
  if (signalType === 'job_posting') return 0.55;
  if (source === 'mql_event') return 0.9;
  if (source === 'linkedin_sales_navigator') return 0.7;
  if (source === 'website_scan') return 0.65;
  if (source === 'slack_alert' || source === 'leandata_routing') return 0.75;
  return 0.5;
}

function calculateDecay(baseStrength: number, observedAt: string, halfLifeHours: number, now: string): number {
  const nowMs = new Date(now).getTime();
  const obsMs = new Date(observedAt).getTime();
  const ageHours = Math.max(0, (nowMs - obsMs) / (1000 * 60 * 60));
  return clamp(baseStrength * Math.pow(0.5, ageHours / halfLifeHours), 0, 1);
}

function buildDedupeKey(
  source: SignalSource,
  signalType: SignalType,
  accountRef: string | undefined,
  personRef: string | undefined,
  timestamp: string,
  metadata: Record<string, any>,
): string {
  const entityRef = accountRef || personRef || 'unattached';
  const fingerprint = String(metadata?.sourceUrl || metadata?.externalId || metadata?.summary || 'no-fingerprint').slice(0, 120);
  const bucket = new Date(timestamp).toISOString().slice(0, 13);
  return [source, signalType, entityRef, fingerprint, bucket].map(safeId).join('.');
}

function cleanStringArray(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(s => typeof s === 'string' ? s.trim() : '')
    .filter(Boolean);
}

function cleanString(s: any): string {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function safeId(value: string): string {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}

function safeNumber(value: any): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function addHours(iso: string, hours: number): string {
  const d = new Date(iso);
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}
