/**
 * Thread-to-Action Bridge — Phase 4
 *
 * Evaluates intelligence threads for actionability and generates
 * outreach drafts when confidence thresholds are met.
 *
 * Storage: Cloudflare KV (MOLTBOOK_ACTIVITY_KV)
 * Key pattern: action:{id}, action:index:pending
 *
 * Flow:
 *   watchThreads detects new signals → evaluateThreadsForAction scans active threads →
 *   LLM scores actionability → generateActionDraft creates outreach → stored in KV →
 *   Telegram push for operator approval → operator approves/rejects via API
 */

import { callLlm } from './llm.ts';
import { fetchActiveThreads, fetchThread, appendToThread } from './intelligenceThreads.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ThreadAction {
  _id: string;
  threadId: string;
  threadTitle: string;
  accountNames: string[];
  accountRefs: string[];
  actionType: 'outreach_email' | 'call_prep' | 'research_deep_dive' | 'escalate_to_ae';
  urgency: 'high' | 'medium' | 'low';
  confidence: number;
  whyNow: string;
  evidence: string[];
  draft: ActionDraft | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'executed' | 'expired';
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  expiresAt: string;
}

interface ActionDraft {
  subject: string;
  body: string;
  callOpeningLine: string;
  outreachAngle: string;
  personaFraming: string;
  evidenceReference: string;
}

interface ActionEvaluation {
  shouldAct: boolean;
  actionType: ThreadAction['actionType'];
  urgency: ThreadAction['urgency'];
  confidence: number;
  whyNow: string;
  evidence: string[];
}

interface ActionIndexEntry {
  _id: string;
  threadId: string;
  threadTitle: string;
  actionType: string;
  urgency: string;
  status: string;
  createdAt: string;
  accountNames: string[];
}

// ─── KV Helpers ─────────────────────────────────────────────────────────────

function getKV(env: any) {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (!kv) throw new Error('MOLTBOOK_ACTIVITY_KV binding not available');
  return kv;
}

async function kvPutAction(kv: any, action: ThreadAction): Promise<void> {
  // Actions expire after 7 days
  await kv.put(`action:${action._id}`, JSON.stringify(action), { expirationTtl: 604800 });
}

async function kvGetAction(kv: any, actionId: string): Promise<ThreadAction | null> {
  const raw = await kv.get(`action:${actionId}`);
  return raw ? JSON.parse(raw) : null;
}

async function kvUpdateActionIndex(kv: any, action: ThreadAction): Promise<void> {
  const raw = await kv.get('action:index:pending');
  const entries: ActionIndexEntry[] = raw ? JSON.parse(raw) : [];

  const entry: ActionIndexEntry = {
    _id: action._id,
    threadId: action.threadId,
    threadTitle: action.threadTitle,
    actionType: action.actionType,
    urgency: action.urgency,
    status: action.status,
    createdAt: action.createdAt,
    accountNames: action.accountNames,
  };

  const idx = entries.findIndex(e => e._id === action._id);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }

  // Cap at 100, remove oldest
  const sorted = entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const capped = sorted.slice(0, 100);

  await kv.put('action:index:pending', JSON.stringify(capped), { expirationTtl: 604800 });
}

// ─── Cleanup Helpers (Fix 4) ────────────────────────────────────────────────

/**
 * Prunes the action index of entries older than 7 days.
 * Called before evaluation to keep the index lean and avoid tracking expired actions.
 */
async function cleanupExpiredActions(kv: any): Promise<number> {
  const raw = await kv.get('action:index:pending');
  const entries: ActionIndexEntry[] = raw ? JSON.parse(raw) : [];

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const filtered = entries.filter(entry => {
    const createdTime = new Date(entry.createdAt);
    return createdTime > sevenDaysAgo;
  });

  const removed = entries.length - filtered.length;

  if (removed > 0) {
    await kv.put('action:index:pending', JSON.stringify(filtered), { expirationTtl: 604800 });
    console.log(`[threadActionBridge] cleaned up ${removed} expired action index entries`);
  }

  return removed;
}

// ─── Action Evaluation (LLM-scored) ────────────────────────────────────────

