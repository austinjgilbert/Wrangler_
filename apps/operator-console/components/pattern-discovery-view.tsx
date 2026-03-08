'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ConsoleSnapshot, DiscoveredPattern } from '@/lib/types';
import {
  getDiscoveredPatternsFromSnapshot,
  getPatternInsightsFromSnapshot,
} from '@/lib/pattern-discovery-data';
import type { PatternInsight } from '@/lib/types';

export function PatternDiscoveryView(props: {
  snapshot: ConsoleSnapshot;
  onOpenAccount: (accountId: string | null) => void;
  onCommand: (command: string) => Promise<void>;
  onStrategySimulate?: (patternId: string, patternName: string) => void;
}) {
  const [timeframe, setTimeframe] = useState('30d');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPattern, setSelectedPattern] = useState<DiscoveredPattern | null>(null);
  const [sampleThreshold, setSampleThreshold] = useState(1);

  const discovered = useMemo(
    () => getDiscoveredPatternsFromSnapshot(props.snapshot),
    [props.snapshot]
  );

  const filtered = useMemo(() => {
    let list = discovered.filter((p) => p.supportCount >= sampleThreshold);
    if (statusFilter !== 'all') list = list.filter((p) => p.status === statusFilter);
    return list;
  }, [discovered, statusFilter, sampleThreshold]);

  const insights: PatternInsight[] = useMemo(() => {
    if (!selectedPattern) return [];
    return getPatternInsightsFromSnapshot(props.snapshot, selectedPattern.id);
  }, [props.snapshot, selectedPattern]);

  const signalTypes = useMemo(() => {
    const set = new Set<string>();
    discovered.forEach((p) => p.sourceSignals.forEach((s) => set.add(s)));
    return [...set];
  }, [discovered]);

  const techOptions = useMemo(() => {
    const set = new Set<string>();
    discovered.forEach((p) => p.sourceTechnologies.forEach((t) => set.add(t)));
    return [...set];
  }, [discovered]);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Pattern Discovery</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input rounded border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <select
            className="input rounded border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="suggested">Suggested</option>
            <option value="approved">Approved</option>
            <option value="watching">Watching</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-[200px_1fr_320px] gap-4 min-h-0">
        {/* Left: filters */}
        <div className="card flex flex-col gap-3 rounded-lg border border-[var(--border)] p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Discovery filters
          </div>
          <label className="text-xs text-[var(--muted)]">
            Timeframe
            <select
              className="input mt-1 w-full rounded border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-sm"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
            >
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Sample size min
            <input
              type="number"
              min={1}
              value={sampleThreshold}
              onChange={(e) => setSampleThreshold(Number(e.target.value) || 1)}
              className="input mt-1 w-full rounded border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-sm"
            />
          </label>
          <div className="text-xs text-[var(--muted)]">
            Signal types: {signalTypes.length}
          </div>
          <div className="text-xs text-[var(--muted)]">
            Technologies: {techOptions.length}
          </div>
        </div>

        {/* Center: emerging pattern list */}
        <div className="flex flex-col gap-2 overflow-auto">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Emerging patterns ({filtered.length})
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPattern(p)}
                className={cn(
                  'card rounded-lg border p-3 text-left transition-colors',
                  selectedPattern?.id === p.id
                    ? 'border-[var(--accent)] bg-[var(--card)]'
                    : 'border-[var(--border)] hover:border-[var(--muted)]'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-[var(--foreground)]">{p.name}</span>
                  <span className="rounded bg-[var(--panel)] px-1.5 py-0.5 text-xs text-[var(--muted)]">
                    {p.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                  <span>Support: {p.supportCount}</span>
                  <span>Confidence: {p.confidence}%</span>
                  <span>Novelty: {p.noveltyScore > 0.6 ? 'High' : p.noveltyScore > 0.3 ? 'Medium' : 'Low'}</span>
                  <span>Conversion: {(p.conversionAssociation * 100).toFixed(0)}%</span>
                </div>
                {p.sourceSignals.length > 0 && (
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    Signals: {p.sourceSignals.slice(0, 3).join(', ')}
                    {p.sourceSignals.length > 3 ? '…' : ''}
                  </div>
                )}
                {p.sourceTechnologies.length > 0 && (
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    Tech: {p.sourceTechnologies.slice(0, 3).join(', ')}
                    {p.sourceTechnologies.length > 3 ? '…' : ''}
                  </div>
                )}
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="text-sm text-[var(--muted)]">No patterns match filters.</div>
          )}
        </div>

        {/* Right: pattern detail / insights */}
        <div className="card flex flex-col gap-3 overflow-auto rounded-lg border border-[var(--border)] p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Pattern insight
          </div>
          {selectedPattern ? (
            <>
              <div>
                <div className="font-medium text-[var(--foreground)]">{selectedPattern.name}</div>
                <p className="mt-1 text-sm text-[var(--muted)]">{selectedPattern.description}</p>
              </div>
              <div className="text-xs text-[var(--muted)]">
                <div>Why it emerged: co-occurring signals and tech across {selectedPattern.supportCount} accounts.</div>
                <div className="mt-2 font-medium text-[var(--foreground)]">Strongest factors</div>
                <ul className="mt-1 list-inside list-disc">
                  {selectedPattern.sourceSignals.slice(0, 4).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                {selectedPattern.sourceTechnologies.length > 0 && (
                  <>
                    <div className="mt-2 font-medium text-[var(--foreground)]">Technologies</div>
                    <div className="mt-1">{selectedPattern.sourceTechnologies.slice(0, 5).join(', ')}</div>
                  </>
                )}
                <div className="mt-2 font-medium text-[var(--foreground)]">Sample accounts</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedPattern.matchedAccounts.slice(0, 5).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => props.onOpenAccount(id)}
                      className="rounded bg-[var(--panel)] px-2 py-0.5 text-xs hover:underline"
                    >
                      {id.slice(0, 12)}…
                    </button>
                  ))}
                </div>
              </div>
              {insights.length > 0 && (
                <div>
                  <div className="font-medium text-[var(--foreground)]">Insights</div>
                  <ul className="mt-1 space-y-1 text-sm text-[var(--muted)]">
                    {insights.map((i) => (
                      <li key={i.id}>[{i.insightType}] {i.summary}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-2 font-medium text-[var(--foreground)]">Recommended action</div>
              <p className="text-sm text-[var(--muted)]">
                Promote to active pattern and re-score matching accounts to surface in Workspace.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => props.onCommand('promote-pattern')}
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Promote to active
                </button>
                <button
                  type="button"
                  className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                >
                  Watchlist
                </button>
                <button
                  type="button"
                  className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => props.onStrategySimulate?.(selectedPattern.id, selectedPattern.name) ?? props.onCommand('simulate-pattern')}
                  className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                >
                  Simulate
                </button>
                <button
                  type="button"
                  onClick={() => props.onCommand('rescore-accounts')}
                  className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                >
                  Re-score impacted
                </button>
                <button
                  type="button"
                  onClick={() => props.onCommand('generate-actions-pattern')}
                  className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                >
                  Generate actions
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Select a pattern to see details and actions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
