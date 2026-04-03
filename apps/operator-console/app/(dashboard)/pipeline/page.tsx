'use client';

import { useState, useMemo } from 'react';
import { useSnapshot } from '../layout';
import {
  GitBranch,
  Search,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  Target,
  Send,
} from 'lucide-react';

/* ─── Pipeline / Action Candidates Page ─────────────────────────────────── */

function confidenceColor(c: number) {
  if (c > 0.7) return 'var(--success)';
  if (c > 0.4) return 'var(--warning)';
  return 'var(--error)';
}

export default function PipelinePage() {
  const { snapshot } = useSnapshot();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [sortDir, setSortDir] = useState<'rank' | 'confidence' | 'score'>('rank');

  const allActions = snapshot?.actions?.raw ?? [];

  const filtered = useMemo(() => {
    let list = [...allActions];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.accountName.toLowerCase().includes(q) ||
          a.actionType.toLowerCase().includes(q) ||
          a.whyNow.toLowerCase().includes(q),
      );
    }

    if (sortDir === 'confidence') {
      list.sort((a, b) => b.confidence - a.confidence);
    } else if (sortDir === 'score') {
      list.sort((a, b) => b.opportunityScore - a.opportunityScore);
    }

    return list;
  }, [allActions, search, sortDir]);

  // Group by draft status for board view
  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {
      pending: [],
      drafting: [],
      ready: [],
      sent: [],
    };
    filtered.forEach((a) => {
      const key = a.draftStatus === 'ready' ? 'ready' : a.draftStatus === 'sent' ? 'sent' : a.draftStatus === 'drafting' ? 'drafting' : 'pending';
      groups[key].push(a);
    });
    return groups;
  }, [filtered]);

  if (!snapshot) return null;

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Pipeline</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1">
            {allActions.length} action candidate{allActions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
              view === 'list'
                ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]40'
                : 'bg-[var(--card)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView('board')}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
              view === 'board'
                ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]40'
                : 'bg-[var(--card)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            Board
          </button>
        </div>
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
            placeholder="Search actions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--highlight)]"
          />
        </div>
        <select
          value={sortDir}
          onChange={(e) => setSortDir(e.target.value as typeof sortDir)}
          className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--highlight)]"
        >
          <option value="rank">Default order</option>
          <option value="confidence">Highest confidence</option>
          <option value="score">Highest opp score</option>
        </select>
      </div>

      {/* Content */}
      {view === 'list' ? (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--panel)]">
            <span className="col-span-3 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Account</span>
            <span className="col-span-2 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Action</span>
            <span className="col-span-3 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Why Now</span>
            <span className="col-span-1 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Conf</span>
            <span className="col-span-1 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Score</span>
            <span className="col-span-2 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Status</span>
          </div>
          {filtered.length > 0 ? (
            filtered.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-12 gap-4 items-center px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="col-span-3 min-w-0">
                  <p className="text-[12px] text-[var(--text)] truncate">{a.accountName}</p>
                  {a.personName && (
                    <p className="text-[11px] text-[var(--muted)] truncate">→ {a.personName}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <span className="text-[12px] text-[var(--text-secondary)]">{a.actionType}</span>
                </div>
                <div className="col-span-3">
                  <p className="text-[11px] text-[var(--muted)] truncate">{a.whyNow}</p>
                </div>
                <div className="col-span-1">
                  <span
                    className="text-[12px] font-mono"
                    style={{ color: confidenceColor(a.confidence) }}
                  >
                    {Math.round(a.confidence * 100)}%
                  </span>
                </div>
                <div className="col-span-1">
                  <span className="text-[12px] font-mono text-[var(--text-secondary)]">
                    {a.opportunityScore}
                  </span>
                </div>
                <div className="col-span-2 flex items-center gap-1.5">
                  {a.draftStatus === 'ready' ? (
                    <>
                      <CheckCircle2 size={12} className="text-[var(--success)]" />
                      <span className="text-[11px] text-[var(--success)]">Ready</span>
                    </>
                  ) : a.draftStatus === 'sent' ? (
                    <>
                      <Send size={12} className="text-[var(--highlight)]" />
                      <span className="text-[11px] text-[var(--highlight)]">Sent</span>
                    </>
                  ) : (
                    <>
                      <Target size={12} className="text-[var(--muted)]" />
                      <span className="text-[11px] text-[var(--muted)]">{a.draftStatus}</span>
                    </>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-12 text-center">
              <GitBranch size={20} className="text-[var(--muted)] mx-auto mb-2" />
              <p className="text-[13px] text-[var(--muted)]">No action candidates</p>
            </div>
          )}
        </div>
      ) : (
        /* Board View */
        <div className="grid grid-cols-4 gap-4">
          {(['pending', 'drafting', 'ready', 'sent'] as const).map((stage) => (
            <div key={stage} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[12px] font-medium text-[var(--text)] capitalize">{stage}</h3>
                <span className="text-[11px] text-[var(--muted)]">{grouped[stage].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[stage].map((a) => (
                  <div
                    key={a.id}
                    className="card p-3 space-y-2 hover:border-[var(--highlight)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[var(--text)] truncate">
                        {a.accountName}
                      </span>
                      <span
                        className="text-[10px] font-mono"
                        style={{ color: confidenceColor(a.confidence) }}
                      >
                        {Math.round(a.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">{a.actionType}</p>
                    <p className="text-[10px] text-[var(--muted)] truncate">{a.whyNow}</p>
                  </div>
                ))}
                {grouped[stage].length === 0 && (
                  <div className="card p-4 text-center border-dashed">
                    <p className="text-[11px] text-[var(--muted)]">Empty</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
