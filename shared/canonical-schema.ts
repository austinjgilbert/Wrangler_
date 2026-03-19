/**
 * Canonical Schema — Single source of truth for all entity shapes.
 *
 * Every data source (Chrome extension, enrichment pipeline, OSINT, calls,
 * molt logs, network daily runs) MUST normalize into these shapes before
 * storage. This ensures:
 *   1. Consistent field names across all sources
 *   2. Timeseries-ready timestamps (ISO 8601, UTC)
 *   3. Unified ID strategy: `{entityType}.{deterministicKey}`
 *   4. Clean separation of raw vs derived data
 *
 * Import with: import type { CanonicalAccount, ... } from '../shared/canonical-schema';
 */

// ═══════════════════════════════════════════════════════════════════════════
// Timeseries Envelope — every entity carries these for pattern recognition
// ═══════════════════════════════════════════════════════════════════════════

export interface TimeseriesEnvelope {
  /** When this entity was first observed (ISO 8601 UTC) */
  observedAt: string;
  /** When this entity was last validated/refreshed (ISO 8601 UTC) */
  lastValidatedAt: string;
  /** When this entity becomes stale and needs refresh (ISO 8601 UTC) */
  staleAfter: string;
  /** Priority for refresh (0-100, higher = more urgent) */
  refreshPriority: number;
  /** Confidence state */
  uncertaintyState: UncertaintyState;
  /** Date bucket for timeseries grouping: YYYY-MM-DD */
  eventDate: string;
  /** Week bucket for timeseries grouping: YYYY-Www */
  eventWeek: string;
  /** Month bucket for timeseries grouping: YYYY-MM */
  eventMonth: string;
}

export type UncertaintyState =
  | 'confirmed'
  | 'likely'
  | 'weakly_inferred'
  | 'contradictory'
  | 'stale'
  | 'needs_validation';

// ═══════════════════════════════════════════════════════════════════════════
// Canonical Account
// ═══════════════════════════════════════════════════════════════════════════

export interface CanonicalAccount extends TimeseriesEnvelope {
  _type: 'account';
  /** Deterministic ID: `account.{accountKey}` */
  _id: string;
  /** Lowercase, alphanumeric key derived from domain */
  accountKey: string;

  // ── Identity ──
  /** Normalized display name (from deriveCommonName) */
  displayName: string;
  /** Canonical URL: `https://{domain}` */
  canonicalUrl: string;
  /** Root domain: `example.com` (no www, no protocol) */
  rootDomain: string;
  /** Industry vertical */
  industry?: string;
  /** Short description */
  description?: string;
  /** LinkedIn company page URL */
  linkedinUrl?: string;
  /** Specialties / tags */
  specialties?: string[];

  // ── Classification ──
  classification?: {
    industry?: string;
    segment?: string;
    tags?: string[];
    aiReadinessTier?: string;
    opportunityTier?: string;
    classifiedAt?: string;
  };

  // ── Technology (unified — single array of canonical tech refs) ──
  /** Canonical tech stack: normalized technology names */
  techStack: string[];
  /** Sanity references to technology documents */
  technologyRefs?: SanityReference[];
  /** Structured tech breakdown (derived from techStack) */
  techBreakdown?: {
    cms: string[];
    frameworks: string[];
    legacySystems: string[];
    pim: string[];
    dam: string[];
    lms: string[];
    migrationOpportunities: string[];
    painPoints: string[];
  };

  // ── People ──
  leadershipRefs?: SanityReference[];

  // ── Pain Points ──
  painPoints?: PainPoint[];

  // ── Competitors ──
  competitorRefs?: SanityReference[];
  competitorResearch?: {
    count?: number;
    researchedAt?: string;
  };

  // ── Benchmarks ──
  benchmarks?: Benchmarks;

  // ── Scores ──
  opportunityScore?: number;
  aiReadinessScore?: number;
  performanceScore?: number;
  businessScale?: {
    scale?: string;
    estimatedAnnualRevenue?: string;
    estimatedMonthlyTraffic?: string;
  };

  // ── Profile Completeness ──
  profileCompleteness?: {
    score: number;
    gaps: string[];
    nextStages: string[];
    assessedAt: string;
  };

  // ── Signal summaries (denormalized for quick access) ──
  signalSummaries?: string[];

  // ── Source tracking ──
  sources: DataSource[];

  // ── Timestamps ──
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Canonical Person
// ═══════════════════════════════════════════════════════════════════════════

export interface CanonicalPerson extends TimeseriesEnvelope {
  _type: 'person';
  /** Deterministic ID: `person.{personKey}` */
  _id: string;
  /** Lowercase key derived from LinkedIn URL or name hash */
  personKey: string;

  // ── Identity ──
  displayName: string;
  title?: string;
  headline?: string;
  /** Always lowercase, always `linkedinUrl` (not linkedInUrl) */
  linkedinUrl?: string;
  location?: string;
  about?: string;
  email?: string;

  // ── Company Link ──
  accountRef?: SanityReference;
  currentCompany?: string;
  currentTitle?: string;
  relatedAccountKey?: string;
  rootDomain?: string;

  // ── Role & Influence ──
  roleCategory?: RoleCategory;
  seniorityLevel?: SeniorityLevel;
  isDecisionMaker?: boolean;
  buyerPersona?: string;

  // ── Experience & Skills ──
  experience?: Experience[];
  education?: Education[];
  skills?: string[];
  certifications?: Certification[];
  publications?: Publication[];
  languages?: Language[];
  connections?: number;

  // ── Signal summaries ──
  signalSummaries?: string[];

  // ── Source tracking ──
  sources: DataSource[];

