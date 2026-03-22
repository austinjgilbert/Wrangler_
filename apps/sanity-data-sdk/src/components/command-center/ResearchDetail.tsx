/**
 * ResearchDetail — Expanded detail view for the Research module.
 *
 * Shows pipeline progress bar + research results (summary stats + brief).
 * Fetches from /enrich/research?accountKey=X on mount.
 *
 * MVP: summary stats + brief markdown. No charts, no fancy layouts.
 */

import { useEffect, useMemo, useState } from 'react';
import { PipelineBar } from './PipelineBar';
import { PipelineFlow } from './graphs';
import { derivePipelineFlow } from './graphs/pipeline-flow-adapter';
import { workerGet } from '../../lib/adapters';
import type { PipelineStage } from '../../lib/adapters';
import { formatTimestamp } from '../../lib/formatters';

import './ResearchDetail.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface ResearchSummary {
  pagesDiscovered: number;
  pagesCrawled: number;
  evidencePacks: number;
  hasBrief: boolean;
  hasLinkedIn: boolean;
}

interface ResearchBrief {
  markdown: string;
  sections?: { title: string; content: string }[];
  recommendations?: string[];
}

interface ResearchStages {
  completed: string[];
  failed: string[];
  total: number;
}

interface ResearchSet {
  accountKey: string;
  canonicalUrl: string;
  completedAt?: string;
  status: 'complete' | 'partial';
  summary: ResearchSummary;
  brief: ResearchBrief | null;
  stages: ResearchStages;
}

// ─── Props ──────────────────────────────────────────────────────────────

export interface ResearchDetailProps {
  accountKey: string;
  pipelineStages: PipelineStage[];
}

// ─── Component ──────────────────────────────────────────────────────────

export function ResearchDetail({ accountKey, pipelineStages }: ResearchDetailProps) {
  const [results, setResults] = useState<ResearchSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pipeline Flow graph — derive flow stages from pipeline stages (memoized)
  const flowStages = useMemo(() => derivePipelineFlow(pipelineStages), [pipelineStages]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    workerGet<{ data: { researchSet: ResearchSet } }>(
      `/enrich/research?accountKey=${encodeURIComponent(accountKey)}`,
    )
      .then((res) => {
        // workerGet wraps Worker JSON in { ok, data: T, status }
        // T here is { data: { researchSet: {...} } }, so res.data.data.researchSet
        const researchSet = res.data?.data?.researchSet ?? null;
        setResults(researchSet);
      })
      .catch((err) => {
        // 404 = no research data yet (expected for un-enriched accounts)
        if (err?.status === 404) {
          setResults(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load research');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accountKey]);

  return (
    <div className="research-detail">
      {/* Pipeline progress bar */}
      <PipelineBar stages={pipelineStages} />

      {/* Pipeline Flow graph — stage breakdown with completion status */}
      {flowStages.length > 0 && (
        <div className="research-detail__graph" style={{ marginBottom: 16 }}>
          <PipelineFlow
            stages={flowStages}
            pipelineStages={pipelineStages}
            onStageClick={() => {}}
            width={680}
            height={260}
          />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="research-detail__loading">Loading research data...</div>
      )}

      {/* Error state */}
      {error && (
        <div className="research-detail__error">{error}</div>
      )}

      {/* Empty state — no research yet */}
      {!loading && !error && !results && (
        <div className="research-detail__empty">
          No research results yet. Click &quot;Deep Research&quot; to start.
        </div>
      )}

      {/* Results */}
      {!loading && results && (
        <div className="research-detail__results">
          {/* Summary stats */}
          <div className="research-detail__summary">
            <div className="research-detail__stat">
              <span className="research-detail__stat-value">{results.summary.pagesDiscovered}</span>
              <span className="research-detail__stat-label">Pages Found</span>
            </div>
            <div className="research-detail__stat">
              <span className="research-detail__stat-value">{results.summary.pagesCrawled}</span>
              <span className="research-detail__stat-label">Crawled</span>
            </div>
            <div className="research-detail__stat">
              <span className="research-detail__stat-value">{results.summary.evidencePacks}</span>
              <span className="research-detail__stat-label">Evidence</span>
            </div>
            <div className="research-detail__stat">
              <span className="research-detail__stat-value">
                {results.stages.completed.length}/{results.stages.total}
              </span>
              <span className="research-detail__stat-label">Stages</span>
            </div>
          </div>

          {/* Brief content */}
          {results.brief?.markdown && (
            <div className="research-detail__brief">
              <h4 className="research-detail__brief-title">Research Brief</h4>
              <div className="research-detail__brief-content">
                {results.brief.markdown}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {results.brief?.recommendations && results.brief.recommendations.length > 0 && (
            <div className="research-detail__recommendations">
              <h4 className="research-detail__recommendations-title">Recommendations</h4>
              <ul className="research-detail__recommendations-list">
                {results.brief.recommendations.map((rec, i) => (
                  <li key={i} className="research-detail__recommendation">{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Completion timestamp */}
          {results.completedAt && (
            <div className="research-detail__meta">
              Completed {formatTimestamp(results.completedAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
