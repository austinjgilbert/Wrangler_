'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type DraftDoc = {
  _id?: string;
  subject?: string;
  body?: string;
  status?: string;
  accountName?: string;
  recipientName?: string;
  recipientCompany?: string;
  to?: string[];
  updatedAt?: string;
  composeUrl?: string;
};

export default function DraftPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [draft, setDraft] = useState<DraftDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing draft id');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/console/draft/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error?.message || data?.error || 'Failed to load draft');
          setDraft(null);
          return;
        }
        setDraft(data?.data?.draft ?? data?.draft ?? null);
        setError(null);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load draft');
          setDraft(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text)] p-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-[var(--muted)]">Loading draft…</p>
        </div>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text)] p-6">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">← Back to console</Link>
          <p className="mt-4 text-[var(--danger)]">{error || 'Draft not found'}</p>
        </div>
      </div>
    );
  }

  const subject = draft.subject ?? '(No subject)';
  const body = draft.body ?? '';
  const status = draft.status ?? 'draft';

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)] p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">← Back to console</Link>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)] capitalize">
            {status}
          </span>
        </div>

        <div className="card rounded-[var(--card-radius)] p-6">
          <h1 className="text-xl font-semibold text-[var(--text)]">{subject}</h1>
          {(draft.accountName || draft.recipientCompany || draft.recipientName) && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              {[draft.recipientName, draft.recipientCompany || draft.accountName].filter(Boolean).join(' · ')}
            </p>
          )}
          {draft.updatedAt && (
            <p className="mt-1 text-xs text-[var(--muted)]">Updated {new Date(draft.updatedAt).toLocaleString()}</p>
          )}
        </div>

        <div className="card rounded-[var(--card-radius)] p-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--muted)] mb-3">Body</h2>
          <div
            className="prose prose-sm max-w-none text-[var(--text)]"
            dangerouslySetInnerHTML={{ __html: body ? body.replace(/\n/g, '<br />') : '<p class="text-[var(--muted)]">No body.</p>' }}
          />
        </div>

        {draft.composeUrl && (
          <a
            href={draft.composeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pill inline-flex"
          >
            Open in Gmail →
          </a>
        )}
      </div>
    </div>
  );
}
