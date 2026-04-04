interface OpportunityGaugeProps {
  score: number;
}

export function OpportunityGauge({ score }: OpportunityGaugeProps) {
  const clampedScore = Math.min(Math.max(score, 0), 100);
  const filledSegments = Math.ceil((clampedScore / 100) * 5);

  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 flex-1 rounded-sm"
          style={{
            backgroundColor:
              i < filledSegments
                ? `rgba(240, 62, 47, ${0.3 + (i / 5) * 0.7})`
                : 'rgba(255, 255, 255, 0.1)',
          }}
        />
      ))}
      <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>
        {clampedScore}
      </span>
    </div>
  );
}
