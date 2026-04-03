/**
 * Targeted Retrieval Layer
 *
 * Each intent has a specific retrieval strategy that fetches only the data
 * needed for that intent — replacing the "load everything" approach in
 * operatorQueryEngine.ts.
 *
 * Uses GROQ queries via the existing sanity-client for targeted data fetching.
 * All retrieval functions fire parallel queries via Promise.all and include
 * source attribution for transparency.
 *
 * @module chat/retrieval
 */

import { getSanityClient } from '../lib/sanity.ts';
import { groqQuery } from '../sanity-client.js';
import { resolveEntities } from '../lib/entityResolver.ts';
import type {
  ChatIntent,
  ClassifiedIntent,
  ConversationState,
  ExtractedEntity,
  RetrievalResult,
  SourceAttribution,
} from './types.ts';

// ─── Constants ─────────────────────────────────────────────────────────────

/** Maximum number of signals to include in retrieval results */
const MAX_SIGNALS = 15;

/** Maximum number of action candidates to include */
const MAX_ACTIONS = 10;

/** Maximum number of people to include */
const MAX_PEOPLE = 10;

/** How far back to look for "recent" signals (in days) */
const RECENT_SIGNAL_DAYS = 7;

// ─── Main Retrieval Router ─────────────────────────────────────────────────

/**
 * Route retrieval to the appropriate strategy based on classified intent.
 *
 * This is the primary entry point used by the chat orchestrator (index.ts).
 * Accepts a ClassifiedIntent + ConversationState for full context.
 *
 * @param env - Cloudflare Worker env bindings
 * @param intent - The classified intent with entities
 * @param session - Current conversation state (for additional context)
 * @returns Structured retrieval result with source attribution
 */
export async function retrieveForIntent(
  env: any,
  intent: ClassifiedIntent,
  session?: ConversationState,
): Promise<RetrievalResult> {
  return retrieve(env, intent.intent, intent.entities);
}

/**
 * Route retrieval to the appropriate strategy based on intent type and entities.
 *
 * Lower-level entry point — use retrieveForIntent() for the full pipeline.
 *
 * @param env - Cloudflare Worker env bindings
 * @param intent - The intent type
 * @param entities - Extracted entities from the query
 * @returns Structured retrieval result with source attribution
 */
export async function retrieve(
  env: any,
  intent: ChatIntent,
  entities: ExtractedEntity[],
): Promise<RetrievalResult> {
  const startTime = Date.now();

  try {
    let result: RetrievalResult;

    switch (intent) {
      case 'account_lookup':
        result = await retrieveForAccountLookup(env, entities);
        break;
      case 'morning_briefing':
        result = await retrieveForMorningBriefing(env);
        break;
      case 'signal_check':
        result = await retrieveForSignalCheck(env, entities);
        break;
      case 'person_lookup':
        result = await retrieveForPersonLookup(env, entities);
        break;
      case 'meeting_prep':
        result = await retrieveForMeetingPrep(env, entities);
        break;
      default:
        result = await retrieveForUnknown(env, entities);
        break;
    }

    result.retrievalTimeMs = Date.now() - startTime;
    return result;
  } catch (error: any) {
    console.error(`[chat/retrieval] Retrieval failed for intent ${intent}: ${error.message}`);
    return {
      intent,
      data: { error: 'Retrieval failed', message: error.message },
      sources: [],
      retrievalTimeMs: Date.now() - startTime,
    };
  }
}

// ─── Helper: Build date filter ─────────────────────────────────────────────

/**
 * Get an ISO date string for N days ago.
 */
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Get today's date at midnight (start of day) as ISO string.
 */
function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Build source attribution from a Sanity document.
 */
function buildSource(doc: any, fact: string): SourceAttribution {
  return {
    fact,
    source: `${doc._type}:${doc._id}`,
    observedAt: doc._updatedAt || doc._createdAt || doc.timestamp || new Date().toISOString(),
    confidence: doc.confidence ?? undefined,
  };
}

/**
 * Find the first entity of a given type, or return undefined.
 */
