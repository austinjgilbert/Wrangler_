/**
 * Chat Module — Main entry point and orchestrator.
 *
 * Coordinates the full chat flow:
 *   intent → retrieval → response → audit
 *
 * Supports both streaming and non-streaming modes.
 * Never throws to the caller — always returns a ChatResponse or ReadableStream.
 *
 * @module chat/index
 */

import type {
  ChatIntent,
  ChatResponse,
  ClassifiedIntent,
  ConversationState,
  ConversationTurn,
  AuditEntry,
  ExtractedEntity,
  RetrievalResult,
} from './types.ts';
import { generateResponse, generateStreamingResponse, generateFollowUpSuggestions } from './response.ts';
import { logInteraction, recordFeedback as auditRecordFeedback } from './audit.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessageInput {
  sessionId: string;
  message: string;
  stream?: boolean;
}

export interface ChatFeedbackInput {
  sessionId: string;
  turnId: string;
  feedback: 'up' | 'down';
  text?: string;
}

// ─── Session Management ─────────────────────────────────────────────────────

const SESSION_TTL = 60 * 60 * 24; // 24 hours
const SESSION_PREFIX = 'chat:session:';

/**
 * Load an existing conversation session from KV, or create a new one.
 */
async function loadOrCreateSession(env: any, sessionId: string): Promise<ConversationState> {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (kv) {
    try {
      const existing = await kv.get(`${SESSION_PREFIX}${sessionId}`, 'json');
      if (existing) return existing as ConversationState;
    } catch (err: any) {
      console.warn('[chat] Failed to load session:', err?.message);
    }
  }

  return {
    sessionId,
    turns: [],
    entityContext: { recentEntities: [] },
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
}

/**
 * Persist conversation state to KV.
 */
async function saveSession(env: any, session: ConversationState): Promise<void> {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (!kv) return;

  try {
    // Keep only the last 50 turns to avoid KV size limits
    const trimmedSession = {
      ...session,
      turns: session.turns.slice(-50),
      lastActiveAt: new Date().toISOString(),
    };
    await kv.put(
      `${SESSION_PREFIX}${session.sessionId}`,
      JSON.stringify(trimmedSession),
      { expirationTtl: SESSION_TTL },
    );
  } catch (err: any) {
    console.warn('[chat] Failed to save session:', err?.message);
  }
}

// ─── Pronoun Resolution ─────────────────────────────────────────────────────

/**
 * Resolve pronouns ("them", "they", "it", "that account") using conversation context.
 *
 * Returns the message with pronouns replaced by entity names for better
 * intent classification and retrieval.
 */
function resolvePronouns(message: string, session: ConversationState): string {
  const focused = session.entityContext.focusedEntity;
  if (!focused) return message;

  const pronounPatterns: Array<{ pattern: RegExp; replacement: string }> = [
    // Account pronouns
    { pattern: /\b(that account|that company|this account|this company|the account|the company)\b/gi, replacement: focused.name },
    { pattern: /\b(them|they|their|it|its)\b/gi, replacement: focused.name },
    // "tell me more" / "what about" patterns
    { pattern: /^(tell me more|more details|what else|go deeper|expand on that)$/i, replacement: `Tell me more about ${focused.name}` },
  ];

  let resolved = message;
  for (const { pattern, replacement } of pronounPatterns) {
    resolved = resolved.replace(pattern, replacement);
  }

  return resolved;
}

// ─── Intent Classification (with fallback) ──────────────────────────────────

/**
 * Classify intent using the intent module, with rule-based fallback.
 */
async function classifyWithFallback(
  env: any,
  message: string,
  session: ConversationState,
): Promise<ClassifiedIntent> {
  try {
    // Dynamic import for cold-start optimization
    const { classifyIntent } = await import('./intent.ts');
    return await classifyIntent(env, message, session);
  } catch (err: any) {
    console.warn('[chat] Intent classification failed, using rule-based fallback:', err?.message);
    return ruleBasedClassification(message);
  }
}

/**
 * Simple rule-based intent classification as fallback.
 */
function ruleBasedClassification(message: string): ClassifiedIntent {
  const lower = message.toLowerCase().trim();

  // Morning briefing patterns
  if (
    lower.includes('morning') ||
    lower.includes('briefing') ||
    lower.includes('good morning') ||
    lower.includes('what should i focus on') ||
    lower.includes('priorities today') ||
    lower.includes("today's plan")
  ) {
    return {
      intent: 'morning_briefing',
      confidence: 0.7,
      entities: [],
      rawQuery: message,
    };
  }

  // Signal check patterns
  if (
    lower.includes('signal') ||
    lower.includes('alert') ||
    lower.includes('what changed') ||
    lower.includes('overnight') ||
    lower.includes('new activity') ||
    lower.includes('pattern')
  ) {
    return {
      intent: 'signal_check',
      confidence: 0.7,
      entities: [],
      rawQuery: message,
    };
  }

  // Meeting prep patterns
  if (
    lower.includes('meeting') ||
    lower.includes('prep') ||
    lower.includes('prepare') ||
    lower.includes('call with') ||
    lower.includes('talking points')
  ) {
    return {
      intent: 'meeting_prep',
      confidence: 0.7,
      entities: [],
      rawQuery: message,
    };
  }

  // Person lookup patterns
  if (
    lower.includes('who is') ||
    lower.includes('tell me about') && (lower.includes('person') || lower.includes('contact')) ||
    lower.includes('linkedin') ||
    lower.match(/\b(vp|cto|ceo|cmo|director|manager|head of)\b/)
  ) {
    return {
      intent: 'person_lookup',
      confidence: 0.6,
      entities: [],
      rawQuery: message,
    };
  }

  // Account lookup patterns (broad — catches most "tell me about X" queries)
  if (
    lower.includes('account') ||
    lower.includes('company') ||
    lower.includes('tell me about') ||
    lower.includes('what do we know') ||
    lower.includes('look up') ||
    lower.includes('score') ||
    lower.match(/\.(com|io|co|org|net)\b/)
  ) {
    return {
      intent: 'account_lookup',
      confidence: 0.6,
      entities: [],
      rawQuery: message,
    };
  }

  return {
    intent: 'unknown',
    confidence: 0.3,
    entities: [],
    rawQuery: message,
  };
}

// ─── Entity Resolution ──────────────────────────────────────────────────────

/**
 * Resolve extracted entities to Sanity document IDs.
 */
async function resolveEntities(
  env: any,
  entities: ExtractedEntity[],
): Promise<ExtractedEntity[]> {
  if (entities.length === 0) return entities;

  try {
    const { resolveEntityIds } = await import('./context.ts');
    return await resolveEntityIds(env, entities);
  } catch (err: any) {
    console.warn('[chat] Entity resolution failed:', err?.message);
    return entities; // Return unresolved entities
  }
}

// ─── Retrieval ──────────────────────────────────────────────────────────────

/**
 * Execute targeted retrieval based on classified intent.
 */
async function executeRetrieval(
  env: any,
  intent: ClassifiedIntent,
  session: ConversationState,
): Promise<RetrievalResult> {
  try {
    const { retrieveForIntent } = await import('./retrieval.ts');
    return await retrieveForIntent(env, intent, session);
  } catch (err: any) {
    console.error('[chat] Retrieval failed:', err?.message);
    return {
      intent: intent.intent,
      data: {},
      sources: [],
      retrievalTimeMs: 0,
    };
  }
}

// ─── Entity Context Update ──────────────────────────────────────────────────

/**
 * Update the session's entity context based on the current turn.
 */
function updateEntityContext(
  session: ConversationState,
  intent: ClassifiedIntent,
): void {
  const now = new Date().toISOString();

  for (const entity of intent.entities) {
    if ((entity.type === 'account' || entity.type === 'person') && entity.resolvedId) {
      // Add to recent entities
      const existing = session.entityContext.recentEntities.find(
        (e) => e.id === entity.resolvedId,
      );
      if (existing) {
        existing.mentionedAt = now;
      } else {
        session.entityContext.recentEntities.push({
          id: entity.resolvedId!,
          type: entity.type,
          name: entity.text,
          mentionedAt: now,
        });
      }

      // Update focused entity (most recently mentioned)
      session.entityContext.focusedEntity = {
        id: entity.resolvedId!,
        type: entity.type,
        name: entity.text,
      };
    }
  }

  // Keep only the 10 most recent entities
  session.entityContext.recentEntities = session.entityContext.recentEntities
    .sort((a, b) => b.mentionedAt.localeCompare(a.mentionedAt))
    .slice(0, 10);
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Handle an incoming chat message through the full pipeline.
 *
 * Flow:
 *  1. Load/create conversation session
 *  2. Resolve pronouns using conversation context
 *  3. Classify intent (with conversation context)
 *  4. Resolve entities to Sanity IDs
 *  5. Execute targeted retrieval
 *  6. Generate response (streaming or not)
 *  7. Update conversation state
 *  8. Log audit entry
 *  9. Return response
 *
 * Never throws — always returns a ChatResponse or ReadableStream.
 */
export async function handleChatMessage(
  env: any,
  input: ChatMessageInput,
): Promise<ChatResponse | ReadableStream> {
  const totalStart = Date.now();
  const turnId = crypto.randomUUID();

  try {
    // 1. Load/create session
    const session = await loadOrCreateSession(env, input.sessionId);

    // 2. Resolve pronouns
    const resolvedMessage = resolvePronouns(input.message, session);

    // 3. Classify intent
    const intent = await classifyWithFallback(env, resolvedMessage, session);

    // 4. Resolve entities
    intent.entities = await resolveEntities(env, intent.entities);

    // 5. Execute retrieval
    const retrievalResult = await executeRetrieval(env, intent, session);

    // 6. Update entity context before generating response
    updateEntityContext(session, intent);

    // 7. Generate response
    if (input.stream) {
      // For streaming, we need to handle session update and audit logging
      // after the stream completes. We wrap the stream to do this.
      const innerStream = generateStreamingResponse(env, intent, retrievalResult, session);

      // Add user turn to session now
      session.turns.push({
        id: turnId,
        role: 'user',
        content: input.message,
        timestamp: new Date().toISOString(),
        intent: intent.intent,
        entities: intent.entities,
      });

      // Wrap stream to capture completion for audit + session save
      return wrapStreamWithAudit(innerStream, env, session, intent, retrievalResult, turnId, totalStart);
    }

    // Non-streaming path
    const response = await generateResponse(env, intent, retrievalResult, session);

    // 8. Update conversation state
    session.turns.push({
      id: turnId,
      role: 'user',
      content: input.message,
      timestamp: new Date().toISOString(),
      intent: intent.intent,
      entities: intent.entities,
    });

    session.turns.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
      intent: intent.intent,
      sources: response.sources,
    });

    await saveSession(env, session);

    // 9. Log audit entry (fire-and-forget)
    const totalTimeMs = Date.now() - totalStart;
    logAuditEntry(env, {
      sessionId: input.sessionId,
      turnId,
      rawQuery: input.message,
      intent,
      retrievalResult,
      response,
      totalTimeMs,
    }).catch((err) => console.error('[chat] Audit logging failed:', err));

    return {
      ...response,
      totalTimeMs,
    };
  } catch (err: any) {
    // Absolute last resort — never throw to the caller
    console.error('[chat] Unhandled error in handleChatMessage:', err?.message || err);
    const totalTimeMs = Date.now() - totalStart;

    return {
      content: "I'm sorry, something went wrong processing your request. Please try again.",
      intent: 'unknown',
      entities: [],
      sources: [],
      followUpSuggestions: [
        "What's my morning briefing?",
        'Show me top accounts',
        'Any new signals today?',
      ],
      generationTimeMs: 0,
      totalTimeMs,
    };
  }
}

