'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Zap,
  GitBranch,
  MessageSquare,
  FlaskConical,
  Search,
  FileText,
  Command,
  PanelRightOpen,
  PanelRightClose,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import type { ConsoleSnapshot } from '@/lib/types';
import { fetchSnapshot } from '@/lib/api';

/* ─── Snapshot Context ──────────────────────────────────────────────────── */

type SnapshotCtx = {
  snapshot: ConsoleSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  lastRefresh: Date | null;
};

const SnapshotContext = createContext<SnapshotCtx>({
  snapshot: null,
  loading: true,
  error: null,
  refresh: () => {},
  lastRefresh: null,
});

export function useSnapshot() {
  return useContext(SnapshotContext);
}

/* ─── Navigation Items ──────────────────────────────────────────────────── */

const NAV = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Building2 },
  { href: '/signals', label: 'Signals', icon: Zap },
  { href: '/pipeline', label: 'Pipeline', icon: GitBranch },
  { href: '/patterns', label: 'Patterns', icon: Search },
  { href: '/research', label: 'Research', icon: FileText },
  { href: '/system', label: 'System', icon: FlaskConical },
] as const;

/* ─── Dashboard Layout ──────────────────────────────────────────────────── */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const data = await fetchSnapshot();
      setSnapshot(data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000); // 60s polling
    return () => clearInterval(interval);
  }, [refresh]);

  // Cmd+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // TODO: open command palette
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const ctx: SnapshotCtx = { snapshot, loading, error, refresh, lastRefresh };

  return (
    <SnapshotContext.Provider value={ctx}>
      <div className="flex h-screen overflow-hidden bg-[var(--background)]">
        {/* ── Sidebar ────────────────────────────────────── */}
        <aside className="dashboard-sidebar w-[var(--sidebar-width)] shrink-0 border-r border-[var(--border)] bg-[var(--panel)] flex flex-col">
          {/* Logo */}
          <div className="h-[var(--command-bar-height)] flex items-center px-5 border-b border-[var(--border-subtle)]">
            <span className="text-sm font-semibold tracking-tight text-[var(--text)]">
              Wrangler
            </span>
            <span className="ml-1.5 text-[0.625rem] font-medium text-[var(--accent)] bg-[var(--accent-muted)] rounded px-1.5 py-0.5">
              OS
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors
                    ${active
                      ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--card)]'
                    }
                  `}
                >
                  <Icon size={16} strokeWidth={1.8} />
                  {label}
                  {/* Badge for signals count */}
                  {label === 'Signals' && snapshot?.overview?.intelligenceStatus?.signalsToday ? (
                    <span className="ml-auto text-[11px] font-medium text-[var(--muted)]">
                      {snapshot.overview.intelligenceStatus.signalsToday}
                    </span>
                  ) : null}
                  {label === 'Pipeline' && snapshot?.overview?.intelligenceStatus?.activeOpportunities ? (
                    <span className="ml-auto text-[11px] font-medium text-[var(--muted)]">
                      {snapshot.overview.intelligenceStatus.activeOpportunities}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* Status Footer */}
          <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--muted)]">
                {lastRefresh
                  ? `Synced ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Connecting…'}
              </span>
              {snapshot?.overview?.intelligenceStatus?.driftRisk && (
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    snapshot.overview.intelligenceStatus.driftRisk === 'low'
                      ? 'bg-[var(--success-muted)] text-[var(--success)]'
                      : snapshot.overview.intelligenceStatus.driftRisk === 'medium'
                      ? 'bg-[var(--warning-muted)] text-[var(--warning)]'
                      : 'bg-[var(--error-muted)] text-[var(--error)]'
                  }`}
                >
                  {snapshot.overview.intelligenceStatus.driftRisk} drift
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* ── Main Area ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Command Bar */}
          <header className="h-[var(--command-bar-height)] shrink-0 border-b border-[var(--border)] bg-[var(--panel)] flex items-center px-5 gap-4">
            <div className="flex-1 flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  type="text"
                  placeholder="Search accounts, signals, patterns…"
                  className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-12 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--highlight)]"
                />
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted)] bg-[var(--panel)] border border-[var(--border)] rounded px-1.5 py-0.5 font-mono">
                  <Command size={10} className="inline mr-0.5" />K
                </kbd>
              </div>
            </div>

            <button
              onClick={refresh}
              disabled={refreshing}
              className="p-2 rounded-md text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              {refreshing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
            </button>

            <button
              onClick={() => setAssistantOpen(!assistantOpen)}
              className="p-2 rounded-md text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors"
              title="Toggle assistant"
            >
              {assistantOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </header>

          {/* Content Area */}
          <div className="flex-1 flex overflow-hidden">
            <main className="flex-1 overflow-y-auto">
              {loading && !snapshot ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 size={24} className="animate-spin text-[var(--accent)] mx-auto mb-3" />
                    <p className="text-[13px] text-[var(--muted)]">Loading intelligence…</p>
                  </div>
                </div>
              ) : error && !snapshot ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-sm">
                    <p className="text-sm text-[var(--error)] mb-2">Connection failed</p>
                    <p className="text-[13px] text-[var(--muted)] mb-4">{error}</p>
                    <button
                      onClick={refresh}
                      className="text-[13px] text-[var(--accent)] hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : (
                children
              )}
            </main>

            {/* Assistant Panel */}
            {assistantOpen && (
              <aside className="dashboard-assistant w-[var(--assistant-width)] shrink-0 border-l border-[var(--border)] bg-[var(--panel)] flex flex-col overflow-hidden">
                <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--border-subtle)]">
                  <span className="text-[13px] font-medium text-[var(--text)]">Assistant</span>
                  <button
                    onClick={() => setAssistantOpen(false)}
                    className="text-[var(--muted)] hover:text-[var(--text)] text-xs"
                  >
                    Close
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <p className="text-[13px] text-[var(--muted)]">
                    Ask questions about your accounts, signals, and pipeline.
                  </p>
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </SnapshotContext.Provider>
  );
}