async function evaluateThreadActionability(
  env: any,
  thread: { _id: string; title: string; query: string; status: string; accountNames: string[]; accountRefs: Array<{ _ref: string }>; entries: Array<{ timestamp: string; source: string; content: string }>; signalWatch: string[]; summary?: string },
): Promise<ActionEvaluation> {
  // Skip threads that are stale or already have recent actions
  if (thread.status !== 'active') {
    return { shouldAct: false, actionType: 'research_deep_dive', urgency: 'low', confidence: 0, whyNow: '', evidence: [] };
  }

  // Need at least 3 entries to have enough intelligence
  if (thread.entries.length < 3) {
    return { shouldAct: false, actionType: 'research_deep_dive', urgency: 'low', confidence: 0, whyNow: '', evidence: [] };
  }

  const recentEntries = thread.entries.slice(-15);
  const entriesSummary = recentEntries
    .map(e => `[${e.timestamp}] (${e.source}) ${e.content}`)
    .join('\n');

  const hasLlm = !!(env.LLM_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
  if (!hasLlm) {
    // Without LLM, use heuristic: 5+ entries with signal sources = medium confidence
    const signalEntries = thread.entries.filter(e => e.source === 'signal');
    if (signalEntries.length >= 3) {
      return {
        shouldAct: true,
        actionType: 'research_deep_dive',
        urgency: 'medium',
        confidence: 0.5,
        whyNow: `${signalEntries.length} signals accumulated across ${thread.accountNames.join(', ')}`,
        evidence: signalEntries.slice(-3).map(e => e.content),
      };
    }
    return { shouldAct: false, actionType: 'research_deep_dive', urgency: 'low', confidence: 0, whyNow: '', evidence: [] };
  }

  try {
    const result = await callLlm(env, [
      {
        role: 'system',
        content: `You evaluate intelligence investigation threads to decide if they contain enough evidence to take action. You are a sales intelligence analyst working for a CMS company (Sanity.io).

Return valid JSON only with these keys:
- "shouldAct": boolean — true if there's enough signal convergence to justify outreach or escalation
- "actionType": one of "outreach_email", "call_prep", "research_deep_dive", "escalate_to_ae"
- "urgency": "high" (act today), "medium" (act this week), "low" (can wait)
- "confidence": 0-1 score for how confident you are in the recommendation
- "whyNow": 1-2 sentence explanation of why this is the right time to act
- "evidence": array of 2-4 key facts from the thread that support the action

Rules:
- "outreach_email": use when there's clear buying signal or tech change + identifiable contact
- "call_prep": use when there's an upcoming meeting or warm relationship signal
- "escalate_to_ae": use when the opportunity is large or complex enough for an account executive
- "research_deep_dive": use when signals are interesting but insufficient for outreach
- Confidence below 0.4 → shouldAct = false
- Need at least 2 independent signal sources to recommend outreach`,
      },
      {
        role: 'user',
        content: `Evaluate this intelligence thread for actionability:

Thread: "${thread.title}"
Original query: ${thread.query}
Accounts: ${thread.accountNames.join(', ') || 'none identified'}
Signal types watched: ${thread.signalWatch.join(', ') || 'none'}
Entry count: ${thread.entries.length}
${thread.summary ? `Current summary: ${thread.summary}` : ''}

Recent entries:
${entriesSummary}`,
      },
    ], { maxTokens: 500, temperature: 0.1, json: true });

    // FIX 1: Separate try/catch for JSON parsing with specific error handling
    let parsed: any;
    try {
      parsed = JSON.parse(result.content);
    } catch (parseErr: any) {
      const contentPreview = result.content.substring(0, 200);
      console.warn(`[threadActionBridge] JSON parse failed for evaluation. Raw content (first 200 chars): ${contentPreview}`);
      // Fall back to heuristic evaluation instead of returning shouldAct=false
      const signalEntries = thread.entries.filter(e => e.source === 'signal');
      if (signalEntries.length >= 3) {
        return {
          shouldAct: true,
          actionType: 'research_deep_dive',
          urgency: 'medium',
          confidence: 0.4,
          whyNow: `${signalEntries.length} signals accumulated; LLM parsing failed, using heuristic`,
          evidence: signalEntries.slice(-3).map(e => e.content),
        };
      }
      return { shouldAct: false, actionType: 'research_deep_dive', urgency: 'low', confidence: 0, whyNow: '', evidence: [] };
    }

    return {
      shouldAct: parsed.shouldAct === true && (parsed.confidence ?? 0) >= 0.4,
      actionType: parsed.actionType || 'research_deep_dive',
      urgency: parsed.urgency || 'low',
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0)),
      whyNow: parsed.whyNow || '',
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
    };
  } catch (err: any) {
    console.warn('[threadActionBridge] evaluation LLM call failed:', err?.message);
    return { shouldAct: false, actionType: 'research_deep_dive', urgency: 'low', confidence: 0, whyNow: '', evidence: [] };
  }
}

