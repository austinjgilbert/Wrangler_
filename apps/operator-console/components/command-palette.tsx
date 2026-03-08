'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
};

export function CommandPalette(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandItem[];
  onSelect: (command: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = props.commands.filter((cmd) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const label = cmd.label.toLowerCase();
    const keywords = (cmd.keywords ?? []).join(' ').toLowerCase();
    return label.includes(q) || keywords.includes(q);
  });

  const select = useCallback(
    (command: CommandItem) => {
      props.onSelect(command.label);
      props.onOpenChange(false);
      setQuery('');
      setSelectedIndex(0);
    },
    [props]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        select(filtered[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        props.onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.open, filtered, selectedIndex, select, props]);

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-[20%] z-50 w-full max-w-xl -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-md)] outline-none"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
            <Command className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={props.placeholder ?? 'Type a command or search…'}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
              autoFocus
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--muted)]">No commands match.</div>
            ) : (
              filtered.map((cmd, i) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => select(cmd)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition',
                    i === selectedIndex
                      ? 'bg-[var(--card)] text-[var(--text)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--card)] hover:text-[var(--text)]'
                  )}
                >
                  <span className="font-medium">{cmd.label}</span>
                  {cmd.description && <span className="text-xs text-[var(--muted)]">{cmd.description}</span>}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
            ↑↓ navigate · Enter run · Esc close
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
