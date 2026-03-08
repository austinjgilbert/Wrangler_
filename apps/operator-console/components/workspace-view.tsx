'use client';

import { useCallback, useState } from 'react';
import type { ConsoleSnapshot } from '@/lib/types';

const STAGES: Array<'new' | 'researching' | 'outreach' | 'won'> = ['new', 'researching', 'outreach', 'won'];

type OpportunityItem = {
  actionCandidateId: string;
  accountId: string | null;
  accountName: string;
  personName: string | null;
  signal: string;
  pattern: string;
  confidence: number;
  action: string;
  whyNow: string;
  draftReady: boolean;
};

function OpportunityBrief(props: { item: OpportunityItem }) {
  const { item } = props;
  return (
    <div className="card rounded-lg p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Opportunity brief</div>
      <div className="mt-2 space-y-2 text-sm">
        <div>
          <span className="text-[var(--muted)]">Signals:</span> {item.signal}
        </div>
        <div>
          <span className="text-[var(--muted)]">Pattern:</span> {item.pattern}
        </div>
        <div>
          <span className="text-[var(--muted)]">Recommended persona:</span> {item.personName || '—'}
        </div>
        <div>
          <span className="text-[var(--muted)]">Suggested angle:</span> {item.whyNow}
        </div>
        <div>
          <span className="text-[var(--muted)]">Confidence:</span> {item.confidence}%
        </div>
      </div>
    </div>
  );
}

