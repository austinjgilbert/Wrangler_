/**
 * OutreachDetail — Expanded detail view for the Outreach module.
 *
 * Shows action candidates for the selected account, with AI-generated
 * email drafts and call angles. Uses useDocuments for candidate data
 * (Sanity direct) and workerPost for draft generation (Worker endpoint).
 *
 * Lane A dependency: POST /drafting/generate + POST /drafting/regenerate.
 * Until Lane A ships, draft generation gracefully falls back to a
 * "not yet available" state — candidates still render from Sanity.
 */

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useDocuments } from '@sanity/sdk-react';

import { workerPost, WorkerApiError } from '../../lib/adapters';
import './OutreachDetail.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface ActionCandidateDoc {
  documentId: string;
  _id?: string;
  actionType?: string;
  urgency?: string;
  opportunityScore?: number;
  confidence?: number;
  whyNow?: string;
  evidence?: string[];
  draftStatus?: string;
  recommendedNextStep?: string;
  missingData?: string[];
}

interface DraftingOutput {
  outreachAngle: string;
  personaFraming: string;
  evidenceReference: string;
  sanityPositioning: string;
  subject: string;
  shortEmailDraft: string;
  callOpeningLine: string;
  generatedAt: string;
  confidenceBreakdown?: Record<string, number>;
}

interface OutreachDetailProps {
  accountKey: string;
  accountId: string;
}

// ─── Constants ──────────────────────────────────────────────────────────

const URGENCY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#d97706',
  medium: '#2563eb',
  low: '#808088',
};

const TONE_OPTIONS = ['professional', 'consultative', 'direct', 'friendly'] as const;

// ─── Inner Component (inside Suspense) ──────────────────────────────────

