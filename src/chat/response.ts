/**
 * Response Generator — Produces chat responses using Claude Sonnet.
 *
 * Takes a classified intent + retrieved data + conversation context and
 * generates a streaming-ready response with source attribution and
 * follow-up suggestions.
 *
 * Design principles:
 *  - ONLY state facts present in the retrieved data
 *  - Always attribute sources inline: "Sitecore 9.3 *(website scan, Mar 28)*"
 *  - Lead with action, then evidence, then detail
 *  - If data is missing, say so honestly
 *  - Concise: 2-5 sentences for simple queries, structured sections for complex
 *
 * @module chat/response
 */

import { callLlm } from '../lib/llm.ts';
import type {
  ChatIntent,
  ClassifiedIntent,
  ConversationState,
  ConversationTurn,
  ChatResponse,
  RetrievalResult,
  SourceAttribution,
} from './types.ts';

/** Model for response generation — Haiku for speed, Sonnet for quality */
const RESPONSE_MODEL = 'claude-haiku-4-5-20251001';

// ─── System Prompts ─────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are Wrangler_, an AI sales intelligence assistant for SDRs.

RULES — follow these strictly:
1. ONLY state facts present in the <data> block. Never fabricate information.
2. Always attribute sources inline using this format: "fact *(source, date)*"
   Example: "They run Sitecore 9.3 *(website scan, Mar 28)*"
3. Lead with the actionable insight, then supporting evidence, then detail.
4. If data is missing or incomplete, say so honestly: "I don't have data on X yet."
5. Keep responses concise:
   - Simple lookups: 2-5 sentences
   - Complex queries (briefings, meeting prep): use structured sections with headers
6. Use natural, conversational language — not corporate jargon.
7. When referencing people, include their title if available.
8. Dates should be relative when recent ("yesterday", "3 days ago") and absolute when older.`;

const INTENT_SYSTEM_PROMPTS: Record<ChatIntent, string> = {
  account_lookup: `${BASE_SYSTEM_PROMPT}

INTENT: Account Lookup
You're answering a question about a specific company/account. Structure:
- Lead with the most relevant fact for the query
- Include tech stack, signals, and opportunity score if available
- Mention recent activity or signals
- End with what's actionable`,

  morning_briefing: `${BASE_SYSTEM_PROMPT}

INTENT: Morning Briefing
You're delivering the daily SDR briefing. Structure:
## 🎯 Top Priorities
List the top 3-5 accounts to focus on today with why-now reasoning.

## 📡 Overnight Signals
Notable signals detected since yesterday.

## 💡 Quick Wins
Low-effort, high-impact actions available right now.

Keep each section tight — the SDR needs to scan this in 60 seconds.`,

  signal_check: `${BASE_SYSTEM_PROMPT}

INTENT: Signal Check
You're reporting on recent signals and patterns. Structure:
- Lead with the most significant signal or pattern
- Group related signals together
- Explain what each signal means for outreach timing
- Flag any compound signals (multiple accounts showing same pattern)`,

  person_lookup: `${BASE_SYSTEM_PROMPT}

INTENT: Person Lookup
You're answering a question about a specific person/contact. Structure:
- Name, title, and company
- Relationship context (how they connect to the SDR's accounts)
- Recent activity or signals involving this person
- Suggested approach or talking points if relevant`,

  meeting_prep: `${BASE_SYSTEM_PROMPT}

INTENT: Meeting Prep
You're preparing an SDR for an upcoming meeting. Structure:
## 🏢 Company Overview
Key facts about the account.

## 👤 Key People
Who they'll be meeting and relevant context.

## 📡 Recent Signals
What's been happening that's relevant.

## 💬 Talking Points
2-3 specific, evidence-based conversation starters.

## ⚠️ Watch Out
Anything to be careful about (competitors, sensitivities).`,

  unknown: `${BASE_SYSTEM_PROMPT}

INTENT: General Query
The user's intent wasn't clearly matched to a specific category.
Answer as helpfully as possible using available data.
If you're unsure what they're asking, ask a clarifying question.
Suggest specific things you can help with.`,
};

// ─── Prompt Builders ────────────────────────────────────────────────────────

/**
 * Build the system prompt for a given intent.
 */
export function buildSystemPrompt(intent: ChatIntent): string {
  return INTENT_SYSTEM_PROMPTS[intent] || INTENT_SYSTEM_PROMPTS.unknown;
}

/**
 * Build the user prompt with retrieved data and conversation history.
 */
