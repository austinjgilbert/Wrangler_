'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ConsoleSnapshot, MarketCluster } from '@/lib/types';
import { getStrategicMapSnapshotFromSnapshot } from '@/lib/intelligence-map-data';

type TabId = 'clusters' | 'heatmaps' | 'technology' | 'whitespace' | 'insights';

export function IntelligenceMapView(props: {
  snapshot: ConsoleSnapshot;
  onOpenAccount: (accountId: string | null) => void;
  onCommand: (command: string) => Promise<void>;
}) {
  const [timeframe, setTimeframe] = useState('30d');
  const [tab, setTab] = useState<TabId>('clusters');
  const [selectedCluster, setSelectedCluster] = useState<MarketCluster | null>(null);
  const [colorMode, setColorMode] = useState<'opportunity' | 'fit' | 'whitespace'>('opportunity');

  const mapSnapshot = useMemo(
    () => getStrategicMapSnapshotFromSnapshot(props.snapshot),
    [props.snapshot]
  );

  const clusters = mapSnapshot.clusters;

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'clusters', label: 'Cluster view' },
    { id: 'heatmaps', label: 'Heatmaps' },
    { id: 'technology', label: 'Technology landscape' },
    { id: 'whitespace', label: 'Coverage / Whitespace' },
    { id: 'insights', label: 'Strategic insights' },
  ];

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Intelligence Map</h1>
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
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as typeof colorMode)}
          >
            <option value="opportunity">Color: Opportunity</option>
            <option value="fit">Color: Strategic fit</option>
            <option value="whitespace">Color: Whitespace</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-[var(--accent)] text-[var(--foreground)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-[1fr_320px] gap-4 min-h-0">
        <div className="flex flex-col overflow-auto">
          {tab === 'clusters' && (
            <div className="flex flex-wrap gap-3">
              {clusters.map((c) => {
                const size = 60 + Math.min(c.accountIds.length * 4, 80);
                const score = colorMode === 'opportunity' ? c.averageOpportunityScore : colorMode === 'fit' ? c.strategicFitScore : c.whitespaceScore;
                const intensity = Math.round(score * 100);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCluster(c)}
                    className={cn(
                      'rounded-xl border-2 p-4 transition-all hover:scale-105',
                      selectedCluster?.id === c.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'
                    )}
                    style={{
                      width: size,
                      height: size,
                      backgroundColor: `hsl(0, 0%, ${12 + (1 - score) * 8}%)`,
                      borderColor: selectedCluster?.id === c.id ? 'var(--accent)' : undefined,
                    }}
                  >
                    <div className="text-xs font-medium text-[var(--foreground)]">{c.name}</div>
                    <div className="mt-1 text-[10px] text-[var(--muted)]">{c.accountIds.length} accts</div>
                    <div className="mt-0.5 text-[10px] text-[var(--muted)]">{intensity}%</div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'heatmaps' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                  Industry × Pattern
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {Object.entries(mapSnapshot.heatmaps.industryPattern).slice(0, 16).map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded bg-[var(--card)] p-2 text-xs"
                      style={{ opacity: 0.4 + Math.min(v, 10) / 10 * 0.6 }}
                    >
                      <div className="truncate text-[var(--foreground)]">{k}</div>
                      <div className="text-[var(--muted)]">{v.toFixed(1)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                  Tech × Signal density
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(mapSnapshot.heatmaps.techSignal).slice(0, 12).map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded bg-[var(--card)] px-3 py-1.5 text-xs"
                      style={{ opacity: 0.5 + Math.min(v, 5) / 5 * 0.5 }}
                    >
                      {k}: {v.toFixed(1)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'technology' && (
            <div className="flex flex-wrap gap-2">
              {clusters.filter((c) => c.clusterType === 'technology').map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCluster(c)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left text-sm',
                    selectedCluster?.id === c.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'
                  )}
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-[var(--muted)]">{c.accountIds.length} accounts · {c.topTechnologies.slice(0, 3).join(', ')}</div>
                </button>
              ))}
            </div>
          )}

          {tab === 'whitespace' && (
            <div className="space-y-2">
              {[...clusters]
                .sort((a, b) => b.whitespaceScore - a.whitespaceScore)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCluster(c)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border p-3 text-left',
                      selectedCluster?.id === c.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'
                    )}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-sm text-[var(--muted)]">
                      Whitespace: {(c.whitespaceScore * 100).toFixed(0)}% · {c.accountIds.length} accts
                    </span>
                  </button>
                ))}
            </div>
          )}

          {tab === 'insights' && (
            <ul className="list-inside space-y-2 text-sm text-[var(--muted)]">
              {mapSnapshot.insights.map((insight, i) => (
                <li key={i} className="rounded-lg border border-[var(--border)] p-3 text-[var(--foreground)]">
                  {insight}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail panel */}
        <div className="card flex flex-col gap-3 overflow-auto rounded-lg border border-[var(--border)] p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Cluster detail
          </div>
          {selectedCluster ? (
            <>
              <div>
                <div className="font-medium text-[var(--foreground)]">{selectedCluster.name}</div>
                <div className="text-xs text-[var(--muted)]">{selectedCluster.clusterType}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Accounts</div>
                <div>{selectedCluster.accountIds.length}</div>
                <div>Avg opportunity</div>
                <div>{(selectedCluster.averageOpportunityScore * 100).toFixed(1)}%</div>
                <div>Signal density</div>
                <div>{selectedCluster.signalDensity.toFixed(2)}</div>
                <div>Whitespace</div>
                <div>{(selectedCluster.whitespaceScore * 100).toFixed(0)}%</div>
                {selectedCluster.conversionRate != null && (
                  <>
                    <div>Conversion rate</div>
                    <div>{(selectedCluster.conversionRate * 100).toFixed(0)}%</div>
                  </>
                )}
              </div>
              {selectedCluster.topPatterns.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-[var(--foreground)]">Top patterns</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-[var(--muted)]">
                    {selectedCluster.topPatterns.map((p) => (
                      <span key={p} className="rounded bg-[var(--panel)] px-2 py-0.5">{p}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedCluster.topTechnologies.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-[var(--foreground)]">Technologies</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{selectedCluster.topTechnologies.join(', ')}</div>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-[var(--foreground)]">Sample accounts</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedCluster.accountIds.slice(0, 6).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => props.onOpenAccount(id)}
                      className="rounded bg-[var(--panel)] px-2 py-0.5 text-xs hover:underline"
                    >
                      {id.slice(0, 10)}…
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 border-t border-[var(--border)] pt-3">
                <div className="text-xs font-medium text-[var(--foreground)]">Actions</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => props.onCommand('generate-target-list')}
                    className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                  >
                    Generate target list
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onCommand('batch-enrich')}
                    className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                  >
                    Batch enrich
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onCommand('segment-action-queue')}
                    className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                  >
                    Segment action queue
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                  >
                    Compare clusters
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:bg-[var(--card)]"
                  >
                    Export report
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Select a cluster to see details and actions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
