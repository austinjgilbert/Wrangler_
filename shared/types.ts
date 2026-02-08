/**
 * Shared TypeScript types for the Molt Content OS.
 *
 * Used by:
 *   - Cloudflare Worker (src/)
 *   - Chrome Extension (chrome-extension/)
 *   - Sanity Studio (sanity/)
 *   - Frontend (sanity-sales-frontend/)
 *
 * Import with: import type { Account, Person, ... } from '../shared/types';
 */

// ═══════════════════════════════════════════════════════════════════════════
// Core Entities
// ═══════════════════════════════════════════════════════════════════════════

export interface Account {
  _type: 'account';
  _id: string;
  accountKey: string;
  canonicalUrl?: string;
  rootDomain?: string;
  domain?: string;
  name?: string;
  companyName?: string;
  industry?: string;
  description?: string;
  linkedinUrl?: string;
  specialties?: string[];

  // Classification
  classification?: {
    industry?: string;
    segment?: string;
    tags?: string[];
    aiReadinessTier?: string;
    opportunityTier?: string;
    classifiedAt?: string;
  };

  // Technology Stack
  techStack?: string[];
  technologyStack?: {
    cms?: string[];
    frameworks?: string[];
    legacySystems?: string[];
    pimSystems?: string[];
    damSystems?: string[];
    lmsSystems?: string[];
    migrationOpportunities?: string[];
    painPoints?: string[];
  };
  technologies?: SanityReference[];

  // Leadership & People
  leadership?: SanityReference[];

  // Pain Points
  painPoints?: PainPoint[];

  // Competitors
  competitors?: SanityReference[];
  competitorResearch?: {
    count?: number;
    researchedAt?: string;
  };

  // Benchmarks
  benchmarks?: Benchmarks;

  // Scores
  opportunityScore?: number;
  aiReadiness?: { score?: number };
  performance?: { performanceScore?: number };
  businessScale?: {
    businessScale?: string;
    estimatedAnnualRevenue?: string;
    estimatedMonthlyTraffic?: string;
  };

  // Profile Completeness
  profileCompleteness?: {
    score?: number;
    gaps?: string[];
    nextStages?: string[];
    assessedAt?: string;
  };

  // Signals
  signals?: string[];

  // Timestamps
  lastScannedAt?: string;
  lastEnrichedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Person {
  _type: 'person';
  _id: string;
  personKey: string;
  name: string;
  title?: string;
  headline?: string;
  linkedinUrl?: string;
  location?: string;
  about?: string;
  email?: string;

  // Company Link
  companyRef?: SanityReference;
  currentCompany?: string;
  currentTitle?: string;
  relatedAccountKey?: string;
  rootDomain?: string;

  // Role & Influence
  roleCategory?: RoleCategory;
  seniorityLevel?: SeniorityLevel;
  isDecisionMaker?: boolean;
  buyerPersona?: string;

  // Experience & Skills
  experience?: Experience[];
  education?: Education[];
  skills?: string[];
  certifications?: Certification[];
  publications?: Publication[];
  languages?: Language[];
  connections?: number;

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

export interface Technology {
  _type: 'technology';
  _id: string;
  name: string;
  slug: string;
  category?: TechnologyCategory;
  vendor?: string;
  website?: string;
  description?: string;
  isLegacy?: boolean;
  isMigrationTarget?: boolean;
  detectionSignals?: string[];
  accountCount?: number;
  tags?: string[];
  lastEnrichedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-types
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

// ═══════════════════════════════════════════════════════════════════════════
// Enums / Union Types
// ═══════════════════════════════════════════════════════════════════════════

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

export type EnrichmentStage =
  | 'scan'
  | 'discovery'
  | 'crawl'
  | 'extract'
  | 'linkedin'
  | 'brief'
  | 'verify';

// ═══════════════════════════════════════════════════════════════════════════
// API Payloads (Chrome Extension → Worker)
// ═══════════════════════════════════════════════════════════════════════════

export interface CapturePayload {
  url: string;
  title: string;
  source: CaptureSource;
  capturedAt: string;
  people: CapturedPerson[];
  accounts: CapturedAccount[];
  technologies: (string | { name: string; category?: string })[];
  signals: (string | { text: string; source?: string })[];
  metadata: Record<string, string>;
  rawText?: string;
}

export interface CapturedPerson {
  name?: string;
  headline?: string;
  title?: string;
  currentTitle?: string;
  currentCompany?: string;
  email?: string;
  phone?: string;
  location?: string;
  about?: string;
  linkedinUrl?: string;
  linkedInUrl?: string;
  experience?: Experience[];
  education?: Education[];
  skills?: string[];
  certifications?: Certification[];
  publications?: Publication[];
  languages?: Language[];
  connections?: number | string | null;
  followers?: string;
  source?: string;
}

export interface CapturedAccount {
  name?: string;
  domain?: string;
  url?: string;
  website?: string;
  industry?: string;
  about?: string;
  description?: string;
  headquarters?: string;
  employeeCount?: string;
  employees?: string;
  revenue?: string;
  type?: string;
  specialties?: string[];
  linkedinUrl?: string;
  source?: string;
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
  | 'website'
  | 'text_paste'
  | string;

// ═══════════════════════════════════════════════════════════════════════════
// API Responses
// ═══════════════════════════════════════════════════════════════════════════

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  requestId: string;
}

export interface CaptureResponse {
  source: string;
  url: string;
  accountsResolved: number;
  peopleResolved: number;
  technologiesLinked: number;
  entitiesResolved: number;
  jobsQueued: number;
  eventId: string;
  backgroundEnrichment: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Enrichment Pipeline
// ═══════════════════════════════════════════════════════════════════════════

export interface EnrichmentResult {
  stage: EnrichmentStage;
  success: boolean;
  duration?: number;
  error?: string;
}

export interface CompletenessScore {
  score: number;
  gaps: string[];
  nextStages: EnrichmentStage[];
  dimensions: Record<string, boolean>;
  assessedAt: string;
}

export interface GapFillRequest {
  env: any;
  accountKey: string;
  domain: string;
  trigger: 'extension' | 'wrangler' | 'cron' | 'manual' | 'api';
}
