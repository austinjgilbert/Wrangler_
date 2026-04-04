interface OpportunityGaugeProps {
  score: number;
}

/** Gradient intensity per segment — derived from --accent-primary (#f03e2f). */
const SEGMENT_OPACITY = [0.3, 0.44, 0.58, 0.72, 0.86] as const;

export function OpportunityGauge({ score }: OpportunityGaugeProps) {
  const clampedScore = Math.min(Math.max(score ?? 0, 0), 100);
  const filledSegments = Math.ceil((clampedScore / 100) * 5);

  return (
    <div className="flex gap-1">
      {SEGMENT_OPACITY.map((opacity, i) => (
        <div
          key={i}
          className="h-1.5 flex-1 rounded-sm"
          style={{
            backgroundColor:
              i < filledSegments
                ? `color-mix(in srgb, var(--accent-primary) ${Math.round(opacity * 100)}%, transparent)`
                : 'var(--surface-empty)',
          }}
        />
      ))}
      <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>
        {clampedScore}
      </span>
    </div>
  );
}
