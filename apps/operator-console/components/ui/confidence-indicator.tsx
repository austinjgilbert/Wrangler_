'use client';

import { cn } from '@/lib/utils';

export function ConfidenceIndicator(props: {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const max = props.max ?? 100;
  const pct = Math.min(100, Math.max(0, (props.value / max) * 100));
  const tone =
    pct >= 75 ? 'success' : pct >= 50 ? 'warning' : 'danger';
  const bg =
    tone === 'success'
      ? 'bg-[var(--success)]'
      : tone === 'warning'
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--error)]';
  const height = props.size === 'sm' ? 'h-1.5' : 'h-2';
  return (
    <div className={cn('w-full', props.className)}>
      <div className={cn('overflow-hidden rounded-full bg-[var(--border)]', height)}>
        <div
          className={cn('h-full rounded-full transition-all', bg)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {props.showLabel && (
        <span className="mt-1 text-xs text-[var(--muted)]">{Math.round(pct)}%</span>
      )}
    </div>
  );
}
