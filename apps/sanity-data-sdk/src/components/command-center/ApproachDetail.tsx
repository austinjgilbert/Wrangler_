/**
 * ApproachDetail — Expanded detail view for the Approach / Opportunity module.
 *
 * Shows the ranked action queue for the selected account, with per-action
 * opportunity score breakdowns (8 weighted factors). Data comes from the
 * Worker's opportunity scoring engine via GET /opportunities/score.
 *
 * Response shape: { ok: true, data: { generatedAt, totalCandidates, actions[] } }
 * Each action: { rank, candidate, account?, person?, signals[], score: OpportunityScoreBreakdown }
 * Score breakdown: { patternStrength, signalUrgency, ..., total, strongestDrivers[] }
 */

import { useEffect, useState } from 'react';

import { workerGet, WorkerApiError } from '../../lib/adapters';
import './ApproachDetail.css';

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
    whyNow?: string;
    evidence?: Array<{ summary?: string }>;
    missingData?: string[];
    recommendedNextStep?: string;
  };
  account?: {
    companyName?: string;
  };
  person?: {
    name?: string;
    currentTitle?: string;
  };
  signals?: Array<{ type?: string; summary?: string }>;
  score?: ScoreBreakdown;
}

interface QueueResponse {
  date?: string;
  generatedAt?: string;
  totalCandidates?: number;
  actions: RankedAction[];
}

interface ApproachDetailProps {
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

const URGENCY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#d97706',
  medium: '#2563eb',
  low: '#808088',
};

// ─── Component ──────────────────────────────────────────────────────────

