'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StatPanel(props: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const toneClass =
    props.tone === 'success'
      ? 'text-[var(--success)]'
      : props.tone === 'warning'
        ? 'text-[var(--warning)]'
        : props.tone === 'danger'
          ? 'text-[var(--error)]'
          : 'text-[var(--text)]';
  return (
    <div className={cn('card rounded-[var(--card-radius)] p-4', props.className)}>
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">{props.label}</div>
      <div className={cn('mt-2 text-2xl font-semibold tabular-nums', toneClass)}>{props.value}</div>
    </div>
  );
}
