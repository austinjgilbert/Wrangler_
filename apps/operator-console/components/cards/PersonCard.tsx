import { SeniorityBadge } from './shared/SeniorityBadge';
import { EntityLink } from './shared/EntityLink';
import { PersonCardData } from './types';

interface PersonCardProps {
  data: PersonCardData;
}

export function PersonCard({ data }: PersonCardProps) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
        {data.name}
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '10px' }}>
        {data.title}
      </p>

      {data.company && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '8px' }}>
          {data.company}
        </p>
      )}

      <div className="flex items-center gap-2 mb-3">
        {data.seniority && <SeniorityBadge level={data.seniority} />}
      </div>

      {data.linkedin && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '8px' }}>
          <EntityLink name="LinkedIn Profile" href={data.linkedin} />
        </p>
      )}

      {data.email && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
          {data.email}
        </p>
      )}

      {data.recentSignals !== undefined && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '10px', marginTop: '8px' }}>
          {data.recentSignals} recent signals
        </p>
      )}
    </div>
  );
}
