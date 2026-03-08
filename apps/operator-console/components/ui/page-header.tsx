'use client';

import type { ReactNode } from 'react';

export function PageHeader(props: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--border)] pb-4">
      {props.eyebrow && (
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">{props.eyebrow}</div>
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">{props.title}</h1>
        {props.actions}
      </div>
      {props.description && (
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]">{props.description}</p>
      )}
    </div>
  );
}
