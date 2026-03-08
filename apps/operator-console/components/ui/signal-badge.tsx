'use client';

import { cn } from '@/lib/utils';

export function SignalBadge(props: {
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const toneClass =
    props.tone === 'success'
      ? 'bg-[var(--success-muted)] text-[var(--success)]'
      : props.tone === 'warning'
        ? 'bg-[var(--warning-muted)] text-[var(--warning)]'
        : props.tone === 'danger'
          ? 'bg-[var(--error-muted)] text-[var(--error)]'
          : 'bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)]';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        toneClass,
        props.className
      )}
    >
      {props.label}
    </span>
  );
}
