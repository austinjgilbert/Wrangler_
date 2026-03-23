/**
 * OpportunityDetail — Score-focused detail view for the Opportunity module.
 *
 * Shows the aggregate opportunity score for the selected account with an
 * 8-factor breakdown, strongest driver highlights, and a recalculate button.
 * Complements ApproachDetail (which shows the ranked action queue).
 *
 * Data comes from GET /opportunities/score?accountKey=X&mode=queue — same
 * endpoint as ApproachDetail, different facet of the response.
 */

import { useCallback, useEffect, useState } from 'react';

import { workerGet, WorkerApiError } from '../../lib/adapters';
import './OpportunityDetail.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  patternStrength: number;
  signalUrgency: number;
  personaInfluence: number;
  techRelevance: number;
  accountPriority: number;
  evidenceConfidence: number;
  recencyWeight: number;
  actionabilityWeight: number;
  total: number;
  strongestDrivers?: string[];
  updatedAt?: string;
}

interface RankedAction {
  rank: number;
  candidate?: {
    actionType?: string;
    urgency?: string;
    missingData?: string[];
  };
  score?: ScoreBreakdown;
}

interface QueueResponse {
  date?: string;
  generatedAt?: string;
  totalCandidates?: number;
  actions: RankedAction[];
}

interface OpportunityDetailProps {
  accountKey: string;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Opportunity score factor display config: label + weight (from opportunityEngine.ts) */
const SCORE_FACTORS: Array<{
  key: keyof Omit<ScoreBreakdown, 'total' | 'strongestDrivers' | 'updatedAt'>;
  label: string;
  weight: number;
}> = [
  { key: 'signalUrgency', label: 'Signal Urgency', weight: 0.18 },
  { key: 'patternStrength', label: 'Pattern Strength', weight: 0.16 },
  { key: 'personaInfluence', label: 'Persona Influence', weight: 0.12 },
  { key: 'techRelevance', label: 'Tech Relevance', weight: 0.12 },
  { key: 'accountPriority', label: 'Account Priority', weight: 0.12 },
  { key: 'evidenceConfidence', label: 'Evidence Confidence', weight: 0.12 },
  { key: 'recencyWeight', label: 'Recency', weight: 0.10 },
  { key: 'actionabilityWeight', label: 'Actionability', weight: 0.08 },
];

/** Score color thresholds */
function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a';
  if (score >= 40) return '#d97706';
  return '#dc2626';
}

// ─── Component ──────────────────────────────────────────────────────────

