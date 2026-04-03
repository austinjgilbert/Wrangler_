'use client';

import { useState, useMemo } from 'react';
import { useSnapshot } from '../layout';
import {
  Search,
  TrendingUp,
  Eye,
  CheckCircle2,
  AlertCircle,
  ArrowUpDown,
} from 'lucide-react';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function lifecycleColor(state: string) {
  switch (state) {
    case 'validated':
      return { bg: 'var(--success)', text: 'var(--success)' };
    case 'emerging':
      return { bg: 'var(--highlight)', text: 'var(--highlight)' };
    case 'watchlist':
      return { bg: 'var(--warning)', text: 'var(--warning)' };
    default:
      return { bg: 'var(--muted)', text: 'var(--muted)' };
  }
}

function lifecycleIcon(state: string) {
  switch (state) {
    case 'validated':
      return CheckCircle2;
    case 'emerging':
      return TrendingUp;
    case 'watchlist':
      return Eye;
    default:
      return AlertCircle;
  }
}

/* ─── Patterns Page ─────────────────────────────────────────────────────── */

export default function PatternsPage() {
  const { snapshot } = useSnapshot();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');

  const allPatterns = snapshot?.patterns?.active ?? [];

  const filtered = useMemo(() => {
    let list = [...allPatterns];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.summary.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q),
      );
    }

    if (stateFilter !== 'all') {
      list = list.filter((p) => p.lifecycleState === stateFilter);
    }

    list.sort((a, b) => b.conversionAssociation - a.conversionAssociation);
    return list;
  }, [allPatterns, search, stateFilter]);

  if (!snapshot) return null;

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-[var(--text)]">Patterns</h1>
        <p className="text-[13px] text-[var(--muted)] mt-1">
          {allPatterns.length} active pattern{allPatterns.length !== 1 ? 's' : ''} discovered
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="text"
            placeholder="Search patterns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--highlight)]"
          />
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--highlight)]"
        >
          <option value="all">All States</option>
          <option value="validated">Validated</option>
          <option value="emerging">Emerging</option>
          <option value="watchlist">Watchlist</option>
        </select>
      </div>

      {/* Pattern Cards */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {filtered.map((p) => {
            const lc = lifecycleColor(p.lifecycleState);
            const Icon = lifecycleIcon(p.lifecycleState);
            return (
              <div key={p.id} className="card p-4 space-y-3 hover:border-[var(--highlight)] transition-colors">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={14} style={{ color: lc.text }} />
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{ background: `${lc.bg}18`, color: lc.text }}
                    >
                      {p.lifecycleState}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">{p.type}</span>
                  </div>
                  <span className="text-[10px] text-[var(--muted)]">
                    {new Date(p.lastUpdated).toLocaleDateString()}
                  </span>
                </div>

                {/* Summary */}
                <p className="text-[13px] text-[var(--text)] leading-relaxed">{p.summary}</p>

                {/* Metrics */}
                <div className="flex items-center gap-4 pt-1">
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Match Freq</p>
                    <p className="text-[13px] font-mono text-[var(--text)]">{p.matchFrequency}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted)]">Conversion</p>
                    <p className="text-[13px] font-mono text-[var(--text)]">
                      {Math.round(p.conversionAssociation * 100)}%
                    </p>
                  </div>
                  {p.owner && (
                    <div>
                      <p className="text-[10px] text-[var(--muted)]">Owner</p>
                      <p className="text-[12px] text-[var(--text-secondary)]">{p.owner}</p>
                    </div>
                  )}
                </div>

                {/* Recommended Moves */}
                {p.recommendedMoves.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[10px] text-[var(--muted)] mb-1">Recommended moves</p>
                    <div className="flex flex-wrap gap-1">
                      {p.recommendedMoves.map((m, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card px-4 py-12 text-center">
          <Search size={20} className="text-[var(--muted)] mx-auto mb-2" />
          <p className="text-[13px] text-[var(--muted)]">
            {search || stateFilter !== 'all' ? 'No patterns match your filters' : 'No patterns discovered yet'}
          </p>
        </div>
      )}
    </div>
  );
}
