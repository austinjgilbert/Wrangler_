'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  StopCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChat, type ChatMessage, type Source } from '@/lib/use-chat';
import {
  extractEntityRefs,
  matchBoldEntity,
  suggestionNavHref,
  type EntityRef,
} from '@/lib/entity-linker';

/* ─── Conversation Starters ─────────────────────────────────────────────── */

const STARTERS = [
  { label: 'What should I do today?', intent: 'morning_briefing' },
  { label: 'Tell me about a company', intent: 'account_lookup' },
  { label: 'Any new signals?', intent: 'signal_check' },
  { label: 'Who should I call next?', intent: 'person_lookup' },
  { label: 'Prep me for my next meeting', intent: 'meeting_prep' },
] as const;

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ─── Lightweight Markdown Renderer ─────────────────────────────────────── */

function renderMarkdown(text: string, entities: EntityRef[] = []): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listKey = 0;

  function flushList() {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-1 my-2">
          {listItems.map((item, i) => (
            <li key={i} className="text-[var(--text)] text-[13px] leading-relaxed">
              {renderInline(item, entities)}
            </li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      flushList();
      nodes.push(
        <h4 key={i} className="text-[13px] font-semibold text-[var(--text)] mt-3 mb-1">
          {renderInline(h3Match[1], entities)}
        </h4>,
      );
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      flushList();
      nodes.push(
        <h3 key={i} className="text-[14px] font-semibold text-[var(--text)] mt-4 mb-1">
          {renderInline(h2Match[1], entities)}
        </h3>,
      );
      continue;
    }

    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      flushList();
      nodes.push(
        <h2 key={i} className="text-[15px] font-bold text-[var(--text)] mt-4 mb-2">
          {renderInline(h1Match[1], entities)}
        </h2>,
      );
      continue;
    }

    // Unordered list items
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      listItems.push(ulMatch[1]);
      continue;
    }

    // Ordered list items
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      listItems.push(olMatch[1]);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      flushList();
      continue;
    }

    // Regular paragraph
    flushList();
    nodes.push(
      <p key={i} className="text-[13px] text-[var(--text)] leading-relaxed my-1">
        {renderInline(line, entities)}
      </p>,
    );
  }

  flushList();
  return nodes;
}

/** Render inline markdown: **bold**, *italic*, `code`, [links](url) */
function renderInline(text: string, entities: EntityRef[] = []): React.ReactNode {
  // Split on inline patterns
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(boldMatch[1]);

      // Check if the bold text matches a known entity → render as Link
      const entity = matchBoldEntity(boldMatch[2], entities);
      if (entity) {
        parts.push(
          <Link
            key={key++}
            href={entity.href}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            {boldMatch[2]}
          </Link>,
        );
      } else {
        parts.push(
          <strong key={key++} className="font-semibold text-[var(--text)]">
            {boldMatch[2]}
          </strong>,
        );
      }
      remaining = boldMatch[3];
      continue;
    }

    // Inline code: `code`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(codeMatch[1]);
      parts.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--highlight)] text-[12px] font-mono"
        >
          {codeMatch[2]}
        </code>,
      );
      remaining = codeMatch[3];
      continue;
    }

    // No more patterns — push the rest
    parts.push(remaining);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/* ─── Source Badge ───────────────────────────────────────────────────────── */

function SourceBadge({ source }: { source: Source }) {
  // Parse source type from "account:acme-corp" format
  const [type, id] = source.source.includes(':')
    ? source.source.split(':', 2)
    : ['data', source.source];

  const dateStr = source.observedAt
    ? new Date(source.observedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--card)] border border-[var(--border-subtle)] text-[11px] text-[var(--muted)]">
      <span className="text-[var(--highlight)] font-medium capitalize">{type}</span>
      <span className="truncate max-w-[120px]" title={id}>
        {id}
      </span>
      {dateStr && (
        <>
          <span className="text-[var(--border)]">·</span>
          <span>{dateStr}</span>
        </>
      )}
    </div>
  );
}

/* ─── Sources Section ───────────────────────────────────────────────────── */

