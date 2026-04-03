/**
 * ChatTool — Main chat interface component for the Sanity Studio tool.
 *
 * Full-screen chat UI with message list, streaming responses,
 * suggestion chips, and conversation starters.
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

const CONVERSATION_STARTERS = [
  'What accounts have been enriched recently?',
  'Show me the latest technology signals',
  'Which companies are using React?',
  'Summarize recent account activity',
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
              key={starter}
              mode="ghost"
              text={starter}
              fontSize={1}
              padding={3}
              onClick={() => onSelect(starter)}
              style={{ textAlign: 'left' }}
            />
          ))}
        </Stack>
      </Stack>
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Suggestion Chips
// ---------------------------------------------------------------------------

function SuggestionChips({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <Flex gap={2} wrap="wrap" paddingY={2} paddingX={4}>
      {suggestions.map((s) => (
        <Button
          key={s}
          mode="ghost"
          tone="primary"
          text={s}
          fontSize={0}
          padding={2}
          onClick={() => onSelect(s)}
        />
      ))}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ChatToolComponent() {
  const { messages, isLoading, sendMessage, submitFeedback, clearChat } =
    useChat();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    setInputValue('');
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
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

  // Get suggestions from the last assistant message
  const lastAssistantMsg = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && !m.isStreaming);
  const suggestions = lastAssistantMsg?.suggestions || [];

  return (
    <Flex
      direction="column"
      style={{
        height: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Card
        padding={3}
        borderBottom
        style={{ flexShrink: 0 }}
      >
        <Flex align="center" justify="space-between">
          <Flex align="center" gap={2}>
            <Text size={2} weight="bold">
              💬
            </Text>
            <Text size={2} weight="bold">
              Chat
            </Text>
          </Flex>
          {messages.length > 0 && (
            <Button
              mode="ghost"
              text="Clear"
              fontSize={1}
              padding={2}
              onClick={clearChat}
              disabled={isLoading}
            />
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
          <Stack space={1}>
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                onFeedback={submitFeedback}
              />
            ))}
          </Stack>

          {/* Suggestion chips */}
          {!isLoading && suggestions.length > 0 && (
            <SuggestionChips
              suggestions={suggestions}
              onSelect={handleStarterOrSuggestion}
            />
          )}

          <div ref={messagesEndRef} />
        </Box>
      )}

      {/* Input Area */}
      <Card
        padding={3}
        borderTop
        style={{ flexShrink: 0 }}
      >
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
            title="Send message"
          />
        </Flex>
      </Card>
    </Flex>
  );
}
