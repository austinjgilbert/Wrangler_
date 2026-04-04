import Link from 'next/link';

interface EntityLinkProps {
  name: string;
  href?: string;
}

export function EntityLink({ name, href }: EntityLinkProps) {
  if (!href) {
    return (
      <span style={{ color: 'var(--text-primary)' }}>{name}</span>
    );
  }

  return (
    <Link href={href}>
      <span
        style={{
          color: 'var(--accent-primary)',
          cursor: 'pointer',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(240, 62, 47, 0.3)',
        }}
      >
        {name}
      </span>
    </Link>
  );
}