function findEntity(entities: ExtractedEntity[], type: ExtractedEntity['type']): ExtractedEntity | undefined {
  return entities.find((e) => e.type === type);
}

/**
 * Find all entities of a given type.
 */
function findEntities(entities: ExtractedEntity[], type: ExtractedEntity['type']): ExtractedEntity[] {
  return entities.filter((e) => e.type === type);
}

// ─── Account Lookup Retrieval ──────────────────────────────────────────────

/**
 * Retrieve data for account_lookup intent.
 *
 * Fetches: account detail + recent signals + action candidates + key people.
 * Uses the account name or domain from extracted entities to find the account.
 */
async function retrieveForAccountLookup(
  env: any,
  entities: ExtractedEntity[],
): Promise<RetrievalResult> {
  const client = getSanityClient(env);
  const sources: SourceAttribution[] = [];

  // Resolve account from entities
  const accountEntity = findEntity(entities, 'account');
  const domainEntity = findEntity(entities, 'domain');

  let account: any = null;

  // Try domain first (more precise), then name
  if (domainEntity) {
    account = await groqQuery(
      client,
      `*[_type == "account" && domain == $domain][0]{
        _id, _type, _updatedAt, _createdAt,
        companyName, name, domain, rootDomain,
        opportunityScore, industry,
        "employeeCount": benchmarks.estimatedEmployees, // NOTE: string in schema, may need parseInt
        profileCompleteness,
        technologyStack
      }`,
      { domain: domainEntity.text },
    );
  }

  if (!account && accountEntity) {
    // Try exact name match first
    account = await groqQuery(
      client,
      `*[_type == "account" && (
        name == $name ||
        companyName == $name ||
        domain match $namePattern
      )][0]{
        _id, _type, _updatedAt, _createdAt,
        companyName, name, domain, rootDomain,
        opportunityScore, industry,
        "employeeCount": benchmarks.estimatedEmployees, // NOTE: string in schema, may need parseInt
        profileCompleteness,
        technologyStack
      }`,
      {
        name: accountEntity.text,
        namePattern: `*${accountEntity.text.toLowerCase().replace(/\s+/g, '')}*`,
      },
    );
  }

  if (!account) {
    return {
      intent: 'account_lookup',
      data: {
        found: false,
        searchedFor: accountEntity?.text || domainEntity?.text || 'unknown',
      },
      sources: [],
      retrievalTimeMs: 0,
    };
  }

  sources.push(buildSource(account, `Account: ${account.companyName || account.name || account.domain}`));

  // Parallel fetch: signals, actions, people for this account
  const recentDate = daysAgo(RECENT_SIGNAL_DAYS);
  const [signals, actions, people] = await Promise.all([
    groqQuery(
      client,
      `*[_type == "signal" && account._ref == $accountId] | order(timestamp desc)[0...${MAX_SIGNALS}]{
        _id, _type, _updatedAt,
        signalType, strength, timestamp,
        summary, source,
        "accountName": account->companyName
      }`,
      { accountId: account._id },
    ).catch(() => []),

    groqQuery(
      client,
      `*[_type == "actionCandidate" && account._ref == $accountId &&
        (!defined(lifecycleStatus) || lifecycleStatus == "active")
      ] | order(opportunityScore desc)[0...${MAX_ACTIONS}]{
        _id, _type, _updatedAt,
        actionType, opportunityScore, confidence,
        patternMatch, whyNow, lifecycleStatus
      }`,
      { accountId: account._id },
    ).catch(() => []),

    groqQuery(
      client,
      `*[_type == "person" && (companyRef._ref == $accountId || currentCompany == $accountId)][0...${MAX_PEOPLE}]{
        _id, _type, _updatedAt,
        name, currentTitle, title, linkedinUrl
      }`,
      { accountId: account._id },
    ).catch(() => []),
  ]);

  // Build source attributions for signals
  const safeSignals = Array.isArray(signals) ? signals : [];
  for (const signal of safeSignals.slice(0, 5)) {
    sources.push(buildSource(signal, `Signal: ${signal.signalType} (strength: ${signal.strength})`));
  }

  const safeActions = Array.isArray(actions) ? actions : [];
  for (const action of safeActions.slice(0, 3)) {
    sources.push(buildSource(action, `Action: ${action.actionType} (score: ${action.opportunityScore})`));
  }

  return {
    intent: 'account_lookup',
    data: {
      found: true,
      account: {
        id: account._id,
        name: account.companyName || account.name || account.domain,
        domain: account.domain || account.rootDomain,
        opportunityScore: account.opportunityScore || 0,
        industry: account.industry || null,
        employeeCount: account.employeeCount || null, // NOTE: string from schema (benchmarks.estimatedEmployees)
        completeness: account.profileCompleteness?.score || null,
        technologyStack: account.technologyStack || null,
      },
      signals: safeSignals.map((s: any) => ({
        type: s.signalType,
        strength: s.strength,
        timestamp: s.timestamp,
        summary: s.summary || null,
      })),
      actions: safeActions.map((a: any) => ({
        id: a._id,
        actionType: a.actionType,
        score: a.opportunityScore,
        confidence: a.confidence,
        pattern: a.patternMatch,
        whyNow: a.whyNow,
        status: a.lifecycleStatus,
      })),
      people: (Array.isArray(people) ? people : []).map((p: any) => ({
        name: p.name,
        title: p.currentTitle || p.title,
        email: p.email || null,
        linkedinUrl: p.linkedinUrl || null,
      })),
    },
    sources,
    retrievalTimeMs: 0,
  };
}

