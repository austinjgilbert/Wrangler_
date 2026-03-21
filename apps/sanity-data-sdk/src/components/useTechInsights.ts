/**
 * useTechInsights — Hook for fetching AI technology analysis from the Worker.
 *
 * Data source: GET /technologies/insights?accountKey=X
 * Trigger:     POST /technologies/analyze { accountKey, force? }
 *
 * Extracted from TechInsightsPanel.tsx for reuse in TechnologiesListView.
 * The endpoint merges technology docs + raw technologyStack + AI blob
 * into a single response with per-tech insights and stack summary.
 *
 * Double-nesting: workerGet returns { ok, data: { ok, data: TechInsightsResponse } }
 * → actual payload at response.data.data
 */

import { useCallback, useEffect, useState } from 'react';
import { workerGet, workerPost, WorkerApiError } from '../lib/adapters/fetch-worker';

// ─── Types (match tech-endpoint-shapes board artifact) ──────────────────

export interface TechInsights {
  risk: string[];
  opportunity: string[];
  painPoints: string[];
  targetPersonas: string[];
  sellingAngle: string | null;
  competitorUsage: string | null;
}

export interface Technology {
  name: string;
  slug: string;
  category: string;
  isLegacy: boolean;
  isMigrationTarget: boolean;
  source: 'enrichment' | 'scan';
  lastEnrichedAt: string | null;
  status: 'active' | 'legacy' | 'migration-target' | 'testing' | 'unknown';
  confidence: number;
  insights: TechInsights | null;
}

export interface StackSummary {
  stackMaturity: 'modern' | 'mixed' | 'legacy';
  migrationReadiness: number; // 0-1
  topRisks: string[];
  topOpportunities: string[];
  overallAssessment: string;
}

export interface TechInsightsResponse {
  accountKey: string;
  companyName: string;
  needsAnalysis: boolean;
  technologies: Technology[];
  grouped: Record<string, Technology[]>;
  summary: StackSummary | null;
  meta: {
    lastAnalyzedAt: string | null;
    totalCount: number;
    categoryCount: number;
    legacyCount: number;
    stackMaturity: 'modern' | 'mixed' | 'legacy' | null;
    categories: string[];
  };
}

interface AnalyzeResponse {
  accountKey: string;
  status: 'analyzing' | 'already_analyzed';
  message: string;
  analysisId?: string;
  technologiesQueued?: number;
  rawStackHash?: string;
  lastAnalyzedAt?: string;
}

// ─── Hook ───────────────────────────────────────────────────────────────

export interface UseTechInsightsResult {
  data: TechInsightsResponse | null;
  loading: boolean;
  error: string | null;
  analyzing: boolean;
  analyze: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTechInsights(accountKey: string | null): UseTechInsightsResult {
  const [data, setData] = useState<TechInsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!accountKey) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await workerGet<{ ok: boolean; data: TechInsightsResponse }>(
        `/technologies/insights?accountKey=${encodeURIComponent(accountKey)}`,
      );
      setData(response.data.data);
    } catch (err) {
      if (err instanceof WorkerApiError && err.status === 404) {
        setData(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load analysis');
      }
    } finally {
      setLoading(false);
    }
  }, [accountKey]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const analyze = useCallback(async () => {
    if (!accountKey) return;
    setAnalyzing(true);
    setError(null);

    try {
      const response = await workerPost<{ ok: boolean; data: AnalyzeResponse }>(
        '/technologies/analyze',
        { accountKey },
      );
      const result = response.data.data;

      if (result.status === 'already_analyzed') {
        await fetchInsights();
      } else {
        // Analysis triggered — poll after delay
        // TODO: Replace with proper polling when analyze becomes async
        setTimeout(() => fetchInsights(), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }, [accountKey, fetchInsights]);

  return { data, loading, error, analyzing, analyze, refresh: fetchInsights };
}
