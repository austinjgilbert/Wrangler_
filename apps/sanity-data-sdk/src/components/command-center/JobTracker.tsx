/**
 * JobTracker — Bottom bar showing active enrichment jobs.
 *
 * Closes the loop: click action → see job appear → watch progress → completion.
 * Collapsed (1-line summary) and expanded (full list) modes.
 * Auto-shows "All clear" for 3s when jobs finish, then hides.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job } from '../../lib/adapters';

// ─── Props ──────────────────────────────────────────────────────────────

export interface JobTrackerProps {
  jobs: Job[];
  polling: boolean;
  error: string | null;
  lastPollAt: number | null;
  onRefresh: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────

export function JobTracker({ jobs, polling, error, lastPollAt, onRefresh }: JobTrackerProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAllClear, setShowAllClear] = useState(false);
  const [prevActiveCount, setPrevActiveCount] = useState(0);

  const activeJobs = useMemo(
    () => jobs.filter(j => j.status === 'running' || j.status === 'queued'),
    [jobs],
  );
  const completedJobs = useMemo(
    () => jobs.filter(j => j.status === 'complete'),
    [jobs],
  );
  const failedJobs = useMemo(
    () => jobs.filter(j => j.status === 'failed'),
    [jobs],
  );

  // Show "All clear" briefly when jobs finish
  useEffect(() => {
    if (prevActiveCount > 0 && activeJobs.length === 0) {
      setShowAllClear(true);
      const timer = setTimeout(() => setShowAllClear(false), 3000);
      return () => clearTimeout(timer);
    }
    setPrevActiveCount(activeJobs.length);
  }, [activeJobs.length, prevActiveCount]);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // Don't render if no jobs and no "all clear" message
  if (jobs.length === 0 && !showAllClear) {
    return null;
  }

  // ── Collapsed ───────────────────────────────────────────────────────

  if (!expanded) {
    return (
      <div className="job-tracker job-tracker--collapsed" onClick={toggleExpanded}>
        <div className="job-tracker__summary">
          {activeJobs.length > 0 ? (
            <>
              <span className="job-tracker__pulse" />
              <span className="job-tracker__count">
                {activeJobs.length} job{activeJobs.length !== 1 ? 's' : ''} running
              </span>
              {activeJobs.length === 1 && (
                <span className="job-tracker__stage">
                  — {activeJobs[0].stageLabel} ({activeJobs[0].progress}%)
                </span>
              )}
            </>
          ) : showAllClear ? (
            <span className="job-tracker__all-clear">✅ All jobs complete</span>
          ) : (
            <>
              {completedJobs.length > 0 && (
                <span className="job-tracker__completed">✓ {completedJobs.length} completed</span>
              )}
              {failedJobs.length > 0 && (
                <span className="job-tracker__failed">✗ {failedJobs.length} failed</span>
              )}
            </>
          )}
        </div>
        <div className="job-tracker__actions">
          {polling && <span className="job-tracker__polling-dot" title="Polling..." />}
          {error && <span className="job-tracker__error-icon" title={error}>⚠</span>}
          <button
            className="job-tracker__expand-btn"
            onClick={(e) => { e.stopPropagation(); toggleExpanded(); }}
          >
            ▲
          </button>
        </div>
      </div>
    );
  }

  // ── Expanded ────────────────────────────────────────────────────────

  return (
    <div className="job-tracker job-tracker--expanded">
      <div className="job-tracker__header" onClick={toggleExpanded}>
        <span className="job-tracker__title">
          {activeJobs.length > 0
            ? `${activeJobs.length} Active Job${activeJobs.length !== 1 ? 's' : ''}`
            : 'Job History'}
        </span>
        <div className="job-tracker__header-actions">
          <button
            className="job-tracker__refresh-btn"
            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            disabled={polling}
            title="Refresh now"
          >
            ↻
          </button>
          <button className="job-tracker__collapse-btn" onClick={toggleExpanded}>▼</button>
        </div>
      </div>

      {error && (
        <div className="job-tracker__error-banner">
          ⚠ {error}
          <button onClick={onRefresh} className="job-tracker__retry-btn">Retry</button>
        </div>
      )}

      <div className="job-tracker__list">
        {activeJobs.map(job => (
          <div key={job.id} className="job-tracker__job job-tracker__job--active">
            <div className="job-tracker__job-header">
              <span className="job-tracker__job-label">{job.label}</span>
              <span className="job-tracker__job-status">
                {job.status === 'queued' ? 'Queued' : `${job.progress}%`}
              </span>
            </div>
            <div className="job-tracker__job-stage">{job.stageLabel}</div>
            <div className="job-tracker__job-bar">
              <div className="job-tracker__job-fill" style={{ width: `${job.progress}%` }} />
            </div>
          </div>
        ))}

        {completedJobs.map(job => (
          <div key={job.id} className="job-tracker__job job-tracker__job--complete">
            <div className="job-tracker__job-header">
              <span className="job-tracker__job-label">{job.label}</span>
              <span className="job-tracker__job-done">✓ Done</span>
            </div>
          </div>
        ))}

        {failedJobs.map(job => (
          <div key={job.id} className="job-tracker__job job-tracker__job--failed">
            <div className="job-tracker__job-header">
              <span className="job-tracker__job-label">{job.label}</span>
              <span className="job-tracker__job-error">✗ Failed</span>
            </div>
            <div className="job-tracker__job-stage">{job.stageLabel}</div>
          </div>
        ))}

        {jobs.length === 0 && (
          <div className="job-tracker__empty">No recent jobs</div>
        )}
      </div>

      {lastPollAt && (
        <div className="job-tracker__footer">
          Last updated: {new Date(lastPollAt).toLocaleTimeString()}
          {polling && ' · Polling...'}
        </div>
      )}
    </div>
  );
}
