'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ConsoleSnapshot, TerritorySegment } from '@/lib/types';
import { getTerritorySegmentsFromSnapshot, getTerritoryRepsFromSnapshot } from '@/lib/territory-data';

export function TerritoryPortfolioView(props: {
  snapshot: ConsoleSnapshot;
  onOpenAccount: (accountId: string | null) => void;
  onCommand: (command: string) => Promise<void>;
}) {
  const [view, setView] = useState<'segments' | 'reps'>('segments');
  const [selectedSegment, setSelectedSegment] = useState<TerritorySegment | null>(null);

  const segments = useMemo(() => getTerritorySegmentsFromSnapshot(props.snapshot), [props.snapshot]);
  const reps = useMemo(() => getTerritoryRepsFromSnapshot(props.snapshot), [props.snapshot]);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Territory & Portfolio</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView('segments')}
            className={cn(
              'rounded border px-3 py-1.5 text-sm',
              view === 'segments' ? 'border-[var(--accent)] bg-[var(--card)]' : 'border-[var(--border)]'
            )}
          >
            Segments
          </button>
          <button
            type="button"
            onClick={() => setView('reps')}
            className={cn(
              'rounded border px-3 py-1.5 text-sm',
              view === 'reps' ? 'border-[var(--accent)] bg-[var(--card)]' : 'border-[var(--border)]'
            )}
          >
            Reps
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-[1fr_320px] gap-4 min-h-0">
        <div className="flex flex-col overflow-auto">
          {view === 'segments' && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                Segments ({segments.length})
              </div>
              {segments.map((seg) => (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setSelectedSegment(seg)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border p-3 text-left',
                    selectedSegment?.id === seg.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'
                  )}
                >
                  <div>
                    <div className="font-medium text-[var(--foreground)]">{seg.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {seg.accountIds.length} accounts · {(seg.opportunityScore * 100).toFixed(0)}% opp · {seg.source}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--muted)]">{seg.ownerName || 'Unassigned'}</div>
                </button>
              ))}
            </div>
          )}
          {view === 'reps' && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                Reps / owners
              </div>
              {reps.map((rep) => (
                <div
                  key={rep.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"
                >
                  <div>
                    <div className="font-medium text-[var(--foreground)]">{rep.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {rep.segmentIds.length} segments · {rep.accountCount} accounts
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onCommand('assign-territory')}
                    className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                  >
                    Manage
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card flex flex-col gap-3 overflow-auto rounded-lg border border-[var(--border)] p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Segment detail
          </div>
          {selectedSegment ? (
            <>
              <div>
                <div className="font-medium text-[var(--foreground)]">{selectedSegment.name}</div>
                <p className="mt-1 text-sm text-[var(--muted)]">{selectedSegment.description}</p>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Owner: {selectedSegment.ownerName || 'Unassigned'}
                </div>
              </div>
              <div className="text-xs text-[var(--muted)]">
                Accounts ({selectedSegment.accountIds.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedSegment.accountIds.slice(0, 10).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => props.onOpenAccount(id)}
                    className="rounded bg-[var(--panel)] px-2 py-0.5 text-xs hover:underline"
                  >
                    {id.slice(0, 12)}…
                  </button>
                ))}
                {selectedSegment.accountIds.length > 10 && (
                  <span className="text-xs text-[var(--muted)]">+{selectedSegment.accountIds.length - 10} more</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => props.onCommand('generate-target-list')}
                  className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                >
                  Generate target list
                </button>
                <button
                  type="button"
                  onClick={() => props.onCommand('assign-owner')}
                  className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                >
                  Assign owner
                </button>
                <button
                  type="button"
                  onClick={() => props.onCommand('export-segment')}
                  className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                >
                  Export segment
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Select a segment to see accounts and actions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
