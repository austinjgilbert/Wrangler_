'use client';

import { useState, useMemo } from 'react';
import { useSnapshot } from '../layout';
import Link from 'next/link';
import {
  Building2,
  Search,
  ArrowUpDown,
  ChevronRight,
  Target,
  AlertCircle,
} from 'lucide-react';

/* ─── Filters ───────────────────────────────────────────────────────────── */

type SortKey = 'name' | 'completion' | 'opportunityScore';
type SortDir = 'asc' | 'desc';

/* ─── Account Row ───────────────────────────────────────────────────────── */

function AccountRow({
  account,
}: {
  account: {
    id: string;
    name: string;
    domain: string | null;
    completion: number;
    opportunityScore: number;
    missing: string[];
    technologies: string[];
  };
}) {
  return (
    <Link
      href={`/accounts/${account.id}`}
      className="grid grid-cols-12 gap-4 items-center px-4 py-3 border-b border-[var(--border-subtle)] hover:bg-[var(--card-hover)] transition-colors group"
    >
      {/* Name + Domain */}
      <div className="col-span-4 flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
          <Building2 size={14} className="text-[var(--accent)]" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
            {account.name}
          </p>
          {account.domain && (
            <p className="text-[11px] text-[var(--muted)] truncate">{account.domain}</p>
          )}
        </div>
      </div>

      {/* Completion */}
      <div className="col-span-2 flex items-center gap-2">
        <div className="w-full max-w-[80px] h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${account.completion}%`,
              background:
                account.completion > 80
                  ? 'var(--success)'
                  : account.completion > 50
                  ? 'var(--warning)'
                  : 'var(--error)',
            }}
          />
        </div>
        <span className="text-[11px] font-mono text-[var(--muted)] w-8 text-right">
          {account.completion}%
        </span>
      </div>

      {/* Opportunity Score */}
      <div className="col-span-2 flex items-center gap-2">
        <Target size={12} className="text-[var(--success)] shrink-0" />
        <span className="text-[13px] font-mono text-[var(--text)]">
          {account.opportunityScore}
        </span>
      </div>

      {/* Technologies */}
      <div className="col-span-3 flex items-center gap-1 overflow-hidden">
        {account.technologies.slice(0, 3).map((t) => (
          <span
            key={t}
            className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border-subtle)] truncate"
          >
            {t}
          </span>
        ))}
        {account.technologies.length > 3 && (
          <span className="text-[10px] text-[var(--muted)]">
            +{account.technologies.length - 3}
          </span>
        )}
      </div>

      {/* Arrow */}
      <div className="col-span-1 flex justify-end">
        <ChevronRight
          size={14}
          className="text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
    </Link>
  );
}

/* ─── Accounts Page ─────────────────────────────────────────────────────── */

export default function AccountsPage() {
  const { snapshot } = useSnapshot();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('opportunityScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const accounts = useMemo(() => {
    if (!snapshot) return [];
    let list = [...snapshot.entities.accounts];

    // Filter
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.domain?.toLowerCase().includes(q) ||
          a.technologies.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Sort
    list.sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    return list;
  }, [snapshot, search, sortKey, sortDir]);

  if (!snapshot) return null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Accounts</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} indexed
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
        />
        <input
          type="text"
          placeholder="Search accounts, domains, tech…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--highlight)]"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {/* Column Headers */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--panel)]">
          <button
            onClick={() => toggleSort('name')}
            className="col-span-4 flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium hover:text-[var(--text)] transition-colors"
          >
            Account
            <ArrowUpDown size={10} />
          </button>
          <button
            onClick={() => toggleSort('completion')}
            className="col-span-2 flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium hover:text-[var(--text)] transition-colors"
          >
            Completion
            <ArrowUpDown size={10} />
          </button>
          <button
            onClick={() => toggleSort('opportunityScore')}
            className="col-span-2 flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium hover:text-[var(--text)] transition-colors"
          >
            Opp Score
            <ArrowUpDown size={10} />
          </button>
          <span className="col-span-3 text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
            Technologies
          </span>
          <span className="col-span-1" />
        </div>

        {/* Rows */}
        {accounts.length > 0 ? (
          accounts.map((a) => <AccountRow key={a.id} account={a} />)
        ) : (
          <div className="px-4 py-12 text-center">
            <AlertCircle size={20} className="text-[var(--muted)] mx-auto mb-2" />
            <p className="text-[13px] text-[var(--muted)]">
              {search ? 'No accounts match your search' : 'No accounts indexed yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
