/**
 * CompetitorsDetail — Expanded detail view for the Competitors module.
 *
 * Shows competitor landscape: competitor cards with overlap scores,
 * technology comparison, market position, and prospecting opportunities.
 * Fetches from GET /competitors/research?accountKey=X on mount.
 */

import { useEffect, useMemo, useState } from 'react';
import { workerGet } from '../../lib/adapters';
import { useNavigation } from '../../lib/navigation';
import { CompetitorMap } from './graphs';
import { deriveCompetitorMap } from './graphs/competitor-map-adapter';

import './CompetitorsDetail.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface Competitor {
  name: string;
  domain?: string;
  overlapScore?: number;
  strengths?: string[];
  weaknesses?: string[];
}

interface TechComparison {
  shared: string[];
  gaps: string[];
  advantages: string[];
}

interface MarketPosition {
  summary: string;
  differentiators: string[];
}

interface Opportunity {
  title: string;
  description: string;
  priority?: 'high' | 'medium' | 'low';
}

interface IndustryProfile {
  industry: string;
  segment?: string;
  summary?: string;
}

interface CompetitorResearchData {
  research: {
    comparison: {
      competitors: Competitor[];
      technologyComparison: TechComparison;
      marketPosition: MarketPosition;
      differentiators: string[];
    };
  };
  opportunities: Opportunity[];
  industryProfile: IndustryProfile;
}

// ─── Props ──────────────────────────────────────────────────────────────

