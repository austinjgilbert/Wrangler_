/**
 * Chat Routes — HTTP endpoint handlers for the upgraded chat module.
 *
 * Wraps the chat module (src/chat/) with proper request parsing,
 * error handling, and response formatting that matches the existing
 * Wrangler_ conventions.
 *
 * Endpoints:
 *   POST /api/chat/message     — Main chat (JSON response)
 *   POST /api/chat/stream      — Streaming chat (SSE)
 *   POST /api/chat/feedback    — Thumbs up/down + corrections
 *   GET  /api/chat/session/:id — Conversation history
 *   GET  /api/chat/audit       — Audit log (admin)
 *
 * Auth is handled at the routing layer in index.js (same as operator console).
 * These handlers assume the request has already passed auth checks.
 *
 * @module routes/chatRoutes
 */

import { createErrorResponse, createSuccessResponse, addCorsHeaders } from '../utils/response.js';

// ─── POST /api/chat/message ─────────────────────────────────────────────────

/**
 * Main chat endpoint — accepts a message, returns a JSON response.
 *
 * Request body:
 *   { sessionId: string, message: string }
 *
 * Response:
 *   { ok: true, data: ChatResponse }
 */
export async function handleChatMessage(request: Request, requestId: string, env: any) {
  try {
    const body = (await request.json()) as Record<string, any>;
    const sessionId = String(body.sessionId || '').trim();
    const message = String(body.message || '').trim();

    if (!sessionId) {
      return createErrorResponse('VALIDATION_ERROR', 'sessionId is required', {}, 400, requestId);
    }
    if (!message) {
      return createErrorResponse('VALIDATION_ERROR', 'message is required', {}, 400, requestId);
    }

    // Dynamic import for cold-start optimization
    const { handleChatMessage: processChatMessage } = await import('../chat/index.ts');

    const result = await processChatMessage(env, {
      sessionId,
      message,
      stream: false,
    });

    return createSuccessResponse(result, requestId);
  } catch (error: any) {
    return createErrorResponse('CHAT_MESSAGE_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── POST /api/chat/stream ──────────────────────────────────────────────────

/**
 * Streaming chat endpoint — returns an SSE stream.
 *
 * Request body:
 *   { sessionId: string, message: string }
 *
 * Response:
 *   Content-Type: text/event-stream
 *   Each chunk is an NDJSON line: { type: "token"|"sources"|"done", ... }
 */
export async function handleChatStream(request: Request, requestId: string, env: any) {
  try {
    const body = (await request.json()) as Record<string, any>;
    const sessionId = String(body.sessionId || '').trim();
    const message = String(body.message || '').trim();

    if (!sessionId) {
      return createErrorResponse('VALIDATION_ERROR', 'sessionId is required', {}, 400, requestId);
    }
    if (!message) {
      return createErrorResponse('VALIDATION_ERROR', 'message is required', {}, 400, requestId);
    }

    // Dynamic import for cold-start optimization
    const { handleChatMessage: processChatMessage } = await import('../chat/index.ts');

    const result = await processChatMessage(env, {
      sessionId,
      message,
      stream: true,
    });

    // handleChatMessage returns a ReadableStream when stream: true
    if (result instanceof ReadableStream) {
      const corsHeaders = addCorsHeaders(null).headers;
      return new Response(result, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Request-Id': requestId,
          ...Object.fromEntries(corsHeaders.entries()),
        },
      });
    }

    // Fallback: if the module returned a non-stream response (shouldn't happen,
    // but handle gracefully), return it as JSON
    return createSuccessResponse(result, requestId);
  } catch (error: any) {
    return createErrorResponse('CHAT_STREAM_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── POST /api/chat/feedback ────────────────────────────────────────────────

/**
 * Feedback endpoint — records thumbs up/down and optional correction text.
 *
 * Request body:
 *   { sessionId: string, turnId: string, feedback: "up"|"down", text?: string }
 *
 * Response:
 *   { ok: true, data: { success: true } }
 */
export async function handleChatFeedback(request: Request, requestId: string, env: any) {
  try {
    const body = (await request.json()) as Record<string, any>;
    const sessionId = String(body.sessionId || '').trim();
    const turnId = String(body.turnId || body.messageId || '').trim();
    const feedback = String(body.feedback || '').trim();
    const text = body.text ? String(body.text).trim() : undefined;

    if (!sessionId) {
      return createErrorResponse('VALIDATION_ERROR', 'sessionId is required', {}, 400, requestId);
    }
    if (!turnId) {
      return createErrorResponse('VALIDATION_ERROR', 'turnId is required', {}, 400, requestId);
    }
    if (feedback !== 'up' && feedback !== 'down') {
      return createErrorResponse('VALIDATION_ERROR', 'feedback must be "up" or "down"', {}, 400, requestId);
    }

    // Dynamic import for cold-start optimization
    const { handleFeedback } = await import('../chat/index.ts');

    const result = await handleFeedback(env, {
      sessionId,
      turnId,
      feedback: feedback as 'up' | 'down',
      text,
    });

    if (!result.success) {
      return createErrorResponse('FEEDBACK_ERROR', result.error || 'Failed to record feedback', {}, 500, requestId);
    }

    return createSuccessResponse({ success: true }, requestId);
  } catch (error: any) {
    return createErrorResponse('CHAT_FEEDBACK_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── GET /api/chat/session/:id ──────────────────────────────────────────────

/**
 * Session history endpoint — returns the conversation turns for a session.
 *
 * The session ID is extracted from the URL path in index.js and passed as a parameter.
 *
 * Response:
 *   { ok: true, data: { sessionId, turns, createdAt, lastActiveAt } }
 */
export async function handleGetSession(request: Request, requestId: string, env: any, sessionId: string) {
  try {
    if (!sessionId) {
      return createErrorResponse('VALIDATION_ERROR', 'sessionId is required', {}, 400, requestId);
    }

    const kv = env.MOLTBOOK_ACTIVITY_KV;
    if (!kv) {
      return createErrorResponse('SERVICE_UNAVAILABLE', 'KV storage not configured', {}, 503, requestId);
    }

    const session = await kv.get(`chat:session:${sessionId}`, 'json');
    if (!session) {
      return createErrorResponse('NOT_FOUND', 'Session not found', { sessionId }, 404, requestId);
    }

    return createSuccessResponse(session, requestId);
  } catch (error: any) {
    return createErrorResponse('CHAT_SESSION_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── GET /api/chat/audit ────────────────────────────────────────────────────

/**
 * Audit log endpoint — returns recent audit entries (admin only).
 *
 * Query params:
 *   ?limit=50        — Max entries to return (default 50, max 200)
 *   ?sessionId=xxx   — Filter to a specific session
 *
 * Response:
 *   { ok: true, data: { entries: AuditEntry[] } }
 */
export async function handleGetAudit(request: Request, requestId: string, env: any) {
  try {
    const url = new URL(request.url);
    const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(1, limitParam), 200);
    const sessionIdFilter = url.searchParams.get('sessionId') || null;

    // Dynamic import for cold-start optimization
    const { getRecentAuditEntries, getSessionAuditTrail } = await import('../chat/audit.ts');

    let entries;
    if (sessionIdFilter) {
      entries = await getSessionAuditTrail(env, sessionIdFilter);
    } else {
      entries = await getRecentAuditEntries(env, limit);
    }

    return createSuccessResponse({
      entries,
      count: entries.length,
      limit,
      ...(sessionIdFilter && { sessionId: sessionIdFilter }),
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('CHAT_AUDIT_ERROR', error.message, {}, 500, requestId);
  }
}
