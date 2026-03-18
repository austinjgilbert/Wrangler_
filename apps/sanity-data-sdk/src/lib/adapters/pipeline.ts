/**
 * Pipeline adapter — maps backend enrichment status to UI pipeline stages.
 */

import type { PipelineStage, PipelineStageName } from './types';

interface StageConfig {
  name: PipelineStageName;
  label: string;
  weight: number;
}

const PIPELINE_STAGES: StageConfig[] = [
  { name: 'initial_scan', label: 'Scan',         weight: 15 },
  { name: 'discovery',    label: 'Discovery',    weight: 6 },
  { name: 'crawl',        label: 'Crawl',        weight: 6 },
  { name: 'extraction',   label: 'Extraction',   weight: 6 },
  { name: 'linkedin',     label: 'LinkedIn',     weight: 10 },
  { name: 'brief',        label: 'Brief',        weight: 10 },
  { name: 'verification', label: 'Verification', weight: 4 },
];

type BackendStatus = 'queued' | 'running' | 'complete' | 'failed';
type UIStatus = PipelineStage['status'];

const STATUS_MAP: Record<BackendStatus, UIStatus> = {
  queued:   'pending',
  running:  'active',
  complete: 'done',
  failed:   'failed',
};

export function mapBackendStatus(backendStatus: string): UIStatus {
  const mapped = STATUS_MAP[backendStatus as BackendStatus];
  if (!mapped) {
    console.warn(`[adapters/pipeline] Unknown backend status: "${backendStatus}", defaulting to "pending"`);
    return 'pending';
  }
  return mapped;
}

export interface BackendStageData {
  status?: string;
  hasData?: boolean;
}

export function buildPipelineStages(
  stageData: Partial<Record<PipelineStageName, BackendStageData>>,
  currentStageIndex?: number,
): PipelineStage[] {
  return PIPELINE_STAGES.map((config, index) => {
    const data = stageData[config.name];

    let status: UIStatus;
    if (data?.status) {
      status = mapBackendStatus(data.status);
    } else if (currentStageIndex !== undefined) {
      if (index < currentStageIndex) status = 'done';
      else if (index === currentStageIndex) status = 'active';
      else status = 'pending';
    } else {
      status = 'pending';
    }

    return {
      name: config.name,
      label: config.label,
      status,
      hasData: data?.hasData ?? false,
      weight: config.weight,
    };
  });
}

export function calculatePipelineProgress(stages: PipelineStage[]): number {
  const totalWeight = stages.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;

  const completedWeight = stages
    .filter(s => s.status === 'done' && s.hasData)
    .reduce((sum, s) => sum + s.weight, 0);

  return Math.round((completedWeight / totalWeight) * 100);
}

export function getPipelineStageConfigs(): readonly StageConfig[] {
  return PIPELINE_STAGES;
}
