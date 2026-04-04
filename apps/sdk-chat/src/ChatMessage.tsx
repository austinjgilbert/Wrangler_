/**
 * ChatMessage — Renders a single chat message bubble.
 *
 * Handles user vs assistant styling, simple markdown rendering,
 * source attribution badges, and feedback buttons.
 *
 * Adapted from sanity/plugins/chat-tool/ChatMessage.tsx for SDK App.
 * Changes: minimal — same @sanity/ui components, same rendering logic.
 */

import React, { type ReactNode } from 'react';
import {
  Box,
  Card,
  Flex,
  Stack,
  Text,
  Button,
  Badge,
  Spinner,
} from '@sanity/ui';
import type { ChatMessage as ChatMessageType, Source } from './useChat';
import { CardRenderer } from './components/cards';

// ---------------------------------------------------------------------------
// Simple Markdown Renderer
// ---------------------------------------------------------------------------

/**
 * Minimal markdown-to-React renderer.
 * Handles: ## headers, **bold**, `code`, - lists, and paragraphs.
 */
function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <Stack key={`list-${key++}`} space={1} paddingLeft={3}>
          {listItems}
        </Stack>,
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    // Headers
    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <Text key={key++} size={2} weight="bold">
          {renderInline(line.slice(3))}
        </Text>,
      );
      continue;
    }

    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <Text key={key++} size={1} weight="bold">
          {renderInline(line.slice(4))}
        </Text>,
      );
      continue;
    }

    // List items
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const content = line.slice(2);
      listItems.push(
        <Flex key={`li-${key++}`} gap={2} align="flex-start">
          <Text size={1} muted>
            •
          </Text>
          <Text size={1}>{renderInline(content)}</Text>
        </Flex>,
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <Text key={key++} size={1}>
        {renderInline(line)}
      </Text>,
    );
  }

  flushList();
  return elements;
}

/**
 * Render inline markdown: **bold** and `code`.
 */
function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  // Match **bold** and `code` patterns
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={key++}>{match[2]}</strong>,
      );
    } else if (match[3]) {
      // `code`
      parts.push(
        <code
          key={key++}
          style={{
            background: 'var(--card-code-bg-color, rgba(0,0,0,0.06))',
            padding: '0.1em 0.3em',
            borderRadius: '3px',
            fontSize: '0.9em',
            fontFamily: 'var(--font-family-code, monospace)',
          }}
        >
          {match[3]}
        </code>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Source Attribution
// ---------------------------------------------------------------------------

/**
 * Source badges — subtle so they don't compete with content.
 * Uses default tone (gray) instead of primary.
 */
function SourceBadges({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;

  return (
    <Flex gap={2} wrap="wrap" paddingTop={2} style={{ opacity: 0.7 }}>
      {sources.map((s, i) => (
        <Badge
          key={i}
          tone="default"
          fontSize={0}
          padding={1}
          title={s.fact}
        >
          {s.source}
        </Badge>
      ))}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Feedback Buttons
// ---------------------------------------------------------------------------

function FeedbackButtons({
  messageId,
  feedback,
  onFeedback,
}: {
  messageId: string;
  feedback?: 'up' | 'down' | null;
  onFeedback: (id: string, rating: 'up' | 'down') => void;
}) {
  return (
    <Flex gap={1} paddingTop={2}>
      <Button
        mode={feedback === 'up' ? 'default' : 'ghost'}
        tone={feedback === 'up' ? 'positive' : 'default'}
        fontSize={0}
        padding={2}
        text="👍"
        onClick={() => onFeedback(messageId, 'up')}
        disabled={feedback !== undefined && feedback !== null}
      />
      <Button
        mode={feedback === 'down' ? 'default' : 'ghost'}
        tone={feedback === 'down' ? 'critical' : 'default'}
        fontSize={0}
        padding={2}
        text="👎"
        onClick={() => onFeedback(messageId, 'down')}
        disabled={feedback !== undefined && feedback !== null}
      />
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: ChatMessageType;
  onFeedback: (id: string, rating: 'up' | 'down') => void;
}

/**
 * User message — right-aligned bubble with background.
 */
function UserMessage({ message }: { message: ChatMessageType }) {
  return (
    <Flex justify="flex-end" paddingY={1}>
      <Box style={{ maxWidth: '80%' }}>
        <Card
          padding={3}
          radius={2}
          shadow={1}
          tone="primary"
          style={{ borderBottomRightRadius: 0 }}
        >
          <Stack space={2}>
            <Text size={0} weight="bold" muted>
              You
            </Text>
            <Text size={1}>{message.content}</Text>
          </Stack>
        </Card>
      </Box>
    </Flex>
  );
}

/**
 * Assistant message — full-width, no bubble chrome.
 * Content flows directly into the layout. Cards break out to full width.
 */
function AssistantMessage({
  message,
  onFeedback,
}: {
  message: ChatMessageType;
  onFeedback: (id: string, rating: 'up' | 'down') => void;
}) {
  return (
    <Box paddingY={2} style={{ width: '100%' }}>
      <Stack space={3}>
        {/* Text content — no background, no border, no bubble */}
        {message.content ? (
          <Stack space={2}>{renderMarkdown(message.content)}</Stack>
        ) : (
          message.isStreaming && (
            <Flex align="center" gap={2}>
              <Spinner muted />
              <Text size={1} muted style={{ fontStyle: 'italic' }}>
                Thinking…
              </Text>
            </Flex>
          )
        )}

        {/* Streaming indicator — subtle dot while tokens arrive */}
        {message.isStreaming && message.content && (
          <Text size={0} muted style={{ opacity: 0.5 }}>
            ●
          </Text>
        )}

        {/* Card components — rendered at full container width */}
        {message.cards && message.cards.length > 0 && (
          <Stack
            space={3}
            style={{
              /* Break out of 720px parent to use full available width */
              marginLeft: -16,
              marginRight: -16,
              width: 'calc(100% + 32px)',
            }}
          >
            {message.cards.map((card, i) => (
              <CardRenderer key={i} {...card} />
            ))}
          </Stack>
        )}

        {/* Source attribution */}
        {message.sources && message.sources.length > 0 && (
          <SourceBadges sources={message.sources} />
        )}

        {/* Feedback (not while streaming) */}
        {!message.isStreaming && message.content && (
          <FeedbackButtons
            messageId={message.id}
            feedback={message.feedback}
            onFeedback={onFeedback}
          />
        )}
      </Stack>
    </Box>
  );
}

export function ChatMessageBubble({ message, onFeedback }: ChatMessageProps) {
  if (message.role === 'user') {
    return <UserMessage message={message} />;
  }

  return <AssistantMessage message={message} onFeedback={onFeedback} />;
}
