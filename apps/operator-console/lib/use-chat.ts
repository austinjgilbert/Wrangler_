'use client';

import { useState, useCallback, useRef } from 'react';

export interface ChatSource {
  type: string;
  label: string;
  url?: string;
  id?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: ChatSource[];
  suggestions?: string[];
  turnId?: string;
  feedback?: 'up' | 'down' | null;
  isStreaming?: boolean;
  timestamp: number;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      sources: [],
      suggestions: [],
      isStreaming: true,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);

    // Abort any previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          sessionId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Something went wrong. Please try again.';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {
          if (errorText) errorMessage = errorText;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: errorMessage, isStreaming: false }
              : m,
          ),
        );
        setIsLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: 'No response received.', isStreaming: false }
              : m,
          ),
        );
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          try {
            const event = JSON.parse(trimmedLine);

            switch (event.type) {
              case 'token':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, text: m.text + (event.text || '') }
                      : m,
                  ),
                );
                break;

              case 'sources':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, sources: event.data || [] }
                      : m,
                  ),
                );
                break;

              case 'suggestions':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, suggestions: event.data || [] }
                      : m,
                  ),
                );
                break;

              case 'done':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          isStreaming: false,
                          turnId: event.meta?.turnId || assistantId,
                        }
                      : m,
                  ),
                );
                break;

              case 'error':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          text: m.text || event.message || 'An error occurred.',
                          isStreaming: false,
                        }
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

      // Ensure streaming flag is cleared
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && m.isStreaming
            ? { ...m, isStreaming: false }
            : m,
        ),
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: m.text || 'Connection lost. Please try again.',
                isStreaming: false,
              }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [isLoading, sessionId]);

  const sendFeedback = useCallback(
    async (turnId: string, feedback: 'up' | 'down', text?: string) => {
      // Optimistically update the message
      setMessages((prev) =>
        prev.map((m) =>
          m.turnId === turnId || m.id === turnId
            ? { ...m, feedback }
            : m,
        ),
      );

      try {
        await fetch('/api/chat/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            turnId,
            feedback,
            text,
            sessionId,
          }),
        });
      } catch {
        // Feedback is best-effort — don't disrupt the UX
      }
    },
    [sessionId],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    sendFeedback,
    clearMessages,
    sessionId,
  };
}
