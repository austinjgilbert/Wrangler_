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
          textDecorationColor: 'var(--accent-primary-underline)',
        }}
      >
        {name}
      </span>
    </Link>
  );
}
