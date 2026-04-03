'use client';

import { useSnapshot } from '../layout';
import {
  Building2,
  Users,
  Zap,
  Target,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

/* ─── Stat Card ──────────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  href?: string;
  accent?: string;
}) {
  const inner = (
    <div className="card p-4 flex items-start gap-3 group cursor-pointer">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: accent ? `${accent}18` : 'var(--accent-muted)' }}
      >
        <Icon size={18} style={{ color: accent || 'var(--accent)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
          {label}
        </p>
        <p className="text-xl font-semibold text-[var(--text)] mt-0.5 tabular-nums">
          {value}
        </p>
        {trend && (
          <p className="text-[11px] text-[var(--success)] mt-1 flex items-center gap-1">
            <TrendingUp size={11} /> {trend}
          </p>
        )}
      </div>
      {href && (
        <ArrowRight
          size={14}
          className="text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity mt-1"
        />
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

/* ─── Action Row ─────────────────────────────────────────────────────────── */

function ActionRow({
  action,
}: {
  action: {
    rank: number;
    account: string;
    person: string | null;
    action: string;
    whyNow: string;
    confidence: number;
    draftReady: boolean;
  };
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--card-hover)] transition-colors">
      <span className="text-[11px] font-mono text-[var(--muted)] w-5 text-center">
        {action.rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--text)] truncate">
            {action.account}
          </span>
          {action.person && (
            <span className="text-[11px] text-[var(--muted)] truncate">
              → {action.person}
            </span>
          )}
        </div>
        <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 truncate">
          {action.whyNow}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {action.draftReady && (
          <span className="badge-success text-[10px]">Draft ready</span>
        )}
        <div className="w-16">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[var(--muted)]">conf</span>
            <span className="text-[10px] font-mono text-[var(--text-secondary)]">
              {Math.round(action.confidence * 100)}%
            </span>
          </div>
          <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${action.confidence * 100}%`,
                background:
                  action.confidence > 0.7
                    ? 'var(--success)'
                    : action.confidence > 0.4
                    ? 'var(--warning)'
                    : 'var(--error)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Signal Pill ────────────────────────────────────────────────────────── */

function SignalRow({
  signal,
}: {
  signal: {
    id: string;
    signalType: string;
    accountName: string;
    source: string;
    strength: number;
    timestamp: string;
  };
}) {
  const age = timeSince(signal.timestamp);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--card-hover)] transition-colors">
      <Zap size={12} className="text-[var(--warning)] shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[12px] text-[var(--text)]">{signal.accountName}</span>
        <span className="text-[11px] text-[var(--muted)] ml-2">{signal.signalType}</span>
      </div>
      <span className="text-[11px] text-[var(--muted)] shrink-0">{signal.source}</span>
      <span className="text-[11px] text-[var(--muted)] shrink-0 w-12 text-right">{age}</span>
    </div>
  );
}

function timeSince(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/* ─── Completion Row ─────────────────────────────────────────────────────── */

function CompletionRow({
  row,
}: {
  row: { accountId: string; accountName: string; completion: number; missing: string[] };
}) {
  return (
    <Link
      href={`/accounts/${row.accountId}`}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--card-hover)] transition-colors"
    >
      <div className="flex-1 min-w-0">
        <span className="text-[12px] text-[var(--text)] truncate">{row.accountName}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-20 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${row.completion}%`,
              background:
                row.completion > 80
                  ? 'var(--success)'
                  : row.completion > 50
                  ? 'var(--warning)'
                  : 'var(--error)',
            }}
          />
        </div>
        <span className="text-[11px] font-mono text-[var(--muted)] w-8 text-right">
          {row.completion}%
        </span>
      </div>
    </Link>
  );
}

/* ─── Overview Page ──────────────────────────────────────────────────────── */

