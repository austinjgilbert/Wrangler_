import { SignalBadge } from './shared/SignalBadge';
import { EntityLink } from './shared/EntityLink';
import { SignalCardData } from './types';

interface SignalCardProps {
  data: SignalCardData;
}

function getRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function SignalCard({ data }: SignalCardProps) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <SignalBadge type={data.signalType} strength={data.strength} />
        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
          {getRelativeTime(data.timestamp)}
        </span>
      </div>

      {data.summary && (
        <p style={{ color: 'var(--text-primary)', fontSize: '12px', marginBottom: '8px' }}>
          {data.summary}
        </p>
      )}

      {data.source && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '10px', marginBottom: '8px' }}>
          Source: {data.source}
        </p>
      )}

      {data.accountName && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
          Account:{' '}
          <EntityLink
            name={data.accountName}
            href={data.accountId ? `/accounts/${data.accountId}` : undefined}
          />
        </p>
      )}
    </div>
  );
}