// ─── Draft Generation ─────────────────────────────────────────────────────────

async function generateActionDraft(
  env: any,
  thread: { title: string; query: string; accountNames: string[]; entries: Array<{ timestamp: string; source: string; content: string }>; summary?: string },
  evaluation: ActionEvaluation,
): Promise<ActionDraft | null> {
  if (evaluation.actionType === 'research_deep_dive') return null;

  const hasLlm = !!(env.LLM_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
  if (!hasLlm) return null;

  try {
    const result = await callLlm(env, [
      {
        role: 'system',
        content: `You are an SDR outreach specialist at Sanity.io, a headless CMS platform. Generate a personalized outreach draft based on intelligence gathered about a prospect.

Return valid JSON only with these keys:
- "subject": email subject line (under 60 chars, specific, no hype)
- "body": short email body (under 120 words, conversational, references specific evidence)
- "callOpeningLine": phone opening if we call instead (1-2 sentences)
- "outreachAngle": the strategic angle for this outreach (1 sentence)
- "personaFraming": how we're positioning for this person's role (1 sentence)
- "evidenceReference": the key evidence that makes this timely (1 sentence)

Rules:
- Reference specific signals, technologies, or changes detected
- No generic "I noticed you're doing great things" filler
- Connect their situation to a Sanity capability
- Keep it human, short, consultative
- Never fabricate facts not in the evidence`,
      },
      {
        role: 'user',
        content: `Generate outreach for this opportunity:

Thread: "${thread.title}"
Accounts: ${thread.accountNames.join(', ')}
Why now: ${evaluation.whyNow}
Evidence: ${evaluation.evidence.join('; ')}
${thread.summary ? `Thread summary: ${thread.summary}` : ''}

Recent intelligence:
${thread.entries.slice(-10).map(e => `[${e.source}] ${e.content}`).join('\n')}`,
      },
    ], { maxTokens: 800, temperature: 0.3, json: true });

    const parsed = JSON.parse(result.content);
    return {
      subject: parsed.subject || '',
      body: parsed.body || '',
      callOpeningLine: parsed.callOpeningLine || '',
      outreachAngle: parsed.outreachAngle || '',
      personaFraming: parsed.personaFraming || '',
      evidenceReference: parsed.evidenceReference || '',
    };
  } catch (err: any) {
    console.warn('[threadActionBridge] draft generation failed:', err?.message);
    return null;
  }
}

// ─── Telegram Notification ──────────────────────────────────────────────────

async function pushActionToTelegram(env: any, action: ThreadAction): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const urgencyEmoji = action.urgency === 'high' ? '🔴' : action.urgency === 'medium' ? '🟡' : '🟢';
  const typeLabel = action.actionType.replace(/_/g, ' ');

  const lines = [
    `${urgencyEmoji} <b>Action Ready: ${typeLabel}</b>`,
    `Thread: ${action.threadTitle}`,
    `Accounts: ${action.accountNames.join(', ')}`,
    `Confidence: ${Math.round(action.confidence * 100)}%`,
    `Why now: ${action.whyNow}`,
  ];

  if (action.draft) {
    lines.push('', `<b>Draft subject:</b> ${action.draft.subject}`);
    lines.push(`<b>Angle:</b> ${action.draft.outreachAngle}`);
  }

  lines.push('', `ID: <code>${action._id}</code>`);

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Core Pipeline ──────────────────────────────────────────────────────────

/**
 * Scans active threads and generates actions for any that meet confidence thresholds.
 * Called from the 15-min cron cycle or manually from the operator console.
 */
export async function evaluateThreadsForAction(env: any): Promise<{
  threadsEvaluated: number;
  actionsCreated: number;
  actions: Array<{ actionId: string; threadTitle: string; actionType: string; urgency: string; confidence: number }>;
}> {
  const kv = getKV(env);

  // FIX 4: Run cleanup before evaluation to prune expired entries
  await cleanupExpiredActions(kv).catch(err => {
    console.warn('[threadActionBridge] cleanup failed:', err?.message);
  });

  const threads = await fetchActiveThreads(env);
  const results: Array<{ actionId: string; threadTitle: string; actionType: string; urgency: string; confidence: number }> = [];

  // Check existing actions to avoid duplicates
  const existingRaw = await kv.get('action:index:pending');
  const existingActions: ActionIndexEntry[] = existingRaw ? JSON.parse(existingRaw) : [];
  const activeThreadsWithActions = new Set(
    existingActions
      .filter(a => a.status === 'pending_review' || a.status === 'approved')
      .map(a => a.threadId),
  );

  // Limit to 5 evaluations per cycle to control LLM costs
  let evaluated = 0;
  const MAX_EVALUATIONS_PER_CYCLE = 5;

  for (const thread of threads) {
    if (evaluated >= MAX_EVALUATIONS_PER_CYCLE) break;

    // Skip threads that already have pending/approved actions
    if (activeThreadsWithActions.has(thread._id)) continue;

    evaluated++;
    const evaluation = await evaluateThreadActionability(env, thread);

    if (!evaluation.shouldAct) continue;

    // Generate draft for outreach/call types
    const draft = await generateActionDraft(env, thread, evaluation);

    const actionId = `action.${thread._id.replace(/^molt\.thread\./, '')}.${Date.now().toString(36)}`;
    const action: ThreadAction = {
      _id: actionId,
      threadId: thread._id,
      threadTitle: thread.title,
      accountNames: thread.accountNames,
      accountRefs: thread.accountRefs.map(r => r._ref),
      actionType: evaluation.actionType,
      urgency: evaluation.urgency,
      confidence: evaluation.confidence,
      whyNow: evaluation.whyNow,
      evidence: evaluation.evidence,
      draft,
      status: 'pending_review',
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    await kvPutAction(kv, action);
    await kvUpdateActionIndex(kv, action);

    // FIX 3: Keep source as 'action-bridge' (consistent source string for the cron evaluation append)
    await appendToThread(env, thread._id, {
      source: 'action-bridge',
      content: `Action generated: ${evaluation.actionType} (${evaluation.urgency} urgency, ${Math.round(evaluation.confidence * 100)}% confidence). ${evaluation.whyNow}`,
    }).catch(() => null);

    // Push to Telegram
    await pushActionToTelegram(env, action).catch(() => null);

    results.push({
      actionId,
      threadTitle: thread.title,
      actionType: evaluation.actionType,
      urgency: evaluation.urgency,
      confidence: evaluation.confidence,
    });
  }

  return {
    threadsEvaluated: evaluated,
    actionsCreated: results.length,
    actions: results,
  };
}

// ─── API Handlers ───────────────────────────────────────────────────────────

/** GET /operator/console/actions — list pending actions, ranked by priority */
export async function fetchPendingActions(env: any): Promise<ActionIndexEntry[]> {
  const kv = getKV(env);
  const raw = await kv.get('action:index:pending');
  const entries: ActionIndexEntry[] = raw ? JSON.parse(raw) : [];

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Filter expired and non-pending, then rank by urgency × recency
  const urgencyWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return entries
    .filter(e => {
      if (e.status !== 'pending_review') return false;
      return new Date(e.createdAt) > sevenDaysAgo;
    })
    .sort((a, b) => {
      const wA = urgencyWeight[a.urgency] || 1;
      const wB = urgencyWeight[b.urgency] || 1;
      if (wB !== wA) return wB - wA;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/** GET /operator/console/actions/:actionId — full action detail */
export async function fetchAction(env: any, actionId: string): Promise<ThreadAction | null> {
  const kv = getKV(env);
  return kvGetAction(kv, actionId);
}

/** POST /operator/console/actions/review — approve or reject an action */
export async function reviewAction(env: any, input: {
  actionId: string;
  decision: 'approved' | 'rejected';
  reviewedBy?: string;
  feedback?: string;
}): Promise<ThreadAction | null> {
  const kv = getKV(env);
  const action = await kvGetAction(kv, input.actionId);
  if (!action) return null;

  action.status = input.decision;
  action.reviewedAt = new Date().toISOString();
  action.reviewedBy = input.reviewedBy || 'operator';

  await kvPutAction(kv, action);
  await kvUpdateActionIndex(kv, action);

  // FIX 3: Keep source as 'operator' (correct source for the review append)
  await appendToThread(env, action.threadId, {
    source: 'operator',
    content: `Action ${input.decision}: ${action.actionType} for ${action.accountNames.join(', ')}${input.feedback ? `. Feedback: ${input.feedback}` : ''}`,
  }).catch(() => null);

  return action;
}

/** POST /operator/console/actions/evaluate — manually trigger evaluation */
export async function triggerActionEvaluation(env: any): Promise<ReturnType<typeof evaluateThreadsForAction>> {
  return evaluateThreadsForAction(env);
}

// ─── Phase 4 Completeness: Execute, Stats, Regenerate, History ────────────

/**
 * POST /operator/console/actions/execute — Mark an approved action as executed.
 * Logs execution to the parent thread and optionally records execution notes.
 */
export async function executeAction(env: any, input: {
  actionId: string;
  executedBy?: string;
  executionNotes?: string;
}): Promise<ThreadAction | null> {
  const kv = getKV(env);
  const action = await kvGetAction(kv, input.actionId);
  if (!action) return null;

  // Only approved actions can be executed
  if (action.status !== 'approved') {
    throw new Error(`Cannot execute action in '${action.status}' status — must be 'approved'`);
  }

  action.status = 'executed';
  action.reviewedAt = new Date().toISOString();
  action.reviewedBy = input.executedBy || action.reviewedBy || 'operator';

  await kvPutAction(kv, action);
  await kvUpdateActionIndex(kv, action);

  // Log execution to thread with details
  const execDetail = input.executionNotes
    ? `Action executed (${action.actionType}): ${input.executionNotes}`
    : `Action executed: ${action.actionType} for ${action.accountNames.join(', ')}. Confidence was ${Math.round(action.confidence * 100)}%.`;

  await appendToThread(env, action.threadId, {
    source: 'operator',
    content: execDetail,
  }).catch(() => null);

  return action;
}

/**
 * GET /operator/console/actions/stats — Pipeline health metrics.
 * Returns counts by status, urgency breakdown, average confidence, and conversion rate.
 */
export async function fetchActionStats(env: any): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byUrgency: Record<string, number>;
  byActionType: Record<string, number>;
  avgConfidenceApproved: number;
  avgConfidenceRejected: number;
  conversionRate: number;
  recentActions: ActionIndexEntry[];
}> {
  const kv = getKV(env);
  const raw = await kv.get('action:index:pending');
  const entries: ActionIndexEntry[] = raw ? JSON.parse(raw) : [];

  const byStatus: Record<string, number> = {};
  const byUrgency: Record<string, number> = {};
  const byActionType: Record<string, number> = {};

  for (const e of entries) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    byUrgency[e.urgency] = (byUrgency[e.urgency] || 0) + 1;
    byActionType[e.actionType] = (byActionType[e.actionType] || 0) + 1;
  }

  // Calculate confidence averages from full action data (sample up to 20 most recent)
  const recentIds = entries.slice(0, 20).map(e => e._id);
  let approvedConfSum = 0, approvedCount = 0;
  let rejectedConfSum = 0, rejectedCount = 0;

  for (const id of recentIds) {
    const action = await kvGetAction(kv, id);
    if (!action) continue;
    if (action.status === 'approved' || action.status === 'executed') {
      approvedConfSum += action.confidence;
      approvedCount++;
    } else if (action.status === 'rejected') {
      rejectedConfSum += action.confidence;
      rejectedCount++;
    }
  }

  const reviewed = approvedCount + rejectedCount;
  const conversionRate = reviewed > 0 ? approvedCount / reviewed : 0;

  return {
    total: entries.length,
    byStatus,
    byUrgency,
    byActionType,
    avgConfidenceApproved: approvedCount > 0 ? Math.round((approvedConfSum / approvedCount) * 100) / 100 : 0,
    avgConfidenceRejected: rejectedCount > 0 ? Math.round((rejectedConfSum / rejectedCount) * 100) / 100 : 0,
    conversionRate: Math.round(conversionRate * 100) / 100,
    recentActions: entries.slice(0, 10),
  };
}

/**
 * POST /operator/console/actions/regenerate — Re-generate outreach draft with optional feedback.
 * Allows the operator to request a new angle after reviewing or rejecting a draft.
 */
export async function regenerateActionDraft(env: any, input: {
  actionId: string;
  feedback?: string;
  newAngle?: string;
}): Promise<ThreadAction | null> {
  const kv = getKV(env);
  const action = await kvGetAction(kv, input.actionId);
  if (!action) return null;

  // Can only regenerate drafts for actions that support it
  if (action.actionType === 'research_deep_dive') {
    throw new Error('Cannot generate outreach draft for research_deep_dive actions');
  }

  // Fetch parent thread for context
  const thread = await fetchThread(env, action.threadId);
  if (!thread) throw new Error(`Parent thread ${action.threadId} not found`);

  const hasLlm = !!(env.LLM_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
  if (!hasLlm) throw new Error('LLM not configured — cannot regenerate draft');

  // Build feedback context
  const feedbackBlock = [
    input.feedback ? `Operator feedback: "${input.feedback}"` : null,
    input.newAngle ? `Requested angle: "${input.newAngle}"` : null,
    action.draft ? `Previous subject line: "${action.draft.subject}"` : null,
    action.draft?.outreachAngle ? `Previous angle: "${action.draft.outreachAngle}"` : null,
  ].filter(Boolean).join('\n');

  try {
    const result = await callLlm(env, [
      {
        role: 'system',
        content: `You are an SDR outreach specialist at Sanity.io, a headless CMS platform. Re-generate a personalized outreach draft based on intelligence gathered and operator feedback on the previous attempt.

Return valid JSON only with these keys:
- "subject": email subject line (under 60 chars, specific, no hype)
- "body": short email body (under 120 words, conversational, references specific evidence)
- "callOpeningLine": phone opening if we call instead (1-2 sentences)
- "outreachAngle": the strategic angle for this outreach (1 sentence)
- "personaFraming": how we're positioning for this person's role (1 sentence)
- "evidenceReference": the key evidence that makes this timely (1 sentence)

Rules:
- Take the operator's feedback seriously and shift the angle accordingly
- Reference specific signals, technologies, or changes detected
- No generic filler — connect their situation to a Sanity capability
- Keep it human, short, consultative
- MUST be meaningfully different from the previous draft`,
      },
      {
        role: 'user',
        content: `Re-generate outreach for this opportunity:

Thread: "${thread.title}"
Accounts: ${action.accountNames.join(', ')}
Why now: ${action.whyNow}
Evidence: ${action.evidence.join('; ')}
${thread.summary ? `Thread summary: ${thread.summary}` : ''}

${feedbackBlock ? `OPERATOR FEEDBACK:\n${feedbackBlock}\n` : ''}
Recent intelligence:
${thread.entries.slice(-10).map(e => `[${e.source}] ${e.content}`).join('\n')}`,
      },
    ], { maxTokens: 800, temperature: 0.4, json: true });

    const parsed = JSON.parse(result.content);
    action.draft = {
      subject: parsed.subject || '',
      body: parsed.body || '',
      callOpeningLine: parsed.callOpeningLine || '',
      outreachAngle: parsed.outreachAngle || '',
      personaFraming: parsed.personaFraming || '',
      evidenceReference: parsed.evidenceReference || '',
    };

    // Reset status back to pending_review after regeneration
    action.status = 'pending_review';
    action.reviewedAt = null;
    action.reviewedBy = null;

    await kvPutAction(kv, action);
    await kvUpdateActionIndex(kv, action);

    await appendToThread(env, action.threadId, {
      source: 'action-bridge',
      content: `Draft regenerated for ${action.actionType}${input.feedback ? ` (feedback: "${input.feedback}")` : ''}. New angle: ${action.draft.outreachAngle}`,
    }).catch(() => null);

    return action;
  } catch (err: any) {
    console.warn('[threadActionBridge] draft regeneration failed:', err?.message);
    throw new Error(`Draft regeneration failed: ${err?.message}`);
  }
}

/**
 * GET /operator/console/actions/history — All actions including resolved.
 * Returns the full index sorted by date, optionally filtered by status.
 */
export async function fetchActionHistory(env: any, statusFilter?: string): Promise<ActionIndexEntry[]> {
  const kv = getKV(env);
  const raw = await kv.get('action:index:pending');
  const entries: ActionIndexEntry[] = raw ? JSON.parse(raw) : [];

  if (statusFilter) {
    return entries.filter(e => e.status === statusFilter);
  }

  return entries;
}