// ─── Morning Briefing Retrieval ────────────────────────────────────────────

/**
 * Retrieve data for morning_briefing intent.
 *
 * Fetches: top action candidates + overnight signals + today's summary.
 * No entity filtering — this is a workspace-wide overview.
 */
async function retrieveForMorningBriefing(env: any): Promise<RetrievalResult> {
  const client = getSanityClient(env);
  const sources: SourceAttribution[] = [];
  const overnightCutoff = daysAgo(1);

  const [topActions, recentSignals, accountStats] = await Promise.all([
    // Top action candidates by opportunity score
    groqQuery(
      client,
      `*[_type == "actionCandidate" &&
        (!defined(lifecycleStatus) || lifecycleStatus == "active")
      ] | order(opportunityScore desc)[0...${MAX_ACTIONS}]{
        _id, _type, _updatedAt,
        actionType, opportunityScore, confidence,
        patternMatch, whyNow, accountName,
        account
      }`,
    ).catch(() => []),

    // Signals from the last 24 hours
    groqQuery(
      client,
      `*[_type == "signal" && timestamp >= $cutoff] | order(timestamp desc)[0...${MAX_SIGNALS}]{
        _id, _type, _updatedAt,
        signalType, strength, timestamp,
        summary, accountName, account
      }`,
      { cutoff: overnightCutoff },
    ).catch(() => []),

    // Quick account stats
    groqQuery(
      client,
      `{
        "totalAccounts": count(*[_type == "account"]),
        "totalSignals": count(*[_type == "signal"]),
        "activeActions": count(*[_type == "actionCandidate" && (!defined(lifecycleStatus) || lifecycleStatus == "active")]),
        "recentSignals": count(*[_type == "signal" && timestamp >= $cutoff])
      }`,
      { cutoff: overnightCutoff },
    ).catch(() => ({})),
  ]);

  const safeActions = Array.isArray(topActions) ? topActions : [];
  const safeSignals = Array.isArray(recentSignals) ? recentSignals : [];

  for (const action of safeActions.slice(0, 3)) {
    sources.push(buildSource(action, `Top action: ${action.actionType} for ${action.accountName || 'unknown'} (score: ${action.opportunityScore})`));
  }
  for (const signal of safeSignals.slice(0, 5)) {
    sources.push(buildSource(signal, `Signal: ${signal.signalType} for ${signal.accountName || 'unknown'}`));
  }

  return {
    intent: 'morning_briefing',
    data: {
      stats: accountStats || {},
      topActions: safeActions.map((a: any) => ({
        id: a._id,
        actionType: a.actionType,
        score: a.opportunityScore,
        confidence: a.confidence,
        pattern: a.patternMatch,
        whyNow: a.whyNow,
        account: a.accountName || a.account?._ref,
      })),
      overnightSignals: safeSignals.map((s: any) => ({
        type: s.signalType,
        strength: s.strength,
        timestamp: s.timestamp,
        summary: s.summary || null,
        account: s.accountName || s.account?._ref,
      })),
    },
    sources,
    retrievalTimeMs: 0,
  };
}

