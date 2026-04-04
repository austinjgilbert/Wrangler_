/**
 * ChatView — Main chat interface for the SDK App.
 *
 * Full-viewport chat UI with message list, streaming responses,
 * suggestion chips, and conversation starters.
 *
 * Adapted from sanity/plugins/chat-tool/ChatTool.tsx for SDK App.
 * Changes:
 * - Removed definePlugin wrapper and tool registration
 * - Removed Studio-specific imports
 * - Made full-viewport (100vh) instead of panel-sized
 * - Kept all @sanity/ui components and chat logic
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  Flex,
  Stack,
  Text,
  TextInput,
  Button,
  Heading,
} from '@sanity/ui';
import { useChat } from './useChat';
import { ChatMessageBubble } from './ChatMessage';

// ---------------------------------------------------------------------------
// Conversation Starters
// ---------------------------------------------------------------------------

/**
 * Conversation starters mapped to the 5 core intents.
 * These feel natural for SDRs — not technical.
 */
const CONVERSATION_STARTERS = [
  { text: 'What should I do today?', icon: '☀️' },        // morning_briefing
  { text: 'Tell me about a company', icon: '🏢' },         // account_lookup
  { text: 'Any new signals?', icon: '📡' },                // signal_check
  { text: 'Who should I call next?', icon: '📞' },         // person_lookup
  { text: 'Prep me for my next meeting', icon: '📋' },     // meeting_prep
];

// ---------------------------------------------------------------------------
// Icons (inline SVG — no external deps)
// ---------------------------------------------------------------------------

function SendIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      style={{ flex: 1 }}
      padding={4}
    >
      <Stack space={4} style={{ maxWidth: 480, textAlign: 'center' }}>
        <Heading size={2}>💬 Chat with your data</Heading>
        <Text size={1} muted>
          Ask questions about accounts, people, technologies, and signals in
          your dataset.
        </Text>

        <Stack space={2} paddingTop={3}>
          <Text size={0} weight="bold" muted>
            Try asking:
          </Text>
          {CONVERSATION_STARTERS.map((starter) => (
            <Button
              key={starter.text}
              mode="ghost"
              fontSize={1}
              padding={3}
              onClick={() => onSelect(starter.text)}
              style={{ textAlign: 'left' }}
            >
              <Flex align="center" gap={2}>
                <Text size={1}>{starter.icon}</Text>
                <Text size={1}>{starter.text}</Text>
              </Flex>
            </Button>
          ))}
        </Stack>
      </Stack>
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Suggestion Chips
// ---------------------------------------------------------------------------

/**
 * Suggestion chips — clearly tappable follow-up actions.
 * Uses primary tone with ghost mode for visual prominence without heaviness.
 */
function SuggestionChips({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <Flex gap={2} wrap="wrap" paddingY={3} paddingX={4}>
      {suggestions.map((s) => (
        <Button
          key={s}
          mode="ghost"
          tone="primary"
          fontSize={1}
          padding={3}
          onClick={() => onSelect(s)}
          style={{
            borderRadius: '999px',
            border: '1px solid var(--card-border-color)',
          }}
        >
          <Text size={1} style={{ color: 'var(--card-link-color)' }}>
            {s}
          </Text>
        </Button>
      ))}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Typing Indicator — pulsing dots animation
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <Flex paddingY={2} paddingX={4}>
      <Card padding={3} radius={2} tone="default" style={{ borderBottomLeftRadius: 0 }}>
        <Flex align="center" gap={1}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'var(--card-muted-fg-color, #999)',
                display: 'inline-block',
                animation: `chatPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
          <style>{`
            @keyframes chatPulse {
              0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
              40% { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </Flex>
      </Card>
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Main Component — Full Viewport Chat
// ---------------------------------------------------------------------------

export function ChatView() {
  const { messages, isLoading, sendMessage, submitFeedback, clearChat } =
    useChat();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount and after clearing chat
  const isEmpty = messages.length === 0;
  useEffect(() => {
    inputRef.current?.focus();
  }, [isEmpty]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    setInputValue('');
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Enter to send (Shift+Enter would be newline in a textarea)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Escape clears the input (not the conversation)
      if (e.key === 'Escape') {
        e.preventDefault();
        setInputValue('');
      }
    },
    [handleSend],
  );

  const handleStarterOrSuggestion = useCallback(
    (text: string) => {
      sendMessage(text);
      setInputValue('');
    },
    [sendMessage],
  );

  const handleClearChat = useCallback(() => {
    clearChat();
    // Re-focus input after clearing
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [clearChat]);

  // Get suggestions from the last assistant message
  const lastAssistantMsg = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && !m.isStreaming);
  const suggestions = lastAssistantMsg?.suggestions || [];

  return (
    <Flex
      direction="column"
      style={{
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        background: 'var(--card-bg-color)',
      }}
    >
      {/* Header */}
      <Card
        padding={3}
        borderBottom
        style={{ flexShrink: 0 }}
      >
        <Flex align="center" justify="space-between" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <Flex align="center" gap={2}>
            <Text size={2} weight="bold">
              💬
            </Text>
            <Text size={2} weight="bold">
              Wrangler_ Chat
            </Text>
          </Flex>
          {messages.length > 0 && (
            <Button
              mode="ghost"
              tone="default"
              fontSize={1}
              padding={2}
              onClick={handleClearChat}
              disabled={isLoading}
            >
              <Flex align="center" gap={2}>
                <Text size={1}>✨</Text>
                <Text size={1}>New conversation</Text>
              </Flex>
            </Button>
          )}
        </Flex>
      </Card>

      {/* Messages Area */}
      {messages.length === 0 ? (
        <EmptyState onSelect={handleStarterOrSuggestion} />
      ) : (
        <Box
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
          padding={4}
        >
          {/* Center messages with max-width for readability */}
          <Box style={{ maxWidth: 720, margin: '0 auto' }}>
            <Stack space={1}>
              {messages.map((msg) => (
                <ChatMessageBubble
                  key={msg.id}
                  message={msg}
                  onFeedback={submitFeedback}
                />
              ))}
            </Stack>

            {/* Typing indicator — pulsing dots while loading with no content yet */}
            {isLoading && (
              <TypingIndicator />
            )}

            {/* Suggestion chips */}
            {!isLoading && suggestions.length > 0 && (
              <SuggestionChips
                suggestions={suggestions}
                onSelect={handleStarterOrSuggestion}
              />
            )}

            <div ref={messagesEndRef} />
          </Box>
        </Box>
      )}

      {/* Input Area — sticky bottom, always visible */}
      <Card
        padding={3}
        borderTop
        style={{ flexShrink: 0 }}
      >
        <Box style={{ maxWidth: 720, margin: '0 auto' }}>
          <Flex gap={2} align="center">
            <Box style={{ flex: 1 }}>
              <TextInput
                ref={inputRef}
                placeholder={
                  isLoading ? 'Waiting for response…' : 'Ask a question…'
                }
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setInputValue(e.currentTarget.value)
                }
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                fontSize={1}
              />
            </Box>
            <Button
              icon={SendIcon}
              mode="ghost"
              tone="primary"
              padding={3}
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              title="Send message (Enter)"
            />
          </Flex>
        </Box>
      </Card>
    </Flex>
  );
}
