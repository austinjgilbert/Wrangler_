/**
 * Module Glance derivers — compute per-module Glance card props from a single GlanceContext.
 *
 * All 9 modules derive their Glance state from one context object (briefing + account + pipeline + jobs).
 * NO independent API calls or subscriptions per module.
 *
 * Canonical module keys (design spec):
 *   profile, opportunity, approach, research, people, signals, competitors, techstack, outreach
 *
 * Grid order (3×3):
 *   Row 1: profile, opportunity, approach
 *   Row 2: research, people, signals
 *   Row 3: competitors, techstack, outreach
 */

import type { GlanceContext, ModuleGlanceProps, PipelineStage } from './types';

// ─── Module Configs ─────────────────────────────────────────────────────

export interface ModuleConfig {
  key: string;
  icon: string;
  label: string;
  color: string;
}

export const MODULE_CONFIGS: ModuleConfig[] = [
  // Row 1
  { key: 'profile',     icon: '🏢', label: 'Company Profile',    color: '#3b82f6' },
  { key: 'opportunity', icon: '🎯', label: 'Opportunity Score',  color: '#f59e0b' },
  { key: 'approach',    icon: '🧭', label: 'Best Approach',      color: '#8b5cf6' },
  // Row 2
  { key: 'research',    icon: '🔬', label: 'Deep Research',      color: '#06b6d4' },
  { key: 'people',      icon: '👥', label: 'Key People',         color: '#ec4899' },
  { key: 'signals',     icon: '📡', label: 'Buying Signals',     color: '#10b981' },
  // Row 3
  { key: 'competitors', icon: '⚔️', label: 'Competitors',        color: '#ef4444' },
  { key: 'techstack',   icon: '🔧', label: 'Tech Stack',         color: '#6366f1' },
  { key: 'outreach',    icon: '📨', label: 'Outreach Queue',     color: '#14b8a6' },
];

// ─── Deriver Functions ──────────────────────────────────────────────────

function deriveProfileGlance(ctx: GlanceContext): ModuleGlanceProps {
  const { account, activeJobs } = ctx;
  const gaps: string[] = [];
  if (!account?.companyName || account.companyName === 'Unknown') gaps.push('Company name missing');
  if (!account?.canonicalUrl) gaps.push('No website URL');
  if (!account?.rootDomain) gaps.push('No root domain');

  return {
    moduleKey: 'profile',
    primaryActionLabel: gaps.length > 0 ? 'Enrich Profile' : 'Refresh Profile',
    progress: account ? Math.min(100, (3 - gaps.length) * 33) : 0,
    gaps,
    insight: account?.companyName && account.companyName !== 'Unknown'
      ? `${account.companyName} — ${account.rootDomain || 'no domain'}`
      : 'No profile data yet',
    activeJob: activeJobs.get('profile') ?? null,
  };
}

function deriveOpportunityGlance(ctx: GlanceContext): ModuleGlanceProps {
  const { account, briefing, activeJobs } = ctx;
  const gaps: string[] = [];
  const score = account?.opportunityScore;

  if (score === undefined) gaps.push('No opportunity score');

  // Check briefing rank
  const rank = briefing?.enrichedAccounts.findIndex(
    a => a.accountKey === account?.accountKey,
  );
  const rankLabel = rank !== undefined && rank >= 0 ? `#${rank + 1} in briefing` : '';

  return {
    moduleKey: 'opportunity',
    primaryActionLabel: score !== undefined ? 'Recalculate' : 'Score Account',
    progress: score ?? 0,
    gaps,
    insight: score !== undefined
      ? `Score: ${score}/100${rankLabel ? ` · ${rankLabel}` : ''}`
      : 'Not scored yet',
    activeJob: activeJobs.get('opportunity') ?? null,
  };
}