export function WorkspaceView(props: {
  snapshot: ConsoleSnapshot;
  onOpenAccount: (accountId: string | null) => void;
  onCommand: (command: string) => Promise<void>;
  opportunityStages: Record<string, 'new' | 'researching' | 'outreach' | 'won'>;
  setOpportunityStages: (value: Record<string, 'new' | 'researching' | 'outreach' | 'won'> | ((prev: Record<string, 'new' | 'researching' | 'outreach' | 'won'>) => Record<string, 'new' | 'researching' | 'outreach' | 'won'>)) => void;
  activityLog: Array<{ id: string; type: string; label: string; at: string }>;
  appendActivity: (type: string, label: string) => void;
}) {
  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityItem | null>(null);
  const [detailTab, setDetailTab] = useState<'signals' | 'patterns' | 'people' | 'brief' | 'drafts' | 'activity'>('brief');

  const opportunities = props.snapshot.overview.opportunityRadar.map((o) => ({
    actionCandidateId: o.actionCandidateId,
    accountId: o.accountId,
    accountName: o.accountName,
    personName: o.personName,
    signal: o.signal,
    pattern: o.pattern,
    confidence: o.confidence,
    action: o.action,
    whyNow: o.whyNow,
    draftReady: o.draftReady,
  }));

  const getStage = useCallback(
    (id: string) => props.opportunityStages[id] ?? 'new',
    [props.opportunityStages]
  );

  const setStage = useCallback(
    (id: string, stage: 'new' | 'researching' | 'outreach' | 'won') => {
      props.setOpportunityStages((prev) => ({ ...prev, [id]: stage }));
      props.appendActivity('opportunity_moved', `${id} → ${stage}`);
    },
    [props]
  );

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('opportunityId', id);
  };

  const handleDrop = (e: React.DragEvent, stage: 'new' | 'researching' | 'outreach' | 'won') => {
    e.preventDefault();
    const id = e.dataTransfer.getData('opportunityId');
    if (id) setStage(id, stage);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const byStage = STAGES.map((stage) => ({
    stage,
    items: opportunities.filter((o) => getStage(o.actionCandidateId) === stage),
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] pb-4">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Operator Workspace</div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Workspace</h1>
        <p className="text-sm text-[var(--text-secondary)]">Manage opportunities through stages. Drag cards between columns.</p>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4">
        {byStage.map(({ stage, items }) => (
          <div
            key={stage}
            className="card flex flex-col rounded-[var(--card-radius)] p-3"
            onDrop={(e) => handleDrop(e, stage)}
            onDragOver={handleDragOver}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold capitalize text-[var(--text)]">{stage}</span>
              <span className="rounded-full bg-[var(--panel)] px-2 py-0.5 text-xs text-[var(--muted)]">
                {items.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.actionCandidateId}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.actionCandidateId)}
                  className="cursor-grab rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 active:cursor-grabbing"
                >
                  <div className="font-medium text-[var(--text)]">{item.accountName}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {item.pattern} · {item.confidence}%
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedOpportunity(item)}
                      className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--card-hover)]"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        props.onOpenAccount(item.accountId);
                        props.appendActivity('open_account', item.accountName);
                      }}
                      className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--card-hover)]"
                    >
                      Account
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        props.appendActivity('generate_outreach', item.accountName);
                        void props.onCommand('generate sdr actions');
                      }}
                      className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--card-hover)]"
                    >
                      Outreach
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedOpportunity && (
        <div className="card fixed right-6 top-24 z-10 flex max-h-[calc(100vh-8rem)] w-[420px] flex-col rounded-[var(--card-radius)] border-2 border-[var(--accent)]/30 bg-[var(--panel)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
            <h2 className="text-lg font-semibold text-[var(--text)]">{selectedOpportunity.accountName} opportunity</h2>
            <button
              type="button"
              onClick={() => setSelectedOpportunity(null)}
              className="rounded p-1 text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--text)]"
            >
              ×
            </button>
          </div>
          <div className="flex border-b border-[var(--border)] gap-2 overflow-x-auto px-4 py-2">
            {(['brief', 'signals', 'patterns', 'people', 'drafts', 'activity'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDetailTab(tab)}
                className={`shrink-0 rounded px-3 py-1.5 text-xs font-medium capitalize ${
                  detailTab === tab ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {detailTab === 'brief' && <OpportunityBrief item={selectedOpportunity} />}
            {detailTab === 'signals' && (
              <div className="text-sm text-[var(--muted)]">
                <p>Signal: {selectedOpportunity.signal}</p>
                <p className="mt-2">From opportunity radar. Full signal history on account view.</p>
              </div>
            )}
            {detailTab === 'patterns' && (
              <div className="text-sm text-[var(--muted)]">
                <p>Pattern: {selectedOpportunity.pattern}</p>
              </div>
            )}
            {detailTab === 'people' && (
              <div className="text-sm text-[var(--muted)]">
                <p>Persona: {selectedOpportunity.personName || '—'}</p>
              </div>
            )}
            {detailTab === 'drafts' && (
              <div className="text-sm text-[var(--muted)]">
                {props.snapshot.research.drafts.filter(
                  (d) => d.actionCandidateId === selectedOpportunity.actionCandidateId
                ).length > 0 ? (
                  <ul className="space-y-2">
                    {props.snapshot.research.drafts
                      .filter((d) => d.actionCandidateId === selectedOpportunity.actionCandidateId)
                      .map((d) => (
                        <li key={d.id}>
                          <a href={`/draft/${d.id}`} className="text-[var(--accent)] hover:underline">
                            {d.subject}
                          </a>
                          <span className="ml-2 text-xs">({d.status})</span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p>No drafts linked yet.</p>
                )}
              </div>
            )}
            {detailTab === 'activity' && (
              <div className="space-y-2 text-sm">
                {props.activityLog.length === 0 ? (
                  <p className="text-[var(--muted)]">No activity yet.</p>
                ) : (
                  props.activityLog.slice(0, 20).map((a) => (
                    <div key={a.id} className="flex gap-2 border-b border-[var(--border-subtle)] pb-2">
                      <span className="shrink-0 text-xs text-[var(--muted)]">
                        {new Date(a.at).toLocaleTimeString()}
                      </span>
                      <span className="text-[var(--text)]">{a.label}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 border-t border-[var(--border)] p-4">
            <button
              type="button"
              onClick={() => props.onOpenAccount(selectedOpportunity.accountId)}
              className="pill flex-1"
            >
              Open account
            </button>
            <button
              type="button"
              onClick={() => void props.onCommand('generate sdr actions')}
              className="pill flex-1"
            >
              Generate outreach
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
