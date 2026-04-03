'use client';

import { useState } from 'react';
import { useSnapshot } from '../layout';
import {
  FlaskConical,
  Activity,
  Cpu,
  Shield,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  ChevronRight,
  BarChart3,
  Loader2,
  XCircle,
  Settings,
} from 'lucide-react';
import { runCommand, runDiagnostic, runSimulation } from '@/lib/api';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function timeSince(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function severityBadge(severity: string) {
  switch (severity) {
    case 'critical':
      return 'bg-[var(--error)]18 text-[var(--error)]';
    case 'warning':
      return 'bg-[var(--warning)]18 text-[var(--warning)]';
    case 'info':
      return 'bg-[var(--highlight)]18 text-[var(--highlight)]';
    default:
      return 'bg-[var(--card)] text-[var(--muted)]';
  }
}

/* ─── System Page ──────────────────────────────────────────────────────── */

export default function SystemPage() {
  const { snapshot, refresh } = useSnapshot();
  const [tab, setTab] = useState<'overview' | 'patterns' | 'autopilot' | 'diagnostics'>('overview');
  const [runningDiag, setRunningDiag] = useState<string | null>(null);

  if (!snapshot) return null;

  const lab = snapshot.systemLab;
  const engine = lab.engineStatus;
  const jobs = snapshot.jobs;

  async function handleDiagnostic(id: string) {
    setRunningDiag(id);
    try {
      await runDiagnostic(id);
      refresh();
    } catch {
      // silent
    } finally {
      setRunningDiag(null);
    }
  }

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: Activity },
    { id: 'patterns' as const, label: 'Patterns', icon: BarChart3 },
    { id: 'autopilot' as const, label: 'Autopilot', icon: Cpu },
    { id: 'diagnostics' as const, label: 'Diagnostics', icon: Shield },
  ];

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-[var(--text)]">System</h1>
        <p className="text-[13px] text-[var(--muted)] mt-1">
          Engine status, pattern engine, autopilot, and diagnostics
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'text-[var(--accent)] border-[var(--accent)]'
                  : 'text-[var(--muted)] border-transparent hover:text-[var(--text)]'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Engine Status */}
          <div className="col-span-2 card p-4 space-y-4">
            <h2 className="text-[13px] font-medium text-[var(--text)]">Engine Status</h2>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Signals Today', value: engine.signalsProcessedToday },
                { label: 'Opportunities', value: engine.activeOpportunities },
                { label: 'Patterns Active', value: engine.patternsActive },
                { label: 'Drafts Generated', value: engine.draftsGenerated },
                { label: 'Jobs Running', value: engine.jobsRunning },
                { label: 'Jobs Queued', value: engine.jobsQueued },
                { label: 'Completion', value: `${engine.systemCompletion}%` },
                { label: 'Drift Risk', value: engine.driftRisk },
              ].map((s) => (
                <div key={s.label} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{s.label}</p>
                  <p className="text-[16px] font-semibold text-[var(--text)] tabular-nums">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Health Indicators */}
          <div className="card p-4 space-y-3">
            <h2 className="text-[13px] font-medium text-[var(--text)]">Health Indicators</h2>
            <div className="space-y-2">
              {Object.entries(engine.healthIndicators).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[12px] text-[var(--muted)]">{key}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(val * 100, 100)}%`,
                          background: val > 0.7 ? 'var(--success)' : val > 0.4 ? 'var(--warning)' : 'var(--error)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-secondary)] w-8 text-right">
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          <div className="col-span-2 card p-4 space-y-3">
            <h2 className="text-[13px] font-medium text-[var(--text)]">Capabilities</h2>
            <div className="grid grid-cols-3 gap-2">
              {lab.capabilities.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)]"
                >
                  {c.enabled ? (
                    <CheckCircle2 size={12} className="text-[var(--success)]" />
                  ) : (
                    <XCircle size={12} className="text-[var(--muted)]" />
                  )}
                  <span className={`text-[12px] ${c.enabled ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
                    {c.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Batch Operations */}
          <div className="card p-4 space-y-3">
            <h2 className="text-[13px] font-medium text-[var(--text)]">Batch Operations</h2>
            <div className="space-y-2">
              {lab.batchOperations.map((op) => (
                <button
                  key={op.id}
                  onClick={() => runCommand(op.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--card-hover)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-[var(--text)]">{op.label}</span>
                    <Play size={12} className="text-[var(--accent)]" />
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-[var(--muted)]">
                      ~{op.estimatedAccountsAffected} accounts
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">{op.estimatedRuntime}</span>
                    <span
                      className={`text-[10px] ${
                        op.riskLevel === 'low'
                          ? 'text-[var(--success)]'
                          : op.riskLevel === 'medium'
                          ? 'text-[var(--warning)]'
                          : 'text-[var(--error)]'
                      }`}
                    >
                      {op.riskLevel} risk
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Recent Jobs (full width) */}
          <div className="col-span-3 card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-[13px] font-medium text-[var(--text)]">Recent Jobs</h2>
              <span className="text-[11px] text-[var(--muted)]">
                {jobs.running} running · {jobs.queued} queued
              </span>
            </div>
            {(jobs.recent ?? []).map((j) => (
              <div
                key={j.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0"
              >
                {j.status === 'running' ? (
                  <Loader2 size={12} className="text-[var(--highlight)] animate-spin shrink-0" />
                ) : j.status === 'done' ? (
                  <CheckCircle2 size={12} className="text-[var(--success)] shrink-0" />
                ) : j.error ? (
                  <AlertTriangle size={12} className="text-[var(--error)] shrink-0" />
                ) : (
                  <Clock size={12} className="text-[var(--muted)] shrink-0" />
                )}
                <span className="text-[12px] text-[var(--text)] flex-1 truncate">{j.jobType}</span>
                {j.error && (
                  <span className="text-[10px] text-[var(--error)] truncate max-w-[200px]">
                    {j.error}
                  </span>
                )}
                <span className="text-[11px] text-[var(--muted)] shrink-0">{j.status}</span>
                <span className="text-[11px] text-[var(--muted)] shrink-0">
                  {timeSince(j.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'patterns' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--panel)] grid grid-cols-12 gap-4">
              <span className="col-span-3 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Pattern</span>
              <span className="col-span-2 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Matches</span>
              <span className="col-span-2 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Success Rate</span>
              <span className="col-span-2 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Confidence</span>
              <span className="col-span-3 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">State</span>
            </div>
            {lab.patternEngine.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-12 gap-4 items-center px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="col-span-3">
                  <span className="text-[12px] text-[var(--text)]">{p.name}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[12px] font-mono text-[var(--text-secondary)]">{p.matches}</span>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="w-12 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${p.successRate * 100}%`,
                        background: p.successRate > 0.7 ? 'var(--success)' : p.successRate > 0.4 ? 'var(--warning)' : 'var(--error)',
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-[var(--muted)]">
                    {Math.round(p.successRate * 100)}%
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[12px] font-mono text-[var(--text-secondary)]">
                    {Math.round(p.confidence * 100)}%
                  </span>
                </div>
                <div className="col-span-3">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      p.lifecycleState === 'validated'
                        ? 'bg-[var(--success)]18 text-[var(--success)]'
                        : p.lifecycleState === 'emerging'
                        ? 'bg-[var(--highlight)]18 text-[var(--highlight)]'
                        : 'bg-[var(--card)] text-[var(--muted)]'
                    }`}
                  >
                    {p.lifecycleState}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'autopilot' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Runtime Health */}
          <div className="col-span-2 card p-4 space-y-4">
            <h2 className="text-[13px] font-medium text-[var(--text)]">Runtime Health</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Healthy Flows', value: lab.autopilot.runtimeHealth.flowsHealthy, color: 'var(--success)' },
                { label: 'Degraded', value: lab.autopilot.runtimeHealth.flowsDegraded, color: 'var(--warning)' },
                { label: 'Quarantined', value: lab.autopilot.runtimeHealth.flowsQuarantined, color: 'var(--error)' },
                { label: 'Failed Jobs', value: lab.autopilot.runtimeHealth.failedJobs, color: 'var(--error)' },
                { label: 'Open Incidents', value: lab.autopilot.runtimeHealth.openIncidents, color: 'var(--warning)' },
                { label: 'Draft Risk', value: `${Math.round(lab.autopilot.runtimeHealth.draftRisk * 100)}%`, color: 'var(--text-secondary)' },
              ].map((s) => (
                <div key={s.label} className="space-y-1">
                  <p className="text-[10px] text-[var(--muted)]">{s.label}</p>
                  <p className="text-[16px] font-semibold tabular-nums" style={{ color: s.color }}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
            {lab.autopilot.runtimeHealth.weakestAreas.length > 0 && (
              <div>
                <p className="text-[10px] text-[var(--muted)] mb-1">Weakest areas</p>
                <div className="flex flex-wrap gap-1">
                  {lab.autopilot.runtimeHealth.weakestAreas.map((a, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--error)]12 text-[var(--error)]">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Repair Activity */}
          <div className="card p-4 space-y-3">
            <h2 className="text-[13px] font-medium text-[var(--text)]">Repair Activity</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-[var(--muted)]">Attempted</p>
                <p className="text-[14px] font-semibold text-[var(--text)]">{lab.autopilot.repairActivity.attempted}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--muted)]">Succeeded</p>
                <p className="text-[14px] font-semibold text-[var(--success)]">{lab.autopilot.repairActivity.succeeded}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--muted)]">Failed</p>
                <p className="text-[14px] font-semibold text-[var(--error)]">{lab.autopilot.repairActivity.failed}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--muted)]">Needs Approval</p>
                <p className="text-[14px] font-semibold text-[var(--warning)]">{lab.autopilot.repairActivity.approvalsNeeded}</p>
              </div>
            </div>
          </div>

          {/* Quarantined Flows */}
          {lab.autopilot.quarantinedFlows.length > 0 && (
            <div className="col-span-3 card overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                <h2 className="text-[13px] font-medium text-[var(--text)]">Quarantined Flows</h2>
              </div>
              {lab.autopilot.quarantinedFlows.map((f) => (
                <div
                  key={f.incidentId}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <AlertTriangle size={12} className="text-[var(--error)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] text-[var(--text)]">{f.summary}</span>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${severityBadge(f.severity)}`}>
                    {f.severity}
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">{f.category}</span>
                </div>
              ))}
            </div>
          )}

          {/* Learning */}
          <div className="col-span-3 card p-4 space-y-3">
            <h2 className="text-[13px] font-medium text-[var(--text)]">Learning Mode</h2>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${lab.learningMode.enabled ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'}`} />
                <span className="text-[12px] text-[var(--text)]">
                  {lab.learningMode.enabled ? 'Active' : 'Inactive'}
                </span>
              </div>
              <span className="text-[12px] text-[var(--muted)]">
                {lab.learningMode.operatorFeedbackCaptured} feedback captured
              </span>
              <span className="text-[12px] text-[var(--muted)]">
                {lab.learningMode.patternsStrengthened} patterns strengthened
              </span>
              <span className="text-[12px] text-[var(--muted)]">
                {lab.learningMode.patternsWeakened} weakened
              </span>
              <span className="text-[12px] text-[var(--muted)]">
                {lab.learningMode.signalWeightsUpdated} signal weights updated
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'diagnostics' && (
        <div className="space-y-6">
          {/* Drift Monitoring */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-[13px] font-medium text-[var(--text)]">Drift Monitoring</h2>
            </div>
            {lab.driftMonitoring.length > 0 ? (
              lab.driftMonitoring.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${severityBadge(d.severity)}`}>
                    {d.severity}
                  </span>
                  <span className="text-[12px] text-[var(--text)] flex-1">{d.label}</span>
                  <span className="text-[12px] font-mono text-[var(--text-secondary)]">{d.value}</span>
                  <span className="text-[11px] text-[var(--muted)]">{d.metricType}</span>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-[13px] text-[var(--muted)]">No drift metrics</p>
              </div>
            )}
          </div>

          {/* Diagnostics */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-[13px] font-medium text-[var(--text)]">Available Diagnostics</h2>
            </div>
            {lab.diagnostics.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)] last:border-0"
              >
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${severityBadge(d.severity)}`}>
                  {d.severity}
                </span>
                <span className="text-[12px] text-[var(--text)] flex-1">{d.label}</span>
                <button
                  onClick={() => handleDiagnostic(d.id)}
                  disabled={runningDiag === d.id}
                  className="px-3 py-1 rounded-lg text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--highlight)] transition-colors disabled:opacity-50"
                >
                  {runningDiag === d.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    'Run'
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Scenario Simulator */}
          <div className="card p-4 space-y-3">
            <h2 className="text-[13px] font-medium text-[var(--text)]">Scenario Simulator</h2>
            <div className="flex items-center gap-4 mb-2">
              <span className="text-[12px] text-[var(--muted)]">
                Suite: {lab.scenarioSimulator.suiteSummary.total} tests
              </span>
              <span className={`text-[12px] ${lab.scenarioSimulator.suiteSummary.passed ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                {lab.scenarioSimulator.suiteSummary.passed ? 'Passing' : `${lab.scenarioSimulator.suiteSummary.failed} failed`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {lab.scenarioSimulator.fixtures.map((f) => (
                <button
                  key={f.id}
                  onClick={() => runSimulation({ fixtureId: f.id })}
                  className="text-left px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--card-hover)] transition-colors"
                >
                  <p className="text-[12px] font-medium text-[var(--text)]">{f.name}</p>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5 truncate">{f.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
