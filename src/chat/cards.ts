/**
 * Card Event Builder — Transforms retrieval data into NDJSON card events.
 *
 * Each card event is emitted in the streaming pipeline between `token` and
 * `sources` events. The frontend card components already exist — this module
 * builds the backend data that feeds them.
 *
 * Card types: account, person, signal, action, briefing
 *
 * Design principles:
 *  - Graceful degradation: omit missing fields, never emit placeholders
 *  - No new GROQ queries: use only data already in RetrievalResult
 *  - Field name correctness: use EXACT names the frontend expects
 *  - Type safety: proper TypeScript types throughout
 *
 * @module chat/cards
 */

import type { ChatIntent, RetrievalResult } from './types.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Display mode for a card */
export type CardDisplay = 'expanded' | 'summary' | 'inline';

/** Card type identifier */
export type CardType = 'account' | 'person' | 'signal' | 'action' | 'briefing';

/** Metadata for card rendering and navigation */
export interface CardMeta {
  display: CardDisplay;
  navigable: boolean;
  href?: string;
  position: 'after_text';
}

/** Source provenance for a card */
export interface CardSource {
  confidence?: number;
  source: string;
  observedAt?: string;
}

/** A single card event in the NDJSON stream */
export interface CardEvent {
  type: 'card';
  cardType: CardType;
  _meta: CardMeta;
  _source: CardSource;
  data: Record<string, any>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a slug from a name for URL paths.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Conditionally include a field in an object.
 * Returns the key-value pair only if the value is defined and non-null.
 */
function optional<T>(key: string, value: T | null | undefined): Record<string, T> {
  if (value === null || value === undefined) return {};
  return { [key]: value };
}

/**
 * Derive urgency from opportunity score when urgency is not explicitly set.
 */
function deriveUrgency(opportunityScore?: number): 'high' | 'medium' | 'low' {
  if (opportunityScore === undefined || opportunityScore === null) return 'low';
  if (opportunityScore >= 70) return 'high';
  if (opportunityScore >= 40) return 'medium';
  return 'low';
}

/**
 * Get today's date as ISO string (date only).
 */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Individual Card Builders ───────────────────────────────────────────────

/**
 * Build an account card from retrieval data.
 *
 * Field mapping from retrieval → card:
 *  - retrieval `name` → card `name` (already resolved via companyName || name || domain)
 *  - retrieval `domain` → card `domain`
 *  - retrieval `opportunityScore` → card `opportunityScore`
 *  - retrieval `completeness` → card `profileCompleteness`
 *  - retrieval `technologyStack` → card `technologyStack`
 */
function buildAccountCard(
  account: Record<string, any>,
  display: CardDisplay,
  signals?: any[],
  actions?: any[],
): CardEvent | null {
  if (!account) return null;

  const id = account.id || account._id;
  // Name fallback chain: companyName || name || domain
  const name = account.companyName || account.name || account.domain;
  if (!id && !name) return null;

  // Domain fallback: domain || rootDomain
  const domain = account.domain || account.rootDomain;
  const slug = slugify(name || domain || id || '');

  const data: Record<string, any> = {
    ...optional('id', id),
    // Frontend AccountCard expects `companyName`, not `name`
    ...optional('companyName', name),
    ...optional('domain', domain),
    ...optional('opportunityScore', account.opportunityScore),
    ...optional('industry', account.industry),
    ...optional('employeeCount', account.employeeCount || account.benchmarks?.estimatedEmployees),
    // Map retrieval's `completeness` to card's `profileCompleteness`
    ...optional('profileCompleteness', account.completeness ?? account.profileCompleteness),
    ...optional('technologyStack', account.technologyStack),
    ...optional('lastUpdated', account.lastUpdated || account._updatedAt),
  };

  // Computed fields: only include if we have the data to compute them
  if (Array.isArray(signals) && signals.length > 0) {
    data.recentSignalCount = signals.length;
    // topSignal: the strongest recent signal
    const topSignal = signals.reduce(
      (best, s) => ((s.strength > (best?.strength ?? 0)) ? s : best),
      signals[0],
    );
    if (topSignal) {
      data.topSignal = {
        ...optional('signalType', topSignal.type || topSignal.signalType),
        ...optional('strength', topSignal.strength),
        ...optional('timestamp', topSignal.timestamp),
      };
    }
  }

  if (Array.isArray(actions) && actions.length > 0) {
    data.pendingActionCount = actions.length;
  }

  return {
    type: 'card',
    cardType: 'account',
    _meta: {
      display,
      navigable: true,
      href: slug ? `/accounts/${slug}` : undefined,
      position: 'after_text',
    },
    _source: {
      ...optional('confidence', account.opportunityScore ? account.opportunityScore / 100 : undefined) as any,
      source: `account:${id || slug}`,
      ...optional('observedAt', account.lastUpdated || account._updatedAt),
    },
    data,
  };
}

/**
 * Build a person card from retrieval data.
 *
 * Field mapping from retrieval → card:
 *  - retrieval `name` → card `name`
 *  - retrieval `title` (already resolved via currentTitle || title) → card `title`
 *  - retrieval `bio` → card `about` (NOT bio)
 *  - retrieval `linkedinUrl` → card `linkedinUrl`
 */
function buildPersonCard(
  person: Record<string, any>,
  display: CardDisplay,
  companyName?: string,
  companyId?: string,
): CardEvent | null {
  if (!person) return null;

  const id = person.id || person._id;
  const name = person.name;
  if (!name) return null;

  const slug = slugify(name);

  const data: Record<string, any> = {
    ...optional('id', id),
    name,
    // Frontend PersonCard expects `currentTitle`, not `title`
    ...optional('currentTitle', person.currentTitle || person.title),
    // Frontend PersonCard expects `currentCompany`, not `company`
    ...optional('currentCompany', companyName || person.currentCompany || person.company),
    ...optional('companyId', companyId || person.companyId),
    ...optional('seniorityLevel', person.seniorityLevel),
    ...optional('isDecisionMaker', person.isDecisionMaker),
    ...optional('buyerPersona', person.buyerPersona),
    ...optional('linkedinUrl', person.linkedinUrl),
    ...optional('relationshipStrength', person.relationshipStrength),
    // Map retrieval's `bio` to card's `about`
    ...optional('about', person.about || person.bio),
    ...optional('lastSignalDate', person.lastSignalDate),
  };

  return {
    type: 'card',
    cardType: 'person',
    _meta: {
      display,
      navigable: true,
      href: slug ? `/people/${slug}` : undefined,
      position: 'after_text',
    },
    _source: {
      source: `person:${id || slug}`,
      ...optional('observedAt', person.lastUpdated || person._updatedAt),
    },
    data,
  };
}

/**
 * Build a signal card from retrieval data.
 *
 * Field mapping from retrieval → card:
 *  - retrieval `type` → card `signalType` (NOT type)
 *  - retrieval `strength` → card `strength` (NOT score)
 *  - retrieval `account` → card `accountName`
 */
function buildSignalCard(
  signal: Record<string, any>,
  display: CardDisplay,
): CardEvent | null {
  if (!signal) return null;

  const id = signal.id || signal._id;
  // Map retrieval's `type` to card's `signalType`
  const signalType = signal.signalType || signal.type;
  const strength = signal.strength;

  if (!signalType && strength === undefined) return null;

  // Frontend SignalCard expects nested account object, not flat fields
  const accountName = signal.accountName || signal.account;
  const accountId = signal.accountId;

  const data: Record<string, any> = {
    ...optional('id', id),
    ...optional('signalType', signalType),
    ...optional('source', signal.source),
    ...optional('summary', signal.summary),
    ...optional('strength', strength),
    ...optional('timestamp', signal.timestamp),
    // Frontend destructures account.companyName — must be nested object
    account: {
      ...optional('_id', accountId),
      ...optional('companyName', accountName),
    },
  };

  return {
    type: 'card',
    cardType: 'signal',
    _meta: {
      display,
      navigable: !!id,
      ...(id ? { href: `/signals/${id}` } : {}),
      position: 'after_text',
    },
    _source: {
      ...optional('confidence', strength ? strength / 100 : undefined) as any,
      source: `signal:${id || signalType || 'unknown'}`,
      ...optional('observedAt', signal.timestamp),
    },
    data,
  };
}

/**
 * Build an action card from retrieval data.
 *
 * Field mapping from retrieval → card:
 *  - retrieval `score` → card `opportunityScore`
 *  - retrieval `pattern` → card `patternMatch`
 *  - retrieval `whyNow` → card `whyNow` (NOT recommendedStep)
 *  - retrieval `confidence` → card `confidence` (NOT score)
 *  - urgency derived from opportunityScore if not present
 */
function buildActionCard(
  action: Record<string, any>,
  display: CardDisplay,
  accountName?: string,
  accountId?: string,
): CardEvent | null {
  if (!action) return null;

  const id = action.id || action._id;
  const actionType = action.actionType;
  // Map retrieval's `score` to card's `opportunityScore`
  const opportunityScore = action.opportunityScore ?? action.score;
  const urgency = action.urgency || deriveUrgency(opportunityScore);
  const whyNow = action.whyNow;

  if (!actionType && !whyNow) return null;

  const data: Record<string, any> = {
    ...optional('id', id),
    ...optional('actionType', actionType),
    urgency,
    ...optional('opportunityScore', opportunityScore),
    ...optional('whyNow', whyNow),
    // Map retrieval's `pattern` to card's `patternMatch`
    ...optional('patternMatch', action.patternMatch || action.pattern),
    ...optional('confidence', action.confidence),
    // Frontend ActionCard expects nested account object, not flat fields
    account: {
      ...optional('_id', accountId || action.accountId),
      ...optional('companyName', accountName || action.accountName || action.account),
    },
    ...optional('targetPerson', action.targetPerson),
    ...optional('title', action.title),
    // Frontend ActionCard expects evidence as a string, not array
    ...optional('evidence', Array.isArray(action.evidence)
      ? action.evidence.map((e: any) => typeof e === 'string' ? e : e.fact).join('; ')
      : action.evidence),
  };

  return {
    type: 'card',
    cardType: 'action',
    _meta: {
      display,
      navigable: !!id,
      ...(id ? { href: `/actions/${id}` } : {}),
      position: 'after_text',
    },
    _source: {
      ...optional('confidence', action.confidence) as any,
      source: `action:${id || actionType || 'unknown'}`,
      ...optional('observedAt', action.timestamp || action._updatedAt),
    },
    data,
  };
}

/**
 * Build a briefing card from morning briefing retrieval data.
 *
 * This is a composite card that includes stats, top actions, and overnight signals.
 */
function buildBriefingCard(
  stats: Record<string, any>,
  topActions: any[],
  overnightSignals: any[],
): CardEvent | null {
  const date = todayISO();

  // Build stats from retrieval data
  const briefingStats = stats && Object.keys(stats).length > 0
    ? {
        ...optional('totalAccounts', stats.totalAccounts),
        ...optional('activeActions', stats.activeActions),
        ...optional('recentSignals', stats.recentSignals),
        ...optional('totalSignals', stats.totalSignals),
      }
    : undefined;

  // Build mini action card data (top 3-5 by score)
  const safeActions = Array.isArray(topActions) ? topActions : [];
  const miniActions = safeActions.slice(0, 5).map((a) => ({
    ...optional('id', a.id || a._id),
    ...optional('actionType', a.actionType),
    urgency: a.urgency || deriveUrgency(a.opportunityScore ?? a.score),
    ...optional('opportunityScore', a.opportunityScore ?? a.score),
    ...optional('whyNow', a.whyNow),
    ...optional('confidence', a.confidence),
    ...optional('accountName', a.accountName || a.account),
    ...optional('patternMatch', a.patternMatch || a.pattern),
  }));

  // Build mini signal card data (top 5 by strength)
  const safeSignals = Array.isArray(overnightSignals) ? overnightSignals : [];
  const miniSignals = safeSignals
    .slice(0, 5)
    .map((s) => ({
      ...optional('signalType', s.signalType || s.type),
      ...optional('strength', s.strength),
      ...optional('timestamp', s.timestamp),
      ...optional('summary', s.summary),
      ...optional('accountName', s.accountName || s.account),
    }));

  // Frontend BriefingCard expects: topAccounts[], actionItemCount, signals[]
  // Transform backend's richer data to match frontend interface

  // topAccounts: extract unique accounts from actions with scores
  const accountMap = new Map<string, { companyName: string; opportunityScore: number; reason?: string }>();
  for (const a of safeActions) {
    const acctName = a.accountName || a.account;
    if (acctName && !accountMap.has(acctName)) {
      accountMap.set(acctName, {
        companyName: acctName,
        opportunityScore: a.opportunityScore ?? a.score ?? 0,
        ...optional('reason', a.whyNow),
      });
    }
  }
  const topAccounts = Array.from(accountMap.values()).slice(0, 5);

  // signals: aggregate by signal type with counts
  const signalTypeCounts = new Map<string, number>();
  for (const s of safeSignals) {
    const sType = s.signalType || s.type || 'unknown';
    signalTypeCounts.set(sType, (signalTypeCounts.get(sType) || 0) + 1);
  }
  const briefingSignals = Array.from(signalTypeCounts.entries()).map(([type, count]) => ({ type, count }));

  const data: Record<string, any> = {
    date,
    topAccounts,
    actionItemCount: safeActions.length,
    signals: briefingSignals,
  };

  return {
    type: 'card',
    cardType: 'briefing',
    _meta: {
      display: 'expanded',
      navigable: false,
      position: 'after_text',
    },
    _source: {
      source: `briefing:${date}`,
      observedAt: new Date().toISOString(),
    },
    data,
  };
}

// ─── Intent-Specific Card Assembly ──────────────────────────────────────────

/**
 * Build cards for account_lookup intent.
 * 1 account card (expanded) + person cards for key contacts + signal cards + action cards
 */
function buildAccountLookupCards(data: Record<string, any>): CardEvent[] {
  const cards: CardEvent[] = [];
  if (!data.found || !data.account) return cards;

  const account = data.account;
  const signals = Array.isArray(data.signals) ? data.signals : [];
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const people = Array.isArray(data.people) ? data.people : [];

  // Primary account card (expanded)
  const accountCard = buildAccountCard(account, 'expanded', signals, actions);
  if (accountCard) cards.push(accountCard);

  // Person cards for key contacts (inline — supporting entities)
  for (const person of people.slice(0, 5)) {
    const personCard = buildPersonCard(person, 'inline', account.name, account.id);
    if (personCard) cards.push(personCard);
  }

  // Signal cards for recent signals (inline)
  for (const signal of signals.slice(0, 5)) {
    const signalCard = buildSignalCard(signal, 'inline');
    if (signalCard) cards.push(signalCard);
  }

  // Action cards for pending actions (inline)
  for (const action of actions.slice(0, 3)) {
    const actionCard = buildActionCard(action, 'inline', account.name, account.id);
    if (actionCard) cards.push(actionCard);
  }

  return cards;
}

/**
 * Build cards for morning_briefing intent.
 * 1 briefing card (expanded) + account cards for top accounts (summary)
 */
function buildMorningBriefingCards(data: Record<string, any>): CardEvent[] {
  const cards: CardEvent[] = [];

  const stats = data.stats || {};
  const topActions = Array.isArray(data.topActions) ? data.topActions : [];
  const overnightSignals = Array.isArray(data.overnightSignals) ? data.overnightSignals : [];

  // Primary briefing card (expanded)
  const briefingCard = buildBriefingCard(stats, topActions, overnightSignals);
  if (briefingCard) cards.push(briefingCard);

  // Extract unique account names from actions and signals for summary cards
  const accountNames = new Set<string>();
  for (const action of topActions) {
    const name = action.accountName || action.account;
    if (name) accountNames.add(name);
  }
  for (const signal of overnightSignals) {
    const name = signal.accountName || signal.account;
    if (name) accountNames.add(name);
  }

  // Build summary account cards for top accounts (max 5)
  let count = 0;
  for (const name of accountNames) {
    if (count >= 5) break;
    const accountCard = buildAccountCard({ name }, 'summary');
    if (accountCard) {
      cards.push(accountCard);
      count++;
    }
  }

  return cards;
}

/**
 * Build cards for signal_check intent.
 * Signal cards (inline) + account cards for affected accounts (summary)
 */
function buildSignalCheckCards(data: Record<string, any>): CardEvent[] {
  const cards: CardEvent[] = [];

  const signals = Array.isArray(data.signals) ? data.signals : [];

  // Signal cards (inline)
  for (const signal of signals.slice(0, 10)) {
    const signalCard = buildSignalCard(signal, 'inline');
    if (signalCard) cards.push(signalCard);
  }

  // Extract unique account names from signals for summary cards
  const accountNames = new Set<string>();
  for (const signal of signals) {
    const name = signal.accountName || signal.account;
    if (name) accountNames.add(name);
  }

  // Build summary account cards for affected accounts (max 5)
  let count = 0;
  for (const name of accountNames) {
    if (count >= 5) break;
    const accountCard = buildAccountCard({ name }, 'summary');
    if (accountCard) {
      cards.push(accountCard);
      count++;
    }
  }

  return cards;
}

/**
 * Build cards for person_lookup intent.
 * 1 person card (expanded) + account card for their company (inline)
 */
function buildPersonLookupCards(data: Record<string, any>): CardEvent[] {
  const cards: CardEvent[] = [];
  if (!data.found || !data.person) return cards;

  const person = data.person;
  const account = data.account;

  // Primary person card (expanded)
  const personCard = buildPersonCard(
    person,
    'expanded',
    account?.name,
    account?.id,
  );
  if (personCard) cards.push(personCard);

  // Account card for their company (inline — supporting entity)
  if (account) {
    const accountCard = buildAccountCard(account, 'inline');
    if (accountCard) cards.push(accountCard);
  }

  return cards;
}

/**
 * Build cards for meeting_prep intent.
 * 1 account card (expanded) + person cards + signal cards + action cards
 */
function buildMeetingPrepCards(data: Record<string, any>): CardEvent[] {
  const cards: CardEvent[] = [];
  if (!data.found || !data.account) return cards;

  const account = data.account;
  const signals = Array.isArray(data.signals) ? data.signals : [];
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const people = Array.isArray(data.people) ? data.people : [];

  // Primary account card (expanded)
  const accountCard = buildAccountCard(account, 'expanded', signals, actions);
  if (accountCard) cards.push(accountCard);

  // Person cards (inline — supporting entities)
  for (const person of people.slice(0, 5)) {
    const personCard = buildPersonCard(person, 'inline', account.name, account.id);
    if (personCard) cards.push(personCard);
  }

  // Signal cards (inline)
  for (const signal of signals.slice(0, 5)) {
    const signalCard = buildSignalCard(signal, 'inline');
    if (signalCard) cards.push(signalCard);
  }

  // Action cards (inline)
  for (const action of actions.slice(0, 3)) {
    const actionCard = buildActionCard(action, 'inline', account.name, account.id);
    if (actionCard) cards.push(actionCard);
  }

  return cards;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Build card events for a given intent and retrieval result.
 *
 * This is the primary entry point — called by generateStreamingResponse()
 * in response.ts to emit card events between token and sources events.
 *
 * @param intent - The classified chat intent
 * @param retrievalResult - The structured data from the retrieval layer
 * @returns Array of CardEvent objects to emit in the NDJSON stream
 */
export function buildCardEvents(
  intent: ChatIntent,
  retrievalResult: RetrievalResult,
): CardEvent[] {
  const data = retrievalResult.data;
  if (!data || Object.keys(data).length === 0) return [];

  switch (intent) {
    case 'account_lookup':
      return buildAccountLookupCards(data);

    case 'morning_briefing':
      return buildMorningBriefingCards(data);

    case 'signal_check':
      return buildSignalCheckCards(data);

    case 'person_lookup':
      return buildPersonLookupCards(data);

    case 'meeting_prep':
      return buildMeetingPrepCards(data);

    case 'unknown':
    default:
      // No cards for unknown intent — text-only response
      return [];
  }
}
