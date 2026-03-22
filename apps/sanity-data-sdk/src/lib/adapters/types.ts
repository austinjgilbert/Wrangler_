/**
 * Shared types for the Command Center adapter layer.
 *
 * These types represent the UI-facing data shapes. All raw API/Sanity
 * responses are transformed into these types by adapter functions.
 * Components NEVER consume raw API data directly.
 */

// ─── Account ────────────────────────────────────────────────────────────

export interface Account {
  _id: string;                  // "account.{accountKey}"
  accountKey: string;           // SHA-1 of canonical URL — primary lookup key everywhere
  companyName: string;          // Sanity field is "companyName", NOT "name"
  canonicalUrl: string;
  rootDomain: string;           // e.g., "acme.com"
  opportunityScore?: number;    // 0-100, from enrichment
  completeness?: number;        // Computed — not stored on doc
  hot?: boolean;                // Derived: opportunityScore >= 70
  lastScannedAt?: string;       // ISO datetime
  technologyStack?: Record<string, string[]>;
}

// ─── Pipeline ───────────────────────────────────────────────────────────

export type PipelineStageName =
  | 'initial_scan'
  | 'discovery'
  | 'crawl'
  | 'extraction'
  | 'linkedin'
  | 'brief'
  | 'verification';

export interface PipelineStage {
  name: PipelineStageName;
  label: string;
  status: 'pending' | 'active' | 'done' | 'failed';
  hasData: boolean;
  weight: number;
}

// ─── Job ────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  accountKey: string;
  accountName: string;
  label: string;
  moduleKey: string;
  progress: number;             // 0-100
  status: 'queued' | 'running' | 'complete' | 'failed';
  stageNumber: number;          // 0-7
  stageLabel: string;
  startedAt: string;
  estimatedSeconds?: number;
  advanceError?: string;        // Error message when enrichment is stuck
}

// ─── Morning Briefing ───────────────────────────────────────────────────

export type Urgency = 'urgent' | 'attention' | 'opportunity';

export interface TopAccount {
  account: string;              // Company name (NOT companyName field)
  accountKey: string;
  canonicalUrl?: string;
  score: number;
  whyNow: string;
  bestNextAction: string;
  owner?: string;
  contact?: string;
}

export interface EmailItem {
  person: string;               // Contact name
  account: string;              // Company name string — match with case-insensitive trim
  accountKey: string;
  reason: string;               // Why this email is queued
  intent: string;               // Email intent/angle
  cta: string;                  // Call to action
  email: string | null;         // Email address if known
}

export interface LinkedInItem {
  person: string;               // Contact name
  account: string;              // Company name string — match with case-insensitive trim
  accountKey: string;
  state: string;                // LinkedIn connection state (e.g., 'not_connected')
  action: string;               // Recommended action (e.g., 'connect', 'message')
  personalization: string;      // Personalized message/note
  linkedInUrl: string | null;   // Profile URL
}

export interface CallItem {
  person: string;               // Contact name or title
  account: string;              // Company name
  accountKey: string;
  score: number;                // Priority score
  whyNow: string;               // Timing reasoning
  talkTrack: string;            // Suggested talk track
  objectionGuess: string;       // Anticipated objection
  cta: string;                  // Call to action
  phone: string | null;         // Phone number if known
  linkedIn: string | null;      // LinkedIn URL fallback
}

export interface BriefingAccount extends TopAccount {
  urgency: Urgency;
}

export interface TransformedBriefing {
  enrichedAccounts: BriefingAccount[];
  emailQueue: EmailItem[];
  linkedInQueue: LinkedInItem[];
  callList: CallItem[];
  stats: {
    totalAccounts: number;
    hotAccounts: number;
    avgScore: number;
    winCondition: string;
  };
  assumptionRefresh?: string | null;
}

export interface Schedule {
  block1_calls: string | null;
  block2_calls: string | null;
  linkedin_block: string | null;
  admin_block: string | null;
  email_block: string | null;
}

export interface RawGoodMorningResponse {
  date?: string;                // ISO date string e.g. "2026-03-18"
  winCondition?: string;        // API-generated win condition
  top10Accounts?: TopAccount[];
  emailQueue?: EmailItem[];
  linkedInQueue?: LinkedInItem[];
  callList?: CallItem[];
  schedule?: Schedule;
  assumptionRefresh?: string | null;
  stats?: {                     // API stats — different shape from TransformedBriefing.stats
    totalAccounts: number;
    qualifiedAccounts: number;
    callsQueued: number;
    linkedInQueued: number;
    emailsQueued: number;
  };
}

// ─── Module Glance ──────────────────────────────────────────────────────

export interface ActionButton {
  key: string;
  label: string;
  variant: 'primary' | 'secondary';
  disabled?: boolean;
}

export interface ModuleActiveJob {
  status: 'queued' | 'running';
  progress: number;
  stageLabel: string;
}

export interface ModuleGlanceProps {
  moduleKey: string;
  primaryActionLabel: string;
  progress: number;
  gaps: string[];
  insight: string;
  activeJob: ModuleActiveJob | null;
}

// ─── Signals ────────────────────────────────────────────────────────────

/** Signal from /operator/console/snapshot → signals.recent[] */
export interface Signal {
  id: string;
  signalType: string;           // 'technology_change', 'leadership_change', 'funding', etc.
  accountId: string | null;     // Sanity _ref (e.g., "account.abc123") — matches Account._id
  accountName: string;          // Display only — do NOT use for matching (brittle)
  timestamp: string;            // ISO datetime
  source?: string;
  summary?: string;             // Human-readable signal description (Phase 2)
  uncertaintyState: string;     // 'likely' | 'confirmed' | 'uncertain'
}

export interface GlanceContext {
  account: Account | null;
  briefing: TransformedBriefing | null;
  pipelineStages: PipelineStage[];
  activeJobs: Map<string, ModuleActiveJob>;
  signals: Signal[];
}

// ─── Urgency Thresholds ─────────────────────────────────────────────────

export const URGENCY_THRESHOLDS = { urgent: 80, attention: 60 } as const;