export function buildUserPrompt(
  intent: ClassifiedIntent,
  data: Record<string, any>,
  conversationHistory: ConversationTurn[],
): string {
  const parts: string[] = [];

  // Include recent conversation context (last 6 turns max)
  const recentTurns = conversationHistory.slice(-6);
  if (recentTurns.length > 0) {
    parts.push('<conversation_history>');
    for (const turn of recentTurns) {
      parts.push(`[${turn.role}]: ${turn.content}`);
    }
    parts.push('</conversation_history>');
    parts.push('');
  }

  // Include retrieved data
  parts.push('<data>');
  parts.push(JSON.stringify(data, null, 2));
  parts.push('</data>');
  parts.push('');

  // Include the user's query
  parts.push(`<query>${intent.rawQuery}</query>`);

  // Include extracted entities for context
  if (intent.entities.length > 0) {
    parts.push('');
    parts.push('<entities>');
    for (const entity of intent.entities) {
      parts.push(`- ${entity.type}: "${entity.text}"${entity.resolvedId ? ` (id: ${entity.resolvedId})` : ''}`);
    }
    parts.push('</entities>');
  }

  return parts.join('\n');
}

// ─── Source Attribution ─────────────────────────────────────────────────────

/**
 * Extract source attributions by matching response claims to retrieval sources.
 *
 * Uses a simple heuristic: if a source's fact text (or a significant substring)
 * appears in the response, include that source.
 */
export function extractSourceAttributions(
  responseText: string,
  retrievalResult: RetrievalResult,
): SourceAttribution[] {
  if (!retrievalResult.sources || retrievalResult.sources.length === 0) {
    return [];
  }

  const responseLower = responseText.toLowerCase();
  const matched: SourceAttribution[] = [];
  const seen = new Set<string>();

  for (const source of retrievalResult.sources) {
    // Check if key terms from the fact appear in the response
    const factTerms = source.fact
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3);

    // Require at least 40% of significant terms to match
    const matchCount = factTerms.filter((term) => responseLower.includes(term)).length;
    const matchRatio = factTerms.length > 0 ? matchCount / factTerms.length : 0;

    if (matchRatio >= 0.4 && !seen.has(source.fact)) {
      seen.add(source.fact);
      matched.push(source);
    }
  }

  return matched;
}

// ─── Follow-Up Suggestions ──────────────────────────────────────────────────

/**
 * Generate contextual follow-up suggestions based on intent and data.
 */
export function generateFollowUpSuggestions(
  intent: ChatIntent,
  data: Record<string, any>,
): string[] {
  const suggestions: string[] = [];

  switch (intent) {
    case 'account_lookup': {
      const accountName = data.account?.companyName || data.account?.name || 'this account';
      suggestions.push(`What signals have fired for ${accountName} recently?`);
      suggestions.push(`Who are the key contacts at ${accountName}?`);
      suggestions.push(`Prep me for a meeting with ${accountName}`);
      if (data.account?.opportunityScore) {
        suggestions.push(`Why is ${accountName} scored at ${data.account.opportunityScore}?`);
      }
      break;
    }

    case 'morning_briefing': {
      suggestions.push('Tell me more about the top priority');
      suggestions.push('What signals fired overnight?');
      suggestions.push('Show me accounts with new hiring signals');
      suggestions.push('Any compound patterns this week?');
      break;
    }

    case 'signal_check': {
      suggestions.push('Which accounts have the strongest signals?');
      suggestions.push('Show me compound signal patterns');
      suggestions.push('What changed in the last 24 hours?');
      if (data.signals?.length > 0) {
        suggestions.push('Explain the top signal in detail');
      }
      break;
    }

    case 'person_lookup': {
      const personName = data.person?.name || 'this person';
      suggestions.push(`What company does ${personName} work at?`);
      suggestions.push(`Any recent signals involving ${personName}?`);
      suggestions.push(`Draft an outreach message for ${personName}`);
      break;
    }

    case 'meeting_prep': {
      suggestions.push('Give me more talking points');
      suggestions.push('What are the risks for this meeting?');
      suggestions.push('Who else should I loop in?');
      suggestions.push('What competitors are they evaluating?');
      break;
    }

    default: {
      suggestions.push("What's my morning briefing?");
      suggestions.push('Show me top accounts to focus on');
      suggestions.push('Any new signals today?');
      break;
    }
  }

  // Return max 4 suggestions
  return suggestions.slice(0, 4);
}

// ─── Response Generation ────────────────────────────────────────────────────

/**
 * Generate a complete (non-streaming) chat response.
 */
export async function generateResponse(
  env: any,
  intent: ClassifiedIntent,
  retrievalResult: RetrievalResult,
  conversationContext: ConversationState,
): Promise<ChatResponse> {
  const genStart = Date.now();

  const systemPrompt = buildSystemPrompt(intent.intent);
  const userPrompt = buildUserPrompt(intent, retrievalResult.data, conversationContext.turns);

  try {
    const llmResult = await callLlm(env, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      temperature: 0.3,
      maxTokens: 2048,
      model: RESPONSE_MODEL,
    });

    const generationTimeMs = Date.now() - genStart;
    const sources = extractSourceAttributions(llmResult.content, retrievalResult);
    const followUpSuggestions = generateFollowUpSuggestions(intent.intent, retrievalResult.data);

    return {
      content: llmResult.content,
      intent: intent.intent,
      entities: intent.entities,
      sources,
      followUpSuggestions,
      generationTimeMs,
      totalTimeMs: retrievalResult.retrievalTimeMs + generationTimeMs,
    };
  } catch (err: any) {
    console.error('[chat/response] LLM generation failed:', err?.message || err);
    return buildFallbackResponse(intent, retrievalResult, Date.now() - genStart);
  }
}

