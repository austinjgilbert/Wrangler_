interface SignalBadgeProps {
  type: string;
  strength: 'high' | 'medium' | 'low';
}

export function SignalBadge({ type, strength }: SignalBadgeProps) {
  const strengthColors = {
    high: { bg: 'rgba(34, 197, 94, 0.15)', text: 'var(--status-success)' },
    medium: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--status-warning)' },
    low: { bg: 'rgba(239, 68, 68, 0.15)', text: 'var(--status-error)' },
  };

  const colors = strengthColors[strength];

  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: colors.text }}
      />
      {type}
    </div>
  );
}
