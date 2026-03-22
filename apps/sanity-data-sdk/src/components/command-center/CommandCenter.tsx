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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAccountDisplayName } from '../../lib/account-dedupe';
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
  workerGet,
  workerPost,
  getCached,
  setCache,
  type RawGoodMorningResponse,
  type Signal,
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
 * UX-4: Map briefing bestNextAction text to a module key for urgency highlighting.
 * The briefing AI generates free-text actions — we fuzzy-match to module keys.
 */
function actionToModuleKey(action: string): string | null {
  const lower = action.toLowerCase();
  if (lower.includes('research') || lower.includes('investigate')) return 'research';
  if (lower.includes('enrich') || lower.includes('profile') || lower.includes('advance')) return 'profile';
  if (lower.includes('competitor')) return 'competitors';
  if (lower.includes('people') || lower.includes('contact') || lower.includes('decision')) return 'people';
  if (lower.includes('tech') || lower.includes('stack') || lower.includes('scan')) return 'techstack';
  if (lower.includes('signal') || lower.includes('intent')) return 'signals';
  if (lower.includes('score') || lower.includes('opportunity') || lower.includes('qualify')) return 'opportunity';
  if (lower.includes('approach') || lower.includes('strategy') || lower.includes('angle')) return 'approach';
  if (lower.includes('outreach') || lower.includes('email') || lower.includes('call')) return 'outreach';
  return null;
}

/**
 * Stub modules — Phase 2 features that show a toast when clicked.
 * Uses CANONICAL module keys (post-rename).
 */

/** Stage names in pipeline order — used to map currentStage string to an index. */
const STAGE_ORDER = ['initial_scan', 'discovery', 'crawl', 'extraction', 'linkedin', 'brief', 'verification'] as const;

const STUB_MODULES: Record<string, string> = {};

// showToast is now React state-driven — see toastMessage state inside CommandCenter()

// ─── Component ──────────────────────────────────────────────────────────

