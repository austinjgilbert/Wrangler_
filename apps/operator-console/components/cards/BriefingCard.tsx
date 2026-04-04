import { BriefingCardData } from './types';

interface BriefingCardProps {
  data: BriefingCardData;
}

export function BriefingCard({ data }: BriefingCardProps) {
  const urgencyColors = {
    high: 'var(--status-error)',
    medium: 'var(--status-warning)',
    low: 'var(--status-success)',
  };

  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <h2 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
        {data.date}
      </h2>

      <div className="mb-4">
        <h3 style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '500', marginBottom: '8px' }}>
          Top Actions
        </h3>
        {data.topActions.map((action, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 mb-2"
            style={{ paddingLeft: '8px', borderLeft: `2px solid ${urgencyColors[action.urgency as keyof typeof urgencyColors]}` }}
          >
            <div>
              <p style={{ color: 'var(--text-primary)', fontSize: '11px', fontWeight: '500' }}>
                {action.action}
              </p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                {action.account}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <h3 style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '500', marginBottom: '8px' }}>
          Overnight Signals
        </h3>
        {data.overnightSignals.map((signal, idx) => (
          <div key={idx} className="mb-2" style={{ paddingLeft: '8px' }}>
            <p style={{ color: 'var(--text-primary)', fontSize: '11px', fontWeight: '500' }}>
              {signal.type}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
              {signal.account}: {signal.summary}
            </p>
          </div>
        ))}
      </div>

      {data.stats && (
        <div className="flex gap-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{data.stats.accounts}</span> accounts
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{data.stats.signals}</span> signals
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{data.stats.actions}</span> actions
          </div>
        </div>
      )}
    </div>
  );
}
