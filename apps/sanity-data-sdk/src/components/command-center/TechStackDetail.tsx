/**
 * TechStackDetail — Expanded detail view for the Tech Stack module.
 *
 * Shows technology inventory grouped by category with status badges,
 * AI-generated summary, stack maturity indicator, and selling angles.
 * Fetches from GET /technologies/insights?accountKey=X on mount.
 */

import { useEffect, useMemo, useState } from 'react';
import { workerGet } from '../../lib/adapters';
import { TechStackRadar } from './graphs';
import { deriveRadarCategories } from './graphs/tech-radar-adapter';

import './TechStackDetail.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface TechMeta {
  totalCount: number;
  categoryCount: number;
  legacyCount: number;
  stackMaturity: string; // e.g. 'modern', 'mixed', 'legacy'
}

interface TechItem {
  name: string;
  category: string;
  status?: string; // 'active' | 'legacy' | 'migration-target' | 'unknown'
  sellingAngle?: string;
}

interface TechInsightsData {
  technologies: TechItem[];
  grouped: Record<string, TechItem[]>;
  summary: string;
  topOpportunity?: string;
  meta: TechMeta;
  needsAnalysis?: boolean;
}

// ─── Props ──────────────────────────────────────────────────────────────

export interface TechStackDetailProps {
  accountKey: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function statusBadgeClass(status?: string): string {
  switch (status) {
    case 'active': return 'techstack-detail__badge--active';
    case 'legacy': return 'techstack-detail__badge--legacy';
    case 'migration-target': return 'techstack-detail__badge--migration';
    default: return 'techstack-detail__badge--unknown';
  }
}

// ─── Component ──────────────────────────────────────────────────────────

export function TechStackDetail({ accountKey }: TechStackDetailProps) {
  const [data, setData] = useState<TechInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    workerGet<{ data: TechInsightsData }>(
      `/technologies/insights?accountKey=${encodeURIComponent(accountKey)}`,
    )
      .then((res) => {
        const payload = res.data?.data ?? null;
        setData(payload);
      })
      .catch((err) => {
        if (err?.status === 404) {
          setData(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load tech stack');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accountKey]);

  // Tech Radar — convert grouped tech items to TechCategory[] for the radar adapter
  const radarCategories = useMemo(
    () =>
      data?.grouped
        ? deriveRadarCategories(
            Object.entries(data.grouped).map(([cat, techs]) => ({
              category: cat,
              technologies: techs.map((t) => t.name),
              count: techs.length,
            })),
          )
        : [],
    [data?.grouped],
  );

  return (
    <div className="techstack-detail">
      {/* Loading */}
      {loading && (
        <div className="techstack-detail__loading">Loading tech stack data...</div>
      )}

      {/* Error */}
      {error && (
        <div className="techstack-detail__error">{error}</div>
      )}

      {/* Empty */}
      {!loading && !error && !data && (
        <div className="techstack-detail__empty">
          No technology data yet. Run research to detect the tech stack.
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <div className="techstack-detail__results">
          {/* Tech Radar graph — spider chart of category strengths */}
          {Object.keys(data.grouped).length > 0 && (
            <div className="techstack-detail__graph" style={{ marginBottom: 16 }}>
              <TechStackRadar
                categories={radarCategories}
                onCategoryClick={() => {}}
                width={680}
                height={340}
              />
            </div>
          )}

          {/* Needs analysis banner */}
          {data.needsAnalysis && (
            <div className="techstack-detail__banner">
              ⚡ Technology data detected but not yet analyzed. Run &quot;Analyze Stack&quot; for insights.
            </div>
          )}

          {/* Summary stats */}
          <div className="techstack-detail__summary">
            <div className="techstack-detail__stat">
              <span className="techstack-detail__stat-value">{data.meta.totalCount}</span>
              <span className="techstack-detail__stat-label">Technologies</span>
            </div>
            <div className="techstack-detail__stat">
              <span className="techstack-detail__stat-value">{data.meta.categoryCount}</span>
              <span className="techstack-detail__stat-label">Categories</span>
            </div>
            <div className="techstack-detail__stat">
              <span className="techstack-detail__stat-value">{data.meta.legacyCount}</span>
              <span className="techstack-detail__stat-label">Legacy</span>
            </div>
            <div className="techstack-detail__stat">
              <span className="techstack-detail__stat-value techstack-detail__stat-value--maturity">
                {data.meta.stackMaturity}
              </span>
              <span className="techstack-detail__stat-label">Maturity</span>
            </div>
          </div>

          {/* AI Summary */}
          {data.summary && (
            <div className="techstack-detail__ai-summary">
              <h4 className="techstack-detail__section-title">Stack Summary</h4>
              <p className="techstack-detail__summary-text">{data.summary}</p>
            </div>
          )}

          {/* Top opportunity */}
          {data.topOpportunity && (
            <div className="techstack-detail__opportunity">
              <h4 className="techstack-detail__section-title">🎯 Top Opportunity</h4>
              <p className="techstack-detail__opportunity-text">{data.topOpportunity}</p>
            </div>
          )}

          {/* Grouped tech list */}
          <div className="techstack-detail__categories">
            <h4 className="techstack-detail__section-title">Technology Inventory</h4>
            {Object.entries(data.grouped).map(([category, techs]) => (
              <div key={category} className="techstack-detail__category">
                <h5 className="techstack-detail__category-name">
                  {category}
                  <span className="techstack-detail__category-count">{techs.length}</span>
                </h5>
                <div className="techstack-detail__tech-list">
                  {techs.map((tech) => (
                    <div key={tech.name} className="techstack-detail__tech-item">
                      <span className="techstack-detail__tech-name">{tech.name}</span>
                      <span className={`techstack-detail__badge ${statusBadgeClass(tech.status)}`}>
                        {tech.status ?? 'unknown'}
                      </span>
                      {tech.sellingAngle && (
                        <span className="techstack-detail__selling-angle" title={tech.sellingAngle}>
                          💡
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
