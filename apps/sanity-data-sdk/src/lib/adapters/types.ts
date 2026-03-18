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
  account: string;              // Company name string — match with case-insensitive trim
  subject: string;
  to: string;
  priority: number;
}

export interface LinkedInItem {
  account: string;              // Company name string — match with case-insensitive trim
  contact: string;
  message: string;
  priority: number;
}

export interface CallItem {
  account: string;
  contact: string;
  phone?: string;
  talkingPoints: string[];
  score: number;
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

export interface RawGoodMorningResponse {
  top10Accounts?: TopAccount[];
  emailQueue?: EmailItem[];
  linkedInQueue?: LinkedInItem[];
  callList?: CallItem[];
  assumptionRefresh?: string | null;
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

export interface GlanceContext {
  account: Account | null;
  briefing: TransformedBriefing | null;
  pipelineStages: PipelineStage[];
  activeJobs: Map<string, ModuleActiveJob>;
}

// ─── Urgency Thresholds ─────────────────────────────────────────────────

export const URGENCY_THRESHOLDS = { urgent: 80, attention: 60 } as const;