function OutreachDetailInner({ accountKey, accountId }: OutreachDetailProps) {
  const { data } = useDocuments({
    documentType: 'actionCandidate',
    filter: 'account._ref == $accountId && lifecycleStatus != "dismissed"',
    params: { accountId },
    orderings: [{ field: 'opportunityScore', direction: 'desc' }],
  });

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [draft, setDraft] = useState<DraftingOutput | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'email' | 'call'>('email');
  const [tone, setTone] = useState<typeof TONE_OPTIONS[number]>('professional');
  const [feedback, setFeedback] = useState('');
  const [showRegenerate, setShowRegenerate] = useState(false);

  const candidateList = useMemo(
    () => ((data ?? []) as ActionCandidateDoc[]).filter(c => !!c.documentId),
    [data],
  );

  const selected = candidateList[selectedIdx] ?? null;

  // ── Generate Draft ──────────────────────────────────────────────────

  const generateDraft = useCallback(async (candidateId: string, isRegenerate = false) => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const endpoint = isRegenerate ? '/drafting/regenerate' : '/drafting/generate';
      const body: Record<string, unknown> = {
        actionCandidateId: candidateId,
        tone,
      };
      if (isRegenerate && feedback.trim()) {
        body.operatorFeedback = feedback.trim();
      }

      const res = await workerPost<{ data: DraftingOutput }>(endpoint, body);
      const output = (res.data as Record<string, unknown>)?.data as DraftingOutput | undefined
        ?? res.data as unknown as DraftingOutput | undefined
        ?? null;
      setDraft(output);
      setShowRegenerate(true);
      setFeedback('');
    } catch (err) {
      if (err instanceof WorkerApiError && err.status === 501) {
        setDraftError('Draft generation is not yet available. Endpoints are being deployed.');
      } else if (err instanceof WorkerApiError && err.status === 404) {
        setDraftError('This action candidate is no longer available. It may have been resolved.');
      } else {
        setDraftError('Something went wrong generating this draft. Try again in a moment.');
      }
    } finally {
      setDraftLoading(false);
    }
  }, [tone, feedback]);

  // ── Empty State ───────────────────────────────────────────────────────

  if (candidateList.length === 0) {
    return (
      <div className="outreach-detail">
        <div className="outreach-detail__empty">
          <p className="outreach-detail__empty-title">No action candidates found.</p>
          <p className="outreach-detail__empty-hint">
            Run enrichment to generate outreach opportunities for this account.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="outreach-detail">
      {/* Candidate Selector */}
      {candidateList.length > 1 && (
        <div className="outreach-detail__selector">
          <label className="outreach-detail__selector-label">Action Candidate</label>
          <div className="outreach-detail__selector-pills">
            {candidateList.map((c, i) => (
              <button
                key={c.documentId}
                className={`outreach-detail__pill ${i === selectedIdx ? 'outreach-detail__pill--active' : ''}`}
                onClick={() => { setSelectedIdx(i); setDraft(null); setShowRegenerate(false); }}
              >
                <span
                  className="outreach-detail__pill-dot"
                  style={{ backgroundColor: URGENCY_COLORS[c.urgency ?? 'low'] ?? '#808088' }}
                />
                {c.actionType ?? 'Action'} #{i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected Candidate Card */}
      {selected && (
        <div className="outreach-detail__candidate">
          <div className="outreach-detail__candidate-header">
            <span className="outreach-detail__candidate-type">{selected.actionType ?? 'Outreach'}</span>
            <span
              className="outreach-detail__urgency-badge"
              style={{ backgroundColor: URGENCY_COLORS[selected.urgency ?? 'low'] ?? '#808088' }}
            >
              {selected.urgency ?? 'low'}
            </span>
            {selected.opportunityScore != null && (
              <span className="outreach-detail__score">
                Score: {Math.round(selected.opportunityScore)}
              </span>
            )}
          </div>

          {selected.whyNow && (
            <p className="outreach-detail__why-now">{selected.whyNow}</p>
          )}

          {selected.recommendedNextStep && (
            <div className="outreach-detail__next-step">
              <span className="outreach-detail__next-step-label">Recommended next step</span>
              <p>{selected.recommendedNextStep}</p>
            </div>
          )}

          {(selected.evidence?.length ?? 0) > 0 && (
            <div className="outreach-detail__evidence">
              <span className="outreach-detail__evidence-label">Evidence</span>
              <ul className="outreach-detail__evidence-list">
                {selected.evidence!.map((e: string, i: number) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {(selected.missingData?.length ?? 0) > 0 && (
            <div className="outreach-detail__missing">
              <span className="outreach-detail__missing-label">Missing data</span>
              <ul className="outreach-detail__missing-list">
                {selected.missingData!.map((m: string, i: number) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Draft Generation */}
      {selected && (
        <div className="outreach-detail__drafting">
          <div className="outreach-detail__drafting-header">
            <h4 className="outreach-detail__drafting-title">
              {showRegenerate ? 'Generated Draft' : 'Generate Draft'}
            </h4>
            <div className="outreach-detail__tone-select">
              <label className="outreach-detail__tone-label">Tone</label>
              <select
                className="outreach-detail__tone-dropdown"
                value={tone}
                onChange={(e) => setTone(e.target.value as typeof TONE_OPTIONS[number])}
              >
                {TONE_OPTIONS.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Draft Output */}
          {draft && (
            <div className="outreach-detail__draft-output">
              <div className="outreach-detail__tabs">
                <button
                  className={`outreach-detail__tab ${activeTab === 'email' ? 'outreach-detail__tab--active' : ''}`}
                  onClick={() => setActiveTab('email')}
                >
                  Email
                </button>
                <button
                  className={`outreach-detail__tab ${activeTab === 'call' ? 'outreach-detail__tab--active' : ''}`}
                  onClick={() => setActiveTab('call')}
                >
                  Call
                </button>
              </div>

              {activeTab === 'email' ? (
                <div className="outreach-detail__email">
                  <div className="outreach-detail__field">
                    <span className="outreach-detail__field-label">Subject</span>
                    <p className="outreach-detail__field-value">{draft.subject}</p>
                  </div>
                  <div className="outreach-detail__field">
                    <span className="outreach-detail__field-label">Draft</span>
                    <p className="outreach-detail__field-value outreach-detail__field-value--body">
                      {draft.shortEmailDraft}
                    </p>
                  </div>
                  <div className="outreach-detail__field">
                    <span className="outreach-detail__field-label">Angle</span>
                    <p className="outreach-detail__field-value">{draft.outreachAngle}</p>
                  </div>
                  <div className="outreach-detail__field">
                    <span className="outreach-detail__field-label">Sanity positioning</span>
                    <p className="outreach-detail__field-value">{draft.sanityPositioning}</p>
                  </div>
                </div>
              ) : (
                <div className="outreach-detail__call">
                  <div className="outreach-detail__field">
                    <span className="outreach-detail__field-label">Opening line</span>
                    <p className="outreach-detail__field-value outreach-detail__field-value--body">
                      {draft.callOpeningLine}
                    </p>
                  </div>
                  <div className="outreach-detail__field">
                    <span className="outreach-detail__field-label">Persona framing</span>
                    <p className="outreach-detail__field-value">{draft.personaFraming}</p>
                  </div>
                  <div className="outreach-detail__field">
                    <span className="outreach-detail__field-label">Evidence reference</span>
                    <p className="outreach-detail__field-value">{draft.evidenceReference}</p>
                  </div>
                </div>
              )}

              {/* Confidence Breakdown */}
              {draft.confidenceBreakdown && Object.keys(draft.confidenceBreakdown).length > 0 && (
                <div className="outreach-detail__confidence">
                  <span className="outreach-detail__confidence-label">Confidence</span>
                  <div className="outreach-detail__confidence-bars">
                    {Object.entries(draft.confidenceBreakdown).map(([key, val]) => (
                      <div key={key} className="outreach-detail__confidence-row">
                        <span className="outreach-detail__confidence-name">{humanizeFactorName(key)}</span>
                        <div className="outreach-detail__confidence-track">
                          <div
                            className="outreach-detail__confidence-fill"
                            style={{ width: `${Math.round((val as number) * 100)}%` }}
                          />
                        </div>
                        <span className="outreach-detail__confidence-pct">
                          {Math.round((val as number) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {draftError && (
            <div className="outreach-detail__draft-error">
              <p>{draftError}</p>
            </div>
          )}

          {/* Generate / Regenerate Controls */}
          <div className="outreach-detail__draft-actions">
            {showRegenerate && (
              <div className="outreach-detail__feedback">
                <textarea
                  className="outreach-detail__feedback-input"
                  placeholder="Optional feedback for regeneration..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={2}
                />
              </div>
            )}
            <button
              className="outreach-detail__generate-btn"
              onClick={() => generateDraft(selected.documentId, showRegenerate)}
              disabled={draftLoading}
            >
              {draftLoading
                ? 'Generating...'
                : showRegenerate
                  ? 'Regenerate Draft'
                  : 'Generate Draft'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

const FACTOR_LABELS: Record<string, string> = {
  patternStrength: 'Pattern Strength',
  signalUrgency: 'Signal Urgency',
  personaInfluence: 'Persona Influence',
  techRelevance: 'Tech Relevance',
  accountPriority: 'Account Priority',
  evidenceConfidence: 'Evidence Confidence',
  recencyWeight: 'Recency',
  actionabilityWeight: 'Actionability',
};

function humanizeFactorName(key: string): string {
  return FACTOR_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}

// ─── Suspense Wrapper ───────────────────────────────────────────────────

export function OutreachDetail(props: OutreachDetailProps) {
  return (
    <Suspense
      fallback={
        <div className="outreach-detail outreach-detail--loading">
          <div className="outreach-detail__spinner" />
          <p>Loading outreach candidates…</p>
        </div>
      }
    >
      <OutreachDetailInner {...props} />
    </Suspense>
  );
}