export interface CompetitorsDetailProps {
  accountKey: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function priorityClass(priority?: string): string {
  switch (priority) {
    case 'high': return 'competitors-detail__priority--high';
    case 'medium': return 'competitors-detail__priority--medium';
    case 'low': return 'competitors-detail__priority--low';
    default: return '';
  }
}

// ─── Component ──────────────────────────────────────────────────────────

export function CompetitorsDetail({ accountKey }: CompetitorsDetailProps) {
  const { navigateToView } = useNavigation();
  const [data, setData] = useState<CompetitorResearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    workerGet<{ data: CompetitorResearchData }>(
      `/competitors/research?accountKey=${encodeURIComponent(accountKey)}`,
    )
      .then((res) => {
        const payload = res.data?.data ?? null;
        setData(payload);
      })
      .catch((err) => {
        if (err?.status === 404) {
          setData(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load competitor data');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accountKey]);

  const competitors = data?.research?.comparison?.competitors ?? [];
  const techComparison = data?.research?.comparison?.technologyComparison;
  const marketPosition = data?.research?.comparison?.marketPosition;
  const opportunities = data?.opportunities ?? [];
  const industry = data?.industryProfile;

  // Derive graph data from competitor list
  const mapCompetitors = useMemo(
    () => deriveCompetitorMap(competitors),
    [competitors],
  );

  return (
    <div className="competitors-detail">
      {/* Loading */}
      {loading && (
        <div className="competitors-detail__loading">Loading competitor data...</div>
      )}

      {/* Error */}
      {error && (
        <div className="competitors-detail__error">{error}</div>
      )}

      {/* Empty */}
      {!loading && !error && !data && (
        <div className="competitors-detail__empty">
          No competitor data yet. Run competitor research to map the landscape.
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <div className="competitors-detail__results">
          {/* Competitor Map — bubble chart visualization */}
          {mapCompetitors.length > 0 && (
            <div className="competitors-detail__graph" style={{ marginBottom: 16 }}>
              <CompetitorMap
                competitors={mapCompetitors}
                onCompetitorClick={() => {
                  navigateToView('accounts');
                }}
                width={680}
                height={340}
              />
            </div>
          )}

          {/* Summary stats */}
          <div className="competitors-detail__summary">
            <div className="competitors-detail__stat">
              <span className="competitors-detail__stat-value">{competitors.length}</span>
              <span className="competitors-detail__stat-label">Competitors</span>
            </div>
            <div className="competitors-detail__stat">
              <span className="competitors-detail__stat-value">{opportunities.length}</span>
              <span className="competitors-detail__stat-label">Opportunities</span>
            </div>
            <div className="competitors-detail__stat">
              <span className="competitors-detail__stat-value">
                {techComparison?.gaps?.length ?? 0}
              </span>
              <span className="competitors-detail__stat-label">Tech Gaps</span>
            </div>
            <div className="competitors-detail__stat">
              <span className="competitors-detail__stat-value">
                {marketPosition?.differentiators?.length ?? 0}
              </span>
              <span className="competitors-detail__stat-label">Differentiators</span>
            </div>
          </div>

          {/* Industry profile */}
          {industry && (
            <div className="competitors-detail__industry">
              <span className="competitors-detail__industry-label">{industry.industry}</span>
              {industry.segment && (
                <span className="competitors-detail__industry-segment">{industry.segment}</span>
              )}
              {industry.summary && (
                <p className="competitors-detail__industry-summary">{industry.summary}</p>
              )}
            </div>
          )}

          {/* Market position */}
          {marketPosition && (
            <div className="competitors-detail__market">
              <h4 className="competitors-detail__section-title">Market Position</h4>
              <p className="competitors-detail__market-summary">{marketPosition.summary}</p>
              {marketPosition.differentiators.length > 0 && (
                <div className="competitors-detail__differentiators">
                  {marketPosition.differentiators.map((d, i) => (
                    <span key={i} className="competitors-detail__tag competitors-detail__tag--advantage">
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Competitor cards */}
          {competitors.length > 0 && (
            <div className="competitors-detail__competitors">
              <h4 className="competitors-detail__section-title">Competitors</h4>
              <div className="competitors-detail__card-list">
                {competitors.map((comp) => (
                  <div key={comp.name} className="competitors-detail__card">
                    <div className="competitors-detail__card-header">
                      <span className="competitors-detail__card-name">{comp.name}</span>
                      {comp.domain && (
                        <span className="competitors-detail__card-domain">{comp.domain}</span>
                      )}
                      {comp.overlapScore != null && (
                        <span className="competitors-detail__overlap">
                          {Math.round(comp.overlapScore * 100)}% overlap
                        </span>
                      )}
                    </div>
                    {comp.strengths && comp.strengths.length > 0 && (
                      <div className="competitors-detail__card-section">
                        <span className="competitors-detail__card-label">Strengths</span>
                        <div className="competitors-detail__tag-list">
                          {comp.strengths.map((s, i) => (
                            <span key={i} className="competitors-detail__tag competitors-detail__tag--strength">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {comp.weaknesses && comp.weaknesses.length > 0 && (
                      <div className="competitors-detail__card-section">
                        <span className="competitors-detail__card-label">Weaknesses</span>
                        <div className="competitors-detail__tag-list">
                          {comp.weaknesses.map((w, i) => (
                            <span key={i} className="competitors-detail__tag competitors-detail__tag--weakness">{w}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technology comparison */}
          {techComparison && (
            <div className="competitors-detail__tech-comparison">
              <h4 className="competitors-detail__section-title">Technology Comparison</h4>
              <div className="competitors-detail__tech-groups">
                {techComparison.shared.length > 0 && (
                  <div className="competitors-detail__tech-group">
                    <span className="competitors-detail__tech-group-label">Shared</span>
                    <div className="competitors-detail__tag-list">
                      {techComparison.shared.map((t) => (
                        <span key={t} className="competitors-detail__tag">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {techComparison.gaps.length > 0 && (
                  <div className="competitors-detail__tech-group">
                    <span className="competitors-detail__tech-group-label">Gaps</span>
                    <div className="competitors-detail__tag-list">
                      {techComparison.gaps.map((t) => (
                        <span key={t} className="competitors-detail__tag competitors-detail__tag--gap">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {techComparison.advantages.length > 0 && (
                  <div className="competitors-detail__tech-group">
                    <span className="competitors-detail__tech-group-label">Advantages</span>
                    <div className="competitors-detail__tag-list">
                      {techComparison.advantages.map((t) => (
                        <span key={t} className="competitors-detail__tag competitors-detail__tag--advantage">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prospecting opportunities */}
          {opportunities.length > 0 && (
            <div className="competitors-detail__opportunities">
              <h4 className="competitors-detail__section-title">Prospecting Opportunities</h4>
              <div className="competitors-detail__opp-list">
                {opportunities.map((opp, i) => (
                  <div key={i} className="competitors-detail__opp">
                    <div className="competitors-detail__opp-header">
                      <span className="competitors-detail__opp-title">{opp.title}</span>
                      {opp.priority && (
                        <span className={`competitors-detail__priority ${priorityClass(opp.priority)}`}>
                          {opp.priority}
                        </span>
                      )}
                    </div>
                    <p className="competitors-detail__opp-desc">{opp.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
