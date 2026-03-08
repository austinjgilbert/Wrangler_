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
  observedAt?: string;
  lastValidatedAt?: string;
  staleAfter?: string;
  refreshPriority?: number;
  uncertaintyState?: UncertaintyState;
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
  observedAt?: string;
  lastValidatedAt?: string;
  staleAfter?: string;
  refreshPriority?: number;
  uncertaintyState?: UncertaintyState;
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
  signals?: string[];

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

export type ActionCandidateType =
  | 'send_email'
  | 'send_linkedin_message'
  | 'make_call'
  | 'create_followup_task'
  | 'run_targeted_research';

export type ActionCandidateUrgency = 'low' | 'medium' | 'high' | 'critical';

export type ActionCandidateDraftStatus =
  | 'not_started'
  | 'ready'
  | 'drafted'
  | 'approved'
  | 'expired';

export interface ActionCandidate {
  _type: 'actionCandidate';
  _id: string;
  id: string;
  observedAt?: string;
  lastValidatedAt?: string;
  staleAfter?: string;
  refreshPriority?: number;
  uncertaintyState?: UncertaintyState;
  confidenceBreakdown?: ConfidenceBreakdown;
  scoringVersion?: string;
  patternVersion?: string;
  draftPolicyVersion?: string;
  strategyVersion?: string;
  rankingPolicyVersion?: string;
  scenarioFixtureId?: string;
  latestOutcomeEventId?: string | null;
  account: SanityReference;
  person?: SanityReference | null;
  signals: string[];
  signalRefs?: SanityReference[];
  patternMatch?: string;
  pattern?: PatternMatch | null;
  opportunityScore: number;
  confidence: number;
  actionType: ActionCandidateType;
  urgency: ActionCandidateUrgency;
  whyNow: string;
  evidence: string[];
  evidenceRefs?: SanityReference[];
  draftStatus: ActionCandidateDraftStatus;
  recommendedNextStep: string;
  missingData: string[];
  expirationTime: string;
  lifecycleStatus?: 'active' | 'expired' | 'completed';
  createdAt?: string;
  updatedAt?: string;
}

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