export function OpportunityDetail({ accountKey }: OpportunityDetailProps) {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpointUnavailable, setEndpointUnavailable] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcStatus, setRecalcStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const fetchScore = useCallback(() => {
    setLoading(true);
    setError(null);
    setEndpointUnavailable(false);

    workerGet<QueueResponse>(
      `/opportunities/score?accountKey=${encodeURIComponent(accountKey)}&mode=queue`,
    )
      .then((res) => {
        setData(res.data ?? null);
      })
      .catch((err) => {
        if (err instanceof WorkerApiError && (err.status === 404 || err.status === 501)) {
          setEndpointUnavailable(true);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load opportunity score');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accountKey]);

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  const handleRecalculate = useCallback(() => {
    setRecalculating(true);
    setRecalcStatus('idle');

    workerGet<QueueResponse>(
      `/opportunities/score?accountKey=${encodeURIComponent(accountKey)}&mode=queue`,
    )
      .then((res) => {
        setData(res.data ?? null);
        setRecalcStatus('success');
      })
      .catch(() => {
        setRecalcStatus('error');
      })
      .finally(() => {
        setRecalculating(false);
      });
  }, [accountKey]);

  // ── Loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="opportunity-detail opportunity-detail--loading">
        <div className="opportunity-detail__spinner" />
        <p>Loading opportunity score…</p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="opportunity-detail opportunity-detail--error">
        <p className="opportunity-detail__error-text">
          Something went wrong loading opportunity data. Try again in a moment.
        </p>
      </div>
    );
  }

  // ── Endpoint Not Yet Available ────────────────────────────────────────

  if (endpointUnavailable) {
    return (
      <div className="opportunity-detail">
        <div className="opportunity-detail__unavailable">
          <p className="opportunity-detail__unavailable-title">Opportunity scoring is not yet available.</p>
          <p className="opportunity-detail__unavailable-hint">
            This endpoint is being deployed. Check back after the next Worker release.
          </p>
        </div>
      </div>
    );
  }

  // ── Empty State ───────────────────────────────────────────────────────

  if (!data || data.actions.length === 0) {
    return (
      <div className="opportunity-detail">
        <div className="opportunity-detail__empty">
          <p className="opportunity-detail__empty-title">No opportunity score available.</p>
          <p className="opportunity-detail__empty-hint">
            Run research to generate scoring data.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived Data ──────────────────────────────────────────────────────

  const topAction = data.actions[0];
  const topScore = topAction?.score?.total ?? 0;
  const strongestDrivers = topAction?.score?.strongestDrivers ?? [];
  const totalCandidates = data.totalCandidates ?? data.actions.length;

  // Aggregate missing data across all actions (deduplicated)
  const allMissingData = Array.from(
    new Set(data.actions.flatMap(a => a.candidate?.missingData ?? [])),
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="opportunity-detail">
      {/* Score Hero */}
      <div className="opportunity-detail__hero">
        <div className="opportunity-detail__score-ring" style={{ borderColor: scoreColor(topScore) }}>
          <span
            className="opportunity-detail__score-value"
            style={{ color: scoreColor(topScore) }}
          >
            {Math.round(topScore)}
          </span>
          <span className="opportunity-detail__score-label">out of 100</span>
        </div>
        <div className="opportunity-detail__hero-meta">
          <h3 className="opportunity-detail__hero-title">Opportunity Score</h3>
          <p className="opportunity-detail__hero-subtitle">
            {totalCandidates} {totalCandidates === 1 ? 'candidate' : 'candidates'} scored
            {data.generatedAt && (
              <span className="opportunity-detail__hero-time">
                {' · '}{formatRelativeTime(data.generatedAt)}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Strongest Drivers */}
      {strongestDrivers.length > 0 && (
        <div className="opportunity-detail__section">
          <h4 className="opportunity-detail__section-title">Strongest Drivers</h4>
          <div className="opportunity-detail__drivers">
            {strongestDrivers.map((driver) => (
              <span key={driver} className="opportunity-detail__driver-pill">
                {humanizeFactorName(driver)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Score Breakdown */}
      <div className="opportunity-detail__section">
        <h4 className="opportunity-detail__section-title">Score Factors</h4>
        <div className="opportunity-detail__factors">
          {SCORE_FACTORS.map(({ key, label, weight }) => {
            const value = topAction?.score?.[key] ?? 0;
            const isDriver = strongestDrivers.includes(key);
            return (
              <div
                key={key}
                className={`opportunity-detail__factor ${isDriver ? 'opportunity-detail__factor--driver' : ''}`}
              >
                <div className="opportunity-detail__factor-header">
                  <span className="opportunity-detail__factor-name">
                    {label}
                    {isDriver && <span className="opportunity-detail__driver-badge">driver</span>}
                  </span>
                  <span className="opportunity-detail__factor-weight">
                    {Math.round(weight * 100)}%
                  </span>
                </div>
                <div className="opportunity-detail__factor-track">
                  <div
                    className="opportunity-detail__factor-fill"
                    style={{ width: `${Math.round(value * 100)}%` }}
                  />
                </div>
                <span className="opportunity-detail__factor-score">
                  {Math.round(value * 100)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Missing Data */}
      {allMissingData.length > 0 && (
        <div className="opportunity-detail__section">
          <h4 className="opportunity-detail__section-title">Data Gaps</h4>
          <div className="opportunity-detail__gaps">
            {allMissingData.map((gap) => (
              <span key={gap} className="opportunity-detail__gap-chip">{gap}</span>
            ))}
          </div>
        </div>
      )}

      {/* Recalculate Button */}
      <div className="opportunity-detail__actions">
        <button
          className="opportunity-detail__recalc-btn"
          onClick={handleRecalculate}
          disabled={recalculating}
        >
          {recalculating
            ? 'Calculating…'
            : recalcStatus === 'success'
              ? '✓ Score updated'
              : recalcStatus === 'error'
                ? 'Failed — try again'
                : '↻ Recalculate Score'}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

const FACTOR_LABELS: Record<string, string> = {
  patternStrength: 'Pattern Strength',
  signalUrgency: 'Signal Urgency',
  personaInfluence: 'Persona Influence',
  techRelevance: 'Tech Relevance',
  accountPriority: 'Account Priority',
  evidenceConfidence: 'Evidence Confidence',
  recencyWeight: 'Recency',
  actionabilityWeight: 'Actionability',
};

function humanizeFactorName(key: string): string {
  return FACTOR_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}