function deriveApproachGlance(ctx: GlanceContext): ModuleGlanceProps {
  const { account, briefing, activeJobs } = ctx;
  const gaps: string[] = [];

  // Find this account in briefing for bestNextAction
  const briefingAccount = briefing?.enrichedAccounts.find(
    a => a.accountKey === account?.accountKey,
  );
  const action = briefingAccount?.bestNextAction;
  if (!action) gaps.push('No recommended approach');

  // Check pipeline progress for approach quality
  const hasResearch = account?.completeness !== undefined && account.completeness > 50;
  if (!hasResearch) gaps.push('Needs more research data');

  return {
    moduleKey: 'approach',
    primaryActionLabel: action ? `${action} →` : 'Generate Approach',
    progress: action ? (hasResearch ? 80 : 40) : 0,
    gaps,
    insight: action
      ? `Recommended: ${action}${briefingAccount?.whyNow ? ` — ${briefingAccount.whyNow}` : ''}`
      : 'Run research first to generate approach',
    activeJob: activeJobs.get('approach') ?? null,
  };
}

function deriveResearchGlance(ctx: GlanceContext): ModuleGlanceProps {
  const { account, pipelineStages, activeJobs } = ctx;
  const gaps: string[] = [];

  const doneStages = pipelineStages.filter((s: PipelineStage) => s.status === 'done' && s.hasData);
  const totalStages = pipelineStages.length;
  const progress = totalStages > 0 ? Math.round((doneStages.length / totalStages) * 100) : 0;

  if (doneStages.length === 0) gaps.push('No research completed');
  const noDataStages = pipelineStages.filter((s: PipelineStage) => s.status === 'done' && !s.hasData);
  if (noDataStages.length > 0) {
    gaps.push(`${noDataStages.length} stage${noDataStages.length > 1 ? 's' : ''} completed without data`);
  }

  return {
    moduleKey: 'research',
    primaryActionLabel: doneStages.length > 0 ? 'Deep Research' : 'Start Research',
    progress,
    gaps,
    insight: doneStages.length > 0
      ? `${doneStages.length}/${totalStages} stages complete`
      : account ? 'Ready to research' : 'Select an account first',
    activeJob: activeJobs.get('research') ?? null,
  };
}

function derivePeopleGlance(ctx: GlanceContext): ModuleGlanceProps {
  const { account, briefing, pipelineStages, activeJobs } = ctx;
  const gaps: string[] = [];

  // Check LinkedIn pipeline stage
  const linkedinStage = pipelineStages.find((s: PipelineStage) => s.name === 'linkedin');
  if (!linkedinStage || linkedinStage.status !== 'done') gaps.push('LinkedIn enrichment pending');
  if (linkedinStage?.status === 'done' && !linkedinStage.hasData) gaps.push('LinkedIn ran but no contacts found');

  // Check briefing for owner/contact
  const briefingAccount = briefing?.enrichedAccounts.find(
    a => a.accountKey === account?.accountKey,
  );
  const hasContact = briefingAccount?.contact || briefingAccount?.owner;

  return {
    moduleKey: 'people',
    primaryActionLabel: hasContact ? 'View People' : 'Find People',
    progress: linkedinStage?.status === 'done' && linkedinStage.hasData ? 100 :
              linkedinStage?.status === 'active' ? 50 : 0,
    gaps,
    insight: hasContact
      ? `Contact: ${briefingAccount?.contact || briefingAccount?.owner}`
      : 'No key contacts identified yet',
    activeJob: activeJobs.get('people') ?? null,
  };
}

function deriveSignalsGlance(ctx: GlanceContext): ModuleGlanceProps {
  const { activeJobs } = ctx;
  return {
    moduleKey: 'signals',
    primaryActionLabel: 'Scan Signals',
    progress: 0,
    gaps: ['Phase 2 — signal scanning not yet available'],
    insight: 'Coming soon: buying signals from web activity',
    activeJob: activeJobs.get('signals') ?? null,
  };
}