function SourcesSection({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-wider">
        Sources
      </p>
      <div className="space-y-1.5">
        {sources.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <ExternalLink size={10} className="text-[var(--muted)] mt-1 shrink-0" />
            <div className="min-w-0">
              <p className="text-[12px] text-[var(--text-secondary)] leading-snug">
                {s.fact}
              </p>
              <SourceBadge source={s} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Suggestion Chips ──────────────────────────────────────────────────── */

function SuggestionChips({
  suggestions,
  entities,
  onSelect,
  onNavigate,
}: {
  suggestions: string[];
  entities: EntityRef[];
  onSelect: (text: string) => void;
  onNavigate: (href: string) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((s, i) => {
        const navHref = suggestionNavHref(s, entities);
        return (
          <button
            key={i}
            onClick={() => (navHref ? onNavigate(navHref) : onSelect(s))}
            className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer ${
              navHref
                ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/20 hover:border-[var(--accent)]/50'
                : 'bg-[var(--accent-secondary)]/10 border border-[var(--accent-secondary)]/30 text-[var(--accent-secondary)] hover:bg-[var(--accent-secondary)]/20 hover:border-[var(--accent-secondary)]/50'
            }`}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Feedback Buttons ──────────────────────────────────────────────────── */

function FeedbackButtons({
  messageId,
  feedback,
  onFeedback,
}: {
  messageId: string;
  feedback?: 'up' | 'down' | null;
  onFeedback: (messageId: string, rating: 'up' | 'down') => void;
}) {
  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        onClick={() => onFeedback(messageId, 'up')}
        className={`p-1 rounded transition-colors ${
          feedback === 'up'
            ? 'text-[var(--success)] bg-[var(--success)]/10'
            : 'text-[var(--muted)] hover:text-[var(--success)] hover:bg-[var(--success)]/10'
        }`}
        title="Helpful"
      >
        <ThumbsUp size={12} />
      </button>
      <button
        onClick={() => onFeedback(messageId, 'down')}
        className={`p-1 rounded transition-colors ${
          feedback === 'down'
            ? 'text-[var(--error)] bg-[var(--error)]/10'
            : 'text-[var(--muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/10'
        }`}
        title="Not helpful"
      >
        <ThumbsDown size={12} />
      </button>
    </div>
  );
}

/* ─── Streaming Skeleton ───────────────────────────────────────────────── */

function StreamingSkeleton() {
  const shimmerStyle = {
    height: '14px',
    borderRadius: 'var(--wrangler-radius-sm)',
    background: `linear-gradient(90deg, var(--wrangler-surface-raised) 25%, var(--wrangler-surface-overlay) 50%, var(--wrangler-surface-raised) 75%)`,
    backgroundSize: '200% 100%',
    animation: 'wrangler-shimmer 1.5s ease-in-out infinite',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wrangler-space-3)', padding: 'var(--wrangler-space-4) 0' }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 'var(--wrangler-space-2)' }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: 'var(--wrangler-accent-primary)',
          animation: 'wrangler-pulse 1.5s ease-in-out infinite',
        }} />
        <span style={{ fontSize: 'var(--wrangler-font-size-xs)', color: 'var(--wrangler-text-muted)' }}>
          Analyzing...
        </span>
      </div>
      <div style={{ ...shimmerStyle, width: '60%' }} />
      <div style={{ ...shimmerStyle, width: '80%' }} />
      <div style={{ ...shimmerStyle, width: '45%' }} />
    </div>
  );
}

/* ─── Error State ──────────────────────────────────────────────────────── */

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="text-[var(--error)] mt-0.5 shrink-0" />
        <p className="text-[13px] text-[var(--muted)] leading-relaxed">
          I couldn&apos;t retrieve that information. Try again or rephrase your question.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/20 hover:border-[var(--accent)]/50 transition-colors cursor-pointer"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}

/* ─── Streaming Indicator ───────────────────────────────────────────────── */

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <span className="w-1 h-1 rounded-full bg-[var(--highlight)] animate-bounce [animation-delay:0ms]" />
      <span className="w-1 h-1 rounded-full bg-[var(--highlight)] animate-bounce [animation-delay:150ms]" />
      <span className="w-1 h-1 rounded-full bg-[var(--highlight)] animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

/* ─── Message Bubble ────────────────────────────────────────────────────── */

function MessageBubble({
  message,
  onSuggestionSelect,
  onNavigate,
  onFeedback,
  onRetry,
}: {
  message: ChatMessage;
  onSuggestionSelect: (text: string) => void;
  onNavigate: (href: string) => void;
  onFeedback: (messageId: string, rating: 'up' | 'down') => void;
  onRetry: () => void;
}) {
  const isUser = message.role === 'user';
  const entities = !isUser && message.sources ? extractEntityRefs(message.sources) : [];
  const isError = !isUser && message.content.startsWith('⚠️');

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {/* Avatar — assistant only (left side) */}
      {!isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-[var(--highlight)]/15">
          <Bot size={14} className="text-[var(--highlight)]" />
        </div>
      )}

      <div className={`flex-1 min-w-0 ${isUser ? 'max-w-[80%] ml-auto' : ''}`}>
        {/* Label */}
        <p
          className={`text-[11px] text-[var(--muted)] mb-1 ${isUser ? 'text-right' : ''}`}
        >
          {isUser ? 'You' : 'Wrangler'}
        </p>

        {/* Content */}
        <div
          className={`rounded-xl px-4 py-3 ${
            isUser
              ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/20 text-[var(--text)]'
              : 'bg-[var(--card)] border border-[var(--border-subtle)] text-[var(--text)]'
          }`}
        >
          {isUser ? (
            <p className="text-[13px] leading-relaxed">{message.content}</p>
          ) : isError ? (
            <ErrorState onRetry={onRetry} />
          ) : (
            <div className="space-y-0">
              {message.content ? (
                renderMarkdown(message.content, entities)
              ) : message.isStreaming ? (
                <StreamingSkeleton />
              ) : null}
              {message.isStreaming && message.content && <StreamingDots />}
            </div>
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <SourcesSection sources={message.sources} />
        )}

        {/* Suggestions */}
        {!isUser && !message.isStreaming && message.suggestions && (
          <SuggestionChips
            suggestions={message.suggestions}
            entities={entities}
            onSelect={onSuggestionSelect}
            onNavigate={onNavigate}
          />
        )}

        {/* Feedback */}
        {!isUser && !isError && !message.isStreaming && message.content && (
          <FeedbackButtons
            messageId={message.id}
            feedback={message.feedback}
            onFeedback={onFeedback}
          />
        )}
      </div>

      {/* Avatar — user only (right side) */}
      {isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-[var(--accent)]/15">
          <User size={14} className="text-[var(--accent)]" />
        </div>
      )}
    </div>
  );
}

/* ─── Chat Page ─────────────────────────────────────────────────────────── */

export default function ChatPage() {
  const {
    messages,
    isLoading,
    sendMessage,
    submitFeedback,
    clearChat,
    cancelStream,
  } = useChat();

  const router = useRouter();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Auto-scroll to bottom on new messages */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /* Auto-focus input on mount */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* Send handler */
  function handleSend(text?: string) {
    const prompt = text || input.trim();
    if (!prompt || isLoading) return;
    setInput('');
    sendMessage(prompt);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    clearChat();
    inputRef.current?.focus();
  }

  function handleSuggestionSelect(text: string) {
    sendMessage(text);
  }

  function handleNavigate(href: string) {
    router.push(href);
  }

  function handleRetry() {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) sendMessage(lastUserMsg.content);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          /* ── Briefing-First Empty State ───────────────── */
          <div className="flex flex-col items-center justify-center h-full" style={{ gap: 'var(--wrangler-space-6)', padding: 'var(--wrangler-space-8)' }}>
            <h1 style={{
              fontSize: 'var(--wrangler-font-size-2xl)',
              fontWeight: 600,
              color: 'var(--wrangler-text-primary)',
            }}>
              {getTimeGreeting()}. Ready for your briefing?
            </h1>
            <p style={{
              fontSize: 'var(--wrangler-font-size-base)',
              color: 'var(--wrangler-text-tertiary)',
              maxWidth: '400px',
              textAlign: 'center',
            }}>
              I&apos;ll analyze your accounts, signals, and pipeline to surface what matters today.
            </p>
            <button
              onClick={() => handleSend('good morning')}
              style={{
                background: 'var(--wrangler-accent-primary)',
                color: 'var(--wrangler-text-primary)',
                border: 'none',
                borderRadius: 'var(--wrangler-radius-lg)',
                padding: 'var(--wrangler-space-3) var(--wrangler-space-6)',
                fontSize: 'var(--wrangler-font-size-base)',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'var(--wrangler-transition-fast)',
              }}
            >
              Start my day
            </button>
            <div className="flex flex-wrap justify-center gap-2 mt-4" style={{ maxWidth: '500px' }}>
              {STARTERS.filter(s => s.intent !== 'morning_briefing').map((s) => (
                <button
                  key={s.intent}
                  onClick={() => handleSend(s.label)}
                  className="px-3 py-2 rounded-xl text-[12px] border transition-all"
                  style={{
                    background: 'var(--wrangler-surface-raised)',
                    borderColor: 'var(--wrangler-border-default)',
                    color: 'var(--wrangler-text-secondary)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Message List ────────────────────────────── */
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onSuggestionSelect={handleSuggestionSelect}
                onNavigate={handleNavigate}
                onFeedback={submitFeedback}
                onRetry={handleRetry}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input Bar ──────────────────────────────────── */}
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
              disabled={isLoading}
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--highlight)] disabled:opacity-50 transition-colors"
            />
          </div>
          {isLoading ? (
            <button
              onClick={cancelStream}
              className="p-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--error)] hover:border-[var(--error)] transition-colors"
              title="Stop generating"
            >
              <StopCircle size={16} />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="p-2.5 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
