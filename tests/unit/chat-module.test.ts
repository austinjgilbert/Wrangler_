/**
 * Chat Module Integration Tests
 *
 * Tests the full chat pipeline with mocked dependencies:
 *   1. Intent Classification (rule-based — no LLM)
 *   2. Context Management (mock KV)
 *   3. Audit Logging (mock KV)
 *   4. Response Generation (mock LLM)
 *   5. Pipeline Integration (mock KV + Sanity + LLM)
 *
 * @module tests/unit/chat-module
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

// ─── Mocks (vi.mock is hoisted — factories must not reference outer variables) ─

vi.mock('../../src/lib/llm.ts', () => ({
  callLlm: vi.fn(),
}));

vi.mock('../../src/lib/sanity.ts', () => ({
  findAccountByName: vi.fn(),
  findAccountByDomain: vi.fn(),
  findPersonByName: vi.fn(),
  getSanityClient: vi.fn(() => ({
    fetch: vi.fn(async () => []),
  })),
}));

// Mock the retrieval module to avoid Sanity client calls in pipeline tests
vi.mock('../../src/chat/retrieval.ts', () => ({
  retrieveForIntent: vi.fn(async (_env: any, intent: any) => ({
    intent: intent.intent,
    data: { account: { companyName: 'Acme Corp', domain: 'acme.com', opportunityScore: 85 } },
    sources: [
      { fact: 'Acme Corp opportunity score is 85', source: 'scoring:acme', observedAt: '2025-03-28' },
    ],
    retrievalTimeMs: 10,
  })),
}));

// Mock sanity-client.js used by retrieval
vi.mock('../../src/sanity-client.js', () => ({
  groqQuery: vi.fn(async () => []),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { callLlm } from '../../src/lib/llm.ts';
import { findAccountByName, findAccountByDomain, findPersonByName } from '../../src/lib/sanity.ts';

import { classifyIntentRuleBased } from '../../src/chat/intent.ts';
import {
  getOrCreateSession,
  addTurn,
  saveSession,
  updateEntityContext,
  resolvePronouns,
  getContextForLLM,
  generateTurnId,
} from '../../src/chat/context.ts';
import {
  logInteraction,
  recordFeedback,
  getRecentAuditEntries,
  getSessionAuditTrail,
} from '../../src/chat/audit.ts';
import {
  buildSystemPrompt,
  extractSourceAttributions,
  generateFollowUpSuggestions,
} from '../../src/chat/response.ts';
import { handleChatMessage, handleFeedback } from '../../src/chat/index.ts';

import type {
  ConversationState,
  ConversationTurn,
  EntityContext,
  AuditEntry,
  RetrievalResult,
  ExtractedEntity,
} from '../../src/chat/types.ts';

// Cast mocks for type-safe usage
const mockCallLlm = vi.mocked(callLlm);
const mockFindAccountByName = vi.mocked(findAccountByName);
const mockFindAccountByDomain = vi.mocked(findAccountByDomain);
const mockFindPersonByName = vi.mocked(findPersonByName);

// ─── Mock Helpers ───────────────────────────────────────────────────────────

/**
 * Creates a mock KV namespace backed by an in-memory Map.
 * Does NOT use vi.fn() so vi.clearAllMocks() won't break the implementations.
 */
function createMockKV() {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const val = store.get(key);
      if (!val) return null;
      return type === 'json' ? JSON.parse(val) : val;
    },
    put: async (key: string, value: string, _opts?: any) => {
      store.set(key, value);
    },
    list: async (opts?: { prefix?: string; limit?: number }) => {
      const keys = [...store.keys()]
        .filter((k) => !opts?.prefix || k.startsWith(opts.prefix))
        .slice(0, opts?.limit || 1000)
        .map((name) => ({ name }));
      return { keys };
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    _store: store,
  };
}

function createMockEnv() {
  const kv = createMockKV();
  return {
    MOLTBOOK_ACTIVITY_KV: kv,
    // Keep KV as alias for backward compatibility in tests
    KV: kv,
    ANTHROPIC_API_KEY: 'test-key',
    SANITY_PROJECT_ID: 'test-project',
    SANITY_DATASET: 'production',
    SANITY_TOKEN: 'test-token',
    _kv: kv,
  };
}

