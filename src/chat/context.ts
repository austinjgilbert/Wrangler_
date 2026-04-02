/**
 * Multi-turn Conversation State Manager
 *
 * Manages conversation state in Cloudflare KV with a 10-turn sliding window.
 * Tracks entity context for pronoun resolution and provides helpers for
 * formatting conversation history for LLM context.
 *
 * KV key format: `chat:session:{sessionId}`
 * TTL: 24 hours (sessions expire after inactivity)
 *
 * @module chat/context
 */

import type {
  ConversationState,
  ConversationTurn,
  EntityContext,
  ExtractedEntity,
} from './types.ts';
import { findAccountByDomain, findAccountByName, findPersonByName } from '../lib/sanity.ts';

// ─── Constants ─────────────────────────────────────────────────────────────

/** Maximum number of turns to keep in the sliding window */
const MAX_TURNS = 10;

/** Maximum number of recent entities to track */
const MAX_RECENT_ENTITIES = 5;

/** Session TTL in seconds (24 hours) */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** Number of recent turns to include in LLM context */
const LLM_CONTEXT_TURNS = 6;

/** KV key prefix for chat sessions */
const KV_PREFIX = 'chat:session:';

// ─── Session Management ────────────────────────────────────────────────────

/**
 * Load an existing session from KV or create a new one.
 *
 * @param env - Cloudflare Worker env bindings (must have env.MOLTBOOK_ACTIVITY_KV)
 * @param sessionId - Unique session identifier
 * @returns The conversation state (existing or newly created)
 */
export async function getOrCreateSession(
  env: any,
  sessionId: string,
): Promise<ConversationState> {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('[chat/context] sessionId is required');
  }

  const key = `${KV_PREFIX}${sessionId}`;

  try {
    const stored = await env.MOLTBOOK_ACTIVITY_KV.get(key, 'json');
    if (stored && isValidSession(stored)) {
      return stored as ConversationState;
    }
  } catch (error: any) {
    console.warn(`[chat/context] Failed to load session ${sessionId}: ${error.message}`);
    // Fall through to create new session
  }

  // Create new session
  const now = new Date().toISOString();
  return {
    sessionId,
    turns: [],
    entityContext: {
      recentEntities: [],
      focusedEntity: undefined,
    },
    createdAt: now,
    lastActiveAt: now,
  };
}

/**
 * Validate that a stored object is a valid ConversationState.
 */
function isValidSession(obj: any): obj is ConversationState {
  return (
    obj &&
    typeof obj.sessionId === 'string' &&
    Array.isArray(obj.turns) &&
    obj.entityContext &&
    typeof obj.createdAt === 'string'
  );
}

/**
 * Add a turn to the conversation and trim to the sliding window.
 *
 * @param session - Current conversation state
 * @param turn - The new turn to add
 * @returns Updated conversation state (mutates in place for efficiency)
 */
export function addTurn(
  session: ConversationState,
  turn: ConversationTurn,
): ConversationState {
  session.turns.push(turn);

  // Trim to sliding window
  if (session.turns.length > MAX_TURNS) {
    session.turns = session.turns.slice(-MAX_TURNS);
  }

  session.lastActiveAt = new Date().toISOString();
  return session;
}

/**
 * Persist session state to KV with TTL.
 *
 * @param env - Cloudflare Worker env bindings
 * @param session - The conversation state to save
 */