function deriveCompetitorsGlance(ctx: GlanceContext): ModuleGlanceProps {
  const { account, activeJobs } = ctx;
  return {
    moduleKey: 'competitors',
    primaryActionLabel: 'Research Competitors',
    progress: 0,
    gaps: account ? [] : ['Select an account first'],
    insight: account ? `Analyze competitive landscape for ${account.companyName}` : 'No account selected',
    activeJob: activeJobs.get('competitors') ?? null,
  };
}

function deriveTechstackGlance(ctx: GlanceContext): ModuleGlanceProps {
  const { account, activeJobs } = ctx;
  const stack = account?.technologyStack;
  const techCount = stack
    ? Object.values(stack).reduce((sum, techs) => sum + (Array.isArray(techs) ? techs.length : 0), 0)
    : 0;

  return {
    moduleKey: 'techstack',
    primaryActionLabel: techCount > 0 ? 'Deep Scan' : 'Scan Tech',
    progress: techCount > 0 ? Math.min(100, techCount * 5) : 0,
    gaps: techCount === 0 ? ['No technology data'] : [],
    insight: techCount > 0
      ? `${techCount} technologies across ${Object.keys(stack!).length} categories`
      : 'No tech stack data yet',
    activeJob: activeJobs.get('techstack') ?? null,
  };
}

function deriveOutreachGlance(ctx: GlanceContext): ModuleGlanceProps {
  const { account, briefing, activeJobs } = ctx;
  const gaps: string[] = [];

  if (!briefing) {
    return {
      moduleKey: 'outreach',
      primaryActionLabel: 'Generate Outreach',
      progress: 0,
      gaps: ['No briefing data'],
      insight: 'Load briefing first',
      activeJob: activeJobs.get('outreach') ?? null,
    };
  }

  // Filter queues by account name (case-insensitive trimmed match)
  const name = account?.companyName?.trim().toLowerCase() ?? '';
  const emails = name
    ? briefing.emailQueue.filter(e => e.account.trim().toLowerCase() === name)
    : [];
  const linkedIn = name
    ? briefing.linkedInQueue.filter(l => l.account.trim().toLowerCase() === name)
    : [];
  const calls = name
    ? briefing.callList.filter(c => c.account.trim().toLowerCase() === name)
    : [];

  const total = emails.length + linkedIn.length + calls.length;
  if (total === 0) gaps.push('No outreach queued for this account');

  return {
    moduleKey: 'outreach',
    primaryActionLabel: total > 0 ? `${total} Actions Ready` : 'Generate Outreach',
    progress: total > 0 ? Math.min(100, total * 20) : 0,
    gaps,
    insight: total > 0
      ? `📧 ${emails.length} · 💬 ${linkedIn.length} · 📞 ${calls.length}`
      : 'No outreach actions for this account',
    activeJob: activeJobs.get('outreach') ?? null,
  };
}

// ─── Single-Pass Deriver ────────────────────────────────────────────────

const DERIVERS: Record<string, (ctx: GlanceContext) => ModuleGlanceProps> = {
  profile: deriveProfileGlance,
  opportunity: deriveOpportunityGlance,
  approach: deriveApproachGlance,
  research: deriveResearchGlance,
  people: derivePeopleGlance,
  signals: deriveSignalsGlance,
  competitors: deriveCompetitorsGlance,
  techstack: deriveTechstackGlance,
  outreach: deriveOutreachGlance,
};

/**
 * Derive all module Glance props in a single pass from one context.
 * Returns a Map<moduleKey, ModuleGlanceProps> for O(1) lookup.
 */
export function deriveAllModuleGlanceProps(ctx: GlanceContext): Map<string, ModuleGlanceProps> {
  const map = new Map<string, ModuleGlanceProps>();
  for (const [key, deriver] of Object.entries(DERIVERS)) {
    map.set(key, deriver(ctx));
  }
  return map;
}