export interface SignalEvent {
  _type: 'signal';
  _id: string;
  id: string;
  dedupeKey?: string;
  observedAt?: string;
  lastValidatedAt?: string;
  staleAfter?: string;
  refreshPriority?: number;
  uncertaintyState?: UncertaintyState;
  sourceReliability?: {
    source: SignalSource;
    reliabilityScore?: number;
    historicalSuccessCorrelation?: number;
    recencySensitivity?: number;
    duplicationFrequency?: number;
    noiseRate?: number;
    sampleSize?: number;
    updatedAt?: string;
  };
  source: SignalSource;
  signalType: SignalType;
  account?: SanityReference | null;
  person?: SanityReference | null;
  strength: number;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface OpportunityScoreBreakdown {
  patternStrength: number;
  signalUrgency: number;
  personaInfluence: number;
  techRelevance: number;
  accountPriority: number;
  evidenceConfidence: number;
  recencyWeight: number;
  actionabilityWeight: number;
  total: number;
  strongestDrivers: string[];
  updatedAt: string;
  scoringVersion?: string;
  rankingPolicyVersion?: string;
}

export interface Evidence {
  _type?: 'evidencePack' | 'evidence';
  _id?: string;
  evidenceId?: string;
  observedAt?: string;
  lastValidatedAt?: string;
  staleAfter?: string;
  refreshPriority?: number;
  uncertaintyState?: UncertaintyState;
  summary?: string;
  keyFacts?: string[];
  urls?: string[];
  sourceRefs?: SanityReference[];
  confidence?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EntityCandidate {
  entityType: 'account' | 'person' | 'technology' | string;
  name: string;
  confidence?: number;
  evidenceExcerptId?: string;
  resolvedRef?: SanityReference | null;
}

export interface PatternMatch {
  patternType: string;
  label?: string;
  score?: number;
  source?: 'heuristic' | 'learned' | 'superuser' | string;
  versionId?: string;
  lifecycleState?: PatternLifecycleState;
  supportingSignalTypes?: string[];
  evidenceRefs?: SanityReference[];
}

export interface PriorityScore {
  total: number;
  strongestDrivers: string[];
  updatedAt: string;
}

export interface PolicyContext {
  scoringVersion?: string;
  patternVersion?: string;
  draftPolicyVersion?: string;
  strategyVersion?: string;
  rankingPolicyVersion?: string;
}

export interface ResearchJob {
  _type?: 'molt.job' | 'enrich.job' | 'enrichmentJob';
  _id: string;
  jobType?: string;
  entityType?: string;
  entityId?: string;
  status: string;
  priority?: number;
  attempts?: number;
  maxAttempts?: number;
  nextAttemptAt?: string | null;
  leaseExpiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RankedActionCandidate {
  rank: number;
  candidate: ActionCandidate;
  account?: Account | null;
  person?: Person | null;
  signals: SignalEvent[];
  score: OpportunityScoreBreakdown;
}

export interface TopActionQueue {
  date: string;
  limit: number;
  generatedAt: string;
  policyContext?: PolicyContext;
  actions: RankedActionCandidate[];
}

export type SdrCommandAction =
  | 'send_email'
  | 'call_now'
  | 'follow_up'
  | 'research_more'
  | 'validate_signal'
  | 'snooze'
  | 'mark_done';

export interface SdrTopActionRow {
  rank: number;
  actionCandidateId: string;
  account: string;
  person: string | null;
  action: SdrCommandAction;
  whyNow: string;
  confidence: number;
  pattern: string;
  draftReady: boolean;
  allowedCommands: SdrCommandAction[];
}

export interface SdrTopActionsTodayView {
  title: 'TOP ACTIONS TODAY';
  generatedAt: string;
  policyContext?: PolicyContext;
  totalActions: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  actions: SdrTopActionRow[];
}

export type SuperuserCommand =
  | 'adjust_signal_weights'
  | 'add_pattern'
  | 'trigger_reanalysis'
  | 'inspect_weak_data'
  | 'inject_strategy_updates'
  | 'rerank_actions';

export interface SuperuserCapability {
  id: SuperuserCommand;
  label: string;
  description: string;
}

export interface SuperuserWeakDataItem {
  type: 'action_candidate' | 'account' | 'person' | 'signal';
  refId: string;
  label: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface SuperuserInterfaceState {
  title: 'SUPERUSER';
  capabilities: SuperuserCapability[];
  actionsToday?: SdrTopActionsTodayView | null;
  weakData?: SuperuserWeakDataItem[];
  latestStrategyUpdateAt?: string | null;
}

export interface DraftingOutput {
  actionCandidateId: string;
  confidenceBreakdown?: ConfidenceBreakdown;
  draftPolicyVersion?: string;
  strategyVersion?: string;
  outreachAngle: string;
  personaFraming: string;
  evidenceReference: string;
  sanityPositioning: string;
  shortEmailDraft: string;
  callOpeningLine: string;
  subject?: string;
  generatedAt: string;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export type OperatorFeedbackType =
  | 'sent_draft'
  | 'edited_draft'
  | 'ignored_action'
  | 'marked_incorrect'
  | 'booked_meeting';

export interface OperatorFeedback {
  _type: 'operatorFeedback';
  _id: string;
  actionCandidate?: SanityReference;
  actionCandidateId: string;
  idempotencyKey?: string;
  scoringVersion?: string;
  patternVersion?: string;
  draftPolicyVersion?: string;
  strategyVersion?: string;
  feedbackType: OperatorFeedbackType;
  operatorEdit?: string;
  timestamp: string;
  outcome?: string;
}

export type UncertaintyState =
  | 'confirmed'
  | 'likely'
  | 'weakly_inferred'
  | 'contradictory'
  | 'stale'
  | 'needs_validation';

export type PatternLifecycleState =
  | 'active'
  | 'monitoring'
  | 'inactive'
  | 'retired'
  | 'quarantined';

export interface ConfidenceBreakdown {
  dataConfidence: number;
  entityConfidence: number;
  patternConfidence: number;
  actionConfidence: number;
  draftConfidence: number;
  updatedAt: string;
  notes?: string[];
}

export interface PolicyVersionBase {
  _id?: string;
  versionId: string;
  changedBy: string;
  changedAt: string;
  reason: string;
  previousVersion?: string | null;
  expectedImpact?: string;
  activationStatus: 'draft' | 'active' | 'inactive' | 'retired';
}

export interface ScoringPolicyVersion extends PolicyVersionBase {
  _type?: 'scoringPolicyVersion';
  policyType: 'scoring';
  weights: Record<string, number>;
  thresholds?: Record<string, number>;
}

export interface PatternVersion extends PolicyVersionBase {
  _type?: 'patternVersion';
  policyType: 'pattern';
  patternKey: string;
  conditions?: Record<string, any>;
  recommendedMoves?: string[];
  lifecycleState?: PatternLifecycleState;
}

export interface DraftPolicyVersion extends PolicyVersionBase {
  _type?: 'draftPolicyVersion';
  policyType: 'draft';
  systemPrompt?: string;
  toneRules?: string[];
  operatingRules?: string[];
}

export interface StrategyInstructionVersion extends PolicyVersionBase {
  _type?: 'strategyInstructionVersion';
  policyType: 'strategy';
  operatingRules?: string[];
  toneRules?: string[];
  values?: string[];
}

export interface ScenarioExpectation {
  expectedActionType?: ActionCandidateType | 'no_action';
  expectedPriorityRange?: { min: number; max: number };
  expectedConfidenceRange?: { min: number; max: number };
  expectedPattern?: string | 'no_pattern';
  notes?: string[];
}

export interface ScenarioFixture {
  id: string;
  name: string;
  description: string;
  now: string;
  inputBundle: {
    accounts?: Account[];
    people?: Person[];
    signals?: SignalEvent[];
    actionCandidates?: ActionCandidate[];
    context?: Record<string, any>;
  };
  expectation: ScenarioExpectation;
}

export interface OutcomeEvent {
  _type?: 'outcomeEvent';
  _id?: string;
  outcomeEventId?: string;
  actionCandidateId: string;
  gmailDraftId?: string | null;
  eventType:
    | 'drafted'
    | 'sent'
    | 'replied'
    | 'meeting_booked'
    | 'ignored'
    | 'bounced'
    | 'wrong_person'
    | 'wrong_timing'
    | 'bad_fit';
  outcomeLabel?: string;
  actor?: 'operator' | 'system' | 'prospect' | string;
  observedAt: string;
  metadata?: Record<string, any>;
}

export interface DriftMetric {
  _type?: 'driftMetric';
  _id?: string;
  metricId?: string;
  metricType:
    | 'action_acceptance_rate'
    | 'draft_edit_distance'
    | 'score_inflation'
    | 'stale_evidence_percentage'
    | 'duplicate_action_rate'
    | 'confidence_outcome_mismatch'
    | 'pattern_decay'
    | 'signal_to_action_conversion'
    | 'weak_draft_rate'
    | 'signal_source_reliability';
  observedAt: string;
  windowStart?: string;
  windowEnd?: string;
  value: number;
  baseline?: number;
  severity?: 'low' | 'medium' | 'high';
  details?: Record<string, any>;
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
