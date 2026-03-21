/**
 * ModuleShell — Three-state module card (Glance / Detail / Mini).
 *
 * The card IS the button. In Glance state, the hero action button sits at
 * the bottom (margin-top: auto). When a job is running, the button transforms
 * into a progress indicator — the button becomes the status.
 *
 * PERF: detailContent slot must render synchronously (skeleton or cached data,
 * never null). Phase 2: ModuleDetailWrapper enforces skeleton-first pattern.
 */

import type React from 'react';
import type { ActionButton, ModuleActiveJob } from '../../lib/adapters';

// ─── Props ──────────────────────────────────────────────────────────────

export interface ModuleShellProps {
  moduleKey: string;
  icon: string;
  label: string;
  color: string;
  primaryAction: ActionButton;
  progress: number;
  gaps: string[];
  insight: string;
  activeJob: ModuleActiveJob | null;
  state: 'glance' | 'detail' | 'mini';
  onExpand: () => void;
  onCollapse: () => void;
  onAction: (moduleKey: string, actionKey: string) => void;
  detailContent?: React.ReactNode;
  actions?: ActionButton[];
  /** UX-5: Phase 2 stub — muted styling + "Coming soon" badge. */
  isStub?: boolean;
  /** UX-4: Highlighted by briefing bestNextAction. */
  isHighlighted?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────

export function ModuleShell({
  moduleKey,
  icon,
  label,
  color,
  primaryAction,
  progress,
  gaps,
  insight,
  activeJob,
  state,
  onExpand,
  onCollapse,
  onAction,
  detailContent,
  actions,
  isStub,
  isHighlighted,
}: ModuleShellProps) {
  // ── Mini State ────────────────────────────────────────────────────────

  if (state === 'mini') {
    return (
      <div
        className="module-shell module-shell--mini"
        onClick={onExpand}
        style={{ borderColor: color }}
        data-module={moduleKey}
      >
        <span className="module-shell__icon">{icon}</span>
        <span className="module-shell__mini-label">{label}</span>
        {activeJob && (
          <span className="module-shell__mini-progress">
            {activeJob.progress}%
          </span>
        )}
      </div>
    );
  }

  // ── Glance State ──────────────────────────────────────────────────────

  if (state === 'glance') {
    const glanceClasses = [
      'module-shell',
      'module-shell--glance',
      isStub ? 'module-shell--stub' : '',
      isHighlighted ? 'module-shell--highlighted' : '',
    ].filter(Boolean).join(' ');

    return (
      <div
        className={glanceClasses}
        onClick={isStub ? undefined : onExpand}
        style={{ borderTopColor: color }}
        data-module={moduleKey}
      >
        {/* Header */}
        <div className="module-shell__header">
          <span className="module-shell__icon">{icon}</span>
          <span className="module-shell__label">{label}</span>
          {isStub && <span className="module-shell__stub-badge">Coming soon</span>}
        </div>

        {/* Insight */}
        <div className="module-shell__insight">{insight}</div>

        {/* Gaps */}
        {gaps.length > 0 && (
          <div className="module-shell__gaps">
            {gaps.map((gap, i) => (
              <span key={i} className="module-shell__gap">⚠ {gap}</span>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {progress > 0 && (
          <div className="module-shell__progress-bar">
            <div
              className="module-shell__progress-fill"
              style={{ width: `${progress}%`, backgroundColor: color }}
            />
          </div>
        )}

        {/* Hero action button — pushed to bottom with margin-top: auto */}
        <div className="module-shell__action-area" style={{ marginTop: 'auto' }}>
          {activeJob ? (
            <button
              className="module-shell__action-btn module-shell__action-btn--running"
              disabled
              style={{ borderColor: color }}
            >
              <span className="module-shell__job-label">{activeJob.stageLabel}</span>
              <div className="module-shell__job-progress">
                <div
                  className="module-shell__job-progress-fill"
                  style={{ width: `${activeJob.progress}%`, backgroundColor: color }}
                />
              </div>
            </button>
          ) : (
            <button
              className="module-shell__action-btn"
              style={{ backgroundColor: color }}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onAction(moduleKey, primaryAction.key);
              }}
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Detail State ──────────────────────────────────────────────────────

  return (
    <div
      className="module-shell module-shell--detail"
      style={{ borderTopColor: color }}
      data-module={moduleKey}
    >
      {/* Header with collapse button */}
      <div className="module-shell__header">
        <span className="module-shell__icon">{icon}</span>
        <span className="module-shell__label">{label}</span>
        <button className="module-shell__collapse-btn" onClick={onCollapse}>
          ✕
        </button>
      </div>

      {/* Insight */}
      <div className="module-shell__insight">{insight}</div>

      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="module-shell__gaps">
          {gaps.map((gap, i) => (
            <span key={i} className="module-shell__gap">⚠ {gap}</span>
          ))}
        </div>
      )}

      {/* Detail content slot */}
      {detailContent && (
        <div className="module-shell__detail-content">
          {detailContent}
        </div>
      )}

      {/* Action buttons */}
      <div className="module-shell__actions">
        {activeJob ? (
          <button
            className="module-shell__action-btn module-shell__action-btn--running"
            disabled
            style={{ borderColor: color }}
          >
            <span className="module-shell__job-label">{activeJob.stageLabel}</span>
            <div className="module-shell__job-progress">
              <div
                className="module-shell__job-progress-fill"
                style={{ width: `${activeJob.progress}%`, backgroundColor: color }}
              />
            </div>
          </button>
        ) : (
          actions?.map((action: ActionButton) => (
            <button
              key={action.key}
              className={`module-shell__action-btn module-shell__action-btn--${action.variant}`}
              style={action.variant === 'primary' ? { backgroundColor: color } : {}}
              disabled={action.disabled}
              onClick={() => onAction(moduleKey, action.key)}
            >
              {action.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