  // ── Timestamps ──
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Canonical Signal (timeseries-native)
// ═══════════════════════════════════════════════════════════════════════════

export interface CanonicalSignal extends TimeseriesEnvelope {
  _type: 'signal';
  /** Deterministic ID: `signal.{dedupeKey}` */
  _id: string;
  signalId: string;
  dedupeKey: string;

  // ── Classification ──
  source: SignalSource;
  signalType: SignalType;

  // ── Entity links ──
  accountRef?: SanityReference | null;
  personRef?: SanityReference | null;

  // ── Strength ──
  /** Raw strength at observation time (0-1) */
  baseStrength: number;
  /** Decayed strength at query time (0-1) */
  currentStrength: number;
  /** Half-life in hours for this signal type */
  halfLifeHours: number;

  // ── Content ──
  summary: string;
  metadata: Record<string, any>;

  // ── Source reliability ──
  sourceReliability?: {
    reliabilityScore?: number;
    historicalSuccessCorrelation?: number;
    noiseRate?: number;
  };

  // ── Source tracking ──
  sources: DataSource[];

  // ── Timestamps ──
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Canonical Technology
// ═══════════════════════════════════════════════════════════════════════════

export interface CanonicalTechnology {
  _type: 'technology';
  _id: string;
  /** Lowercase slug: `react`, `wordpress`, `shopify` */
  slug: string;
  /** Display name: `React`, `WordPress`, `Shopify` */
  displayName: string;
  category: TechnologyCategory;
  vendor?: string;
  website?: string;
  description?: string;
  isLegacy: boolean;
  isMigrationTarget: boolean;
  detectionSignals?: string[];
  accountCount?: number;
  tags?: string[];
  lastEnrichedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Source Tracking — provenance for every piece of data
// ═══════════════════════════════════════════════════════════════════════════

export interface DataSource {
  /** Where this data came from */
  origin: CaptureSource;
  /** When it was captured */
  capturedAt: string;
  /** Confidence in this source (0-1) */
  confidence: number;
  /** URL or identifier of the source */
  sourceUrl?: string;
}

export type CaptureSource =
  | 'linkedin'
  | 'salesforce'
  | 'hubspot'
  | 'outreach'
  | 'commonroom'
  | 'looker'
  | 'gong'
  | 'apollo'
  | 'zoominfo'
  | '6sense'
  | 'website_scan'
  | 'chrome_extension'
  | 'enrichment_pipeline'
  | 'manual_entry'
  | 'xlsx_import'
  | string;

// ═══════════════════════════════════════════════════════════════════════════
// Signal Enums
// ═══════════════════════════════════════════════════════════════════════════

export type SignalSource =
  | 'website_scan'
  | 'linkedin_sales_navigator'
  | 'mql_event'
  | 'intent_platform'
  | 'product_signup'
  | 'slack_alert'
  | 'leandata_routing'
  | 'manual_operator_note';

export type SignalType =
  | 'signup'
  | 'pricing_page_visit'
  | 'intent_spike'
  | 'job_posting'
  | 'website_scan'
  | 'linkedin_context'
  | 'mql'
  | 'slack_alert'
  | 'routing_signal'
  | 'operator_note'
  | string;

// ═══════════════════════════════════════════════════════════════════════════
// Sub-types (shared)
// ═══════════════════════════════════════════════════════════════════════════

export interface PainPoint {
  category: string;
  description: string;
  severity?: 'high' | 'medium' | 'low';
  source?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface Benchmarks {
  estimatedRevenue?: string;
  estimatedEmployees?: string;
  estimatedTraffic?: string;
  fundingStage?: string;
  yearFounded?: number;
  headquarters?: string;
  publicOrPrivate?: string;
  stockTicker?: string;
  updatedAt?: string;
}

export interface Experience {
  title?: string;
  company?: string;
  duration?: string;
  isCurrent?: boolean;
}

export interface Education {
  school?: string;
  degree?: string;
  field?: string;
}

export interface Certification {
  name: string;
  issuer?: string;
  date?: string;
}

export interface Publication {
  title: string;
  publisher?: string;
  date?: string;
  url?: string;
}

export interface Language {
  name: string;
  proficiency?: string;
}

export interface SanityReference {
  _ref: string;
  _type?: 'reference';
}

export type RoleCategory =
  | 'engineering'
  | 'marketing'
  | 'digital-product'
  | 'it-security'
  | 'executive'
  | 'sales'
  | 'operations'
  | 'other';

export type SeniorityLevel =
  | 'c-suite'
  | 'vp'
  | 'director'
  | 'manager'
  | 'ic';

export type TechnologyCategory =
  | 'cms'
  | 'framework'
  | 'analytics'
  | 'cdp'
  | 'crm'
  | 'ecommerce'
  | 'hosting'
  | 'cdn'
  | 'marketing-automation'
  | 'dxp'
  | 'dam'
  | 'pim'
  | 'lms'
  | 'legacy'
  | 'detected'
  | string;

// ═══════════════════════════════════════════════════════════════════════════
// Timeseries Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Derive timeseries buckets from an ISO timestamp */
export function deriveTimeseriesBuckets(isoTimestamp: string): {
  eventDate: string;
  eventWeek: string;
  eventMonth: string;
} {
  const d = new Date(isoTimestamp);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');

  // ISO week number
  const jan1 = new Date(Date.UTC(yyyy, 0, 1));
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + jan1.getUTCDay()) / 7);
  const ww = String(weekNum).padStart(2, '0');

  return {
    eventDate: `${yyyy}-${mm}-${dd}`,
    eventWeek: `${yyyy}-W${ww}`,
    eventMonth: `${yyyy}-${mm}`,
  };
}

/** Build a deterministic entity ID */
export function buildEntityId(entityType: string, key: string): string {
  const safeKey = String(key || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return `${entityType}.${safeKey || 'unknown'}`;
}