// ─── Signal Check Retrieval ────────────────────────────────────────────────

/**
 * Retrieve data for signal_check intent.
 *
 * Fetches signals, optionally filtered by account, industry, or timeframe.
 * Supports broad "any new signals?" and targeted "signals for Acme" queries.
 */
async function retrieveForSignalCheck(
  env: any,
  entities: ExtractedEntity[],
): Promise<RetrievalResult> {
  const client = getSanityClient(env);
  const sources: SourceAttribution[] = [];

  // Build dynamic GROQ filter based on entities
  const accountEntity = findEntity(entities, 'account');
  const domainEntity = findEntity(entities, 'domain');
  const dateEntity = findEntity(entities, 'date');
  const industryEntity = findEntity(entities, 'industry');
  const technologyEntity = findEntity(entities, 'technology');

  // Determine time filter
  let timeCutoff = daysAgo(RECENT_SIGNAL_DAYS); // default: last 7 days
  if (dateEntity) {
    const dateText = dateEntity.text.toLowerCase();
    if (dateText.includes('today') || dateText.includes('24 hour')) {
      timeCutoff = daysAgo(1);
    } else if (dateText.includes('yesterday')) {
      timeCutoff = daysAgo(2);
    } else if (dateText.includes('week')) {
      timeCutoff = daysAgo(7);
    } else if (dateText.includes('month')) {
      timeCutoff = daysAgo(30);
    } else {
      const daysMatch = dateText.match(/(\d+)\s*days?/);
      if (daysMatch) {
        timeCutoff = daysAgo(parseInt(daysMatch[1], 10));
      }
    }
  }

  // If we have an account/domain entity, resolve it first
  let accountId: string | null = null;
  if (domainEntity) {
    const account = await groqQuery(
      client,
      '*[_type == "account" && domain == $domain][0]{ _id }',
      { domain: domainEntity.text },
    );
    if (account) accountId = account._id;
  } else if (accountEntity) {
    const account = await groqQuery(
      client,
      '*[_type == "account" && (name == $name || companyName == $name)][0]{ _id }',
      { name: accountEntity.text },
    );
    if (account) accountId = account._id;
  }

  // Build the signal query
  const filterClauses = ['_type == "signal"', 'timestamp >= $cutoff'];
  const params: Record<string, any> = { cutoff: timeCutoff };

  if (accountId) {
    filterClauses.push('account._ref == $accountId');
    params.accountId = accountId;
  }

  const signalQuery = `*[${filterClauses.join(' && ')}] | order(timestamp desc, strength desc)[0...${MAX_SIGNALS * 2}]{
    _id, _type, _updatedAt,
    signalType, strength, timestamp,
    summary, source, accountName, account
  }`;

  const [signals, signalStats] = await Promise.all([
    groqQuery(client, signalQuery, params).catch(() => []),
    groqQuery(
      client,
      `{
        "total": count(*[_type == "signal" && timestamp >= $cutoff]),
        "byType": *[_type == "signal" && timestamp >= $cutoff]{signalType}
      }`,
      { cutoff: timeCutoff },
    ).catch(() => ({})),
  ]);

  const safeSignals = Array.isArray(signals) ? signals : [];

  // Compute signal type breakdown
  const typeCounts: Record<string, number> = {};
  if (signalStats && Array.isArray(signalStats.byType)) {
    for (const s of signalStats.byType) {
      const t = s.signalType || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
  }

  for (const signal of safeSignals.slice(0, 5)) {
    sources.push(buildSource(signal, `${signal.signalType}: ${signal.summary || signal.accountName || 'N/A'}`));
  }

  return {
    intent: 'signal_check',
    data: {
      filters: {
        account: accountEntity?.text || domainEntity?.text || null,
        accountId,
        timeCutoff,
        industry: industryEntity?.text || null,
        technology: technologyEntity?.text || null,
      },
      totalCount: signalStats?.total || safeSignals.length,
      typeCounts,
      signals: safeSignals.map((s: any) => ({
        type: s.signalType,
        strength: s.strength,
        timestamp: s.timestamp,
        summary: s.summary || null,
        account: s.accountName || s.account?._ref,
        source: s.source || null,
      })),
    },
    sources,
    retrievalTimeMs: 0,
  };
}

// ─── Person Lookup Retrieval ───────────────────────────────────────────────

/**
 * Retrieve data for person_lookup intent.
 *
 * Fetches: person detail + associated account + recent interactions/signals.
 */
async function retrieveForPersonLookup(
  env: any,
  entities: ExtractedEntity[],
): Promise<RetrievalResult> {
  const client = getSanityClient(env);
  const sources: SourceAttribution[] = [];

  const personEntity = findEntity(entities, 'person');
  const domainEntity = findEntity(entities, 'domain');

  let person: any = null;

  // Try to find person by name
  if (personEntity) {
    person = await groqQuery(
      client,
      `*[_type == "person" && name match $namePattern][0]{
        _id, _type, _updatedAt, _createdAt,
        name, currentTitle, title, email, linkedinUrl,
        companyRef, currentCompany,
        bio, summary, notes
      }`,
      { namePattern: `*${personEntity.text}*` },
    );
  }

  if (!person) {
    return {
      intent: 'person_lookup',
      data: {
        found: false,
        searchedFor: personEntity?.text || 'unknown',
      },
      sources: [],
      retrievalTimeMs: 0,
    };
  }

  sources.push(buildSource(person, `Person: ${person.name} (${person.currentTitle || person.title || 'no title'})`));

  // Parallel fetch: associated account + signals involving this person
  const accountRef = person.companyRef?._ref || person.currentCompany;

  const [account, personSignals] = await Promise.all([
    accountRef
      ? groqQuery(
          client,
          `*[_type == "account" && _id == $accountId][0]{
            _id, _type, _updatedAt,
            companyName, name, domain, rootDomain,
            opportunityScore, industry
          }`,
          { accountId: accountRef },
        ).catch(() => null)
      : Promise.resolve(null),

    groqQuery(
      client,
      `*[_type == "signal" && person._ref == $personId] | order(timestamp desc)[0...${MAX_SIGNALS}]{
        _id, _type, _updatedAt,
        signalType, strength, timestamp,
        summary, accountName
      }`,
      { personId: person._id },
    ).catch(() => []),
  ]);

  if (account) {
    sources.push(buildSource(account, `Company: ${account.companyName || account.name || account.domain}`));
  }

  const safeSignals = Array.isArray(personSignals) ? personSignals : [];

  return {
    intent: 'person_lookup',
    data: {
      found: true,
      person: {
        id: person._id,
        name: person.name,
        title: person.currentTitle || person.title || null,
        email: person.email || null,
        linkedinUrl: person.linkedinUrl || null,
        bio: person.bio || person.summary || null,
        notes: person.notes || null,
      },
      account: account
        ? {
            id: account._id,
            name: account.companyName || account.name || account.domain,
            domain: account.domain || account.rootDomain,
            opportunityScore: account.opportunityScore || 0,
            industry: account.industry || null,
          }
        : null,
      signals: safeSignals.map((s: any) => ({
        type: s.signalType,
        strength: s.strength,
        timestamp: s.timestamp,
        summary: s.summary || null,
      })),
    },
    sources,
    retrievalTimeMs: 0,
  };
}

// ─── Meeting Prep Retrieval ────────────────────────────────────────────────

/**
 * Retrieve data for meeting_prep intent.
 *
 * Fetches: account detail + key people + recent signals + action candidates + talking points.
 * This is the most comprehensive retrieval — combines account_lookup + person_lookup data.
 */
async function retrieveForMeetingPrep(
  env: any,
  entities: ExtractedEntity[],
): Promise<RetrievalResult> {
  const client = getSanityClient(env);
  const sources: SourceAttribution[] = [];

  // Resolve account — try account entity, domain, or person's company
  const accountEntity = findEntity(entities, 'account');
  const domainEntity = findEntity(entities, 'domain');
  const personEntity = findEntity(entities, 'person');

  let account: any = null;

  if (domainEntity) {
    account = await groqQuery(
      client,
      `*[_type == "account" && domain == $domain][0]{
        _id, _type, _updatedAt, _createdAt,
        companyName, name, domain, rootDomain,
        opportunityScore, industry, employeeCount,
        profileCompleteness, technologyStack,
        description, summary
      }`,
      { domain: domainEntity.text },
    );
  }

  if (!account && accountEntity) {
    account = await groqQuery(
      client,
      `*[_type == "account" && (name == $name || companyName == $name)][0]{
        _id, _type, _updatedAt, _createdAt,
        companyName, name, domain, rootDomain,
        opportunityScore, industry, employeeCount,
        profileCompleteness, technologyStack,
        description, summary
      }`,
      { name: accountEntity.text },
    );
  }

  // If we have a person but no account, find the person first then their company
  if (!account && personEntity) {
    const person = await groqQuery(
      client,
      `*[_type == "person" && name match $namePattern][0]{
        companyRef, currentCompany
      }`,
      { namePattern: `*${personEntity.text}*` },
    );
    if (person) {
      const accountRef = person.companyRef?._ref || person.currentCompany;
      if (accountRef) {
        account = await groqQuery(
          client,
          `*[_type == "account" && _id == $accountId][0]{
            _id, _type, _updatedAt, _createdAt,
            companyName, name, domain, rootDomain,
            opportunityScore, industry, employeeCount,
            profileCompleteness, technologyStack,
            description, summary
          }`,
          { accountId: accountRef },
        );
      }
    }
  }

  if (!account) {
    return {
      intent: 'meeting_prep',
      data: {
        found: false,
        searchedFor: accountEntity?.text || domainEntity?.text || personEntity?.text || 'unknown',
      },
      sources: [],
      retrievalTimeMs: 0,
    };
  }

  sources.push(buildSource(account, `Meeting prep for: ${account.companyName || account.name || account.domain}`));

  // Comprehensive parallel fetch for meeting prep
  const recentDate = daysAgo(30); // Wider window for meeting prep
  const [signals, actions, people, patterns] = await Promise.all([
    // Recent signals for this account
    groqQuery(
      client,
      `*[_type == "signal" && account._ref == $accountId && timestamp >= $cutoff] | order(timestamp desc)[0...${MAX_SIGNALS}]{
        _id, _type, _updatedAt,
        signalType, strength, timestamp,
        summary, source
      }`,
      { accountId: account._id, cutoff: recentDate },
    ).catch(() => []),

    // Active action candidates
    groqQuery(
      client,
      `*[_type == "actionCandidate" && account._ref == $accountId &&
        (!defined(lifecycleStatus) || lifecycleStatus == "active")
      ] | order(opportunityScore desc)[0...${MAX_ACTIONS}]{
        _id, _type, _updatedAt,
        actionType, opportunityScore, confidence,
        patternMatch, whyNow
      }`,
      { accountId: account._id },
    ).catch(() => []),

    // Key people at this account
    groqQuery(
      client,
      `*[_type == "person" && (companyRef._ref == $accountId || currentCompany == $accountId)][0...${MAX_PEOPLE}]{
        _id, _type, _updatedAt,
        name, currentTitle, title, email, linkedinUrl,
        bio, summary
      }`,
      { accountId: account._id },
    ).catch(() => []),

    // Matched patterns for context
    groqQuery(
      client,
      `*[_type == "molt.pattern" && lifecycleState == "active"] | order(conversionAssociation desc)[0...5]{
        _id, _type, _updatedAt,
        patternType, summary, conversionAssociation,
        recommendedMoves
      }`,
    ).catch(() => []),
  ]);

  const safeSignals = Array.isArray(signals) ? signals : [];
  const safeActions = Array.isArray(actions) ? actions : [];
  const safePeople = Array.isArray(people) ? people : [];
  const safePatterns = Array.isArray(patterns) ? patterns : [];

  // Build talking points from signals and actions
  const talkingPoints: string[] = [];

  for (const signal of safeSignals.slice(0, 3)) {
    if (signal.summary) {
      talkingPoints.push(`Recent signal: ${signal.summary}`);
    } else {
      talkingPoints.push(`Recent ${signal.signalType} signal (strength: ${signal.strength})`);
    }
    sources.push(buildSource(signal, `Signal: ${signal.signalType}`));
  }

  for (const action of safeActions.slice(0, 2)) {
    if (action.whyNow) {
      talkingPoints.push(`Opportunity: ${action.whyNow}`);
    }
    sources.push(buildSource(action, `Action: ${action.actionType} (score: ${action.opportunityScore})`));
  }

  if (account.technologyStack?.cms?.length > 0) {
    talkingPoints.push(`Current CMS: ${account.technologyStack.cms.join(', ')}`);
  }

  return {
    intent: 'meeting_prep',
    data: {
      found: true,
      account: {
        id: account._id,
        name: account.companyName || account.name || account.domain,
        domain: account.domain || account.rootDomain,
        opportunityScore: account.opportunityScore || 0,
        industry: account.industry || null,
        employeeCount: account.employeeCount || null,
        completeness: account.profileCompleteness?.score || null,
        technologyStack: account.technologyStack || null,
        description: account.description || account.summary || null,
      },
      signals: safeSignals.map((s: any) => ({
        type: s.signalType,
        strength: s.strength,
        timestamp: s.timestamp,
        summary: s.summary || null,
      })),
      actions: safeActions.map((a: any) => ({
        actionType: a.actionType,
        score: a.opportunityScore,
        confidence: a.confidence,
        pattern: a.patternMatch,
        whyNow: a.whyNow,
      })),
      people: safePeople.map((p: any) => ({
        name: p.name,
        title: p.currentTitle || p.title || null,
        email: p.email || null,
        linkedinUrl: p.linkedinUrl || null,
        bio: p.bio || p.summary || null,
      })),
      talkingPoints,
      relevantPatterns: safePatterns.map((p: any) => ({
        type: p.patternType,
        summary: p.summary,
        conversionRate: p.conversionAssociation,
        recommendedMoves: p.recommendedMoves || [],
      })),
    },
    sources,
    retrievalTimeMs: 0,
  };
}

// ─── Unknown Intent Retrieval ──────────────────────────────────────────────

/**
 * Fallback retrieval for unknown intents.
 *
 * Returns a lightweight workspace overview to give the LLM some context
 * for generating a helpful response.
 */
async function retrieveForUnknown(
  env: any,
  entities: ExtractedEntity[],
): Promise<RetrievalResult> {
  const client = getSanityClient(env);

  const stats = await groqQuery(
    client,
    `{
      "totalAccounts": count(*[_type == "account"]),
      "totalPeople": count(*[_type == "person"]),
      "totalSignals": count(*[_type == "signal"]),
      "activeActions": count(*[_type == "actionCandidate" && (!defined(lifecycleStatus) || lifecycleStatus == "active")])
    }`,
  ).catch(() => ({}));

  return {
    intent: 'unknown',
    data: {
      stats: stats || {},
      supportedIntents: [
        'Ask about a specific account (e.g., "Tell me about Acme Corp")',
        'Get your morning briefing (e.g., "What should I focus on today?")',
        'Check signals (e.g., "Any new signals for fintech accounts?")',
        'Look up a person (e.g., "Who is Jane Smith?")',
        'Prepare for a meeting (e.g., "Prep me for my meeting with Nike")',
      ],
    },
    sources: [],
    retrievalTimeMs: 0,
  };
}
