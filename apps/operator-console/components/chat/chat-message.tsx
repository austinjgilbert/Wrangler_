'use client';

import { type ReactNode, useMemo } from 'react';
import { ThumbsUp, ThumbsDown, ExternalLink, Bot, User } from 'lucide-react';
import type { ChatMessage as ChatMessageType, ChatSource } from '@/lib/use-chat';

interface ChatMessageProps {
  message: ChatMessageType;
  onFeedback?: (turnId: string, feedback: 'up' | 'down') => void;
}

/** Lightweight markdown-ish renderer — no dependencies */
function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="my-2 ml-4 list-disc space-y-1 text-sm text-[var(--text-secondary)]">
          {listItems.map((item, i) => (
            <li key={i}>{inlineFormat(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  }

  for (const line of lines) {
    // Headers
    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={key++} className="mt-3 mb-1 text-sm font-semibold text-[var(--text)]">
          {inlineFormat(line.slice(4))}
        </h4>,
      );
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={key++} className="mt-4 mb-1.5 text-base font-semibold text-[var(--text)]">
          {inlineFormat(line.slice(3))}
        </h3>,
      );
    } else if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={key++} className="mt-4 mb-2 text-lg font-bold text-[var(--text)]">
          {inlineFormat(line.slice(2))}
        </h2>,
      );
    }
    // List items
    else if (line.match(/^[-*]\s/)) {
      listItems.push(line.replace(/^[-*]\s/, ''));
    }
    // Numbered list items
    else if (line.match(/^\d+\.\s/)) {
      listItems.push(line.replace(/^\d+\.\s/, ''));
    }
    // Empty line
    else if (line.trim() === '') {
      flushList();
      elements.push(<div key={key++} className="h-2" />);
    }
    // Regular paragraph
    else {
      flushList();
      elements.push(
        <p key={key++} className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {inlineFormat(line)}
        </p>,
      );
    }
  }
  flushList();
  return elements;
}

/** Handle **bold**, *italic*, and `code` inline formatting */
function inlineFormat(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Split on bold, italic, and code patterns
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // Bold
      parts.push(
        <strong key={key++} className="font-semibold text-[var(--text)]">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // Italic
      parts.push(
        <em key={key++} className="italic">
          {match[3]}
        </em>,
      );
    } else if (match[4]) {
      // Code
      parts.push(
        <code
          key={key++}
          className="rounded bg-[var(--panel)] px-1.5 py-0.5 text-xs font-mono text-[var(--accent)]"
        >
          {match[4]}
        </code>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function SourceBadges({ sources }: { sources: ChatSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {sources.map((source, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-[var(--accent)]"
            >
              {source.label || source.type}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ) : (
            <span>{source.label || source.type}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-block ml-0.5">
      <span className="inline-block h-4 w-0.5 animate-pulse bg-[var(--accent)]" />
    </span>
  );
}

export function ChatMessageBubble({ message, onFeedback }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const content = useMemo(() => renderMarkdown(message.text), [message.text]);
  const turnId = message.turnId || message.id;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-start gap-2">
          <div className="rounded-2xl rounded-tr-md bg-[var(--accent)] px-4 py-2.5 text-sm text-white shadow-sm">
            {message.text}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[85%] items-start gap-3">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
          <Bot className="h-4 w-4 text-[var(--accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl rounded-tl-md border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm">
            <div className="space-y-0.5">
              {message.text ? content : null}
              {message.isStreaming && <StreamingCursor />}
              {!message.text && message.isStreaming && (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--muted)] [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--muted)] [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--muted)] [animation-delay:300ms]" />
                </div>
              )}
            </div>

            {message.sources && message.sources.length > 0 && (
              <SourceBadges sources={message.sources} />
            )}
          </div>

          {/* Feedback buttons — only show when not streaming */}
          {!message.isStreaming && message.text && onFeedback && (
            <div className="mt-1.5 flex items-center gap-1 pl-1">
              <button
                type="button"
                onClick={() => onFeedback(turnId, 'up')}
                className={`rounded-md p-1 transition ${
                  message.feedback === 'up'
                    ? 'text-[var(--success)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
                aria-label="Thumbs up"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onFeedback(turnId, 'down')}
                className={`rounded-md p-1 transition ${
                  message.feedback === 'down'
                    ? 'text-[var(--error)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
                aria-label="Thumbs down"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
