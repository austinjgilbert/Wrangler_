import { OpportunityGauge } from './shared/OpportunityGauge';
import { TechPill } from './shared/TechPill';
import { AccountCardData } from './types';

interface AccountCardProps {
  data: AccountCardData;
}

export function AccountCard({ data }: AccountCardProps) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
        {data.name}
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '10px' }}>
        {data.domain}
      </p>

      <div className="mb-3">
        <OpportunityGauge score={data.opportunityScore} />
      </div>

      {data.industry && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '8px' }}>
          {data.industry}
        </p>
      )}

      {data.techStack && data.techStack.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-3">
          {data.techStack.map((tech) => (
            <TechPill key={tech} name={tech} />
          ))}
        </div>
      )}

      {data.completeness !== undefined && (
        <div className="mb-2">
          <div
            className="h-1 bg-slate-700 rounded-full overflow-hidden"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${data.completeness}%`,
                backgroundColor: 'var(--accent-primary)',
              }}
            />
          </div>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '10px', marginTop: '4px' }}>
            {data.completeness}% complete
          </p>
        </div>
      )}

      {data.lastActivity && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
          Last activity: {data.lastActivity}
        </p>
      )}
    </div>
  );
}
