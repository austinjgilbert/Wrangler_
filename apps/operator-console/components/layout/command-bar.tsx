'use client';

import { Command, Loader2, PanelRightOpen, RefreshCw, Search } from 'lucide-react';

export function CommandBar(props: {
  onSearchClick: () => void;
  statusMessage?: string | null;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  onRefresh?: () => void;
  onAssistantToggle?: () => void;
  assistantOpen?: boolean;
  isLoading?: boolean;
}) {
  return (
    <header
      className="flex h-[var(--command-bar-height)] shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--panel)] px-4"
      style={{ height: 'var(--command-bar-height)' }}
    >
      <button
        type="button"
        onClick={props.onSearchClick}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-left text-sm text-[var(--text-secondary)] transition hover:border-[var(--muted)] hover:text-[var(--text)]"
      >
        <Command className="h-4 w-4 shrink-0" />
        <span className="truncate">Run a command… (⌘K)</span>
      </button>
      {props.onSearchQueryChange != null && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <input
            type="text"
            value={props.searchQuery ?? ''}
            onChange={(e) => props.onSearchQueryChange?.(e.target.value)}
            placeholder="Filter"
            className="w-28 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          />
        </div>
      )}
      {props.onRefresh != null && (
        <button
          type="button"
          onClick={props.onRefresh}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text)]"
        >
          {props.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      )}
      {props.onAssistantToggle != null && (
        <button
          type="button"
          onClick={props.onAssistantToggle}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text)]"
          title={props.assistantOpen ? 'Hide assistant' : 'Show assistant'}
        >
          <PanelRightOpen className="h-4 w-4" />
          Assistant
        </button>
      )}
      {props.statusMessage && (
        <span className="hidden truncate text-xs text-[var(--muted)] sm:inline">{props.statusMessage}</span>
      )}
    </header>
  );
}
