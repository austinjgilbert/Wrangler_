/**
 * Chat Module Types
 *
 * Core type definitions for the Wrangler_ chat-first conversational interface.
 * These types power intent classification, entity extraction, multi-turn context,
 * retrieval, response generation, and audit logging.
 *
 * @module chat/types
 */

// ─── Intent Classification ─────────────────────────────────────────────────

/**
 * Supported chat intents. Each maps to a specific retrieval strategy
 * and response template.
 */
export type ChatIntent =
  | 'account_lookup'
  | 'morning_briefing'
  | 'signal_check'
  | 'person_lookup'
  | 'meeting_prep'
  | 'unknown';

/**
 * Result of intent classification — includes the classified intent,
 * confidence score, and any entities extracted from the query.
 */
export interface ClassifiedIntent {
  intent: ChatIntent;
  confidence: number;
  entities: ExtractedEntity[];
  rawQuery: string;
}

/**
 * An entity extracted from the user's query text.
 * May be resolved to a Sanity document ID after entity resolution.
 */
export interface ExtractedEntity {
  text: string;
  type: 'account' | 'person' | 'domain' | 'date' | 'industry' | 'technology';
  resolvedId?: string;
}

// ─── Conversation State ────────────────────────────────────────────────────

/**
 * A single turn in the conversation (user message or assistant response).
 */
export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  intent?: ChatIntent;
  entities?: ExtractedEntity[];
  sources?: SourceAttribution[];
}

/**
 * Full conversation state persisted to KV.
 * Maintains a sliding window of turns and entity context for pronoun resolution.
 */
export interface ConversationState {
  sessionId: string;
  turns: ConversationTurn[];
  entityContext: EntityContext;
  createdAt: string;
  lastActiveAt: string;
}

/**
 * Tracks recently mentioned entities to enable pronoun resolution
 * ("they" → last mentioned account, "her" → last mentioned person).
 */
export interface EntityContext {
  /** Last 5 entities mentioned — enables pronoun resolution */
  recentEntities: Array<{
    id: string;
    type: 'account' | 'person';
    name: string;
    mentionedAt: string;
  }>;
  /** Currently focused entity (most recently discussed) */
  focusedEntity?: {
    id: string;
    type: 'account' | 'person';
    name: string;
  };
}

// ─── Source Attribution ────────────────────────────────────────────────────

/**
 * Attribution for a specific fact in the response.
 * Enables "show your work" transparency for the operator.
 */
export interface SourceAttribution {
  /** The specific fact or claim */
  fact: string;
  /** Source document or system (e.g., "signal:abc123", "account:xyz") */
  source: string;
  /** When this data was observed/updated */
  observedAt: string;
  /** Optional confidence in the source data (0-1) */
  confidence?: number;
}

// ─── Retrieval ─────────────────────────────────────────────────────────────

/**
 * Result from the targeted retrieval layer.
 * Contains structured data fetched for a specific intent,
 * along with source attribution and timing.
 */
export interface RetrievalResult {
  intent: ChatIntent;
  data: Record<string, any>;
  sources: SourceAttribution[];
  retrievalTimeMs: number;
}

// ─── Response ──────────────────────────────────────────────────────────────

/**
 * Final chat response returned to the client.
 * Includes the generated content, metadata, and follow-up suggestions.
 */
export interface ChatResponse {
  content: string;
  intent: ChatIntent;
  entities: ExtractedEntity[];
  sources: SourceAttribution[];
  followUpSuggestions: string[];
  generationTimeMs: number;
  totalTimeMs: number;
}

// ─── Audit ─────────────────────────────────────────────────────────────────

/**
 * Full audit trail entry for a single chat turn.
 * Captures timing, classification, retrieval, and feedback data
 * for quality monitoring and improvement.
 */
export interface AuditEntry {
  sessionId: string;
  turnId: string;
  timestamp: string;
  rawQuery: string;
  classifiedIntent: ChatIntent;
  intentConfidence: number;
  entitiesResolved: ExtractedEntity[];
  retrievalQueries: string[];
  retrievalTimeMs: number;
  generationTimeMs: number;
  totalTimeMs: number;
  responseLength: number;
  sourcesCount: number;
  feedback?: 'up' | 'down' | null;
  feedbackText?: string;
}
