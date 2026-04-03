'use client';

import { useState } from 'react';
import { useSnapshot } from '../layout';
import {
  FileText,
  Clock,
  Edit3,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function timeSince(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── Research Page ─────────────────────────────────────────────────────── */

export default function ResearchPage() {
  const { snapshot } = useSnapshot();
  const [tab, setTab] = useState<'briefs' | 'drafts'>('briefs');
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);

  if (!snapshot) return null;

  const briefs = snapshot.research?.briefs ?? [];
  const drafts = snapshot.research?.drafts ?? [];

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-[var(--text)]">Research</h1>
        <p className="text-[13px] text-[var(--muted)] mt-1">
          Intelligence briefs and draft communications
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        <button
          onClick={() => setTab('briefs')}
          className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
            tab === 'briefs'
              ? 'text-[var(--accent)] border-[var(--accent)]'
              : 'text-[var(--muted)] border-transparent hover:text-[var(--text)]'
          }`}
        >
          Briefs ({briefs.length})
        </button>
        <button
          onClick={() => setTab('drafts')}
          className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
            tab === 'drafts'
              ? 'text-[var(--accent)] border-[var(--accent)]'
              : 'text-[var(--muted)] border-transparent hover:text-[var(--text)]'
          }`}
        >
          Drafts ({drafts.length})
        </button>
      </div>

      {/* Content */}
      {tab === 'briefs' ? (
        <div className="space-y-4">
          {briefs.length > 0 ? (
            briefs.map((b) => (
              <div key={b.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedBrief(expandedBrief === b.id ? null : b.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--card-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText size={14} className="text-[var(--highlight)] shrink-0" />
                    <div className="text-left">
                      <p className="text-[13px] font-medium text-[var(--text)]">
                        Daily Brief — {new Date(b.date).toLocaleDateString()}
                      </p>
                      <p className="text-[11px] text-[var(--muted)] mt-0.5">
                        {b.topActions?.length || 0} top actions
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`text-[var(--muted)] transition-transform ${
                      expandedBrief === b.id ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {expandedBrief === b.id && (
                  <div className="px-4 py-4 border-t border-[var(--border-subtle)]">
                    <div className="prose prose-sm max-w-none text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                      {b.summaryMarkdown}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="card px-4 py-12 text-center">
              <FileText size={20} className="text-[var(--muted)] mx-auto mb-2" />
              <p className="text-[13px] text-[var(--muted)]">No briefs generated yet</p>
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {drafts.length > 0 ? (
            drafts.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--card-hover)] transition-colors"
              >
                <Edit3 size={14} className="text-[var(--accent-secondary)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[var(--text)] truncate">{d.subject}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">
                    Updated {timeSince(d.updatedAt)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    d.status === 'ready'
                      ? 'bg-[var(--success)]18 text-[var(--success)]'
                      : d.status === 'sent'
                      ? 'bg-[var(--highlight)]18 text-[var(--highlight)]'
                      : 'bg-[var(--card)] text-[var(--muted)]'
                  }`}
                >
                  {d.status}
                </span>
              </div>
            ))
          ) : (
            <div className="px-4 py-12 text-center">
              <Edit3 size={20} className="text-[var(--muted)] mx-auto mb-2" />
              <p className="text-[13px] text-[var(--muted)]">No drafts yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
