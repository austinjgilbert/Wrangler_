'use client';

import { useState, useMemo } from 'react';
import { useSnapshot } from '../layout';
import {
  Zap,
  Search,
  Filter,
  ArrowUpDown,
} from 'lucide-react';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function timeSince(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function strengthColor(s: number) {
  if (s > 0.7) return 'var(--success)';
  if (s > 0.4) return 'var(--warning)';
  return 'var(--muted)';
}

/* ─── Signals Page ──────────────────────────────────────────────────────── */

export default function SignalsPage() {
  const { snapshot } = useSnapshot();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortDir, setSortDir] = useState<'newest' | 'strongest'>('newest');

  const allSignals = snapshot?.signals?.recent ?? [];

  // Derive unique types and sources for filters
  const signalTypes = useMemo(() => {
    const s = new Set(allSignals.map((s) => s.signalType));
    return Array.from(s).sort();
  }, [allSignals]);

  const signalSources = useMemo(() => {
    const s = new Set(allSignals.map((s) => s.source));
    return Array.from(s).sort();
  }, [allSignals]);

  const filtered = useMemo(() => {
    let list = [...allSignals];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.accountName.toLowerCase().includes(q) ||
          s.signalType.toLowerCase().includes(q) ||
          s.source.toLowerCase().includes(q),
      );
    }

    if (typeFilter !== 'all') {
      list = list.filter((s) => s.signalType === typeFilter);
    }
    if (sourceFilter !== 'all') {
      list = list.filter((s) => s.source === sourceFilter);
    }

    if (sortDir === 'strongest') {
      list.sort((a, b) => b.strength - a.strength);
    } else {
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    return list;
  }, [allSignals, search, typeFilter, sourceFilter, sortDir]);

  if (!snapshot) return null;

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-[var(--text)]">Signals</h1>
        <p className="text-[13px] text-[var(--muted)] mt-1">
          {allSignals.length} signal{allSignals.length !== 1 ? 's' : ''} captured
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="text"
            placeholder="Search signals…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--highlight)]"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--highlight)]"
        >
          <option value="all">All Types</option>
          {signalTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--highlight)]"
        >
          <option value="all">All Sources</option>
          {signalSources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          onClick={() => setSortDir((d) => (d === 'newest' ? 'strongest' : 'newest'))}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowUpDown size={12} />
          {sortDir === 'newest' ? 'Newest first' : 'Strongest first'}
        </button>
      </div>

      {/* Signal List */}
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--panel)]">
          <span className="col-span-3 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
            Account
          </span>
          <span className="col-span-2 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
            Signal
          </span>
          <span className="col-span-2 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
            Source
          </span>
          <span className="col-span-2 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
            Strength
          </span>
          <span className="col-span-2 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
            State
          </span>
          <span className="col-span-1 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium text-right">
            Age
          </span>
        </div>

        {filtered.length > 0 ? (
          filtered.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-12 gap-4 items-center px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--card-hover)] transition-colors"
            >
              <div className="col-span-3 flex items-center gap-2 min-w-0">
                <Zap size={12} style={{ color: strengthColor(s.strength) }} className="shrink-0" />
                <span className="text-[12px] text-[var(--text)] truncate">{s.accountName}</span>
              </div>
              <div className="col-span-2">
                <span className="text-[12px] text-[var(--text-secondary)]">{s.signalType}</span>
              </div>
              <div className="col-span-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--muted)] border border-[var(--border-subtle)]">
                  {s.source}
                </span>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.strength * 100}%`,
                        background: strengthColor(s.strength),
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-[var(--muted)]">
                    {Math.round(s.strength * 100)}%
                  </span>
                </div>
              </div>
              <div className="col-span-2">
                <span
                  className="text-[11px]"
                  style={{
                    color:
                      s.uncertaintyState === 'confirmed'
                        ? 'var(--success)'
                        : s.uncertaintyState === 'speculative'
                        ? 'var(--warning)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {s.uncertaintyState}
                </span>
              </div>
              <div className="col-span-1 text-right">
                <span className="text-[11px] text-[var(--muted)]">{timeSince(s.timestamp)}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-12 text-center">
            <Zap size={20} className="text-[var(--muted)] mx-auto mb-2" />
            <p className="text-[13px] text-[var(--muted)]">
              {search || typeFilter !== 'all' || sourceFilter !== 'all'
                ? 'No signals match your filters'
                : 'No signals captured yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
