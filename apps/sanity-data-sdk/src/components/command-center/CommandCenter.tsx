/**
 * CommandCenter — Root orchestrator for the Wrangler sales intelligence dashboard.
 *
 * This is the "single pane of glass" Austin requested. It manages:
 * - Morning Briefing landing (no account selected)
 * - Account selection (AccountSelector dropdown)
 * - 9-module grid (ModuleGrid with Glance/Detail/Mini states)
 * - Action dispatch (hero buttons → worker API → optimistic UI)
 * - Job tracking (useJobPolling → JobTracker bottom bar)
 *
 * Data flow:
 *   /sdr/good-morning → transformBriefingResponse → briefing state
 *   AccountSelector → selectedAccount state
 *   briefing + account + pipeline + jobs → GlanceContext → deriveAllModuleGlanceProps
 *   Hero button click → workerPost → mergeStatus (optimistic) → refreshJobs
 *   useJobPolling → activeJobsByModule → Glance card overlays + JobTracker
 */

import './CommandCenter.css';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccountSelector } from './AccountSelector';
import { JobTracker } from './JobTracker';
import { ModuleGrid } from './ModuleGrid';
import { useJobPolling } from './useJobPolling';
import {
  type Account,
  type BriefingAccount,
  type GlanceContext,
  type TransformedBriefing,
  transformBriefingResponse,
  workerPost,
  getCached,
  setCache,
  clearCache,
  type RawGoodMorningResponse,
  buildPipelineStages,
} from '../../lib/adapters';

// ─── Constants ──────────────────────────────────────────────────────────

/** Extract root domain from a canonical URL. */
function extractDomain(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/**
 * Stub modules — Phase 2 features that show a toast when clicked.
 * Uses CANONICAL module keys (post-rename).
 */
const STUB_MODULES: Record<string, string> = {
  signals: 'Signal scanning coming in Phase 2 — will detect buying signals from web activity',
  techstack: 'Deep tech scan coming in Phase 2 — will map full technology stack',
  opportunity: 'Opportunity scoring coming in Phase 2 — will rank deal likelihood',       // FIX #1: was 'pipeline'
  approach: 'Approach generation coming in Phase 2 — will build personalized outreach strategy', // FIX #1: was 'gaps'
  outreach: 'Sequence generation coming in Phase 2 — will create multi-channel outreach',  // FIX #1: was 'brief'
};

function showToast(message: string) {
  console.info(`[CommandCenter] ${message}`);
  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '60px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#334155',
    color: '#f8fafc',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    zIndex: '200',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    transition: 'opacity 200ms',
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, 2500);
}

// ─── Component ──────────────────────────────────────────────────────────

