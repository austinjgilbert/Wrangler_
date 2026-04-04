interface TechPillProps {
  name: string;
}

export function TechPill({ name }: TechPillProps) {
  return (
    <span
      className="inline-block px-2 py-1 rounded-md text-xs font-medium"
      style={{
        backgroundColor: 'var(--accent-primary-bg)',
        color: 'var(--accent-primary)',
        border: '1px solid var(--accent-primary-border)',
      }}
    >
      {name}
    </span>
  );
}
