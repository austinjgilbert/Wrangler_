'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Brief = {
  id: string;
  _type?: string;
  title: string;
  summary: string;
  summaryMarkdown?: string;
  date?: string;
  generatedAt?: string;
  topActions?: Array<Record<string, unknown>>;
};

export default function ResearchPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing brief id');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/console/brief/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error?.message || data?.error || 'Failed to load brief');
          setBrief(null);
          return;
        }
        const raw = data?.data?.brief ?? data?.brief;
        setBrief(raw ? { id: raw.id || raw._id, _type: raw._type, title: raw.title || 'Brief', summary: raw.summary || '', summaryMarkdown: raw.summaryMarkdown, date: raw.date, generatedAt: raw.generatedAt, topActions: raw.topActions || [] } : null);
        setError(null);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load brief');
          setBrief(null);
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
          <p className="text-[var(--muted)]">Loading research brief…</p>
        </div>
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text)] p-6">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">← Back to console</Link>
          <p className="mt-4 text-[var(--danger)]">{error || 'Brief not found'}</p>
        </div>
      </div>
    );
  }

  const content = brief.summaryMarkdown || brief.summary || '';

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)] p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/" className="text-sm text-[var(--accent)] hover:underline">← Back to console</Link>

        <div className="card rounded-[var(--card-radius)] p-6">
          <h1 className="text-xl font-semibold text-[var(--text)]">{brief.title}</h1>
          {(brief.date || brief.generatedAt) && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              {brief.date || (brief.generatedAt ? new Date(brief.generatedAt).toLocaleDateString() : '')}
            </p>
          )}
        </div>

        <div className="card rounded-[var(--card-radius)] p-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--muted)] mb-3">Summary</h2>
          <div className="prose prose-sm max-w-none text-[var(--text)] whitespace-pre-wrap">{content}</div>
        </div>

        {brief.topActions && brief.topActions.length > 0 && (
          <div className="card rounded-[var(--card-radius)] p-6">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--muted)] mb-3">Top actions</h2>
            <ul className="space-y-2 text-sm text-[var(--text)]">
              {brief.topActions.slice(0, 10).map((action: any, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[var(--muted)]">{i + 1}.</span>
                  <span>{action.action || action.summary || JSON.stringify(action)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
