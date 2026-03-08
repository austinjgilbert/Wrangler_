'use client';

import { useMemo, useState } from 'react';
import type { ConsoleSnapshot } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';

type TimelineEvent = {
  id: string;
  type: 'signal' | 'pattern' | 'opportunity' | 'draft';
  label: string;
  detail: string;
  timestamp: string;
  accountId: string | null;
  accountName: string;
  confidence?: number;
  payload?: unknown;
};

function buildTimelineEvents(snapshot: ConsoleSnapshot): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  snapshot.overview.signalTimeline.forEach((s) => {
    events.push({
      id: `sig-${s.id}`,
      type: 'signal',
      label: s.signalType || 'Signal',
      detail: `${s.source} · ${s.accountName}`,
      timestamp: s.timestamp,
      accountId: s.accountId,
      accountName: s.accountName,
      payload: s,
    });
  });

  snapshot.overview.opportunityRadar.forEach((o) => {
    events.push({
      id: `opp-${o.actionCandidateId}`,
      type: 'opportunity',
      label: `Opportunity: ${o.accountName}`,
      detail: `${o.pattern} · ${o.signal} · ${o.confidence}%`,
      timestamp: new Date().toISOString(),
      accountId: o.accountId,
      accountName: o.accountName,
      confidence: o.confidence,
      payload: o,
    });
  });

  snapshot.research.drafts.slice(0, 10).forEach((d) => {
    events.push({
      id: `draft-${d.id}`,
      type: 'draft',
      label: `Draft: ${d.subject}`,
      detail: `Status: ${d.status}`,
      timestamp: d.updatedAt,
      accountId: null,
      accountName: '',
      payload: d,
    });
  });

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, 50);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TimelineExplorerView(props: {
  snapshot: ConsoleSnapshot;
  onOpenAccount: (accountId: string | null) => void;
  onCommand: (command: string) => Promise<void>;
}) {
  const [filterAccount, setFilterAccount] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const events = useMemo(() => {
    const list = buildTimelineEvents(props.snapshot);
    if (filterAccount) return list.filter((e) => e.accountId === filterAccount || e.accountName === filterAccount);
    return list;
  }, [props.snapshot, filterAccount]);

  const typeColor = (t: TimelineEvent['type']) =>
    t === 'signal' ? 'var(--highlight)' : t === 'opportunity' ? 'var(--success)' : t === 'draft' ? 'var(--accent)' : 'var(--warning)';

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Timeline"
        eyebrow="Opportunity Explorer"
        description="Sequence of signals and events leading to opportunities."
      />
      <div className="mt-4 flex gap-4">
        <div className="card flex-1 overflow-hidden rounded-[var(--card-radius)] p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--muted)]">Filters:</span>
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text)]"
            >
              <option value="">All accounts</option>
              {props.snapshot.entities.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setSelectedEvent(ev)}
                className="flex w-full items-start gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-left transition hover:border-[var(--accent)]/40"
              >
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: typeColor(ev.type) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--text)]">{ev.label}</div>
                  <div className="text-xs text-[var(--muted)]">{ev.detail}</div>
                </div>
                <div className="shrink-0 text-xs text-[var(--muted)]">{formatTime(ev.timestamp)}</div>
              </button>
            ))}
          </div>
        </div>
        {selectedEvent && (
          <div className="card w-80 shrink-0 rounded-[var(--card-radius)] p-4">
            <div className="text-sm font-semibold text-[var(--text)]">{selectedEvent.label}</div>
            <div className="mt-2 text-xs text-[var(--muted)]">{selectedEvent.detail}</div>
            <div className="mt-2 text-xs text-[var(--muted)]">Event type: {selectedEvent.type}</div>
            {selectedEvent.confidence != null && (
              <div className="mt-2 text-xs text-[var(--muted)]">Confidence: {selectedEvent.confidence}%</div>
            )}
            {selectedEvent.accountId && (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => props.onOpenAccount(selectedEvent.accountId)}
                  className="pill w-full text-left"
                >
                  Open account
                </button>
                <button
                  type="button"
                  onClick={() => props.onCommand('generate sdr actions')}
                  className="pill w-full text-left"
                >
                  Generate outreach
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