export default function OverviewPage() {
  const { snapshot } = useSnapshot();
  if (!snapshot) return null;

  const status = snapshot.overview.intelligenceStatus;
  const topActions = snapshot.overview.topActionsToday?.actions?.slice(0, 8) ?? [];
  const recentSignals = snapshot.signals?.recent?.slice(0, 6) ?? [];
  const completionRows = snapshot.overview.completionRows?.slice(0, 6) ?? [];
  const jobs = snapshot.jobs;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Page Header */}
      <div>
        <h1 className="text-lg font-semibold text-[var(--text)]">Overview</h1>
        <p className="text-[13px] text-[var(--muted)] mt-1">
          Intelligence status and top priorities
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Accounts"
          value={status.accountsIndexed}
          icon={Building2}
          href="/accounts"
        />
        <StatCard
          label="People"
          value={status.peopleIndexed}
          icon={Users}
          accent="#7c5cff"
        />
        <StatCard
          label="Signals Today"
          value={status.signalsToday}
          icon={Zap}
          accent="#f59e0b"
          href="/signals"
        />
        <StatCard
          label="Opportunities"
          value={status.activeOpportunities}
          icon={Target}
          accent="#22c55e"
          href="/pipeline"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-5 gap-6">
        {/* Left: Actions (3 cols) */}
        <div className="col-span-3 space-y-6">
          {/* Top Actions */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-[13px] font-medium text-[var(--text)]">
                Top Actions
              </h2>
              <Link
                href="/pipeline"
                className="text-[11px] text-[var(--accent)] hover:underline"
              >
                View all →
              </Link>
            </div>
            {topActions.length > 0 ? (
              topActions.map((a) => <ActionRow key={a.actionCandidateId} action={a} />)
            ) : (
              <div className="px-4 py-8 text-center">
                <CheckCircle2 size={20} className="text-[var(--success)] mx-auto mb-2" />
                <p className="text-[13px] text-[var(--muted)]">No pending actions</p>
              </div>
            )}
          </div>

          {/* Recent Signals */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-[13px] font-medium text-[var(--text)]">Recent Signals</h2>
              <Link
                href="/signals"
                className="text-[11px] text-[var(--accent)] hover:underline"
              >
                View all →
              </Link>
            </div>
            {recentSignals.length > 0 ? (
              recentSignals.map((s) => <SignalRow key={s.id} signal={s} />)
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-[13px] text-[var(--muted)]">No recent signals</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Status (2 cols) */}
        <div className="col-span-2 space-y-6">
          {/* System Health */}
          <div className="card p-4 space-y-3">
            <h2 className="text-[13px] font-medium text-[var(--text)]">System Health</h2>
            <div className="space-y-2">
              <HealthRow
                label="Completion"
                value={`${status.systemCompletion}%`}
                severity={status.systemCompletion > 70 ? 'good' : status.systemCompletion > 40 ? 'warn' : 'bad'}
              />
              <HealthRow
                label="Drift Risk"
                value={status.driftRisk}
                severity={status.driftRisk === 'low' ? 'good' : status.driftRisk === 'medium' ? 'warn' : 'bad'}
              />
              <HealthRow
                label="Jobs Running"
                value={String(jobs.running)}
                severity="neutral"
              />
              <HealthRow
                label="Jobs Queued"
                value={String(jobs.queued)}
                severity="neutral"
              />
            </div>
          </div>

          {/* Account Completeness */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-[13px] font-medium text-[var(--text)]">
                Account Completeness
              </h2>
            </div>
            {completionRows.length > 0 ? (
              completionRows.map((r) => <CompletionRow key={r.accountId} row={r} />)
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-[13px] text-[var(--muted)]">No accounts yet</p>
              </div>
            )}
          </div>

          {/* Recent Jobs */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-[13px] font-medium text-[var(--text)]">Recent Jobs</h2>
              <Link
                href="/system"
                className="text-[11px] text-[var(--accent)] hover:underline"
              >
                System →
              </Link>
            </div>
            {(jobs.recent?.slice(0, 5) ?? []).map((j) => (
              <div
                key={j.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0"
              >
                {j.status === 'running' ? (
                  <Clock size={12} className="text-[var(--highlight)] animate-pulse shrink-0" />
                ) : j.status === 'done' ? (
                  <CheckCircle2 size={12} className="text-[var(--success)] shrink-0" />
                ) : j.error ? (
                  <AlertTriangle size={12} className="text-[var(--error)] shrink-0" />
                ) : (
                  <Clock size={12} className="text-[var(--muted)] shrink-0" />
                )}
                <span className="text-[12px] text-[var(--text)] flex-1 truncate">
                  {j.jobType}
                </span>
                <span className="text-[11px] text-[var(--muted)]">{j.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Health Row ─────────────────────────────────────────────────────────── */

function HealthRow({
  label,
  value,
  severity,
}: {
  label: string;
  value: string;
  severity: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const color =
    severity === 'good'
      ? 'var(--success)'
      : severity === 'warn'
      ? 'var(--warning)'
      : severity === 'bad'
      ? 'var(--error)'
      : 'var(--text-secondary)';

  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[var(--muted)]">{label}</span>
      <span className="text-[12px] font-medium" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
