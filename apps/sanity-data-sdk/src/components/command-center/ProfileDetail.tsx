/**
 * ProfileDetail — Expanded detail view for the Company Profile module.
 *
 * Fetches from GET /account/profile?accountKey=X (Sprint 8 OSINT endpoint).
 * Shows: identity, completeness, research brief, OSINT intelligence,
 * leadership, enrichment status, refresh metadata, and actionable hint.
 *
 * Action button triggers POST /account/ensure-enriched to fill gaps.
 *
 * Sprint 9 Lane 1 — @uibuilder
 */

import { useEffect, useState } from 'react';

import { workerGet, workerPost, WorkerApiError } from '../../lib/adapters';
import { formatRelativeTime, formatTimestamp } from '../../lib/formatters';

import './ProfileDetail.css';

// ─── Types (mirrors /account/profile response shape) ────────────────────

interface ProfileAccount {
  accountKey: string;
  companyName: string;
  domain: string;
  canonicalUrl: string;
  industry: string | null;
  classification: string | null;
  tags: string[];
  opportunityScore: number | null;
  aiReadiness: number | null;
  performance: number | null;
  businessScale: number | null;
}

interface CompletenessData {
  score: number;
  gaps: string[];
  nextStages: string[];
  dimensions: Record<string, boolean>;
}

interface EnrichmentStatus {
  status: string;
  jobId: string | null;
  currentStage: string | null;
  completedStages: string[];
  failedStages: string[];
  startedAt: string | null;
  lastUpdatedAt: string | null;
}

interface ResearchBrief {
  executiveSummary: string | null;
  keyFindings: string[];
  generatedAt: string | null;
}

interface ResearchSection {
  brief: ResearchBrief | null;
  techStack: Record<string, string[]> | null;
  leadership: LeadershipPerson[];
  competitors: unknown;
  painPoints: string[];
  benchmarks: unknown;
}

interface LeadershipPerson {
  name: string;
  title: string;
  linkedinUrl: string | null;
  roleCategory: string | null;
  seniorityLevel: number | null;
  isDecisionMaker: boolean;
}

interface OsintYearAhead {
  executiveSummary: string | null;
  keyFindings: string[];
  strategicRecommendations: string[];
  industryTrends: string[];
  competitiveLandscape: string | null;
  generatedAt: string | null;
}

interface OsintSection {
  yearAhead: OsintYearAhead | null;
  hiringSignals: string[];
  newsInsights: string[];
  initiatives: string[];
}

interface RefreshMeta {
  lastScannedAt: string | null;
  lastEnrichedAt: string | null;
  isStale: boolean;
  refreshInterval: string;
  nextRefreshAt: string | null;
}

interface DataAge {
  scan: string | null;
  enrichment: string | null;
  osint: string | null;
  account: string | null;
}

interface ProfileMeta {
  dataAge: DataAge;
  sources: string[];
}

interface ProfileResponse {
  account: ProfileAccount;
  completeness: CompletenessData;
  enrichment: EnrichmentStatus;
  research: ResearchSection;
  osint: OsintSection;
  refresh: RefreshMeta;
  meta: ProfileMeta;
  hint: string;
}

// ─── Props ──────────────────────────────────────────────────────────────

export interface ProfileDetailProps {
  accountKey: string;
}

// ─── Component ──────────────────────────────────────────────────────────

