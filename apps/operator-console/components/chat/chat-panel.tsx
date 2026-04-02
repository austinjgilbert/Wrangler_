'use client';

import { useEffect, useRef } from 'react';
import { MessageSquare, Sparkles, Sun, Building2, Radio, Phone, Calendar } from 'lucide-react';
import { useChat } from '@/lib/use-chat';
import { ChatMessageBubble } from './chat-message';
import { ChatInput } from './chat-input';
import { SuggestionChips } from './suggestion-chips';

const CONVERSATION_STARTERS = [
  { text: 'Good morning', icon: Sun, label: 'Morning briefing' },
  { text: 'Show me top accounts', icon: Building2, label: 'Account lookup' },
  { text: 'Any new signals?', icon: Radio, label: 'Signal check' },
  { text: 'Who should I call?', icon: Phone, label: 'Person lookup' },
  { text: 'Prep me for my next meeting', icon: Calendar, label: 'Meeting prep' },
];

export function ChatPanel() {
  const { messages, isLoading, sendMessage, sendFeedback } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isEmpty = messages.length === 0;

  // Get the latest assistant message's suggestions for the follow-up chips
  const lastAssistantMsg = [...messages].reverse().find(
    (m) => m.role === 'assistant' && !m.isStreaming,
  );
  const followUpSuggestions = lastAssistantMsg?.suggestions || [];

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState onSelect={sendMessage} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                onFeedback={sendFeedback}
              />
            ))}

            {/* Follow-up suggestions after the last assistant message */}
            {followUpSuggestions.length > 0 && !isLoading && (
              <div className="pl-10">
                <SuggestionChips
                  suggestions={followUpSuggestions}
                  onSelect={sendMessage}
                  disabled={isLoading}
                />
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border)] bg-[var(--panel)] px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <ChatInput onSend={sendMessage} isLoading={isLoading} />
          <div className="mt-2 text-center text-[10px] text-[var(--muted)]">
            Wrangler_ AI can make mistakes. Verify important information.
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="mx-auto max-w-2xl text-center">
        {/* Logo / icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-muted)]">
          <Sparkles className="h-8 w-8 text-[var(--accent)]" />
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
          What can I help you with?
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          I have access to your accounts, signals, patterns, and pipeline. Ask me anything.
        </p>

        {/* Conversation starters */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONVERSATION_STARTERS.map((starter) => {
            const Icon = starter.icon;
            return (
              <button
                key={starter.text}
                type="button"
                onClick={() => onSelect(starter.text)}
                className="card flex items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--card-hover)]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
                  <Icon className="h-4 w-4 text-[var(--accent)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text)]">{starter.text}</div>
                  <div className="text-xs text-[var(--muted)]">{starter.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
