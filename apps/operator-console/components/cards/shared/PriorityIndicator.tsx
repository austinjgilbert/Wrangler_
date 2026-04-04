interface PriorityIndicatorProps {
  urgency: 'high' | 'medium' | 'low';
}

export function PriorityIndicator({ urgency }: PriorityIndicatorProps) {
  const colorMap = {
    high: 'var(--status-error)',
    medium: 'var(--status-warning)',
    low: 'var(--status-success)',
  };

  const iconMap = {
    high: '⚡',
    medium: '→',
    low: '◉',
  };

  const color = colorMap[urgency];

  return (
    <div className="flex items-center gap-2">
      <div
        className="w-1 h-6"
        style={{ backgroundColor: color, borderRadius: '2px' }}
      />
      <span style={{ color, fontSize: '14px' }}>{iconMap[urgency]}</span>
    </div>
  );
}
