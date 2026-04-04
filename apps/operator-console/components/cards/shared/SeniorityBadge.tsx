interface SeniorityBadgeProps {
  level: string;
}

export function SeniorityBadge({ level }: SeniorityBadgeProps) {
  const colorMap: Record<string, string> = {
    'C-Suite': 'var(--accent-primary)',
    VP: 'var(--status-warning)',
    Director: 'var(--status-success)',
    Manager: 'var(--text-secondary)',
    IC: 'var(--text-tertiary)',
  };

  const color = colorMap[level] || 'var(--text-secondary)';

  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: `${color}15`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      {level}
    </span>
  );
}