function makeSession(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    sessionId: 'test-session-1',
    turns: [],
    entityContext: {
      recentEntities: [],
      focusedEntity: undefined,
    },
    createdAt: '2025-01-01T00:00:00.000Z',
    lastActiveAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTurn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    id: generateTurnId(),
    role: 'user',
    content: 'test message',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    sessionId: 'test-session-1',
    turnId: 'turn-1',
    timestamp: new Date().toISOString(),
    rawQuery: 'Tell me about Acme',
    classifiedIntent: 'account_lookup',
    intentConfidence: 0.8,
    entitiesResolved: [{ text: 'Acme', type: 'account' }],
    retrievalQueries: [],
    retrievalTimeMs: 50,
    generationTimeMs: 200,
    totalTimeMs: 300,
    responseLength: 150,
    sourcesCount: 2,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. INTENT CLASSIFICATION TESTS (rule-based — no LLM needed)
// ═══════════════════════════════════════════════════════════════════════════

describe('Intent Classification (rule-based)', () => {
  describe('account_lookup intent', () => {
    test('classifies "Tell me about Acme Corp"', () => {
      const result = classifyIntentRuleBased('Tell me about Acme Corp');
      expect(result.intent).toBe('account_lookup');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('classifies "What\'s the score for fleetfeet.com?"', () => {
      const result = classifyIntentRuleBased("What's the score for fleetfeet.com?");
      expect(result.intent).toBe('account_lookup');
      expect(result.entities.some((e) => e.type === 'domain' && e.text === 'fleetfeet.com')).toBe(true);
    });

    test('classifies "Pull up Nike"', () => {
      const result = classifyIntentRuleBased('Pull up Nike');
      expect(result.intent).toBe('account_lookup');
    });
  });

  describe('morning_briefing intent', () => {
    test('classifies "What\'s my morning briefing?"', () => {
      const result = classifyIntentRuleBased("What's my morning briefing?");
      expect(result.intent).toBe('morning_briefing');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    test('classifies "What should I focus on today?"', () => {
      const result = classifyIntentRuleBased('What should I focus on today?');
      expect(result.intent).toBe('morning_briefing');
    });

    test('classifies "gm" as morning briefing', () => {
      const result = classifyIntentRuleBased('gm');
      expect(result.intent).toBe('morning_briefing');
    });
  });

  describe('signal_check intent', () => {
    test('classifies "Any new signals?"', () => {
      const result = classifyIntentRuleBased('Any new signals?');
      expect(result.intent).toBe('signal_check');
    });

    test('classifies "What signals came in for Acme?"', () => {
      const result = classifyIntentRuleBased('What signals came in for Acme?');
      expect(result.intent).toBe('signal_check');
    });

    test('classifies "Show me hiring signals"', () => {
      const result = classifyIntentRuleBased('Show me hiring signals');
      expect(result.intent).toBe('signal_check');
    });
  });

  describe('person_lookup intent', () => {
    test('classifies "Who is Jane Smith?"', () => {
      const result = classifyIntentRuleBased('Who is Jane Smith?');
      expect(result.intent).toBe('person_lookup');
      expect(result.entities.some((e) => e.type === 'person' && e.text === 'Jane Smith')).toBe(true);
    });

    test('classifies "Look up the VP of Engineering"', () => {
      const result = classifyIntentRuleBased('Look up the VP of Engineering');
      expect(result.intent).toBe('person_lookup');
    });

    test('classifies "Sarah at Stripe" as person_lookup', () => {
      const result = classifyIntentRuleBased('Sarah at Stripe');
      expect(result.intent).toBe('person_lookup');
    });
  });

  describe('meeting_prep intent', () => {
    test('classifies "Prep me for my meeting with Acme"', () => {
      const result = classifyIntentRuleBased('Prep me for my meeting with Acme');
      expect(result.intent).toBe('meeting_prep');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    test('classifies "What should I know before talking to Jane?"', () => {
      const result = classifyIntentRuleBased('What should I know before talking to Jane?');
      expect(result.intent).toBe('meeting_prep');
    });

    test('classifies "I have a discovery call with Nike"', () => {
      const result = classifyIntentRuleBased('I have a discovery call with Nike');
      expect(result.intent).toBe('meeting_prep');
    });
  });

  describe('entity extraction', () => {
    test('extracts account names from "about X" pattern', () => {
      const result = classifyIntentRuleBased('Tell me about Acme Corp');
      const accountEntities = result.entities.filter((e) => e.type === 'account');
      expect(accountEntities.length).toBeGreaterThanOrEqual(1);
      expect(accountEntities.some((e) => e.text.includes('Acme'))).toBe(true);
    });

    test('extracts person names (capitalized two-word)', () => {
      const result = classifyIntentRuleBased('Who is Jane Smith?');
      expect(result.entities.some((e) => e.type === 'person' && e.text === 'Jane Smith')).toBe(true);
    });

    test('extracts domain entities', () => {
      const result = classifyIntentRuleBased('Check fleetfeet.com');
      expect(result.entities.some((e) => e.type === 'domain' && e.text === 'fleetfeet.com')).toBe(true);
    });

    test('extracts industry entities', () => {
      const result = classifyIntentRuleBased('Show me fintech signals');
      expect(result.entities.some((e) => e.type === 'industry' && e.text.toLowerCase() === 'fintech')).toBe(true);
    });

    test('extracts date entities', () => {
      const result = classifyIntentRuleBased('What happened this week?');
      expect(result.entities.some((e) => e.type === 'date')).toBe(true);
    });
  });

  describe('entity-aware intent override', () => {
    test('"What\'s happening with Acme?" → account_lookup not morning_briefing', () => {
      const result = classifyIntentRuleBased("What's happening with Acme?");
      // "what's happening" matches morning_briefing, but entity override pushes to account_lookup
      expect(result.intent).toBe('account_lookup');
    });

    test('"What do we know about Dataflow?" → account_lookup', () => {
      const result = classifyIntentRuleBased('What do we know about Dataflow?');
      expect(result.intent).toBe('account_lookup');
    });

    test('meeting time pressure overrides to meeting_prep', () => {
      const result = classifyIntentRuleBased('I have a call with Acme in an hour');
      expect(result.intent).toBe('meeting_prep');
    });
  });

  describe('unknown intent fallback', () => {
    test('returns unknown for gibberish', () => {
      const result = classifyIntentRuleBased('asdfghjkl');
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    test('returns unknown for unrelated queries', () => {
      const result = classifyIntentRuleBased('How do I reset my password?');
      expect(result.intent).toBe('unknown');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CONTEXT MANAGEMENT TESTS (mock KV)
// ═══════════════════════════════════════════════════════════════════════════

describe('Context Management', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe('session creation', () => {
    test('creates a new session when none exists', async () => {
      const session = await getOrCreateSession(env, 'new-session-123');
      expect(session.sessionId).toBe('new-session-123');
      expect(session.turns).toEqual([]);
      expect(session.entityContext.recentEntities).toEqual([]);
      expect(session.createdAt).toBeTruthy();
    });

    test('loads existing session from KV', async () => {
      const existing = makeSession({ sessionId: 'existing-session' });
      existing.turns.push(makeTurn({ content: 'previous message' }));
      env._kv._store.set('chat:session:existing-session', JSON.stringify(existing));

      const session = await getOrCreateSession(env, 'existing-session');
      expect(session.sessionId).toBe('existing-session');
      expect(session.turns.length).toBe(1);
      expect(session.turns[0].content).toBe('previous message');
    });

    test('throws on empty sessionId', async () => {
      await expect(getOrCreateSession(env, '')).rejects.toThrow('sessionId is required');
    });
  });

  describe('adding turns and sliding window', () => {
    test('adds a turn to the session', () => {
      const session = makeSession();
      const turn = makeTurn({ content: 'Hello' });
      addTurn(session, turn);
      expect(session.turns.length).toBe(1);
      expect(session.turns[0].content).toBe('Hello');
    });

    test('enforces max 10 turns sliding window', () => {
      const session = makeSession();
      for (let i = 0; i < 12; i++) {
        addTurn(session, makeTurn({ content: `Message ${i}` }));
      }
      expect(session.turns.length).toBe(10);
      expect(session.turns[0].content).toBe('Message 2');
      expect(session.turns[9].content).toBe('Message 11');
    });

    test('updates lastActiveAt on each turn', () => {
      const session = makeSession({ lastActiveAt: '2020-01-01T00:00:00.000Z' });
      addTurn(session, makeTurn());
      expect(session.lastActiveAt).not.toBe('2020-01-01T00:00:00.000Z');
    });
  });

  describe('entity context tracking', () => {
    test('adds account entity to context', () => {
      const context: EntityContext = { recentEntities: [] };
      const entities: ExtractedEntity[] = [{ text: 'Acme Corp', type: 'account' }];
      const updated = updateEntityContext(context, entities);
      expect(updated.recentEntities.length).toBe(1);
      expect(updated.recentEntities[0].name).toBe('Acme Corp');
      expect(updated.recentEntities[0].type).toBe('account');
    });

    test('updates focused entity to most recently mentioned', () => {
      const context: EntityContext = { recentEntities: [] };
      const entities: ExtractedEntity[] = [
        { text: 'Acme Corp', type: 'account' },
        { text: 'Nike', type: 'account' },
      ];
      const updated = updateEntityContext(context, entities);
      expect(updated.focusedEntity?.name).toBe('Nike');
    });

    test('deduplicates entities by name', () => {
      const context: EntityContext = {
        recentEntities: [
          { id: 'old-id', type: 'account', name: 'Acme Corp', mentionedAt: '2025-01-01T00:00:00Z' },
        ],
      };
      const entities: ExtractedEntity[] = [{ text: 'Acme Corp', type: 'account' }];
      const updated = updateEntityContext(context, entities);
      expect(updated.recentEntities.length).toBe(1);
    });

    test('trims to max 5 recent entities', () => {
      const context: EntityContext = { recentEntities: [] };
      for (let i = 0; i < 7; i++) {
        updateEntityContext(context, [{ text: `Company ${i}`, type: 'account' }]);
      }
      expect(context.recentEntities.length).toBeLessThanOrEqual(5);
    });

    test('ignores non-trackable entity types (date, industry, etc.)', () => {
      const context: EntityContext = { recentEntities: [] };
      const entities: ExtractedEntity[] = [
        { text: 'today', type: 'date' },
        { text: 'fintech', type: 'industry' },
      ];
      const updated = updateEntityContext(context, entities);
      expect(updated.recentEntities.length).toBe(0);
    });
  });

  describe('pronoun resolution', () => {
    test('resolves "they" to focused entity name', () => {
      const context: EntityContext = {
        recentEntities: [
          { id: 'acme-1', type: 'account', name: 'Acme Corp', mentionedAt: '2025-01-01T00:00:00Z' },
        ],
        focusedEntity: { id: 'acme-1', type: 'account', name: 'Acme Corp' },
      };
      const resolved = resolvePronouns('What signals do they have?', context);
      expect(resolved).toContain('Acme Corp');
      expect(resolved).not.toContain('they');
    });

    test('resolves "it" to focused account', () => {
      const context: EntityContext = {
        recentEntities: [
          { id: 'nike-1', type: 'account', name: 'Nike', mentionedAt: '2025-01-01T00:00:00Z' },
        ],
        focusedEntity: { id: 'nike-1', type: 'account', name: 'Nike' },
      };
      const resolved = resolvePronouns("What's its score?", context);
      expect(resolved).toContain('Nike');
    });

    test('returns original query when no entity context', () => {
      const context: EntityContext = { recentEntities: [] };
      const query = 'What signals do they have?';
      const resolved = resolvePronouns(query, context);
      expect(resolved).toBe(query);
    });
  });

  describe('session save/load round-trip', () => {
    test('saves and loads session correctly', async () => {
      const session = makeSession({ sessionId: 'roundtrip-test' });
      addTurn(session, makeTurn({ content: 'Hello', role: 'user' }));
      addTurn(session, makeTurn({ content: 'Hi there!', role: 'assistant' }));
      session.entityContext.focusedEntity = { id: 'acme-1', type: 'account', name: 'Acme' };

      await saveSession(env, session);

      const loaded = await getOrCreateSession(env, 'roundtrip-test');
      expect(loaded.sessionId).toBe('roundtrip-test');
      expect(loaded.turns.length).toBe(2);
      expect(loaded.turns[0].content).toBe('Hello');
      expect(loaded.turns[1].content).toBe('Hi there!');
      expect(loaded.entityContext.focusedEntity?.name).toBe('Acme');
    });
  });

  describe('LLM context formatting', () => {
    test('formats conversation history for LLM', () => {
      const session = makeSession();
      addTurn(session, makeTurn({ content: 'Tell me about Acme', role: 'user' }));
      addTurn(session, makeTurn({ content: 'Acme Corp is a tech company...', role: 'assistant' }));

      const context = getContextForLLM(session);
      expect(context).toContain('Conversation History');
      expect(context).toContain('Tell me about Acme');
      expect(context).toContain('Acme Corp is a tech company');
    });

    test('returns empty string for empty session', () => {
      const session = makeSession();
      const context = getContextForLLM(session);
      expect(context).toBe('');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. AUDIT LOGGING TESTS (mock KV)
// ═══════════════════════════════════════════════════════════════════════════

describe('Audit Logging', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe('logging an interaction', () => {
    test('stores audit entry in KV', async () => {
      const entry = makeAuditEntry({ turnId: 'turn-abc' });
      await logInteraction(env, entry);

      const keys = [...env._kv._store.keys()];
      const entryKey = keys.find((k) => k.startsWith('audit:entry:') && k.endsWith(':turn-abc'));
      expect(entryKey).toBeTruthy();

      const stored = JSON.parse(env._kv._store.get(entryKey!)!);
      expect(stored.turnId).toBe('turn-abc');
      expect(stored.classifiedIntent).toBe('account_lookup');
    });

    test('updates session index with turnId', async () => {
      const entry = makeAuditEntry({ sessionId: 'sess-1', turnId: 'turn-1' });
      await logInteraction(env, entry);

      const sessionIndex = JSON.parse(env._kv._store.get('audit:session:sess-1')!);
      expect(sessionIndex).toContain('turn-1');
    });

    test('appends to recent entries list', async () => {
      const entry = makeAuditEntry({ turnId: 'turn-recent' });
      await logInteraction(env, entry);

      const recent = JSON.parse(env._kv._store.get('audit:recent')!);
      expect(recent.length).toBe(1);
      expect(recent[0]).toContain('turn-recent');
    });
  });

  describe('recording feedback', () => {
    test('stores thumbs up feedback', async () => {
      const entry = makeAuditEntry({ sessionId: 'sess-fb', turnId: 'turn-fb-1' });
      await logInteraction(env, entry);

      await recordFeedback(env, 'sess-fb', 'turn-fb-1', 'up', 'Great answer!');

      const fbRecord = JSON.parse(env._kv._store.get('audit:feedback:turn-fb-1')!);
      expect(fbRecord.feedback).toBe('up');
      expect(fbRecord.feedbackText).toBe('Great answer!');
      expect(fbRecord.sessionId).toBe('sess-fb');
    });

    test('stores thumbs down feedback', async () => {
      const entry = makeAuditEntry({ sessionId: 'sess-fb2', turnId: 'turn-fb-2' });
      await logInteraction(env, entry);

      await recordFeedback(env, 'sess-fb2', 'turn-fb-2', 'down', 'Wrong info');

      const fbRecord = JSON.parse(env._kv._store.get('audit:feedback:turn-fb-2')!);
      expect(fbRecord.feedback).toBe('down');
      expect(fbRecord.feedbackText).toBe('Wrong info');
    });
  });

  describe('retrieving audit entries', () => {
    test('retrieves recent audit entries', async () => {
      for (let i = 0; i < 3; i++) {
        await logInteraction(env, makeAuditEntry({ turnId: `turn-${i}`, timestamp: `2025-01-0${i + 1}T00:00:00Z` }));
      }

      const entries = await getRecentAuditEntries(env, 10);
      expect(entries.length).toBe(3);
    });

    test('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await logInteraction(env, makeAuditEntry({ turnId: `turn-lim-${i}` }));
      }

      const entries = await getRecentAuditEntries(env, 2);
      expect(entries.length).toBe(2);
    });

    test('returns empty array when no entries exist', async () => {
      const entries = await getRecentAuditEntries(env);
      expect(entries).toEqual([]);
    });
  });

  describe('session audit trail', () => {
    test('retrieves all entries for a session', async () => {
      for (let i = 0; i < 3; i++) {
        await logInteraction(
          env,
          makeAuditEntry({
            sessionId: 'trail-session',
            turnId: `trail-turn-${i}`,
            timestamp: `2025-01-0${i + 1}T00:00:00Z`,
          }),
        );
      }

      const trail = await getSessionAuditTrail(env, 'trail-session');
      expect(trail.length).toBe(3);
      expect(trail[0].timestamp).toBe('2025-01-01T00:00:00Z');
      expect(trail[2].timestamp).toBe('2025-01-03T00:00:00Z');
    });

    test('returns empty array for non-existent session', async () => {
      const trail = await getSessionAuditTrail(env, 'nonexistent');
      expect(trail).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. RESPONSE GENERATION TESTS (mock LLM)
// ═══════════════════════════════════════════════════════════════════════════

describe('Response Generation', () => {
  describe('system prompt generation per intent', () => {
    test('generates account_lookup system prompt', () => {
      const prompt = buildSystemPrompt('account_lookup');
      expect(prompt).toContain('Account Lookup');
      expect(prompt).toContain('ONLY state facts');
      expect(prompt).toContain('tech stack');
    });

    test('generates morning_briefing system prompt', () => {
      const prompt = buildSystemPrompt('morning_briefing');
      expect(prompt).toContain('Morning Briefing');
      expect(prompt).toContain('Top Priorities');
      expect(prompt).toContain('Overnight Signals');
    });

    test('generates meeting_prep system prompt', () => {
      const prompt = buildSystemPrompt('meeting_prep');
      expect(prompt).toContain('Meeting Prep');
      expect(prompt).toContain('Talking Points');
      expect(prompt).toContain('Company Overview');
    });

    test('generates signal_check system prompt', () => {
      const prompt = buildSystemPrompt('signal_check');
      expect(prompt).toContain('Signal Check');
      expect(prompt).toContain('compound signals');
    });

    test('generates person_lookup system prompt', () => {
      const prompt = buildSystemPrompt('person_lookup');
      expect(prompt).toContain('Person Lookup');
      expect(prompt).toContain('title');
    });

    test('generates unknown/fallback system prompt', () => {
      const prompt = buildSystemPrompt('unknown');
      expect(prompt).toContain('General Query');
      expect(prompt).toContain('clarifying question');
    });
  });

  describe('source attribution extraction', () => {
    test('matches sources when response contains fact terms', () => {
      const responseText = 'Acme Corp runs Sitecore 9.3 on their website and has been hiring aggressively.';
      const retrievalResult: RetrievalResult = {
        intent: 'account_lookup',
        data: {},
        sources: [
          { fact: 'Acme Corp runs Sitecore 9.3', source: 'website_scan:acme', observedAt: '2025-03-28' },
          { fact: 'Acme Corp hiring aggressively in engineering', source: 'signal:hiring', observedAt: '2025-03-27' },
          { fact: 'Nike uses Shopify Plus', source: 'website_scan:nike', observedAt: '2025-03-25' },
        ],
        retrievalTimeMs: 50,
      };

      const matched = extractSourceAttributions(responseText, retrievalResult);
      expect(matched.length).toBeGreaterThanOrEqual(1);
      expect(matched.some((s) => s.source === 'website_scan:acme')).toBe(true);
      expect(matched.some((s) => s.source === 'website_scan:nike')).toBe(false);
    });

    test('returns empty array when no sources provided', () => {
      const matched = extractSourceAttributions('Some response', {
        intent: 'account_lookup',
        data: {},
        sources: [],
        retrievalTimeMs: 0,
      });
      expect(matched).toEqual([]);
    });
  });

  describe('follow-up suggestion generation', () => {
    test('generates account_lookup follow-ups with account name', () => {
      const suggestions = generateFollowUpSuggestions('account_lookup', {
        account: { companyName: 'Acme Corp' },
      });
      expect(suggestions.length).toBeGreaterThanOrEqual(2);
      expect(suggestions.length).toBeLessThanOrEqual(4);
      expect(suggestions.some((s) => s.includes('Acme Corp'))).toBe(true);
    });

    test('generates morning_briefing follow-ups', () => {
      const suggestions = generateFollowUpSuggestions('morning_briefing', {});
      expect(suggestions.length).toBeGreaterThanOrEqual(2);
      expect(suggestions.some((s) => s.toLowerCase().includes('signal'))).toBe(true);
    });

    test('generates meeting_prep follow-ups', () => {
      const suggestions = generateFollowUpSuggestions('meeting_prep', {});
      expect(suggestions.length).toBeGreaterThanOrEqual(2);
      expect(suggestions.some((s) => s.toLowerCase().includes('talking points'))).toBe(true);
    });

    test('generates unknown intent follow-ups', () => {
      const suggestions = generateFollowUpSuggestions('unknown', {});
      expect(suggestions.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. PIPELINE INTEGRATION TEST (mock KV + Sanity + LLM)
// ═══════════════════════════════════════════════════════════════════════════

describe('Pipeline Integration', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();

    // Setup LLM mock — return valid JSON for intent classification, then prose for response
    mockCallLlm.mockImplementation(async (_env: any, messages: any[], _opts?: any) => {
      // Check if this is an intent classification call (system prompt contains "intent classifier")
      const systemContent = messages[0]?.content || '';
      if (systemContent.includes('intent classifier')) {
        return {
          content: JSON.stringify({
            intent: 'morning_briefing',
            confidence: 0.9,
            entities: [],
          }),
          model: 'claude-3-5-haiku-20241022',
          usage: { inputTokens: 200, outputTokens: 50 },
        };
      }
      // Otherwise it's a response generation call
      return {
        content: 'Here is your morning briefing. Top priorities include following up with key accounts.',
        model: 'claude-sonnet-4-20250514',
        usage: { inputTokens: 500, outputTokens: 100 },
      };
    });

    // Setup Sanity mocks
    mockFindAccountByName.mockResolvedValue({ _id: 'acme-123', companyName: 'Acme Corp' });
    mockFindAccountByDomain.mockResolvedValue(null);
    mockFindPersonByName.mockResolvedValue(null);
  });

  test('full flow: message → intent → retrieval → response → audit', async () => {
    const result = await handleChatMessage(env, {
      sessionId: 'integration-test-session',
      message: "What's my morning briefing?",
      stream: false,
    });

    expect(result).toBeDefined();
    expect('content' in result).toBe(true);

    const response = result as any;
    expect(response.content).toBeTruthy();
    expect(response.intent).toBeTruthy();
    expect(response.followUpSuggestions).toBeDefined();
    expect(Array.isArray(response.followUpSuggestions)).toBe(true);
    expect(response.totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  test('audit entry is created after processing', async () => {
    await handleChatMessage(env, {
      sessionId: 'audit-integration-session',
      message: 'Tell me about Acme',
      stream: false,
    });

    // Give fire-and-forget audit a tick to complete
    await new Promise((r) => setTimeout(r, 100));

    const keys = [...env._kv._store.keys()];
    const auditKeys = keys.filter((k) => k.startsWith('audit:entry:'));
    expect(auditKeys.length).toBeGreaterThanOrEqual(1);
  });

  test('session is updated with conversation turns', async () => {
    await handleChatMessage(env, {
      sessionId: 'session-update-test',
      message: 'Tell me about Acme',
      stream: false,
    });

    const sessionData = env._kv._store.get('chat:session:session-update-test');
    expect(sessionData).toBeTruthy();

    const session = JSON.parse(sessionData!);
    expect(session.turns.length).toBeGreaterThanOrEqual(1);
    expect(session.turns.some((t: any) => t.role === 'user')).toBe(true);
    expect(session.turns.some((t: any) => t.role === 'assistant')).toBe(true);
  });

  test('feedback recording works through handleFeedback', async () => {
    // Record feedback directly (doesn't need a prior interaction)
    const result = await handleFeedback(env, {
      sessionId: 'feedback-test-session',
      turnId: 'some-turn-id',
      feedback: 'up',
      text: 'Very helpful!',
    });

    expect(result.success).toBe(true);

    const fbData = env._kv._store.get('audit:feedback:some-turn-id');
    expect(fbData).toBeTruthy();
    const fb = JSON.parse(fbData!);
    expect(fb.feedback).toBe('up');
    expect(fb.feedbackText).toBe('Very helpful!');
  });

  test('handles LLM failure gracefully with fallback response', async () => {
    mockCallLlm.mockRejectedValue(new Error('API timeout'));

    const result = await handleChatMessage(env, {
      sessionId: 'error-test-session',
      message: "What's my morning briefing?",
      stream: false,
    });

    expect(result).toBeDefined();
    const response = result as any;
    expect(response.content).toBeTruthy();
    // Should not throw — graceful degradation
  });
});
