/**
 * PipelineBar — Visual representation of the 7-stage enrichment pipeline.
 *
 * Defensive design rule: "done + hasData" (green solid) is different from
 * "done + !hasData" (amber hollow). A stage can complete without producing data.
 *
 * Two modes:
 *   compact — single-line weighted segment bar (for Glance cards)
 *   full    — dot-connector layout with labels (for Detail view)
 */

import { useMemo } from 'react';
import type { PipelineStage } from '../../lib/adapters';
import { calculatePipelineProgress } from '../../lib/adapters';

// ─── Props ──────────────────────────────────────────────────────────────

export interface PipelineBarProps {
  stages: PipelineStage[];
  compact?: boolean;
}

// ─── Status Styles ──────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  'done-data':    { bg: '#22c55e', border: '#22c55e', text: '#fff' },
  'done-nodata':  { bg: 'transparent', border: '#f59e0b', text: '#f59e0b' },
  'active':       { bg: '#3b82f6', border: '#3b82f6', text: '#fff' },
  'pending':      { bg: '#334155', border: '#475569', text: '#64748b' },
  'failed':       { bg: '#ef4444', border: '#ef4444', text: '#fff' },
};

function getStageStyle(stage: PipelineStage) {
  if (stage.status === 'done' && stage.hasData) return STATUS_STYLES['done-data'];
  if (stage.status === 'done' && !stage.hasData) return STATUS_STYLES['done-nodata'];
  if (stage.status === 'failed') return STATUS_STYLES['failed'];
  if (stage.status === 'active') return STATUS_STYLES['active'];
  return STATUS_STYLES['pending'];
}

function getStageIcon(stage: PipelineStage): string {
  if (stage.status === 'done' && stage.hasData) return '✓';
  if (stage.status === 'done' && !stage.hasData) return '⚠';
  if (stage.status === 'active') return '●';
  if (stage.status === 'failed') return '✗';
  return '○';
}

function getStageTooltip(stage: PipelineStage): string {
  if (stage.status === 'done' && stage.hasData) return `${stage.label}: Complete with data`;
  if (stage.status === 'done' && !stage.hasData) return `${stage.label}: Completed but no data returned`;
  if (stage.status === 'active') return `${stage.label}: Running...`;
  if (stage.status === 'failed') return `${stage.label}: Failed`;
  return `${stage.label}: Pending`;
}

// ─── Component ──────────────────────────────────────────────────────────

export function PipelineBar({ stages, compact = false }: PipelineBarProps) {
  const progress = useMemo(() => calculatePipelineProgress(stages), [stages]);
  const activeStage = stages.find(s => s.status === 'active');
  const failedCount = stages.filter(s => s.status === 'failed').length;
  const doneNoData = stages.filter(s => s.status === 'done' && !s.hasData).length;

  if (compact) {
    return (
      <div className="pipeline-bar pipeline-bar--compact" title={`Pipeline: ${progress}% complete`}>
        <div className="pipeline-bar__segments">
          {stages.map(stage => {
            const style = getStageStyle(stage);
            return (
              <div
                key={stage.name}
                className={`pipeline-bar__segment ${
                  stage.status === 'active' ? 'pipeline-bar__segment--pulse' : ''
                }`}
                style={{
                  flex: stage.weight,
                  backgroundColor: style.bg,
                  borderColor: style.border,
                }}
                title={getStageTooltip(stage)}
              />
            );
          })}
        </div>
        <span className="pipeline-bar__compact-label">{progress}%</span>
      </div>
    );
  }

  return (
    <div className="pipeline-bar pipeline-bar--full">
      <div className="pipeline-bar__summary">
        <span className="pipeline-bar__progress-text">{progress}% complete</span>
        {activeStage && (
          <span className="pipeline-bar__active-label">Running: {activeStage.label}</span>
        )}
        {failedCount > 0 && (
          <span className="pipeline-bar__failed-label">{failedCount} failed</span>
        )}
        {doneNoData > 0 && (
          <span className="pipeline-bar__warning-label">{doneNoData} empty</span>
        )}
      </div>

      <div className="pipeline-bar__stages">
        {stages.map((stage, i) => {
          const style = getStageStyle(stage);
          const icon = getStageIcon(stage);
          return (
            <div
              key={stage.name}
              className={`pipeline-bar__stage ${
                stage.status === 'active' ? 'pipeline-bar__stage--active' : ''
              }`}
              title={getStageTooltip(stage)}
            >
              {i > 0 && (
                <div
                  className="pipeline-bar__connector"
                  style={{
                    backgroundColor:
                      stage.status === 'done' || stage.status === 'active'
                        ? '#334155'
                        : '#1e293b',
                  }}
                />
              )}
              <div
                className={`pipeline-bar__dot ${
                  stage.status === 'active' ? 'pipeline-bar__dot--pulse' : ''
                }`}
                style={{
                  backgroundColor: style.bg,
                  borderColor: style.border,
                  color: style.text,
                }}
              >
                {icon}
              </div>
              <span
                className="pipeline-bar__stage-label"
                style={{ color: style.text === '#fff' ? '#f8fafc' : style.text }}
              >
                {stage.label}
              </span>
              {stage.status === 'done' && !stage.hasData && (
                <span className="pipeline-bar__no-data-badge">no data</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="pipeline-bar__overall">
        <div
          className="pipeline-bar__overall-fill"
          style={{
            width: `${progress}%`,
            backgroundColor: failedCount > 0 ? '#ef4444' : '#22c55e',
          }}
        />
      </div>
    </div>
  );
}
