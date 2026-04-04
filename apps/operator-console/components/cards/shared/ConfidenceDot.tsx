interface ConfidenceDotProps {
  level: 'high' | 'medium' | 'low';
}

export function ConfidenceDot({ level }: ConfidenceDotProps) {
  const colorMap = {
    high: 'var(--status-success)',
    medium: 'var(--status-warning)',
    low: 'var(--status-error)',
  };

  return (
    <div
      className="w-2 h-2 rounded-full"
      style={{ backgroundColor: colorMap[level] }}
      title={`Confidence: ${level}`}
    />
  );
}
