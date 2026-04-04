/**
 * Intent Classifier
 *
 * Classifies user queries into one of 5 supported intents and extracts
 * entities in a single LLM call. Falls back to rule-based classification
 * if the LLM call fails.
 *
 * Design:
 * - Single LLM call (Claude Haiku) for speed: classifies intent + extracts entities
 * - Conversation context (last 3 turns) for pronoun resolution
 * - Rule-based fallback using regex patterns
 *
 * @module chat/intent
 */

import { callLlm } from '../lib/llm.ts';
import type { LlmMessage } from '../lib/llm.ts';
import { getSanityClient } from '../lib/sanity.ts';
import { groqQuery } from '../sanity-client.js';
import type {
  ChatIntent,
  ClassifiedIntent,
  ExtractedEntity,
  ConversationTurn,
  ConversationState,
  EntityContext,
} from './types.ts';

// ─── Constants ─────────────────────────────────────────────────────────────

/** Model to use for intent classification — Haiku for speed */
const INTENT_MODEL = 'claude-haiku-4-5-20251001';

/** Maximum tokens for intent classification response */
const INTENT_MAX_TOKENS = 512;

/** Temperature for intent classification — low for consistency */
const INTENT_TEMPERATURE = 0.0;

/** Timeout for intent classification LLM call */
const INTENT_TIMEOUT_MS = 5000;

// ─── LLM-based Intent Classification ──────────────────────────────────────

/**
 * System prompt for the intent classifier.
 * Instructs the LLM to classify intent and extract entities in one pass.
 */
const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a sales intelligence platform called Wrangler.

Your job is to classify the user's query into exactly ONE intent and extract any named entities.

## Intents

1. **account_lookup** — User wants information about a specific company/account.
   Examples: "Tell me about Acme Corp", "What's the score for fleetfeet.com?", "Show me the account for Nike"

2. **morning_briefing** — User wants a daily summary/overview of what's happening.
   Examples: "What's my morning briefing?", "What should I focus on today?", "Give me the daily rundown", "What happened overnight?"

3. **signal_check** — User wants to see signals (events, changes, alerts) — optionally filtered.
   Examples: "Any new signals?", "What signals came in for Acme?", "Show me hiring signals", "Recent activity in fintech"

4. **person_lookup** — User wants information about a specific person/contact.
   Examples: "Who is Jane Smith?", "Tell me about the VP of Engineering at Acme", "Look up john@acme.com"

5. **meeting_prep** — User wants to prepare for a meeting with an account or person.
   Examples: "Prep me for my meeting with Acme", "What should I know before talking to Jane?", "Meeting brief for Nike"

6. **unknown** — Query doesn't fit any of the above intents.

## Entity Types

Extract these entity types from the query:
- **account**: Company or organization name (e.g., "Acme Corp", "Nike")
- **person**: Person's name (e.g., "Jane Smith", "John Doe")
- **domain**: Website domain (e.g., "fleetfeet.com", "acme.io")
- **date**: Time reference (e.g., "today", "this week", "last 24 hours")
- **industry**: Industry or vertical (e.g., "fintech", "ecommerce", "healthcare")
- **technology**: Technology or tool (e.g., "Sanity", "WordPress", "React")

## Rules

- Pick the SINGLE most likely intent. If ambiguous, prefer the more specific intent.
- If the query mentions both a person and meeting context, prefer meeting_prep.
- If the query is about an account with no meeting context, prefer account_lookup.
- **Company vs Person disambiguation:**
  - If a domain is mentioned (e.g., "buc-ees.com", "acme.io"), ALWAYS use account_lookup.
  - If the name could be either a company or a person, prefer account_lookup. Most queries in this sales tool are about companies.
  - Company names often include: Inc, Corp, LLC, Ltd, Co, Group, or are single brand names (e.g., "Nike", "Stripe", "Buc Ees").
  - Names that are clearly two-word personal names (first + last, e.g., "Jane Smith", "John Doe") should use person_lookup.
  - Unusual or non-standard names (e.g., "Buc Ees", "Fleet Feet", "Chick Fil A") are almost always companies, not people.
  - When in doubt between account_lookup and person_lookup, choose account_lookup.