// ─── Streaming Wrapper ──────────────────────────────────────────────────────

/**
 * Wraps a streaming response to capture the full text for audit logging
 * and session persistence after the stream completes.
 */
function wrapStreamWithAudit(
  innerStream: ReadableStream,
  env: any,
  session: ConversationState,
  intent: ClassifiedIntent,
  retrievalResult: RetrievalResult,
  turnId: string,
  totalStart: number,
): ReadableStream {
  let fullText = '';
  let sources: any[] = [];
  let meta: any = {};

  const reader = innerStream.getReader();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();

      if (done) {
        // Stream complete — save session and log audit
        session.turns.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: fullText,
          timestamp: new Date().toISOString(),
          intent: intent.intent,
          sources,
        });

        saveSession(env, session).catch((err) =>
          console.error('[chat] Session save failed:', err),
        );

        const totalTimeMs = Date.now() - totalStart;
        logAuditEntry(env, {
          sessionId: session.sessionId,
          turnId,
          rawQuery: intent.rawQuery,
          intent,
          retrievalResult,
          response: {
            content: fullText,
            intent: intent.intent,
            entities: intent.entities,
            sources,
            followUpSuggestions: [],
            generationTimeMs: meta.generationTimeMs || 0,
            totalTimeMs,
          },
          totalTimeMs,
        }).catch((err) => console.error('[chat] Audit logging failed:', err));

        controller.close();
        return;
      }

      // Pass through the chunk and capture text for audit
      controller.enqueue(value);

      // Parse the NDJSON chunk to capture content
      try {
        const text = new TextDecoder().decode(value);
        const lines = text.split('\n').filter(Boolean);
        for (const line of lines) {
          const parsed = JSON.parse(line);
          if (parsed.type === 'token') {
            fullText += parsed.text;
          } else if (parsed.type === 'sources') {
            sources = parsed.data;
          } else if (parsed.type === 'done') {
            meta = parsed.meta || {};
          }
        }
      } catch {
        // Non-critical — just means we might miss some text for audit
      }
    },

    cancel() {
      reader.cancel();
    },
  });
}

