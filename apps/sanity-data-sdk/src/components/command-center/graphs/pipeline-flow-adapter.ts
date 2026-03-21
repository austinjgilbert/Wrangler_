/**
 * pipeline-flow-adapter.ts — Transform pipeline stages into flow chart data.
 *
 * Data source: PipelineStage[] from adapters/pipeline.ts
 * Maps 1:1 to FlowStage for the stacked bar chart.
 */

import type { PipelineStage } from '../../../lib/adapters/types';

export interface FlowStage {
  name: string;
  label: string;
  weight: number;
  complete: number;   // Count of accounts at this stage with status 'done'
  active: number;     // Count with status 'active'
  failed: number;     // Count with status 'failed'
  pending: number;    // Count with status 'pending'
}

/**
 * Derive flow stages from pipeline stages.
 * In single-account view, each stage has 0 or 1 in each status bucket.
 */
export function derivePipelineFlow(stages: PipelineStage[]): FlowStage[] {
  return stages.map((s) => ({
    name: s.name,
    label: s.label,
    weight: s.weight,
    complete: s.status === 'done' ? 1 : 0,
    active: s.status === 'active' ? 1 : 0,
    failed: s.status === 'failed' ? 1 : 0,
    pending: s.status === 'pending' ? 1 : 0,
  }));
}

/**
 * Pipeline health summary message.
 */
export function pipelineSummary(stages: PipelineStage[]): string {
  const done = stages.filter((s) => s.status === 'done').length;
  const failed = stages.filter((s) => s.status === 'failed').length;
  const active = stages.filter((s) => s.status === 'active').length;
  const total = stages.length;

  if (failed > 0) return `⚠ ${failed} stage${failed > 1 ? 's' : ''} failed — needs attention`;
  if (done === total) return '✅ Pipeline complete — all stages done';
  if (active > 0) return `▶ ${active} stage${active > 1 ? 's' : ''} active, ${done}/${total} complete`;
  return `${done}/${total} stages complete`;
}
