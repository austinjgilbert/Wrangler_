interface TechPillProps {
  name: string;
}

export function TechPill({ name }: TechPillProps) {
  return (
    <span
      className="inline-block px-2 py-1 rounded-md text-xs font-medium"
      style={{
        backgroundColor: 'rgba(240, 62, 47, 0.1)',
        color: 'var(--accent-primary)',
        border: '1px solid rgba(240, 62, 47, 0.2)',
      }}
    >
      {name}
    </span>
  );
}