export async function saveSession(
  env: any,
  session: ConversationState,
): Promise<void> {
  const key = `${KV_PREFIX}${session.sessionId}`;

  try {
    await env.MOLTBOOK_ACTIVITY_KV.put(key, JSON.stringify(session), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
  } catch (error: any) {
    console.error(`[chat/context] Failed to save session ${session.sessionId}: ${error.message}`);
    // Don't throw — session loss is recoverable, don't break the chat flow
  }
}

// ─── Entity Context ────────────────────────────────────────────────────────

/**
 * Update the entity context with newly mentioned entities.
 *
 * Adds new entities to the recent list, deduplicates, trims to max,
 * and updates the focused entity to the most recently mentioned one.
 *
 * @param context - Current entity context
 * @param entities - Newly extracted entities (with resolvedId if available)
 * @returns Updated entity context
 */
export function updateEntityContext(
  context: EntityContext,
  entities: ExtractedEntity[],
): EntityContext {
  const now = new Date().toISOString();

  // Only track account and person entities in context
  const trackableEntities = entities.filter(
    (e) => (e.type === 'account' || e.type === 'person') && e.text.trim().length > 0,
  );

  if (trackableEntities.length === 0) {
    return context;
  }

  // Add new entities to the front of the list
  for (const entity of trackableEntities) {
    const newEntry = {
      id: entity.resolvedId || `unresolved:${entity.text}`,
      type: entity.type as 'account' | 'person',
      name: entity.text,
      mentionedAt: now,
    };

    // Remove existing entry with same name (dedup)
    context.recentEntities = context.recentEntities.filter(
      (e) => e.name.toLowerCase() !== entity.text.toLowerCase(),
    );

    // Add to front
    context.recentEntities.unshift(newEntry);
  }

  // Trim to max
  if (context.recentEntities.length > MAX_RECENT_ENTITIES) {
    context.recentEntities = context.recentEntities.slice(0, MAX_RECENT_ENTITIES);
  }

  // Update focused entity to the most recently mentioned
  const mostRecent = trackableEntities[trackableEntities.length - 1];
  if (mostRecent) {
    context.focusedEntity = {
      id: mostRecent.resolvedId || `unresolved:${mostRecent.text}`,
      type: mostRecent.type as 'account' | 'person',
      name: mostRecent.text,
    };
  }

  return context;
}

// ─── Pronoun Resolution ────────────────────────────────────────────────────

/**
 * Pronoun patterns that should be resolved to entity names.
 */
const PRONOUN_PATTERNS: Array<{
  pattern: RegExp;
  entityType?: 'account' | 'person';
}> = [
  // "they" / "them" / "their" — could be account or person, use focused entity
  { pattern: /\b(they|them|their|they're|they've)\b/gi },
  // "it" / "its" — typically refers to an account/company
  { pattern: /\b(it|its|it's)\b/gi, entityType: 'account' },
  // "he" / "him" / "his" — refers to a person
  { pattern: /\b(he|him|his|he's|he'd)\b/gi, entityType: 'person' },
  // "she" / "her" / "hers" — refers to a person
  { pattern: /\b(she|her|hers|she's|she'd)\b/gi, entityType: 'person' },
  // "that company" / "that account" — refers to focused account
  { pattern: /\b(that|the)\s+(company|account|org|organization)\b/gi, entityType: 'account' },
  // "that person" / "that contact" — refers to focused person
  { pattern: /\b(that|the)\s+(person|contact|rep|guy|woman|man)\b/gi, entityType: 'person' },
];

/**
 * Resolve pronouns in a query using the entity context.
 *
 * Replaces pronouns like "they", "it", "her" with the name of the
 * most recently discussed entity of the appropriate type.
 *
 * @param query - The user's raw query text
 * @param entityContext - Current entity context with recent entities
 * @returns Query with pronouns resolved to entity names
 *
 * @example
 * // If focused entity is "Acme Corp" (account):
 * resolvePronouns("What signals do they have?", context)
 * // → "What signals does Acme Corp have?"
 */
export function resolvePronouns(
  query: string,
  entityContext: EntityContext,
): string {
  if (!entityContext.focusedEntity && entityContext.recentEntities.length === 0) {
    return query;
  }

  let resolved = query;
  let wasResolved = false;

  for (const { pattern, entityType } of PRONOUN_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;

    if (!pattern.test(resolved)) continue;
    pattern.lastIndex = 0;

    // Find the best matching entity
    let targetEntity: { name: string; type: string } | undefined;

    if (entityType) {
      // Look for a specific entity type
      targetEntity = entityContext.recentEntities.find((e) => e.type === entityType);
      if (!targetEntity && entityContext.focusedEntity?.type === entityType) {
        targetEntity = entityContext.focusedEntity;
      }
    } else {
      // Use focused entity regardless of type
      targetEntity = entityContext.focusedEntity || entityContext.recentEntities[0];
    }

    if (targetEntity) {
      resolved = resolved.replace(pattern, targetEntity.name);
      wasResolved = true;
    }
  }

  if (wasResolved) {
    console.log(`[chat/context] Pronoun resolution: "${query}" → "${resolved}"`);
  }

  return resolved;
}

// ─── LLM Context Formatting ───────────────────────────────────────────────

/**
 * Format recent conversation turns for inclusion in LLM context.
 *
 * Returns the last N turns formatted as a conversation transcript,
 * suitable for including in a system or user message.
 *
 * @param session - Current conversation state
 * @param maxTurns - Maximum number of turns to include (default: 6)
 * @returns Formatted conversation context string, or empty string if no history
 */
export function getContextForLLM(
  session: ConversationState,
  maxTurns: number = LLM_CONTEXT_TURNS,
): string {
  if (session.turns.length === 0) {
    return '';
  }

  const recentTurns = session.turns.slice(-maxTurns);

  const lines: string[] = ['## Conversation History'];

  for (const turn of recentTurns) {
    const role = turn.role === 'user' ? 'User' : 'Assistant';
    // Truncate long assistant responses to conserve context budget
    let content = turn.content;
    if (turn.role === 'assistant' && content.length > 500) {
      content = content.slice(0, 500) + '... [truncated]';
    }
    lines.push(`**${role}**: ${content}`);
  }

  // Add entity context summary
  if (session.entityContext.focusedEntity) {
    lines.push('');
    lines.push(`**Currently discussing**: ${session.entityContext.focusedEntity.name} (${session.entityContext.focusedEntity.type})`);
  }

  return lines.join('\n');
}

/**
 * Generate a unique turn ID.
 *
 * Uses timestamp + random suffix for uniqueness without external dependencies.
 */
export function generateTurnId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `turn_${timestamp}_${random}`;
}

// ─── Entity Resolution ─────────────────────────────────────────────────────

/**
 * Resolve extracted entities to Sanity document IDs.
 *
 * Attempts to match entity text to existing Sanity documents:
 * - account entities → findAccountByName / findAccountByDomain
 * - person entities → findPersonByName
 * - domain entities → findAccountByDomain
 *
 * Returns the same entities array with resolvedId populated where possible.
 * Never throws — returns unresolved entities on failure.
 *
 * @param env - Cloudflare Worker env bindings
 * @param entities - Extracted entities to resolve
 * @returns Entities with resolvedId populated where matches were found
 */
export async function resolveEntityIds(
  env: any,
  entities: ExtractedEntity[],
): Promise<ExtractedEntity[]> {
  if (entities.length === 0) return entities;

  const resolved = await Promise.all(
    entities.map(async (entity) => {
      try {
        switch (entity.type) {
          case 'account': {
            const account = await findAccountByName(env, entity.text);
            if (account) {
              return { ...entity, resolvedId: account._id };
            }
            break;
          }
          case 'domain': {
            const account = await findAccountByDomain(env, entity.text);
            if (account) {
              return { ...entity, resolvedId: account._id };
            }
            break;
          }
          case 'person': {
            const person = await findPersonByName(env, entity.text);
            if (person) {
              return { ...entity, resolvedId: person._id };
            }
            break;
          }
          // date, industry, technology don't need resolution
          default:
            break;
        }
      } catch (error: any) {
        console.warn(`[chat/context] Failed to resolve entity "${entity.text}" (${entity.type}): ${error.message}`);
      }
      return entity;
    }),
  );

  return resolved;
}
