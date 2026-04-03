'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Users,
  Zap,
  Target,
  FileText,
  ExternalLink,
  ChevronRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { AccountDetail } from '@/lib/types';
import { fetchAccountDetail, runCommand } from '@/lib/api';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function timeSince(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function severityColor(state: string) {
  switch (state) {
    case 'confirmed':
      return 'var(--success)';
    case 'speculative':
      return 'var(--warning)';
    default:
      return 'var(--text-secondary)';
  }
}

/* ─── Account Detail Page ──────────────────────────────────────────────── */

export default function AccountDetailPage() {
  const params = useParams();
  const accountId = params.id as string;

  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAccountDetail(accountId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function handleEnrich() {
    setEnriching(true);
    try {
      await runCommand('enrich_account', { accountId });
      const d = await fetchAccountDetail(accountId);
      setDetail(d);
    } catch {
      // silently fail for now
    } finally {
      setEnriching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertTriangle size={20} className="text-[var(--error)] mx-auto mb-2" />
          <p className="text-sm text-[var(--error)]">{error || 'Account not found'}</p>
          <Link href="/accounts" className="text-[13px] text-[var(--accent)] hover:underline mt-2 block">
            ← Back to accounts
          </Link>
        </div>
      </div>
    );
  }

  const { account, signalsTimeline, people, actions, research } = detail;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Breadcrumb */}
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
      >
        <ArrowLeft size={14} />
        Accounts
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center">
            <Building2 size={22} className="text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text)]">{account.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              {account.domain && (
                <a
                  href={`https://${account.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] text-[var(--accent)] hover:underline flex items-center gap-1"
                >
                  {account.domain}
                  <ExternalLink size={11} />
                </a>
              )}
              <span className="text-[12px] text-[var(--muted)]">
                Completion: {account.completion}%
              </span>
              <span className="text-[12px] text-[var(--muted)]">
                Opp Score: {account.opportunityScore}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleEnrich}
          disabled={enriching}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {enriching ? 'Enriching…' : 'Enrich Account'}
        </button>
      </div>

      {/* Missing Fields */}
      {account.missing.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--warning)]12 border border-[var(--warning)]30">
          <AlertTriangle size={14} className="text-[var(--warning)] shrink-0" />
          <span className="text-[12px] text-[var(--warning)]">
            Missing: {account.missing.join(', ')}
          </span>
        </div>
      )}

      {/* Two Column */}
      <div className="grid grid-cols-5 gap-6">
        {/* Left (3 cols) */}
        <div className="col-span-3 space-y-6">
          {/* Signals Timeline */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-[13px] font-medium text-[var(--text)] flex items-center gap-2">
                <Zap size={14} className="text-[var(--warning)]" />
                Signals
              </h2>
              <span className="text-[11px] text-[var(--muted)]">{signalsTimeline.length} total</span>
            </div>
            {signalsTimeline.length > 0 ? (
              signalsTimeline.slice(0, 10).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--card-hover)] transition-colors"
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background:
                        s.strength > 0.7
                          ? 'var(--success)'
                          : s.strength > 0.4
                          ? 'var(--warning)'
                          : 'var(--muted)',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] text-[var(--text)]">{s.signalType}</span>
                    <span className="text-[11px] text-[var(--muted)] ml-2">{s.source}</span>
                  </div>
                  <span className="text-[11px] text-[var(--muted)] shrink-0">{timeSince(s.timestamp)}</span>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-[13px] text-[var(--muted)]">No signals yet</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-[13px] font-medium text-[var(--text)] flex items-center gap-2">
                <Target size={14} className="text-[var(--success)]" />
                Actions
              </h2>
            </div>
            {actions.length > 0 ? (
              actions.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--card-hover)] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-[var(--text)]">
                        {a.actionType}
                      </span>
                      {a.draftStatus === 'ready' && (
                        <span className="badge-success text-[10px]">Draft ready</span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
                      {a.whyNow}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[11px] font-mono"
                      style={{ color: severityColor(a.uncertaintyState) }}
                    >
                      {Math.round(a.confidence * 100)}%
                    </span>
                    <ChevronRight size={12} className="text-[var(--muted)]" />
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-[13px] text-[var(--muted)]">No actions yet</p>
              </div>
            )}
          </div>

          {/* Research */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-[13px] font-medium text-[var(--text)] flex items-center gap-2">
                <FileText size={14} className="text-[var(--highlight)]" />
                Research & Evidence
              </h2>
            </div>
            {research.evidence.length > 0 || research.briefs.length > 0 ? (
              <>
                {research.briefs.map((b) => (
                  <div
                    key={b.id}
                    className="px-4 py-3 border-b border-[var(--border-subtle)] last:border-0"
                  >
                    <p className="text-[12px] font-medium text-[var(--text)]">{b.title}</p>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5">{b.summary}</p>
                    <p className="text-[10px] text-[var(--muted)] mt-1">
                      {timeSince(b.generatedAt)}
                    </p>
                  </div>
                ))}
                {research.evidence.map((e) => (
                  <div
                    key={e.id}
                    className="px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0"
                  >
                    <p className="text-[12px] text-[var(--text-secondary)]">{e.summary}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[10px]"
                        style={{ color: severityColor(e.uncertaintyState) }}
                      >
                        {e.uncertaintyState}
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">
                        {timeSince(e.observedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-[13px] text-[var(--muted)]">No research yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Right (2 cols) */}
        <div className="col-span-2 space-y-6">
          {/* People */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-[13px] font-medium text-[var(--text)] flex items-center gap-2">
                <Users size={14} className="text-[#7c5cff]" />
                People ({people.length})
              </h2>
            </div>
            {people.length > 0 ? (
              people.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <div className="w-7 h-7 rounded-full bg-[#7c5cff18] flex items-center justify-center text-[11px] font-medium text-[#7c5cff]">
                    {p.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[var(--text)] truncate">{p.name}</p>
                    {p.title && (
                      <p className="text-[11px] text-[var(--muted)] truncate">{p.title}</p>
                    )}
                  </div>
                  {p.seniority && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                      {p.seniority}
                    </span>
                  )}
                  {p.linkedinUrl && (
                    <a
                      href={p.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--muted)] hover:text-[var(--accent)]"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-[13px] text-[var(--muted)]">No people indexed</p>
              </div>
            )}
          </div>

          {/* Technologies */}
          {account.technologies.length > 0 && (
            <div className="card p-4 space-y-3">
              <h2 className="text-[13px] font-medium text-[var(--text)]">Technologies</h2>
              <div className="flex flex-wrap gap-1.5">
                {account.technologies.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] px-2 py-1 rounded-md bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Patterns */}
          {detail.patterns.length > 0 && (
            <div className="card p-4 space-y-3">
              <h2 className="text-[13px] font-medium text-[var(--text)]">Matched Patterns</h2>
              <div className="space-y-1.5">
                {detail.patterns.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-[var(--success)] shrink-0" />
                    <span className="text-[12px] text-[var(--text-secondary)]">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          {detail.controls.length > 0 && (
            <div className="card p-4 space-y-3">
              <h2 className="text-[13px] font-medium text-[var(--text)]">Quick Actions</h2>
              <div className="space-y-1.5">
                {detail.controls.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => runCommand(c.id, { accountId })}
                    className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] hover:text-[var(--text)] transition-colors border border-[var(--border-subtle)]"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
