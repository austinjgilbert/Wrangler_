/**
 * ActionCard — Action candidate card.
 *
 * Shows action type, urgency indicator, target account, evidence summary,
 * and recommended next step.
 */

import React from 'react';
import { Box, Card, Flex, Stack, Text, Badge } from '@sanity/ui';
import type { CardMeta } from './CardRenderer';
import { MetaBar } from './CardRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionData {
  actionType: string;
  urgency: 'high' | 'medium' | 'low';
  account: {
    _id: string;
    companyName: string;
  };
  evidence: string;
  recommendedStep: string;
  title?: string;
}

interface ActionCardProps {
  data: ActionData;
  _meta?: CardMeta;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function urgencyTone(urgency: string): 'critical' | 'caution' | 'default' {
  switch (urgency) {
    case 'high':
      return 'critical';
    case 'medium':
      return 'caution';
    default:
      return 'default';
  }
}

function urgencyColor(urgency: string): string {
  switch (urgency) {
    case 'high':
      return 'var(--wrangler-status-error)';
    case 'medium':
      return 'var(--wrangler-status-warning)';
    default:
      return 'var(--wrangler-text-muted)';
  }
}

function formatActionType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function ActionCardSkeleton() {
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
              height: 20,
              width: 60,
              borderRadius: 10,
              background: 'var(--wrangler-surface-overlay)',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }}
          />
          <Box
            style={{
              height: 14,
              width: '40%',
              borderRadius: 4,
              background: 'var(--wrangler-surface-overlay)',
              animation: 'shimmer 1.5s ease-in-out 0.2s infinite',
            }}
          />
        </Flex>
        <Box
          style={{
            height: 12,
            width: '70%',
            borderRadius: 4,
            background: 'var(--wrangler-surface-overlay)',
            animation: 'shimmer 1.5s ease-in-out 0.4s infinite',
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

export function ActionCard({ data, _meta }: ActionCardProps) {
  const { actionType, urgency, account, evidence, recommendedStep, title } =
    data;

  return (
    <Card
      padding={4}
      radius={2}
      style={{
        border: '1px solid var(--wrangler-border-default)',
        background: 'var(--wrangler-surface-raised)',
        borderLeft: `3px solid ${urgencyColor(urgency)}`,
      }}
    >
      <Stack space={3}>
        {/* Header: action type + urgency */}
        <Flex align="center" gap={2}>
          <Badge tone={urgencyTone(urgency)} fontSize={0}>
            {urgency}
          </Badge>
          <Text size={1} weight="bold">
            {title || formatActionType(actionType)}
          </Text>
        </Flex>

        {/* Target account */}
        <Flex align="center" gap={2}>
          <Text size={0} muted>
            Account:
          </Text>
          <Text size={1}>{account.companyName}</Text>
        </Flex>

        {/* Evidence */}
        <Stack space={1}>
          <Text size={0} weight="bold" muted>
            Evidence
          </Text>
          <Text size={1}>{evidence}</Text>
        </Stack>

        {/* Recommended next step */}
        <Card
          padding={3}
          radius={2}
          style={{
            background: 'var(--wrangler-accent-primary-muted)',
            border: 'none',
          }}
        >
          <Stack space={1}>
            <Text size={0} weight="bold" muted>
              Recommended
            </Text>
            <Text size={1}>{recommendedStep}</Text>
          </Stack>
        </Card>

        <MetaBar _meta={_meta} />
      </Stack>
    </Card>
  );
}
