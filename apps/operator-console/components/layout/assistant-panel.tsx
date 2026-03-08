'use client';

import type { ReactNode } from 'react';
import { PanelRightClose } from 'lucide-react';

export function AssistantPanel(props: { children: ReactNode; onClose: () => void }) {
  return (
    <aside
      className="flex w-[var(--assistant-width)] flex-shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)]"
      style={{ width: 'var(--assistant-width)' }}
    >
      <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-4">
        <span className="text-sm font-semibold text-[var(--text)]">AI Assistant</span>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded p-1.5 text-[var(--muted)] transition hover:bg-[var(--card)] hover:text-[var(--text)]"
          aria-label="Close assistant"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {props.children}
      </div>
    </aside>
  );
}
