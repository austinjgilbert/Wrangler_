import { PriorityIndicator } from './shared/PriorityIndicator';
import { EntityLink } from './shared/EntityLink';
import { ActionCardData } from './types';

interface ActionCardProps {
  data: ActionCardData;
}

export function ActionCard({ data }: ActionCardProps) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-start gap-2 mb-3">
        <PriorityIndicator urgency={data.urgency} />
        <div className="flex-1">
          <h3 style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600' }}>
            {data.actionType}
          </h3>
        </div>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '10px' }}>
        {data.whyNow}
      </p>

      {data.evidence && data.evidence.length > 0 && (
        <ul style={{ marginBottom: '10px', marginLeft: '16px' }}>
          {data.evidence.map((item, idx) => (
            <li
              key={idx}
              style={{
                color: 'var(--text-tertiary)',
                fontSize: '11px',
                listStyleType: 'disc',
                marginBottom: '4px',
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-4 text-11px">
        {data.accountName && (
          <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
            <EntityLink
              name={data.accountName}
              href={data.accountId ? `/accounts/${data.accountId}` : undefined}
            />
          </span>
        )}
        {data.personName && (
          <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
            {data.personName}
          </span>
        )}
      </div>
    </div>
  );
}
