import type { BestKnownPath, ScenarioRun } from './autopilotTypes.ts';

const DEFAULT_PATHS: Record<string, { steps: string[]; fallbackSteps: string[] }> = {
  account_enrichment: {
    steps: ['inspect account gaps', 'run tech detection', 'run person discovery', 'validate evidence', 'recalculate score', 'generate actions'],
    fallbackSteps: ['skip tech detection if crawl fails', 'use existing signals', 'generate partial action candidates', 'mark missing data'],
  },
  daily_action_queue: {
    steps: ['ingest fresh signals', 'rerank opportunities', 'de-duplicate actions', 'generate drafts', 'publish queue preview'],
    fallbackSteps: ['rerun scoring', 'drop expired candidates', 'queue research for weak accounts'],
  },
  draft_generation: {
    steps: ['load candidate context', 'load signals', 'generate draft', 'save draft lineage'],
    fallbackSteps: ['retry generator', 'downgrade to research action', 'record missing context'],
  },
};

export function recalculateBestKnownPaths(runs: ScenarioRun[]) {
  const grouped = runs.reduce<Record<string, ScenarioRun[]>>((acc, run) => {
    acc[run.scenarioId] = acc[run.scenarioId] || [];
    acc[run.scenarioId].push(run);
    return acc;
  }, {});

  return Object.entries(grouped).map(([scenarioId, items]) => buildBestKnownPath(scenarioId, items));
}

export function buildBestKnownPath(scenarioId: string, runs: ScenarioRun[]): BestKnownPath {
  const successful = runs.filter((run) => run.status === 'passed' && Array.isArray(run.bestKnownPath) && run.bestKnownPath.length > 0);
  const template = DEFAULT_PATHS[scenarioId] || {
    steps: successful[0]?.bestKnownPath || ['observe', 'validate', 'repair', 'retest'],
    fallbackSteps: ['retry', 'fallback', 'quarantine'],
  };
  const successRate = runs.length ? Math.round((successful.length / runs.length) * 100) : 0;
  const confidenceScore = runs.length
    ? Math.round(runs.reduce((sum, run) => sum + Number(run.overallConfidence || 0), 0) / runs.length)
    : 0;
  const lastValidatedAt = runs[0]?.completedAt || new Date().toISOString();

  return {
    _type: 'bestKnownPath',
    _id: `bestKnownPath.${scenarioId}`,
    pathId: `bestKnownPath.${scenarioId}`,
    scenarioId,
    steps: successful[0]?.bestKnownPath || template.steps,
    fallbackSteps: template.fallbackSteps,
    successRate,
    confidenceScore,
    lastValidatedAt,
  };
}
