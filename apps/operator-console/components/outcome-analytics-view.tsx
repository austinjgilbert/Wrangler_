'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ConsoleSnapshot, OutcomeRecord } from '@/lib/types';
import { getOutcomeRecordsFromSnapshot, getOutcomeFunnelFromSnapshot } from '@/lib/outcome-data';

export function OutcomeAnalyticsView(props: {
  snapshot: ConsoleSnapshot;
  onOpenAccount: (accountId: string | null) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'signal' | 'reply' | 'meeting' | 'pipeline'>('all');

  const records = useMemo(() => getOutcomeRecordsFromSnapshot(props.snapshot), [props.snapshot]);
  const funnel = useMemo(() => getOutcomeFunnelFromSnapshot(props.snapshot), [props.snapshot]);

  const filtered = useMemo(() => {
    if (filter === 'all') return records;
    return records.filter((r) => r.outcomeType === filter);
  }, [records, filter]);

  const formatTime = (at: string) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Outcome analytics</h1>
        <div className="flex gap-2">
          {(['all', 'signal', 'reply', 'meeting', 'pipeline'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'rounded border px-3 py-1.5 text-sm capitalize',
                filter === f ? 'border-[var(--accent)] bg-[var(--card)]' : 'border-[var(--border)]'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="card rounded-lg border border-[var(--border)] p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Signals</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{funnel.signals}</div>
          <div className="text-xs text-[var(--muted)]">{funnel.period}</div>
        </div>
        <div className="card rounded-lg border border-[var(--border)] p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Replies</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{funnel.replies}</div>
          <div className="text-xs text-[var(--muted)]">
            {(funnel.conversionSignalToReply * 100).toFixed(1)}% from signals
          </div>
        </div>
        <div className="card rounded-lg border border-[var(--border)] p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Meetings</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{funnel.meetings}</div>
          <div className="text-xs text-[var(--muted)]">
            {(funnel.conversionReplyToMeeting * 100).toFixed(1)}% from replies
          </div>
        </div>
        <div className="card rounded-lg border border-[var(--border)] p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Pipeline value</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
            ${funnel.pipelineValue.toLocaleString()}
          </div>
          <div className="text-xs text-[var(--muted)]">from meetings</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)] mb-2">
          Funnel: Signal → Reply → Meeting → Pipeline
        </div>
        <div className="mb-4 flex gap-2">
          <div className="flex-1 rounded-lg border border-[var(--border)] p-3 text-center">
            <div className="text-lg font-semibold">{funnel.signals}</div>
            <div className="text-xs text-[var(--muted)]">Signals</div>
          </div>
          <div className="self-center text-[var(--muted)]">→</div>
          <div className="flex-1 rounded-lg border border-[var(--border)] p-3 text-center">
            <div className="text-lg font-semibold">{funnel.replies}</div>
            <div className="text-xs text-[var(--muted)]">Replies</div>
          </div>
          <div className="self-center text-[var(--muted)]">→</div>
          <div className="flex-1 rounded-lg border border-[var(--border)] p-3 text-center">
            <div className="text-lg font-semibold">{funnel.meetings}</div>
            <div className="text-xs text-[var(--muted)]">Meetings</div>
          </div>
          <div className="self-center text-[var(--muted)]">→</div>
          <div className="flex-1 rounded-lg border border-[var(--border)] p-3 text-center">
            <div className="text-lg font-semibold">${(funnel.pipelineValue / 1000).toFixed(1)}k</div>
            <div className="text-xs text-[var(--muted)]">Pipeline</div>
          </div>
        </div>

        <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)] mb-2">
          Recent outcomes ({filtered.length})
        </div>
        <ul className="space-y-2">
          {filtered.slice(0, 30).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => props.onOpenAccount(r.accountId)}
                className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:border-[var(--muted)]"
              >
                <span className="font-medium text-[var(--foreground)]">{r.accountName}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded bg-[var(--panel)] px-2 py-0.5 text-xs capitalize">{r.outcomeType}</span>
                  {r.value != null && <span className="text-xs text-[var(--muted)]">${r.value.toLocaleString()}</span>}
                  <span className="text-xs text-[var(--muted)]">{formatTime(r.at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