export function CommandCenter() {
  // ── State ─────────────────────────────────────────────────────────────

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [briefing, setBriefing] = useState<TransformedBriefing | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // ── Toast (React state-driven, no DOM manipulation) ─────────────────
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = setTimeout(() => setToastMessage(null), 2500);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // UX-3: Store briefing context when user clicks a briefing account card.
  // Shows "🎯 whyNow → bestNextAction" banner above module grid.
  const [briefingContext, setBriefingContext] = useState<BriefingAccount | null>(null);

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
        return getAccountDisplayName(selectedAccount);
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

  // ── Pipeline Data (enrichment status → real pipeline stages) ──────────
  // Fetches /enrich/status when an account is selected, maps currentStage
  // to a stage index for buildPipelineStages(). Three cases:
  //   'in_progress' → indexOf(currentStage) marks stages done/active/pending
  //   'complete'    → index 7 (past all stages) → all done
  //   'not_started' → undefined index → all pending

  const [pipelineStageIndex, setPipelineStageIndex] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!selectedAccount) {
      setPipelineStageIndex(undefined);
      return;
    }

    workerGet<{ data: { status: Record<string, unknown> } }>(
      `/enrich/status?accountKey=${encodeURIComponent(selectedAccount.accountKey)}`,
    )
      .then((res) => {
        // workerGet wraps Worker JSON in { ok, data: T, status }
        // T here is { data: { status: {...} } }, so res.data.data.status is the payload
        const statusPayload = res.data?.data?.status ?? {};
        const enrichStatus = statusPayload.status as string | undefined;
        const currentStage = statusPayload.currentStage as string | undefined;

        if (enrichStatus === 'complete') {
          setPipelineStageIndex(STAGE_ORDER.length); // 7 → all stages done
        } else if (enrichStatus === 'in_progress' && currentStage) {
          const idx = STAGE_ORDER.indexOf(currentStage as typeof STAGE_ORDER[number]);
          setPipelineStageIndex(idx >= 0 ? idx : undefined);
        } else {
          setPipelineStageIndex(undefined); // not_started → all pending
        }
      })
      .catch(() => {
        setPipelineStageIndex(undefined);
      });
  }, [selectedAccount]);

  // ── Signals Data (from snapshot, already fetched by AccountSelector) ──
  // Extracts signals.recent from /operator/console/snapshot.
  // HTTP cache deduplicates with AccountSelector's fetch.

  const [signals, setSignals] = useState<Signal[]>([]);

  useEffect(() => {
    workerGet<{ data: { signals: { recent: Signal[] } } }>('/operator/console/snapshot')
      .then((res) => {
        const recent = res.data?.data?.signals?.recent ?? [];
        setSignals(recent);
      })
      .catch(() => {
        setSignals([]);
      });
  }, []); // Fetch once on mount — signals are system-wide, not per-account

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
      const response = await workerPost<{ ok: boolean; data: RawGoodMorningResponse }>('/sdr/good-morning', {
        daysBack: 30,
        minCallScore: 6,
        maxCalls: 25,
        maxLinkedIn: 15,
        maxEmails: 10,
        userId: 'austin',
        trackPattern: true,
      });

      // workerPost wraps Worker JSON in { ok, data: T, status }
      // T here is { ok, data: RawGoodMorningResponse }
      // transformBriefingResponse expects { ok, data: RawGoodMorningResponse }
      const transformed = transformBriefingResponse(response.data);

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

  const handleSelectAccount = useCallback((account: Account, briefingItem?: BriefingAccount) => {
    setSelectedAccount(account);
    // UX-3: Store briefing context if account was selected from briefing card.
    // Clear it if selected from AccountSelector dropdown (no briefing context).
    setBriefingContext(briefingItem ?? null);
    // B2: Don't clearCache() here — briefing and accounts are system-wide data
    // that shouldn't be nuked on account switch. Account-specific data (pipeline,
    // signals, jobs) lives in React state and resets via useEffect dependencies.
  }, []);

  const handleBackToBriefing = useCallback(() => {
    setSelectedAccount(null);
    setBriefingContext(null);
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

      // Signals: refresh snapshot data (no heavy analytics endpoint)
      if (moduleKey === 'signals') {
        if (!selectedAccount) {
          showToast('Select an account first');
          return;
        }
        showToast('Refreshing signals...');
        workerGet<{ data: { signals: { recent: Signal[] } } }>('/operator/console/snapshot')
          .then((res) => {
            const recent = res.data?.data?.signals?.recent ?? [];
            setSignals(recent);
            const name = selectedAccount.companyName?.trim().toLowerCase() ?? '';
            const count = recent.filter((s: Signal) => s.accountName?.trim().toLowerCase() === name).length;
            showToast(count > 0 ? `Found ${count} signal${count > 1 ? 's' : ''}` : 'No signals found');
          })
          .catch(() => showToast('Failed to refresh signals'));
        return;
      }

      if (!selectedAccount) {
        showToast('Select an account first');
        return;
      }

      // Real action endpoints — uses CANONICAL module keys.
      // Endpoint contracts verified against handler source:
      //   /research/complete: `input` auto-detects accountKey (16 hex chars)
      //   /enrich/advance: needs `accountKey` only
      //   /competitors/research: needs `accountKey` + `canonicalUrl`
      //   /person/brief: needs `accountKey` + `canonicalUrl`
      //   /scan: reads `url` from QUERY PARAMS, not body (index.js L4690)
      //   /enrich/queue: POST body with accountKey, canonicalUrl, mode, stages
      //   /research/complete (approach): same endpoint, mode:'fast', no competitors
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
        techstack: {
          // /scan reads url from query params, not POST body (index.js L4690)
          endpoint: `/scan?url=${encodeURIComponent(selectedAccount.canonicalUrl)}`,
          body: {},
        },
        opportunity: {
          endpoint: '/enrich/queue',
          body: {
            accountKey: selectedAccount.accountKey,
            canonicalUrl: selectedAccount.canonicalUrl,
            mode: 'standard',
            stages: ['initial_scan'],
            selfHeal: true,
          },
        },
        approach: {
          // Same endpoint as research but lightweight — no competitors, no auto-enrich
          // Job tracker will show both as "research" (deriveModuleKey collision) — acceptable for MVP
          endpoint: '/research/complete',
          body: {
            input: selectedAccount.accountKey,
            inputType: 'accountKey',
            mode: 'fast',
            includeCompetitors: false,
            autoEnrich: false,
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
      pipelineStages: buildPipelineStages({}, pipelineStageIndex),
      activeJobs: activeJobsByModule,
      signals,
    }),
    [selectedAccount, briefing, pipelineStageIndex, activeJobsByModule, signals],
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="command-center">
      {/* Header with Account Selector */}
      <div className="command-center__header">
        <span className="command-center__title">Select an account to explore</span>
        <AccountSelector
          selectedAccount={selectedAccount}
          onSelect={handleSelectAccount}
          onClear={handleBackToBriefing}
        />
      </div>

      {/* Main content: Briefing Landing or Module Grid */}
      <div className="command-center__content">
        {selectedAccount ? (
          <>
            {/* UX-3: Briefing context banner — shows why this account was selected */}
            {briefingContext && (
              <div className="briefing-context-banner">
                <span className="briefing-context-banner__icon">🎯</span>
                <span className="briefing-context-banner__text">
                  {briefingContext.whyNow} → <strong>{briefingContext.bestNextAction}</strong>
                </span>
                <button
                  className="briefing-context-banner__dismiss"
                  onClick={() => setBriefingContext(null)}
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
            <ModuleGrid
              glanceContext={glanceContext}
              onModuleAction={handleModuleAction}
              highlightedModule={briefingContext ? actionToModuleKey(briefingContext.bestNextAction) : null}
            />
          </>
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

      {/* Toast (rendered in component tree, not document.body) */}
      {toastMessage && (
        <div className="command-center__toast">{toastMessage}</div>
      )}
    </div>
  );
}

// ─── Morning Briefing Landing ───────────────────────────────────────────

interface MorningBriefingLandingProps {
  briefing: TransformedBriefing | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectAccount: (account: Account, briefingItem?: BriefingAccount) => void;
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
            // B1: Look up full Account from AccountSelector's snapshot cache.
            // This gives us opportunityScore, hot, technologyStack, completeness,
            // lastScannedAt — fields the partial construction was missing.
            // Falls back to partial if cache miss (rare — AccountSelector fetches on mount).
            onClick={() => {
              const cached = getCached<Account[]>('accounts');
              const fullAccount = cached?.data.find(
                (a: Account) => a.accountKey === item.accountKey,
              );
              if (!fullAccount) {
                console.warn('[CC] Briefing account cache miss:', item.accountKey);
              }
              onSelectAccount(
                fullAccount ?? {
                  _id: `account.${item.accountKey}`,
                  accountKey: item.accountKey,
                  companyName: item.account,
                  rootDomain: extractDomain(item.canonicalUrl),
                  canonicalUrl: item.canonicalUrl ?? '',
                },
                item, // UX-3: Pass briefing context for banner display
              );
            }}
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
