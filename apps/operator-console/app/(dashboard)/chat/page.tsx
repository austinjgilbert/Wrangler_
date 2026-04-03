'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSnapshot } from '../layout';
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { streamCopilotQuery } from '@/lib/api';
import type { CopilotQueryResult } from '@/lib/types';

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  result?: CopilotQueryResult;
  streaming?: boolean;
};

/* ─── Starter Chips ─────────────────────────────────────────────────────── */

const STARTERS = [
  'Give me a morning briefing',
  'Which accounts need attention?',
  'What signals came in today?',
  'Show me top opportunities',
  'Run enrichment on stale accounts',
  'What patterns are emerging?',
];

/* ─── Chat Page ─────────────────────────────────────────────────────────── */

export default function ChatPage() {
  const { snapshot } = useSnapshot();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend(text?: string) {
    const prompt = text || input.trim();
    if (!prompt || streaming) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: prompt,
    };

    const assistantMsg: Message = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    try {
      await streamCopilotQuery(prompt, { section: 'chat' }, {
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content + chunk }
                : m,
            ),
          );
        },
        onResult: (result) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, result, streaming: false }
                : m,
            ),
          );
        },
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                content: 'Something went wrong. Please try again.',
                streaming: false,
              }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
      // Mark streaming done in case onResult wasn't called
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id && m.streaming
            ? { ...m, streaming: false }
            : m,
        ),
      );
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    setMessages([]);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          /* Empty State */
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent-muted)] flex items-center justify-center mx-auto">
                <Sparkles size={24} className="text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Wrangler Chat</h2>
                <p className="text-[13px] text-[var(--muted)] mt-2">
                  Ask about accounts, signals, pipeline, or kick off enrichment jobs.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="px-3 py-1.5 rounded-lg text-[12px] bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--highlight)] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Message List */
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    msg.role === 'user'
                      ? 'bg-[var(--accent-muted)]'
                      : 'bg-[var(--highlight)]20'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User size={14} className="text-[var(--accent)]" />
                  ) : (
                    <Bot size={14} className="text-[var(--highlight)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[var(--muted)] mb-1">
                    {msg.role === 'user' ? 'You' : 'Wrangler'}
                  </p>
                  <div className="text-[13px] text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                    {msg.streaming && (
                      <span className="inline-block w-1.5 h-4 bg-[var(--highlight)] rounded-sm animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                  {msg.result?.action && (
                    <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border-subtle)]">
                      <p className="text-[11px] text-[var(--muted)] mb-1">Suggested action</p>
                      <p className="text-[12px] text-[var(--text)]">
                        {msg.result.action.type}: {msg.result.action.command}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--panel)] px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors"
              title="Clear chat"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask Wrangler anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming}
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--highlight)] disabled:opacity-50"
            />
          </div>
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || streaming}
            className="p-2.5 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-30"
          >
            {streaming ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