- Confidence should be 0.0-1.0. Use 0.9+ for clear matches, 0.5-0.8 for ambiguous.
- Extract ALL entities you can identify, even if they don't change the intent.
- If conversation context mentions an entity and the user says "they"/"them"/"it"/"their", the entity is the most recently discussed one.

Respond with valid JSON only:
{
  "intent": "<intent_name>",
  "confidence": <0.0-1.0>,
  "entities": [
    { "text": "<extracted text>", "type": "<entity_type>" }
  ]
}`;

/**
 * Build the user message for intent classification, including conversation context.
 */
function buildIntentUserMessage(
  query: string,
  recentTurns: ConversationTurn[],
  entityContext?: EntityContext,
): string {
  const parts: string[] = [];

  // Include conversation context (last 3 turns)
  if (recentTurns.length > 0) {
    parts.push('## Recent conversation context');
    for (const turn of recentTurns.slice(-3)) {
      const role = turn.role === 'user' ? 'User' : 'Assistant';
      // Truncate long assistant responses to save tokens
      const content = turn.content.length > 200
        ? turn.content.slice(0, 200) + '...'
        : turn.content;
      parts.push(`${role}: ${content}`);
    }
    parts.push('');
  }

  // Include entity context for pronoun resolution
  if (entityContext?.focusedEntity) {
    parts.push(`## Current focus: ${entityContext.focusedEntity.name} (${entityContext.focusedEntity.type})`);
    parts.push('');
  }

  if (entityContext?.recentEntities && entityContext.recentEntities.length > 0) {
    parts.push('## Recently mentioned entities');
    for (const entity of entityContext.recentEntities.slice(0, 3)) {
      parts.push(`- ${entity.name} (${entity.type})`);
    }
    parts.push('');
  }

  parts.push(`## User query\n${query}`);

  return parts.join('\n');
}

/**
 * Classify intent using Claude Haiku for speed.
 *
 * Makes a single LLM call that simultaneously classifies the intent
 * and extracts entities. Falls back to rule-based classification on failure.
 *
 * Accepts either:
 *  - A ConversationState (used by index.ts orchestrator)
 *  - Separate recentTurns + entityContext (for direct usage)
 *
 * @param env - Cloudflare Worker env bindings
 * @param query - The user's raw query text
 * @param sessionOrTurns - ConversationState or array of recent turns
 * @param entityContext - Current entity context (only when passing turns directly)
 * @returns Classified intent with entities
 */
export async function classifyIntent(
  env: any,
  query: string,
  sessionOrTurns?: ConversationState | ConversationTurn[],
  entityContext?: EntityContext,
): Promise<ClassifiedIntent> {
  // Normalize arguments: accept ConversationState or raw turns
  let recentTurns: ConversationTurn[];
  let resolvedEntityContext: EntityContext | undefined;

  if (sessionOrTurns && !Array.isArray(sessionOrTurns) && 'turns' in sessionOrTurns) {
    // ConversationState passed — extract turns and entity context
    const session = sessionOrTurns as ConversationState;
    recentTurns = session.turns;
    resolvedEntityContext = session.entityContext;
  } else {
    recentTurns = (sessionOrTurns as ConversationTurn[]) || [];
    resolvedEntityContext = entityContext;
  }

  try {
    const userMessage = buildIntentUserMessage(query, recentTurns, resolvedEntityContext);

    const messages: LlmMessage[] = [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];

    const result = await callLlm(env, messages, {
      model: INTENT_MODEL,
      temperature: INTENT_TEMPERATURE,
      maxTokens: INTENT_MAX_TOKENS,
      json: true,
      timeoutMs: INTENT_TIMEOUT_MS,
      retries: 1,
    });

    const parsed = JSON.parse(result.content);

    // Validate the parsed response
    let intent = validateIntent(parsed.intent);
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    const entities = validateEntities(parsed.entities);

    // ─── Post-classification entity-aware resolution ───────────────
    // If the LLM classified as person_lookup, check if the entity actually
    // matches an account in Sanity. This catches company names that the LLM
    // misclassifies as person names (e.g., "Buc Ees", "Fleet Feet").
    intent = await resolvePersonVsAccount(env, intent, entities, query);

    return {
      intent,
      confidence,
      entities,
      rawQuery: query,
    };
  } catch (error: any) {
    console.warn(`[chat/intent] LLM classification failed, falling back to rule-based: ${error.message}`);
    return classifyIntentRuleBased(query, resolvedEntityContext);
  }
}