export function ProfileDetail({ accountKey }: ProfileDetailProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fillState, setFillState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  useEffect(() => {
    const abortController = new AbortController();
    setLoading(true);
    setError(null);

    workerGet<ProfileResponse>(
      `/account/profile?accountKey=${encodeURIComponent(accountKey)}`,
    )
      .then((res) => {
        if (abortController.signal.aborted) return;
        setProfile(res.data ?? null);
      })
      .catch((err) => {
        if (abortController.signal.aborted) return;
        if (err instanceof WorkerApiError && err.status === 404) {
          setProfile(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load profile');
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      });

    return () => abortController.abort();
  }, [accountKey]);

  // ── Loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="profile-detail profile-detail--loading">
        <div className="profile-detail__spinner" />
        <p>Loading company profile…</p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="profile-detail profile-detail--error">
        <p className="profile-detail__error-text">
          Something went wrong loading the profile. Try again in a moment.
        </p>
      </div>
    );
  }

  // ── Empty State ───────────────────────────────────────────────────────

  if (!profile) {
    return (
      <div className="profile-detail">
        <div className="profile-detail__empty">
          <p className="profile-detail__empty-title">No profile data available.</p>
          <p className="profile-detail__empty-hint">
            Select an account to view its complete profile.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────

  const { account, completeness, enrichment, research, osint, refresh, meta, hint } = profile;
  const hasOsint = osint.yearAhead !== null;
  const hasLeadership = research.leadership.length > 0;
  const hasBrief = research.brief?.executiveSummary !== null;
  const decisionMakers = research.leadership.filter(p => p.isDecisionMaker);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="profile-detail">
      {/* ── Identity Header ──────────────────────────────────────────── */}
      <div className="profile-detail__identity">
        <div className="profile-detail__identity-main">
          <h3 className="profile-detail__company-name">{account.companyName}</h3>
          <a
            className="profile-detail__domain"
            href={account.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {account.domain}
          </a>
        </div>
        <div className="profile-detail__identity-meta">
          {account.industry && (
            <span className="profile-detail__tag">{account.industry}</span>
          )}
          {account.classification && (
            <span className="profile-detail__tag">{account.classification}</span>
          )}
          {account.tags.slice(0, 3).map(tag => (
            <span key={tag} className="profile-detail__tag">{tag}</span>
          ))}
        </div>
      </div>

      {/* ── Scores Row ───────────────────────────────────────────────── */}
      <div className="profile-detail__scores">
        <ScorePill label="Opportunity" value={account.opportunityScore} />
        <ScorePill label="AI Readiness" value={account.aiReadiness} />
        <ScorePill label="Performance" value={account.performance} />
        <ScorePill label="Scale" value={account.businessScale} />
      </div>

      {/* ── Completeness ─────────────────────────────────────────────── */}
      <div className="profile-detail__completeness">
        <div className="profile-detail__completeness-header">
          <span className="profile-detail__section-label">Profile Completeness</span>
          <span className="profile-detail__completeness-score">
            {completeness.score}%
          </span>
        </div>
        <div className="profile-detail__completeness-bar">
          <div
            className="profile-detail__completeness-fill"
            style={{ width: `${Math.min(100, completeness.score)}%` }}
          />
        </div>
        {completeness.gaps.length > 0 && (
          <div className="profile-detail__gaps">
            <span className="profile-detail__gaps-label">Gaps:</span>
            {completeness.gaps.map(gap => (
              <span key={gap} className="profile-detail__gap-chip">{gap}</span>
            ))}
          </div>
        )}
        {completeness.nextStages.length > 0 && (
          <p className="profile-detail__next-stages">
            {completeness.nextStages.length === 1
              ? `Recommended next: ${completeness.nextStages[0]}`
              : `Recommended next steps: ${completeness.nextStages.join(', ')}`}
          </p>
        )}
        <FillGapsButton
          accountKey={accountKey}
          hasGaps={completeness.gaps.length > 0}
          fillState={fillState}
          onFillStateChange={setFillState}
        />
      </div>

      {/* ── Actionable Hint ──────────────────────────────────────────── */}
      {hint && (
        <div className="profile-detail__hint">
          <span className="profile-detail__hint-icon">💡</span>
          <span className="profile-detail__hint-text">{hint}</span>
        </div>
      )}

      {/* ── Research Brief ───────────────────────────────────────────── */}
      {hasBrief && research.brief && (
        <div className="profile-detail__section">
          <h4 className="profile-detail__section-title">Deep Research</h4>
          {research.brief.executiveSummary && (
            <p className="profile-detail__brief-summary">
              {research.brief.executiveSummary}
            </p>
          )}
          {research.brief.keyFindings.length > 0 && (
            <ul className="profile-detail__findings-list">
              {research.brief.keyFindings.slice(0, 5).map((finding, i) => (
                <li key={i} className="profile-detail__finding">{finding}</li>
              ))}
            </ul>
          )}
          {research.brief.generatedAt && (
            <span className="profile-detail__meta-text">
              Generated {formatTimestamp(research.brief.generatedAt)}
            </span>
          )}
        </div>
      )}

      {/* ── OSINT Intelligence ───────────────────────────────────────── */}
      {hasOsint && osint.yearAhead && (
        <div className="profile-detail__section">
          <h4 className="profile-detail__section-title">
            Intelligence Report
            {osint.yearAhead.generatedAt && (
              <span className="profile-detail__section-meta">
                {formatTimestamp(osint.yearAhead.generatedAt)}
              </span>
            )}
          </h4>
          {osint.yearAhead.executiveSummary && (
            <p className="profile-detail__brief-summary">
              {osint.yearAhead.executiveSummary}
            </p>
          )}
          {osint.yearAhead.keyFindings.length > 0 && (
            <div className="profile-detail__subsection">
              <span className="profile-detail__subsection-label">Key Findings</span>
              <ul className="profile-detail__findings-list">
                {osint.yearAhead.keyFindings.slice(0, 5).map((f, i) => (
                  <li key={i} className="profile-detail__finding">{f}</li>
                ))}
              </ul>
            </div>
          )}
          {osint.yearAhead.strategicRecommendations.length > 0 && (
            <div className="profile-detail__subsection">
              <span className="profile-detail__subsection-label">Strategic Recommendations</span>
              <ul className="profile-detail__findings-list">
                {osint.yearAhead.strategicRecommendations.slice(0, 3).map((r, i) => (
                  <li key={i} className="profile-detail__finding">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── OSINT Signals Row ────────────────────────────────────────── */}
      {(osint.hiringSignals.length > 0 || osint.newsInsights.length > 0 || osint.initiatives.length > 0) && (
        <div className="profile-detail__osint-signals">
          {osint.hiringSignals.length > 0 && (
            <div className="profile-detail__signal-group">
              <span className="profile-detail__signal-group-label">
                🧑‍💼 Hiring ({osint.hiringSignals.length})
              </span>
              <div className="profile-detail__signal-chips">
                {osint.hiringSignals.slice(0, 3).map((s, i) => (
                  <span key={i} className="profile-detail__signal-chip">{s}</span>
                ))}
              </div>
            </div>
          )}
          {osint.newsInsights.length > 0 && (
            <div className="profile-detail__signal-group">
              <span className="profile-detail__signal-group-label">
                📰 News ({osint.newsInsights.length})
              </span>
              <div className="profile-detail__signal-chips">
                {osint.newsInsights.slice(0, 3).map((s, i) => (
                  <span key={i} className="profile-detail__signal-chip">{s}</span>
                ))}
              </div>
            </div>
          )}
          {osint.initiatives.length > 0 && (
            <div className="profile-detail__signal-group">
              <span className="profile-detail__signal-group-label">
                🚀 Initiatives ({osint.initiatives.length})
              </span>
              <div className="profile-detail__signal-chips">
                {osint.initiatives.slice(0, 3).map((s, i) => (
                  <span key={i} className="profile-detail__signal-chip">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Leadership ───────────────────────────────────────────────── */}
      {hasLeadership && (
        <div className="profile-detail__section">
          <h4 className="profile-detail__section-title">
            Leadership
            <span className="profile-detail__section-count">
              {research.leadership.length} people
              {decisionMakers.length > 0 && ` · ${decisionMakers.length} decision makers`}
            </span>
          </h4>
          <div className="profile-detail__people-grid">
            {research.leadership.slice(0, 8).map((person) => (
              <div key={person.name} className="profile-detail__person-card">
                <span className="profile-detail__person-name">
                  {person.name}
                  {person.isDecisionMaker && (
                    <span className="profile-detail__dm-badge" title="Decision Maker">DM</span>
                  )}
                </span>
                <span className="profile-detail__person-title">{person.title}</span>
                {person.linkedinUrl && (
                  <a
                    className="profile-detail__person-linkedin"
                    href={person.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    LinkedIn ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pain Points ──────────────────────────────────────────────── */}
      {research.painPoints.length > 0 && (
        <div className="profile-detail__section">
          <h4 className="profile-detail__section-title">Pain Points</h4>
          <div className="profile-detail__chip-list">
            {research.painPoints.map((pp, i) => (
              <span key={i} className="profile-detail__pain-chip">{pp}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Enrichment Status ────────────────────────────────────────── */}
      <div className="profile-detail__enrichment">
        <div className="profile-detail__enrichment-row">
          <span className="profile-detail__section-label">Research Status</span>
          <EnrichmentBadge status={enrichment.status} />
        </div>
        {enrichment.currentStage && (
          <span className="profile-detail__meta-text">
            Stage: {enrichment.currentStage}
          </span>
        )}
        {enrichment.completedStages.length > 0 && (
          <span className="profile-detail__meta-text">
            Completed: {enrichment.completedStages.join(', ')}
          </span>
        )}
        {enrichment.failedStages.length > 0 && (
          <span className="profile-detail__meta-text profile-detail__meta-text--warn">
            Failed: {enrichment.failedStages.join(', ')}
          </span>
        )}
      </div>

      {/* ── Data Freshness ──────────────────────────────────────────── */}
      <div className="profile-detail__freshness">
        <div className="profile-detail__freshness-status">
          {refresh.isStale ? (
            <span className="profile-detail__freshness-warn">
              ⚠️ Data may be outdated
              {refresh.lastScannedAt && (
                <span className="profile-detail__freshness-detail">
                  Last scanned {formatRelativeTime(refresh.lastScannedAt)}
                </span>
              )}
            </span>
          ) : (
            <span className="profile-detail__freshness-ok">
              ✓ Data is current
              {refresh.nextRefreshAt && (
                <span className="profile-detail__freshness-detail">
                  Next refresh {formatRelativeTime(refresh.nextRefreshAt)}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="profile-detail__freshness-row">
          <span className="profile-detail__age-item">
            Scan: {meta.dataAge.scan ?? 'No data'}
          </span>
          <span className="profile-detail__age-item">
            Research: {meta.dataAge.enrichment ?? 'No data'}
          </span>
          <span className="profile-detail__age-item">
            OSINT: {meta.dataAge.osint ?? 'No data'}
          </span>
        </div>
        {meta.sources.length > 0 && (
          <div className="profile-detail__freshness-row">
            <span className="profile-detail__age-item">
              Sources: {meta.sources.join(', ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function ScorePill({ label, value }: { label: string; value: number | null }) {
  if (value === null || value === undefined) return null;
  const rounded = Math.round(value);
  const tier =
    rounded >= 70 ? 'high' :
    rounded >= 40 ? 'mid' :
    'low';

  return (
    <div className={`profile-detail__score-pill profile-detail__score-pill--${tier}`}>
      <span className="profile-detail__score-value">{rounded}</span>
      <span className="profile-detail__score-label">{label}</span>
    </div>
  );
}

function EnrichmentBadge({ status }: { status: string }) {
  const badgeClass =
    status === 'completed' ? 'complete' :
    status === 'running' || status === 'queued' ? 'active' :
    status === 'failed' ? 'failed' :
    'none';

  const label =
    status === 'completed' ? 'Complete' :
    status === 'running' ? 'In progress' :
    status === 'queued' ? 'Queued' :
    status === 'failed' ? 'Failed — retry available' :
    status === 'unknown' ? 'Unknown' :
    'Not started';

  return (
    <span className={`profile-detail__enrichment-badge profile-detail__enrichment-badge--${badgeClass}`}>
      {label}
    </span>
  );
}

interface FillGapsButtonProps {
  accountKey: string;
  hasGaps: boolean;
  fillState: 'idle' | 'loading' | 'success' | 'error';
  onFillStateChange: (state: 'idle' | 'loading' | 'success' | 'error') => void;
}

function FillGapsButton({ accountKey, hasGaps, fillState, onFillStateChange }: FillGapsButtonProps) {
  if (!hasGaps && fillState === 'idle') {
    return (
      <button className="profile-detail__fill-btn profile-detail__fill-btn--done" disabled>
        ✓ Profile complete
      </button>
    );
  }

  const handleClick = () => {
    if (fillState === 'loading') return;
    onFillStateChange('loading');
    workerPost('/account/ensure-enriched', { accountKey })
      .then(() => {
        onFillStateChange('success');
      })
      .catch(() => {
        onFillStateChange('error');
      });
  };

  const label =
    fillState === 'loading' ? 'Analyzing…' :
    fillState === 'success' ? '✓ Research started' :
    fillState === 'error' ? 'Failed — try again' :
    '▶ Fill Gaps';

  const btnClass =
    fillState === 'success' ? 'profile-detail__fill-btn profile-detail__fill-btn--success' :
    fillState === 'error' ? 'profile-detail__fill-btn profile-detail__fill-btn--error' :
    'profile-detail__fill-btn';

  return (
    <button
      className={btnClass}
      onClick={handleClick}
      disabled={fillState === 'loading'}
    >
      {label}
    </button>
  );
}
