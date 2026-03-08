'use client';

import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

export type SidebarItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export function Sidebar(props: {
  items: SidebarItem[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  badges?: Partial<Record<string, number | string>>;
}) {
  const items = props.items;
  return (
    <aside
      className="flex w-[var(--sidebar-width)] flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]"
      style={{ width: 'var(--sidebar-width)' }}
    >
      <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white font-semibold text-sm">
          IO
        </div>
        <span className="font-semibold text-[var(--text)]">Intelligence</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = props.activeSection === item.id;
          const badge = props.badges?.[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => props.onSectionChange(item.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition',
                active
                  ? 'bg-[var(--card)] text-[var(--text)] border border-[var(--border)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--card)] hover:text-[var(--text)] border border-transparent'
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {badge != null && (
                <span className="shrink-0 rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
