/**
 * BriefingCard — Morning briefing summary card.
 *
 * Shows date, top accounts with scores, action items count, and signal summary.
 * Wraps the morning briefing response into a structured card.
 */

import React from 'react';
import { Box, Card, Flex, Stack, Text, Badge } from '@sanity/ui';
import type { CardMeta } from './CardRenderer';
import { MetaBar } from './CardRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BriefingAccount {
  companyName: string;
  opportunityScore: number;
  reason?: string;
}

interface BriefingSignal {
  type: string;
  count: number;
}

interface BriefingData {
  date: string;
  topAccounts: BriefingAccount[];
  actionItemCount: number;
  signals: BriefingSignal[];
  summary?: string;
}

interface BriefingCardProps {
  data: BriefingData;
  _meta?: CardMeta;
  _source?: SourceAttribution;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 70) return 'var(--wrangler-score-high)';
  if (score >= 40) return 'var(--wrangler-score-medium)';
  return 'var(--wrangler-score-low)';
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function BriefingCardSkeleton() {
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
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            style={{
              height: 14,
              width: `${70 - i * 15}%`,
              borderRadius: 4,
              background: 'var(--wrangler-surface-overlay)',
              animation: `shimmer 1.5s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
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

export function BriefingCard({ data, _meta, _source }: BriefingCardProps) {
  const { date, topAccounts, actionItemCount, signals, summary } = data;

  return (
    <Card
      padding={4}
      radius={2}
      style={{
        border: '1px solid var(--wrangler-border-default)',
        background: 'var(--wrangler-surface-raised)',
      }}
    >
      <Stack space={4}>
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Flex align="center" gap={2}>
            <Text size={2}>☀️</Text>
            <Text size={2} weight="bold">
              Morning Briefing
            </Text>
          </Flex>
          <Text size={0} muted>
            {date}
          </Text>
        </Flex>

        {/* Summary */}
        {summary && (
          <Text size={1} muted>
            {summary}
          </Text>
        )}

        {/* Top accounts */}
        {topAccounts && topAccounts.length > 0 && (
          <Stack space={2}>
            <Text size={0} weight="bold" muted>
              Top Accounts
            </Text>
            {topAccounts.map((account, i) => (
              <Flex key={i} align="center" justify="space-between" gap={2}>
                <Text size={1}>{account.companyName}</Text>
                <Flex align="center" gap={2}>
                  {account.reason && (
                    <Text size={0} muted>
                      {account.reason}
                    </Text>
                  )}
                  <Text
                    size={1}
                    weight="bold"
                    style={{ color: scoreColor(account.opportunityScore) }}
                  >
                    {account.opportunityScore}
                  </Text>
                </Flex>
              </Flex>
            ))}
          </Stack>
        )}

        {/* Stats row */}
        <Flex gap={4} wrap="wrap">
          {actionItemCount > 0 && (
            <Flex align="center" gap={2}>
              <Text size={2} weight="bold">
                {actionItemCount}
              </Text>
              <Text size={0} muted>
                action items
              </Text>
            </Flex>
          )}
          {signals && signals.length > 0 && (
            <Flex gap={2} wrap="wrap">
              {signals.map((sig, i) => (
                <Badge key={i} tone="default" fontSize={0} padding={1}>
                  {sig.type}: {sig.count}
                </Badge>
              ))}
            </Flex>
          )}
        </Flex>

        <MetaBar _source={_source} />
      </Stack>
    </Card>
  );
}