export function ApproachDetail({ accountKey }: ApproachDetailProps) {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpointUnavailable, setEndpointUnavailable] = useState(false);
  const [expandedAction, setExpandedAction] = useState<number | null>(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setEndpointUnavailable(false);

    workerGet<QueueResponse>(
      `/opportunities/score?accountKey=${encodeURIComponent(accountKey)}&mode=queue`,
    )
      .then((res) => {
        const queue = res.data ?? null;
        setData(queue);
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

  // ── Loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="approach-detail approach-detail--loading">
        <div className="approach-detail__spinner" />
        <p>Loading opportunity scores…</p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="approach-detail approach-detail--error">
        <p className="approach-detail__error-text">
          Something went wrong loading opportunity data. Try again in a moment.
        </p>
      </div>
    );
  }

  // ── Endpoint Not Yet Available ────────────────────────────────────────

  if (endpointUnavailable) {
    return (
      <div className="approach-detail">
        <div className="approach-detail__unavailable">
          <p className="approach-detail__unavailable-title">Opportunity scoring is not yet available.</p>
          <p className="approach-detail__unavailable-hint">
            This endpoint is being deployed. Check back after the next Worker release.
          </p>
        </div>
      </div>
    );
  }

  // ── Empty State ───────────────────────────────────────────────────────

  if (!data || data.actions.length === 0) {
    return (
      <div className="approach-detail">
        <div className="approach-detail__empty">
          <p className="approach-detail__empty-title">No opportunities scored yet.</p>
          <p className="approach-detail__empty-hint">
            Run research on this account to generate action candidates for scoring.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived Stats ─────────────────────────────────────────────────────

  const topAction = data.actions[0];
  const topScore = topAction?.score?.total ?? 0;
  const actionCount = data.actions.length;
  const highPriorityCount = data.actions.filter(
    a => a.candidate?.urgency === 'critical' || a.candidate?.urgency === 'high',
  ).length;
  const topDriver = topAction?.score?.strongestDrivers?.[0];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="approach-detail">
      {/* Summary Stats */}
      <div className="approach-detail__stats">
        <div className="approach-detail__stat">
          <span className="approach-detail__stat-value approach-detail__stat-value--score">
            {Math.round(topScore)}
          </span>
          <span className="approach-detail__stat-label">Top Opportunity Score</span>
        </div>
        <div className="approach-detail__stat">
          <span className="approach-detail__stat-value">{actionCount}</span>
          <span className="approach-detail__stat-label">
            {actionCount === 1 ? 'Action' : 'Actions'}
          </span>
        </div>
        {topDriver && (
          <div className="approach-detail__stat">
            <span className="approach-detail__stat-value approach-detail__stat-value--driver">
              {humanizeFactorName(topDriver)}
            </span>
            <span className="approach-detail__stat-label">Top Driver</span>
          </div>
        )}
        <div className="approach-detail__stat">
          <span className="approach-detail__stat-value approach-detail__stat-value--priority">
            {highPriorityCount}
          </span>
          <span className="approach-detail__stat-label">High Priority</span>
        </div>
      </div>

      {/* Ranked Actions */}
      <div className="approach-detail__actions">
        <h4 className="approach-detail__section-title">
          Ranked Actions
          {data.generatedAt && (
            <span className="approach-detail__generated-at">
              Generated {formatRelativeTime(data.generatedAt)}
            </span>
          )}
        </h4>
        <div className="approach-detail__action-list">
          {data.actions.map((action, i) => {
            const isExpanded = expandedAction === i;
            const urgency = action.candidate?.urgency ?? 'low';
            return (
              <div key={i} className="approach-detail__action-card">
                <button
                  className="approach-detail__action-header"
                  onClick={() => setExpandedAction(isExpanded ? null : i)}
                >
                  <span className="approach-detail__action-rank">#{action.rank ?? i + 1}</span>
                  <span className="approach-detail__action-type">
                    {action.candidate?.actionType ?? 'Action'}
                  </span>
                  {urgency !== 'low' && (
                    <span
                      className="approach-detail__action-urgency"
                      style={{ backgroundColor: URGENCY_COLORS[urgency] ?? '#808088' }}
                    >
                      {urgency}
                    </span>
                  )}
                  {action.score?.total != null && (
                    <span className="approach-detail__action-score">
                      {Math.round(action.score.total)}
                    </span>
                  )}
                  <span className={`approach-detail__expand-icon ${isExpanded ? 'approach-detail__expand-icon--open' : ''}`}>
                    ▸
                  </span>
                </button>

                {isExpanded && (
                  <div className="approach-detail__action-body">
                    {action.person?.name && (
                      <div className="approach-detail__action-person">
                        <span className="approach-detail__action-person-name">{action.person.name}</span>
                        {action.person.currentTitle && (
                          <span className="approach-detail__action-person-title">
                            {action.person.currentTitle}
                          </span>
                        )}
                      </div>
                    )}

                    {action.candidate?.whyNow && (
                      <p className="approach-detail__action-why">{action.candidate.whyNow}</p>
                    )}

                    {action.candidate?.recommendedNextStep && (
                      <div className="approach-detail__action-next">
                        <span className="approach-detail__label">Recommended next step</span>
                        <p>{action.candidate.recommendedNextStep}</p>
                      </div>
                    )}

                    {/* Per-action score breakdown */}
                    {action.score && (
                      <div className="approach-detail__breakdown">
                        <span className="approach-detail__label">Opportunity Score Breakdown</span>
                        <div className="approach-detail__factors">
                          {SCORE_FACTORS.map(({ key, label, weight }) => {
                            const value = action.score![key] ?? 0;
                            const isDriver = action.score!.strongestDrivers?.includes(key);
                            return (
                              <div
                                key={key}
                                className={`approach-detail__factor ${isDriver ? 'approach-detail__factor--driver' : ''}`}
                              >
                                <div className="approach-detail__factor-header">
                                  <span className="approach-detail__factor-name">
                                    {label}
                                    {isDriver && <span className="approach-detail__driver-badge">driver</span>}
                                  </span>
                                  <span className="approach-detail__factor-weight">
                                    {Math.round(weight * 100)}%
                                  </span>
                                </div>
                                <div className="approach-detail__factor-track">
                                  <div
                                    className="approach-detail__factor-fill"
                                    style={{ width: `${Math.round(value * 100)}%` }}
                                  />
                                </div>
                                <span className="approach-detail__factor-score">
                                  {Math.round(value * 100)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Evidence chips */}
                    {(action.candidate?.evidence?.length ?? 0) > 0 && (
                      <div className="approach-detail__chips">
                        <span className="approach-detail__label">Evidence</span>
                        <div className="approach-detail__chip-list">
                          {action.candidate!.evidence!.map((e, j) => (
                            <span key={j} className="approach-detail__evidence-chip">
                              {typeof e === 'string' ? e : e.summary ?? 'Evidence'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Missing data warnings */}
                    {(action.candidate?.missingData?.length ?? 0) > 0 && (
                      <div className="approach-detail__chips">
                        <span className="approach-detail__label">Missing data</span>
                        <div className="approach-detail__chip-list">
                          {action.candidate!.missingData!.map((m, j) => (
                            <span key={j} className="approach-detail__missing-chip">{m}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Signals */}
                    {(action.signals?.length ?? 0) > 0 && (
                      <div className="approach-detail__chips">
                        <span className="approach-detail__label">Signals</span>
                        <div className="approach-detail__chip-list">
                          {action.signals!.map((s, j) => (
                            <span key={j} className="approach-detail__signal-chip">
                              {s.type ?? 'signal'}{s.summary ? `: ${s.summary}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
