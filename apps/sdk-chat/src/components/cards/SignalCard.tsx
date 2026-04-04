/**
 * SignalCard — Signal event card.
 *
 * Shows signal type badge, source, timestamp, strength indicator (colored dot),
 * account reference, and summary.
 */

import React from 'react';
import { Box, Card, Flex, Stack, Text, Badge } from '@sanity/ui';
import type { CardMeta } from './CardRenderer';
import { MetaBar } from './CardRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignalData {
  signalType: string;
  strength: number;
  summary: string;
  account: {
    _id: string;
    companyName: string;
  };
  timestamp: string;
  source?: string;
}

interface SignalCardProps {
  data: SignalData;
  _meta?: CardMeta;
  _source?: SourceAttribution;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function strengthColor(strength: number): string {
  if (strength >= 0.7) return 'var(--wrangler-signal-strong)';
  if (strength >= 0.4) return 'var(--wrangler-signal-moderate)';
  if (strength > 0) return 'var(--wrangler-signal-weak)';
  return 'var(--wrangler-signal-noise)';
}

function strengthLabel(strength: number): string {
  if (strength >= 0.7) return 'Strong';
  if (strength >= 0.4) return 'Moderate';
  if (strength > 0) return 'Weak';
  return 'Noise';
}

function formatSignalType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function SignalCardSkeleton() {
  return (
    <Card
      padding={4}
      radius={2}
      style={{
        border: '1px solid var(--wrangler-border-default)',
        background: 'var(--wrangler-surface-raised)',
      }}
    >
      <Stack space={3}>
        <Flex align="center" gap={2}>
          <Box
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--wrangler-surface-overlay)',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }}
          />
          <Box
            style={{
              height: 14,
              width: '30%',
              borderRadius: 4,
              background: 'var(--wrangler-surface-overlay)',
              animation: 'shimmer 1.5s ease-in-out 0.1s infinite',
            }}
          />
        </Flex>
        <Box
          style={{
            height: 12,
            width: '80%',
            borderRadius: 4,
            background: 'var(--wrangler-surface-overlay)',
            animation: 'shimmer 1.5s ease-in-out 0.3s infinite',
          }}
        />
      </Stack>
      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SignalCard({ data, _meta, _source }: SignalCardProps) {
  const { signalType, strength, summary, account, timestamp, source } = data;

  return (
    <Card
      padding={4}
      radius={2}
      style={{
        border: '1px solid var(--wrangler-border-default)',
        background: 'var(--wrangler-surface-raised)',
      }}
    >
      <Stack space={3}>
        {/* Header: signal type + strength */}
        <Flex align="center" justify="space-between">
          <Flex align="center" gap={2}>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: strengthColor(strength),
                flexShrink: 0,
              }}
              title={strengthLabel(strength)}
            />
            <Badge tone="primary" fontSize={0}>
              {formatSignalType(signalType)}
            </Badge>
            {source && (
              <Badge tone="default" fontSize={0}>
                {source}
              </Badge>
            )}
          </Flex>
          <Text size={0} muted>
            {new Date(timestamp).toLocaleDateString()}
          </Text>
        </Flex>

        {/* Account reference */}
        <Text size={1} weight="bold">
          {account.companyName}
        </Text>

        {/* Summary */}
        <Text size={1}>{summary}</Text>

        {/* Strength label */}
        <Flex align="center" gap={2}>
          <Text size={0} muted>
            Signal strength:
          </Text>
          <Text
            size={0}
            weight="bold"
            style={{ color: strengthColor(strength) }}
          >
            {strengthLabel(strength)} ({Math.round(strength * 100)}%)
          </Text>
        </Flex>

        <MetaBar _source={_source} />
      </Stack>
    </Card>
  );
}