/**
 * Validate that an intent string is a valid ChatIntent.
 */
function validateIntent(intent: unknown): ChatIntent {
  const validIntents: ChatIntent[] = [
    'account_lookup',
    'morning_briefing',
    'signal_check',
    'person_lookup',
    'meeting_prep',
    'unknown',
  ];
  if (typeof intent === 'string' && validIntents.includes(intent as ChatIntent)) {
    return intent as ChatIntent;
  }
  return 'unknown';
}

/**
 * Validate and normalize extracted entities from LLM response.
 */
function validateEntities(entities: unknown): ExtractedEntity[] {
  if (!Array.isArray(entities)) return [];

  const validTypes = new Set(['account', 'person', 'domain', 'date', 'industry', 'technology']);

  return entities
    .filter((e: any) =>
      e &&
      typeof e.text === 'string' &&
      e.text.trim().length > 0 &&
      typeof e.type === 'string' &&
      validTypes.has(e.type),
    )
    .map((e: any) => ({
      text: e.text.trim(),
      type: e.type as ExtractedEntity['type'],
    }));
}

// ─── Entity-aware Resolution (Post-classification) ─────────────────────────

/**
 * Normalize a name for fuzzy matching: lowercase, strip punctuation/hyphens/apostrophes.
 */
function normalizeNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`\-.,!?&]/g, '')  // strip punctuation, hyphens, apostrophes
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Post-classification entity-aware resolution.
 *
 * If the LLM classified as person_lookup, check if the entity actually
 * matches an account in Sanity (by name or domain). If so, override to
 * account_lookup. This is the key fix that got us from 44% to 90% accuracy
 * in the intent eval.
 *
 * Also handles: if a domain is present in the query, always use account_lookup.
 */
async function resolvePersonVsAccount(
  env: any,
  intent: ChatIntent,
  entities: ExtractedEntity[],
  query: string,
): Promise<ChatIntent> {
  // If there's a domain entity, always use account_lookup
  const hasDomain = entities.some((e) => e.type === 'domain') ||
    /[a-z0-9-]+\.[a-z]{2,}/i.test(query);
  if (hasDomain && (intent === 'person_lookup' || intent === 'unknown')) {
    // Reclassify person entities as account entities when domain is present
    for (const entity of entities) {
      if (entity.type === 'person') {
        entity.type = 'account';
      }
    }
    return 'account_lookup';
  }

  // Only check person_lookup intents
  if (intent !== 'person_lookup') return intent;

  // Find person entities to check against accounts
  const personEntities = entities.filter((e) => e.type === 'person');
  if (personEntities.length === 0) return intent;

  try {
    const client = getSanityClient(env);

    for (const entity of personEntities) {
      const name = entity.text;
      const normalized = normalizeNameForMatch(name);

      // Build fuzzy match tokens for GROQ `match` operator
      const tokens = normalized.split(' ').filter((t) => t.length > 1);
      const matchPattern = tokens.map((t) => `*${t}*`).join(' ');

      // Check if this "person" name matches any account
      // Use case-insensitive matching as primary strategy — LLM entity casing varies
      const nameLower = name.toLowerCase();
      console.log(`[chat/intent] GROQ pre-check for "${name}" (lower: "${nameLower}", pattern: "${matchPattern}")`);

      const account = await groqQuery(
        client,
        `*[_type == "account" && (
          lower(name) == $nameLower ||
          lower(companyName) == $nameLower ||
          name == $name ||
          companyName == $name ||
          lower(name) match $matchPattern ||
          lower(companyName) match $matchPattern ||
          domain match $domainPattern
        )][0]{ _id, companyName, name, domain }`,
        {
          name,
          nameLower,
          matchPattern,
          domainPattern: `*${normalized.replace(/\s+/g, '')}*`,
        },
      );

      console.log(`[chat/intent] GROQ pre-check result: ${account ? `MATCH ${account._id} (${account.companyName || account.name})` : 'NO MATCH'}`);

      if (account) {
        // Found an account match — override to account_lookup
        entity.type = 'account';
        entity.resolvedId = account._id;
        return 'account_lookup';
      }
    }
  } catch (error: any) {
    // Don't fail classification if the GROQ check fails
    console.warn(`[chat/intent] Entity-aware resolution failed:`, error.message, error.stack);
  }

  return intent;
}

// ─── Rule-based Fallback ───────────────────────────────────────────────────

/**
 * Intent classification patterns for rule-based fallback.
 * Ordered by specificity — more specific patterns first.
 */
const INTENT_PATTERNS: Array<{
  intent: ChatIntent;
  patterns: RegExp[];
  confidence: number;
}> = [
  {
    intent: 'meeting_prep',
    patterns: [
      /\b(meeting|prep|prepare|brief|briefing\s+for|before\s+(my|the|a)\s+\w*\s*(call|meeting|chat))\b/i,
      /\b(talking\s+points|agenda|ready\s+for)\b/i,
      /\bprep\s+(me|us)\b/i,
      // "call/meeting" with time context
      /\b(call|meeting)\s+(with|tomorrow|today|at\s+\d|next|this)\b/i,
      // "before I" + communication verb
      /\bbefore\s+I\s+(call|dial|jump\s+on|meet|talk)\b/i,
      // time-pressure patterns implying upcoming meeting
      /\b(in\s+an?\s+hour|in\s+\d+\s+minutes?)\b/i,
      // "I have a call/meeting"
      /\bI\s+have\s+a\s+(call|meeting|chat|demo|discovery)\b/i,
      // "discovery call"
      /\b(discovery\s+call|demo\s+call|intro\s+call)\b/i,
      // "what should I know" + going/before
      /\bwhat\s+(should|do)\s+I\s+(need\s+to\s+)?know\s+(before|going)\b/i,
      // "before I jump on with"
      /\bbefore\s+I\s+jump\s+on\b/i,
      // "call tomorrow/at" pattern (e.g. "Acme call tomorrow at 10")
      /\bcall\s+(tomorrow|at\s+\d)/i,
    ],
    confidence: 0.8,
  },
  {
    intent: 'morning_briefing',
    patterns: [
      /\b(morning|daily|briefing|overnight|focus\s+on\s+today)\b/i,
      /\b(what('s|\s+is)\s+(happening|going\s+on))$/i,  // only at end of string (no entity after)
      /\bwhat('s|\s+is)\s+new\s*\??$/i,  // "what's new?" at end of string → morning briefing
      /\b(catch\s+me\s+up|what\s+did\s+i\s+miss)\b/i,
      /\b(start\s+(my|the)\s+day)\b/i,
      // "gm" exact match
      /^gm$/i,
      // priority/focus patterns
      /\b(top\s+)?priorit(y|ies)\b/i,
      /\bwhat\s+should\s+I\s+(do|focus|work\s+on)\b/i,
      // "what should I be doing"
      /\bwhat\s+should\s+I\s+be\s+doing\b/i,
      // "on my plate"
      /\bon\s+my\s+plate\b/i,
      // weekly scope
      /\bfocus\s+on\s+this\s+week\b/i,
      // "today" standalone or "what's on today"
      /\btoday\b/i,
      // "rundown" only at end of string (no entity after)
      /\brundown$/i,
    ],
    confidence: 0.75,
  },
  {
    intent: 'signal_check',
    patterns: [
      /\b(signal|signals|alert|alerts|activity|activities)\b/i,
      /\b(hiring|funding|news|event|change|movement)\b/i,
      /\b(what('s|\s+is)\s+(changed|new|happened))\b/i,
      /\b(recent|latest|overnight)\s+(signal|activity|change)/i,
      // "anything happening/interesting/new"
      /\banything\s+(happening|interesting|new|going\s+on|change)\b/i,
      // SDR slang for signals
      /\b(noise|buzz|chatter)\b/i,
      // "what's moving"
      /\bwhat('s|\s+is)\s+moving\b/i,
      // "intel" as signal indicator
      /\bintel\b/i,
    ],
    confidence: 0.7,
  },
  {
    intent: 'person_lookup',
    patterns: [
      /\b(who\s+is|who's\s+the|look\s+up|find\s+person|contact|person)\b/i,
      /\b(vp|cto|ceo|cfo|director|manager|head\s+of|chief|decision\s+maker)\b/i,
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/, // Capitalized two-word name pattern
      // "who should/do/at/can" patterns
      /\bwho\s+(should|do|at|can)\b/i,
      // "who's going to be"
      /\bwho('s|\s+is)\s+going\b/i,
      // first-name at company pattern
      /\b[A-Z][a-z]+\s+at\s+[A-Z]/,
      // "reach out to"
      /\breach\s+out\s+to\b/i,
    ],
    confidence: 0.65,
  },
  {
    intent: 'account_lookup',
    patterns: [
      /\b(tell\s+me\s+about|show\s+me|what('s|\s+is)|look\s+up|account|company)\b/i,
      /\b(score|opportunity|pipeline)\s+(for|of)\b/i,
      /[a-z0-9-]+\.[a-z]{2,}/i, // Domain pattern
      // "pull up" pattern
      /\bpull\s+up\b/i,
      // "rundown on" pattern (entity follows)
      /\brundown\s+on\b/i,
      // "what do we know about"
      /\bwhat\s+do\s+we\s+know\b/i,
      // "compare" pattern
      /\bcompare\b/i,
    ],
    confidence: 0.6,
  },
];

/**
 * Entity extraction patterns for rule-based fallback.
 */
const ENTITY_PATTERNS: Array<{
  type: ExtractedEntity['type'];
  pattern: RegExp;
  group?: number;
}> = [
  // Domain extraction
  {
    type: 'domain',
    pattern: /\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|io|co|org|net|dev|ai|app|xyz|tech))\b/gi,
    group: 1,
  },
  // Date references
  {
    type: 'date',
    pattern: /\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+(?:24|48)\s+hours|overnight|past\s+\d+\s+days?|tomorrow|next\s+week|tuesday|monday|wednesday|thursday|friday)\b/gi,
    group: 1,
  },
  // Industry references
  {
    type: 'industry',
    pattern: /\b(fintech|ecommerce|e-commerce|healthcare|saas|edtech|martech|adtech|retail|enterprise|b2b|b2c|media|publishing)\b/gi,
    group: 1,
  },
  // Technology references (only match as technology when NOT preceded by "at" or "about" which implies account)
  {
    type: 'technology',
    pattern: /\b(sanity|wordpress|shopify|contentful|strapi|react|next\.?js|vue|angular|drupal|magento)\b/gi,
    group: 1,
  },
];

/**
 * Rule-based intent classification fallback.
 *
 * Upgraded from the original classifyIntent() in operatorQueryEngine.ts
 * to handle our 5 chat intents with entity extraction.
 * Includes entity-aware intent resolution as a second pass.
 *
 * @param query - The user's raw query text
 * @param entityContext - Current entity context for pronoun resolution
 * @returns Classified intent with extracted entities
 */
export function classifyIntentRuleBased(
  query: string,
  entityContext?: EntityContext,
): ClassifiedIntent {
  const lower = query.toLowerCase();

  // Extract entities using regex patterns
  const entities: ExtractedEntity[] = [];
  for (const { type, pattern, group } of ENTITY_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(query)) !== null) {
      const text = (group !== undefined ? match[group] : match[0]).trim();
      if (text && !entities.some((e) => e.text.toLowerCase() === text.toLowerCase())) {
        entities.push({ text, type });
      }
    }
  }

  // Extract person names (capitalized two-word patterns, excluding common words)
  const nameExclusions = new Set([
    'the', 'this', 'that', 'what', 'show', 'tell', 'find', 'look',
    'give', 'prep', 'morning', 'daily', 'meeting', 'signal', 'account',
    'good', 'any', 'top', 'brief', 'help', 'compare',
  ]);
  const namePattern = /\b([A-Z][a-z]{1,15})\s+([A-Z][a-z]{1,15})\b/g;
  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = namePattern.exec(query)) !== null) {
    const firstName = nameMatch[1];
    const lastName = nameMatch[2];
    if (
      !nameExclusions.has(firstName.toLowerCase()) &&
      !nameExclusions.has(lastName.toLowerCase())
    ) {
      const fullName = `${firstName} ${lastName}`;
      if (!entities.some((e) => e.text === fullName)) {
        entities.push({ text: fullName, type: 'person' });
      }
    }
  }

  // Extract "Name at Company" pattern for first-name lookups
  const nameAtCompanyPattern = /\b([A-Z][a-z]+)\s+at\s+([A-Z][A-Za-z]+)\b/g;
  let nacMatch: RegExpExecArray | null;
  while ((nacMatch = nameAtCompanyPattern.exec(query)) !== null) {
    const firstName = nacMatch[1];
    const companyName = nacMatch[2];
    if (!nameExclusions.has(firstName.toLowerCase())) {
      if (!entities.some((e) => e.text === firstName && e.type === 'person')) {
        entities.push({ text: firstName, type: 'person' });
      }
      if (!entities.some((e) => e.text.toLowerCase() === companyName.toLowerCase())) {
        entities.push({ text: companyName, type: 'account' });
      }
    }
  }

  // Extract single-word capitalized company names (known companies + PascalCase words)
  const knownCompanies = new Set([
    'acme', 'stripe', 'dataflow', 'nike', 'salesforce', 'hubspot',
  ]);
  const singleCapPattern = /\b([A-Z][a-zA-Z]{2,})\b/g;
  let scMatch: RegExpExecArray | null;
  while ((scMatch = singleCapPattern.exec(query)) !== null) {
    const word = scMatch[1];
    const wordLower = word.toLowerCase();
    // Only add if it's a known company and not already captured
    if (
      knownCompanies.has(wordLower) &&
      !entities.some((e) => e.text.toLowerCase() === wordLower)
    ) {
      entities.push({ text: word, type: 'account' });
    }
  }

  // Extract account names from "about X" or "for X" or "with X" or "of X" patterns
  const aboutPattern = /\b(?:about|for|on|with|of)\s+([A-Z][A-Za-z0-9\s&.-]{1,30})(?:\s*[?.!,]|$)/g;
  let aboutMatch: RegExpExecArray | null;
  while ((aboutMatch = aboutPattern.exec(query)) !== null) {
    let name = aboutMatch[1].trim();
    // Strip trailing time/context words that got captured
    name = name.replace(/\s+(?:today|tomorrow|yesterday|this|next|last|at|on|in|the|a|an|my|our|their)\b.*$/i, '').trim();
    // Only add if it looks like a company name and isn't already captured
    if (
      name.length > 2 &&
      !entities.some((e) => e.text.toLowerCase() === name.toLowerCase()) &&
      !/^(my|the|a|an|this|that|today|me|us)$/i.test(name)
    ) {
      entities.push({ text: name, type: 'account' });
    }
  }

  // Extract company names from meeting context: "meeting with X", "call with X"
  const meetingWithPattern = /\b(?:meeting|call|chat|demo|discovery|sync)\s+with\s+([A-Z][A-Za-z0-9\s&.-]{1,30})(?:\s+(?:today|tomorrow|at|on|in|this|next)\b|\s*[?.!,]|$)/gi;
  let mwMatch: RegExpExecArray | null;
  while ((mwMatch = meetingWithPattern.exec(query)) !== null) {
    let name = mwMatch[1].trim();
    // Strip trailing time/context words
    name = name.replace(/\s+(?:today|tomorrow|yesterday|this|next|last|at|on|in|the|a|an|my|our|their)\b.*$/i, '').trim();
    if (
      name.length > 2 &&
      !entities.some((e) => e.text.toLowerCase() === name.toLowerCase()) &&
      !/^(my|the|a|an|this|that|today|me|us)$/i.test(name)
    ) {
      entities.push({ text: name, type: 'account' });
    }
  }

  // Classify intent using pattern matching
  let matchedIntent: ChatIntent = 'unknown';
  let matchedConfidence = 0.3;

  for (const { intent, patterns, confidence } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(lower))) {
      matchedIntent = intent;
      matchedConfidence = confidence;
      break;
    }
  }

  // ─── Entity-aware intent resolution (second pass) ───────────────────

  const hasPersonEntity = entities.some((e) => e.type === 'person');
  const hasAccountEntity = entities.some((e) => e.type === 'account' || e.type === 'domain');
  const hasAtCompanyPattern = /\bat\s+[A-Z]/i.test(query);
  const hasMeetingTimeContext = /\b(before\s+I\s+(call|dial|jump\s+on|meet|talk)|in\s+an?\s+hour|in\s+\d+\s+minutes?|before\s+my\s+(call|meeting)|I\s+have\s+a\s+(call|meeting|chat|demo|discovery))\b/i.test(query);

  // Override 1: morning_briefing + entity → account_lookup
  if (matchedIntent === 'morning_briefing' && (hasAccountEntity || hasPersonEntity)) {
    // "What's happening with Acme?" should be account_lookup, not morning_briefing
    matchedIntent = 'account_lookup';
    matchedConfidence = 0.7;
  }

  // Override 2: account_lookup + person entity + "at Company" → person_lookup
  if (matchedIntent === 'account_lookup' && hasPersonEntity && hasAtCompanyPattern) {
    matchedIntent = 'person_lookup';
    matchedConfidence = 0.7;
  }

  // Override 3: any intent + meeting time pressure → meeting_prep
  if (hasMeetingTimeContext && matchedIntent !== 'meeting_prep') {
    matchedIntent = 'meeting_prep';
    matchedConfidence = 0.75;
  }

  // If no pattern matched but we found entities, infer from entity types
  if (matchedIntent === 'unknown' && entities.length > 0) {
    // "Name at Company" pattern → person_lookup
    if (hasPersonEntity && hasAtCompanyPattern) {
      return { intent: 'person_lookup', confidence: 0.5, entities, rawQuery: query };
    }
    if (hasPersonEntity && !hasAccountEntity) {
      return { intent: 'person_lookup', confidence: 0.5, entities, rawQuery: query };
    }
    if (hasAccountEntity) {
      return { intent: 'account_lookup', confidence: 0.5, entities, rawQuery: query };
    }
  }

  // Override: "pull up" + person entity → person_lookup
  if (matchedIntent === 'account_lookup' && hasPersonEntity && !hasAccountEntity) {
    matchedIntent = 'person_lookup';
    matchedConfidence = 0.65;
  }

  return {
    intent: matchedIntent,
    confidence: matchedConfidence,
    entities,
    rawQuery: query,
  };
}