// ─── Audit Helper ───────────────────────────────────────────────────────────

/**
 * Build and log an audit entry from the chat pipeline results.
 */
async function logAuditEntry(
  env: any,
  params: {
    sessionId: string;
    turnId: string;
    rawQuery: string;
    intent: ClassifiedIntent;
    retrievalResult: RetrievalResult;
    response: ChatResponse;
    totalTimeMs: number;
  },
): Promise<void> {
  const entry: AuditEntry = {
    sessionId: params.sessionId,
    turnId: params.turnId,
    timestamp: new Date().toISOString(),
    rawQuery: params.rawQuery,
    classifiedIntent: params.intent.intent,
    intentConfidence: params.intent.confidence,
    entitiesResolved: params.intent.entities,
    retrievalQueries: [], // TODO: capture from retrieval module
    retrievalTimeMs: params.retrievalResult.retrievalTimeMs,
    generationTimeMs: params.response.generationTimeMs,
    totalTimeMs: params.totalTimeMs,
    responseLength: params.response.content.length,
    sourcesCount: params.response.sources.length,
  };

  await logInteraction(env, entry);
}

// ─── Feedback Handler ───────────────────────────────────────────────────────

/**
 * Record user feedback for a specific chat turn.
 */
export async function handleFeedback(
  env: any,
  input: ChatFeedbackInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    await auditRecordFeedback(env, input.sessionId, input.turnId, input.feedback, input.text);
    return { success: true };
  } catch (err: any) {
    console.error('[chat] Feedback recording failed:', err?.message || err);
    return { success: false, error: err?.message || 'Failed to record feedback' };
  }
}

// ─── Re-exports for convenience ─────────────────────────────────────────────

export type { ChatResponse, ChatIntent, ConversationState, AuditEntry } from './types.ts';
