/**
 * useChat — React hook for chat state management with NDJSON streaming.
 *
 * Adapted from sanity/plugins/chat-tool/useChat.ts for the Operator Console.
 * Uses the app's resolveEndpoint/authHeaders pattern for API resolution.
 *
 * Manages conversation state, sends messages to the chat worker via streaming,
 * parses NDJSON responses, and handles feedback submission.
 */

'use client';

import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Source {
  fact: string;
  source: string;
  observedAt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  suggestions?: string[];
  feedback?: 'up' | 'down' | null;
  isStreaming?: boolean;
  meta?: Record<string, unknown>;
}

interface StreamToken {
  type: 'token';
  text: string;
}

interface StreamSources {
  type: 'sources';
  data: Source[];
}

interface StreamSuggestions {
  type: 'suggestions';
  data: string[];
}

interface StreamDone {
  type: 'done';
  meta?: Record<string, unknown>;
}

type StreamEvent = StreamToken | StreamSources | StreamSuggestions | StreamDone;

// ---------------------------------------------------------------------------
// Endpoint resolution — mirrors lib/api.ts pattern
// ---------------------------------------------------------------------------

function resolveEndpoint(proxyPath: string, workerPath: string): string {
  const workerUrl =
    typeof window !== 'undefined'
      ? (window as Record<string, unknown>).__WORKER_URL ??
        process.env.NEXT_PUBLIC_WORKER_URL
      : process.env.NEXT_PUBLIC_WORKER_URL;

  if (workerUrl) {
    return `${String(workerUrl).replace(/\/$/, '')}${workerPath}`;
  }
  return proxyPath;
}

function authHeaders(): Record<string, string> {
  const key =
    typeof window !== 'undefined'
      ? (window as Record<string, unknown>).__WORKER_API_KEY ??
        process.env.NEXT_PUBLIC_WORKER_API_KEY
      : process.env.NEXT_PUBLIC_WORKER_API_KEY;
  if (key) return { 'X-API-Key': String(key) };
  return {};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getSessionId(): string {
  if (typeof sessionStorage === 'undefined') return `session-${generateId()}`;
  const stored = sessionStorage.getItem('chat-session-id');
  if (stored) return stored;
  const id = `session-${generateId()}`;
  sessionStorage.setItem('chat-session-id', id);
  return id;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>(getSessionId());

  /**
   * Send a user message and stream the assistant response.
   */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text.trim(),
      };

      const assistantId = generateId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const endpoint = resolveEndpoint(
          '/api/chat/stream',
          '/api/chat/stream',
        );

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({
            message: text.trim(),
            sessionId: sessionIdRef.current,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last (possibly incomplete) line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const event: StreamEvent = JSON.parse(trimmed);

              switch (event.type) {
                case 'token':
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: m.content + event.text }
                        : m,
                    ),
                  );
                  break;

                case 'sources':
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, sources: event.data }
                        : m,
                    ),
                  );
                  break;

                case 'suggestions':
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, suggestions: event.data }
                        : m,
                    ),
                  );
                  break;

                case 'done':
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, isStreaming: false, meta: event.meta }
                        : m,
                    ),
                  );
                  break;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // Ensure streaming flag is cleared even if no "done" event
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m,
          ),
        );
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        const errorText =
          err instanceof Error ? err.message : 'Something went wrong';

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `⚠️ ${errorText}`, isStreaming: false }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [isLoading],
  );

  /**
   * Submit thumbs-up / thumbs-down feedback for a message.
   */
  const submitFeedback = useCallback(
    async (messageId: string, rating: 'up' | 'down') => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, feedback: rating } : m,
        ),
      );

      try {
        const endpoint = resolveEndpoint(
          '/api/chat/feedback',
          '/api/chat/feedback',
        );

        await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            turnId: messageId,
            feedback: rating,
          }),
        });
      } catch {
        // Feedback is best-effort — don't disrupt the UI
      }
    },
    [],
  );

  /**
   * Clear conversation and start fresh.
   */
  const clearChat = useCallback(() => {
    setMessages([]);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('chat-session-id');
    }
    sessionIdRef.current = getSessionId();
  }, []);

  /**
   * Cancel an in-flight streaming request.
   */
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    submitFeedback,
    clearChat,
    cancelStream,
  };
}