/**
 * Generate a streaming chat response as NDJSON ReadableStream.
 *
 * Emits:
 *   {"type":"token","text":"word "}
 *   {"type":"sources","data":[...]}
 *   {"type":"suggestions","data":[...]}
 *   {"type":"done","meta":{...}}
 */
export function generateStreamingResponse(
  env: any,
  intent: ClassifiedIntent,
  retrievalResult: RetrievalResult,
  conversationContext: ConversationState,
): ReadableStream {
  const systemPrompt = buildSystemPrompt(intent.intent);
  const userPrompt = buildUserPrompt(intent, retrievalResult.data, conversationContext.turns);
  const genStart = Date.now();

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const emit = (obj: Record<string, any>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      try {
        // Call LLM (non-streaming internally — we chunk the response for the client)
        // TODO: When callLlm supports native streaming, switch to that
        const llmResult = await callLlm(env, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], {
          temperature: 0.3,
          maxTokens: 2048,
          model: RESPONSE_MODEL,
        });

        const generationTimeMs = Date.now() - genStart;

        // Emit tokens (simulate streaming by chunking the response)
        const words = llmResult.content.split(/(?<=\s)/);
        for (const word of words) {
          emit({ type: 'token', text: word });
        }

        // Emit sources
        const sources = extractSourceAttributions(llmResult.content, retrievalResult);
        emit({ type: 'sources', data: sources });

        // Emit follow-up suggestions
        const suggestions = generateFollowUpSuggestions(intent.intent, retrievalResult.data);
        emit({ type: 'suggestions', data: suggestions });

        // Emit done with metadata
        emit({
          type: 'done',
          meta: {
            intent: intent.intent,
            confidence: intent.confidence,
            entities: intent.entities,
            generationTimeMs,
            totalTimeMs: retrievalResult.retrievalTimeMs + generationTimeMs,
            model: llmResult.model,
            usage: llmResult.usage,
          },
        });
      } catch (err: any) {
        console.error('[chat/response] Streaming generation failed:', err?.message || err);

        // Emit fallback response
        const fallback = buildFallbackResponse(intent, retrievalResult, Date.now() - genStart);
        emit({ type: 'token', text: fallback.content });
        emit({ type: 'sources', data: fallback.sources });
        emit({ type: 'suggestions', data: fallback.followUpSuggestions });
        emit({
          type: 'done',
          meta: {
            intent: fallback.intent,
            error: err?.message || 'Generation failed',
            generationTimeMs: fallback.generationTimeMs,
            totalTimeMs: fallback.totalTimeMs,
          },
        });
      } finally {
        controller.close();
      }
    },
  });
}

// ─── Fallback Response ──────────────────────────────────────────────────────

/**
 * Build a structured fallback response when LLM generation fails.
 */
function buildFallbackResponse(
  intent: ClassifiedIntent,
  retrievalResult: RetrievalResult,
  generationTimeMs: number,
): ChatResponse {
  let content: string;

  if (!retrievalResult.data || Object.keys(retrievalResult.data).length === 0) {
    content = "I couldn't fetch the data needed to answer that right now. This might be a temporary issue — try again in a moment, or rephrase your question.";
  } else {
    // Try to build a basic response from the raw data
    switch (intent.intent) {
      case 'account_lookup': {
        const acct = retrievalResult.data.account;
        if (acct) {
          content = `Here's what I have on ${acct.companyName || acct.name || acct.domain || 'this account'}:\n`;
          if (acct.domain) content += `- Domain: ${acct.domain}\n`;
          if (acct.industry) content += `- Industry: ${acct.industry}\n`;
          if (acct.opportunityScore) content += `- Opportunity Score: ${acct.opportunityScore}\n`;
          content += '\n_(Generated from raw data — my AI summarization is temporarily unavailable.)_';
        } else {
          content = "I found some data but couldn't generate a proper summary. Try asking again.";
        }
        break;
      }
      case 'morning_briefing':
        content = "I have your briefing data but couldn't format it properly. Try asking \"what's my morning briefing?\" again in a moment.";
        break;
      default:
        content = "I have some relevant data but couldn't generate a proper response. Try rephrasing your question or asking again in a moment.";
    }
  }

  return {
    content,
    intent: intent.intent,
    entities: intent.entities,
    sources: retrievalResult.sources || [],
    followUpSuggestions: generateFollowUpSuggestions(intent.intent, retrievalResult.data),
    generationTimeMs,
    totalTimeMs: retrievalResult.retrievalTimeMs + generationTimeMs,
  };
}