export function CommandCenter() {
  // ── State ─────────────────────────────────────────────────────────────

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [briefing, setBriefing] = useState<TransformedBriefing | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // ── Job Polling (FIX #2: hook wired, replaces placeholder Map) ──────
  // Polls for active enrichment jobs. Adaptive intervals (3-30s),
  // pauses when tab hidden, stops when no account selected.

  const accountKeys = useMemo(
    () => selectedAccount ? [selectedAccount.accountKey] : [],
    [selectedAccount],
  );

  const resolveAccountName = useCallback(
    (key: string) => {
      if (selectedAccount && selectedAccount.accountKey === key) {
        return selectedAccount.companyName;
      }
      return key;
    },
    [selectedAccount],
  );

  const {
    jobs,
    activeJobsByModule,
    polling: jobPolling,
    error: jobError,
    lastPollAt,
    refresh: refreshJobs,
    mergeStatus,
  } = useJobPolling({
    accountKeys,
    resolveAccountName,
    enabled: !!selectedAccount,
  });

  // ── Briefing Fetch ────────────────────────────────────────────────────

  const fetchBriefing = useCallback(async () => {
    const cached = getCached<TransformedBriefing>('briefing');
    if (cached) {
      setBriefing(cached.data);
      if (cached.fresh) return;
    }

    setBriefingLoading(!cached);
    setBriefingError(null);

    try {
      const response = await workerPost<RawGoodMorningResponse>('/sdr/good-morning', {
        daysBack: 30,
        minCallScore: 6,
        maxCalls: 25,
        maxLinkedIn: 15,
        maxEmails: 10,
        userId: 'austin',
        trackPattern: true,
      });

      // workerPost returns { ok, data: <Worker JSON>, status }
      // Worker JSON is { ok, data: { top10Accounts, ... }, requestId }
      // transformBriefingResponse expects { ok, data: RawGoodMorningResponse }
      // So we need response.data.data (the inner data), not response.data
      const workerBody = response.data as any;
      const transformed = transformBriefingResponse({
        ok: true,
        data: workerBody.data ?? workerBody,  // prefer inner .data, fallback to whole body
      });

      setBriefing(transformed);
      setCache('briefing', transformed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load briefing';
      setBriefingError(msg);
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  // ── Account Selection ─────────────────────────────────────────────────

  const handleSelectAccount = useCallback((account: Account) => {
    setSelectedAccount(account);
    clearCache();
  }, []);

  const handleBackToBriefing = useCallback(() => {
    setSelectedAccount(null);
  }, []);

  // ── Module Actions ────────────────────────────────────────────────────

  const handleModuleAction = useCallback(
    async (moduleKey: string, _actionKey: string) => {
      // Check if this is a stub module first
      const stubMessage = STUB_MODULES[moduleKey];
      if (stubMessage) {
        showToast(stubMessage);
        return;
      }

      if (!selectedAccount) {
        showToast('Select an account first');
        return;
      }

      // Real action endpoints — uses CANONICAL module keys.
      // Endpoint contracts verified against handler source (L4 smoke test):
      //   /research/complete: `input` auto-detects accountKey (16 hex chars)
      //   /enrich/advance: needs `accountKey` only
      //   /competitors/research: needs `accountKey` + `canonicalUrl`
      //   /person/brief: needs `accountKey` + `canonicalUrl`
      const actionMap: Record<string, { endpoint: string; body: object }> = {
        research: {
          endpoint: '/research/complete',
          body: {
            input: selectedAccount.accountKey,
            inputType: 'accountKey',
            mode: 'deep',
            includeCompetitors: true,
            autoEnrich: true,
          },
        },
        profile: {
          endpoint: '/enrich/advance',
          body: {
            accountKey: selectedAccount.accountKey,
          },
        },
        competitors: {
          endpoint: '/competitors/research',
          body: {
            accountKey: selectedAccount.accountKey,
            canonicalUrl: selectedAccount.canonicalUrl,
          },
        },
        people: {
          endpoint: '/person/brief',
          body: {
            accountKey: selectedAccount.accountKey,
            canonicalUrl: selectedAccount.canonicalUrl,
          },
        },
      };

      const action = actionMap[moduleKey];
      if (!action) {
        console.warn(`[CommandCenter] No action mapped for module: ${moduleKey}`);
        return;
      }

      try {
        // Optimistic UI: immediately show "queued" state on the module
        mergeStatus(moduleKey, {
          status: 'queued',
          progress: 0,
          stageLabel: 'Queuing...',
        });

        await workerPost(action.endpoint, action.body);

        // Trigger immediate poll to get real job status
        refreshJobs();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Action failed';
        showToast(`Failed: ${msg}`);
      }
    },
    [selectedAccount, mergeStatus, refreshJobs],
  );

  // ── Glance Context ────────────────────────────────────────────────────

  const glanceContext: GlanceContext = useMemo(
    () => ({
      account: selectedAccount,
      briefing,
      pipelineStages: buildPipelineStages({}), // TODO: Wire to real pipeline data
      activeJobs: activeJobsByModule,           // FIX #2: from hook, not empty Map
    }),
    [selectedAccount, briefing, activeJobsByModule],
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="command-center">
      {/* Header with Account Selector */}
      <div className="command-center__header">
        <span className="command-center__title">⚡ Command Center</span>
        <AccountSelector
          selectedAccount={selectedAccount}
          onSelect={handleSelectAccount}
          onClear={handleBackToBriefing}
        />
      </div>

      {/* Main content: Briefing Landing or Module Grid */}
      <div className="command-center__content">
        {selectedAccount ? (
          <ModuleGrid
            glanceContext={glanceContext}
            onModuleAction={handleModuleAction}
          />
        ) : (
          <MorningBriefingLanding
            briefing={briefing}
            loading={briefingLoading}
            error={briefingError}
            onRetry={fetchBriefing}
            onSelectAccount={handleSelectAccount}
          />
        )}
      </div>

      {/* Job Tracker — bottom bar showing active enrichment jobs (FIX #2: wired) */}
      <JobTracker
        jobs={jobs}
        polling={jobPolling}
        error={jobError}
        lastPollAt={lastPollAt}
        onRefresh={refreshJobs}
      />
    </div>
  );
}

// ─── Morning Briefing Landing ───────────────────────────────────────────

interface MorningBriefingLandingProps {
  briefing: TransformedBriefing | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectAccount: (account: Account) => void;
}

function MorningBriefingLanding({
  briefing,
  loading,
  error,
  onRetry,
  onSelectAccount,
}: MorningBriefingLandingProps) {
  if (loading && !briefing) {
    return (
      <div className="briefing-landing briefing-landing--loading">
        <div className="briefing-landing__spinner">Loading briefing...</div>
      </div>
    );
  }

  if (error && !briefing) {
    return (
      <div className="briefing-landing briefing-landing--error">
        <div className="briefing-landing__error-msg">{error}</div>
        <button className="briefing-landing__retry-btn" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (!briefing) return null;

  const { enrichedAccounts, stats } = briefing;

  return (
    <div className="briefing-landing">
      {/* Stats bar */}
      <div className="briefing-landing__stats">
        <div className="briefing-landing__stat">
          <span className="briefing-landing__stat-value">{stats.totalAccounts}</span>
          <span className="briefing-landing__stat-label">Accounts</span>
        </div>
        <div className="briefing-landing__stat">
          <span className="briefing-landing__stat-value">{stats.hotAccounts}</span>
          <span className="briefing-landing__stat-label">🔥 Hot</span>
        </div>
        <div className="briefing-landing__stat">
          <span className="briefing-landing__stat-value">{stats.avgScore}</span>
          <span className="briefing-landing__stat-label">Avg Score</span>
        </div>
      </div>

      {/* Win condition */}
      <div className="briefing-landing__win-condition">
        🎯 {stats.winCondition}
      </div>

      {/* Account cards */}
      <div className="briefing-landing__accounts">
        {enrichedAccounts.map((item: BriefingAccount) => (
          <div
            key={item.accountKey}
            className={`briefing-landing__account-card briefing-landing__account-card--${item.urgency}`}
            // TODO: Phase 2 — check AccountSelector cache for full Account object
            // before constructing a partial. This partial is missing opportunityScore,
            // hot, technologyStack, lastScannedAt — Glance derivers will show gap/muted
            // state for ~200ms until real data loads. Acceptable skeleton-to-content
            // transition for Phase 1, but eliminable if we pull from cache.
            onClick={() =>
              onSelectAccount({
                _id: `account.${item.accountKey}`,
                accountKey: item.accountKey,
                companyName: item.account,
                rootDomain: extractDomain(item.canonicalUrl),
                canonicalUrl: item.canonicalUrl ?? '',
              })
            }
          >
            <div className="briefing-landing__account-header">
              <span className="briefing-landing__account-name">{item.account}</span>
              <span className="briefing-landing__account-score">{item.score}</span>
            </div>
            <div className="briefing-landing__account-why">{item.whyNow}</div>
            <div className="briefing-landing__account-footer">
              <span className="briefing-landing__account-action">▶ {item.bestNextAction}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
