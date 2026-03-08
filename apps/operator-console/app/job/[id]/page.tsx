'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Job = {
  id: string;
  _type?: string;
  jobType: string;
  status: string;
  priority?: number;
  attempts?: number;
  nextAttemptAt?: string | null;
  updatedAt?: string;
  error?: string | null;
  result?: unknown;
};

export default function JobPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing job id');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/console/job/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error?.message || data?.error || 'Failed to load job');
          setJob(null);
          return;
        }
        const raw = data?.data?.job ?? data?.job;
        setJob(raw ? { id: raw.id || raw._id, _type: raw._type, jobType: raw.jobType, status: raw.status, priority: raw.priority, attempts: raw.attempts, nextAttemptAt: raw.nextAttemptAt, updatedAt: raw.updatedAt, error: raw.error, result: raw.result } : null);
        setError(null);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load job');
          setJob(null);
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
          <p className="text-[var(--muted)]">Loading job…</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--text)] p-6">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">← Back to console</Link>
          <p className="mt-4 text-[var(--danger)]">{error || 'Job not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)] p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/" className="text-sm text-[var(--accent)] hover:underline">← Back to console</Link>

        <div className="card rounded-[var(--card-radius)] p-6">
          <h1 className="text-xl font-semibold text-[var(--text)]">Job: {job.jobType}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{job.id}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
              job.status === 'done' ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20' :
              job.status === 'failed' ? 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger)]/20' :
              'bg-[var(--surface-muted)] text-[var(--muted)] border-[var(--border)]'
            }`}>
              {job.status}
            </span>
            {job.priority != null && <span className="text-xs text-[var(--muted)]">Priority: {job.priority}</span>}
            {job.attempts != null && <span className="text-xs text-[var(--muted)]">Attempts: {job.attempts}</span>}
          </div>
          {job.updatedAt && <p className="mt-2 text-xs text-[var(--muted)]">Updated {new Date(job.updatedAt).toLocaleString()}</p>}
        </div>

        {job.error && (
          <div className="card rounded-[var(--card-radius)] p-6 border-[var(--danger)]/30 bg-[var(--danger-bg)]">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--danger)] mb-2">Error</h2>
            <pre className="text-sm text-[var(--danger)] whitespace-pre-wrap break-words">{job.error}</pre>
          </div>
        )}

        {job.result != null && (
          <div className="card rounded-[var(--card-radius)] p-6">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--muted)] mb-3">Result / output</h2>
            <pre className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]">
              {typeof job.result === 'string' ? job.result : JSON.stringify(job.result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
