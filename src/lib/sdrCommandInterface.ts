import type {
  ActionCandidate,
  RankedActionCandidate,
  SdrCommandAction,
  SdrTopActionRow,
  SdrTopActionsTodayView,
  TopActionQueue,
} from '../../shared/types.ts';

type BuildTopActionsInput = {
  queue: TopActionQueue;
  page?: number;
  pageSize?: number;
};

export function buildTopActionsTodayView(input: BuildTopActionsInput): SdrTopActionsTodayView {
  const page = clampInt(input.page ?? 1, 1, 999);
  const pageSize = clampInt(input.pageSize ?? 50, 50, 200);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageActions = (input.queue.actions || []).slice(start, end);

  return {
    title: 'TOP ACTIONS TODAY',
    generatedAt: input.queue.generatedAt,
    policyContext: input.queue.policyContext,
    totalActions: input.queue.actions.length,
    page,
    pageSize,
    hasMore: end < input.queue.actions.length,
    actions: pageActions.map(toSdrTopActionRow),
  };
}

export function toSdrTopActionRow(item: RankedActionCandidate): SdrTopActionRow {
  const action = mapPrimaryCommand(item.candidate);
  const account = item.account?.companyName || item.account?.name || item.account?.domain || item.candidate.account._ref;
  const person = item.person?.name || null;
  const draftReady = isDraftReady(item.candidate);
  const confidence = normalizeConfidence(item.candidate.confidence);

  return {
    rank: item.rank,
    actionCandidateId: item.candidate._id,
    account,
    person,
    action,
    whyNow: truncate(item.candidate.whyNow, 220),
    confidence,
    pattern: item.candidate.patternMatch || 'unknown',
    draftReady,
    allowedCommands: buildAllowedCommands(item.candidate, action, draftReady),
  };
}

function mapPrimaryCommand(candidate: ActionCandidate): SdrCommandAction {
  if (candidate.actionType === 'send_email') return 'send_email';
  if (candidate.actionType === 'make_call') return 'call_now';
  if (candidate.actionType === 'create_followup_task') return 'follow_up';
  if (candidate.actionType === 'run_targeted_research') {
    return requiresValidation(candidate) ? 'validate_signal' : 'research_more';
  }
  if (candidate.actionType === 'send_linkedin_message') return 'follow_up';
  return 'research_more';
}

function buildAllowedCommands(
  candidate: ActionCandidate,
  primary: SdrCommandAction,
  draftReady: boolean,
): SdrCommandAction[] {
  const commands: SdrCommandAction[] = [primary];

  if (candidate.person?._ref && normalizeConfidence(candidate.confidence) >= 70) {
    commands.push('call_now');
  }
  if (draftReady || candidate.actionType === 'send_email') {
    commands.push('send_email');
  }
  if (!draftReady || (candidate.missingData || []).length > 0) {
    commands.push('research_more');
  }
  if (requiresValidation(candidate)) {
    commands.push('validate_signal');
  }
  commands.push('follow_up', 'snooze', 'mark_done');

  return uniqueCommands(commands);
}

function requiresValidation(candidate: ActionCandidate): boolean {
  return (candidate.missingData || []).some((gap) => /validation|target_person|account_description/i.test(gap))
    || /signal|follow_up_required/i.test(candidate.patternMatch || '');
}

function isDraftReady(candidate: ActionCandidate): boolean {
  return candidate.draftStatus === 'ready' || candidate.draftStatus === 'drafted' || candidate.draftStatus === 'approved';
}

function normalizeConfidence(value: number): number {
  const normalized = Number(value) || 0;
  if (normalized <= 1) return clampInt(Math.round(normalized * 100), 0, 100);
  return clampInt(Math.round(normalized), 0, 100);
}

function truncate(value: string, max: number): string {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function uniqueCommands(values: SdrCommandAction[]): SdrCommandAction[] {
  return [...new Set(values)];
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}
