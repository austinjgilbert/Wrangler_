/**
 * CardRenderer — Routes card events from the NDJSON stream to the
 * appropriate card component based on `cardType`.
 *
 * Falls back to a generic JSON display for unknown card types.
 */

import React from 'react';
import { Box, Card, Code, Flex, Stack, Text, Badge } from '@sanity/ui';
import { AccountCard } from './AccountCard';
import { BriefingCard } from './BriefingCard';
import { SignalCard } from './SignalCard';
import { ActionCard } from './ActionCard';
import { PersonCard } from './PersonCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Rendering hints from the NDJSON stream — controls how the card is displayed */
export interface CardMeta {
  display: 'inline' | 'expanded' | 'summary' | 'link';
  navigable?: boolean;
  href?: string;
  position?: 'after_text' | 'standalone';
}

/** Source attribution metadata — confidence, provenance, freshness */
export interface SourceAttribution {
  confidence?: number;
  source?: string;
  observedAt?: string;
}

export interface CardProps {
  cardType: string;
  data: any;
  _meta?: CardMeta;
  _source?: SourceAttribution;
}

// ---------------------------------------------------------------------------
// Card Registry
// ---------------------------------------------------------------------------

const CARD_COMPONENTS: Record<string, React.ComponentType<{ data: any; _meta?: CardMeta; _source?: SourceAttribution }>> = {
  account: AccountCard,
  briefing: BriefingCard,
  signal: SignalCard,
  action: ActionCard,
  person: PersonCard,
};

// ---------------------------------------------------------------------------
// Confidence Dot
// ---------------------------------------------------------------------------

function ConfidenceDot({ confidence }: { confidence: number }) {
  let color = 'var(--wrangler-confidence-unknown)';
  let label = 'Unknown';

  if (confidence >= 0.8) {
    color = 'var(--wrangler-confidence-high)';
    label = 'High confidence';
  } else if (confidence >= 0.5) {
    color = 'var(--wrangler-confidence-medium)';
    label = 'Medium confidence';
  } else if (confidence > 0) {
    color = 'var(--wrangler-confidence-low)';
    label = 'Low confidence';
  }

  return (
    <span
      title={label}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Meta Bar — confidence dot, source badge, timestamp
// ---------------------------------------------------------------------------

export function MetaBar({ _source }: { _source?: SourceAttribution }) {
  if (!_source) return null;

  return (
    <Flex align="center" gap={2} paddingTop={2} style={{ opacity: 0.7 }}>
      {_source.confidence != null && (
        <ConfidenceDot confidence={_source.confidence} />
      )}
      {_source.source && (
        <Badge tone="default" fontSize={0} padding={1}>
          {_source.source}
        </Badge>
      )}
      {_source.observedAt && (
        <Text size={0} muted>
          {new Date(_source.observedAt).toLocaleDateString()}
        </Text>
      )}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Fallback — generic JSON display for unknown card types
// ---------------------------------------------------------------------------

function FallbackCard({ cardType, data, _meta, _source }: CardProps) {
  return (
    <Card
      padding={3}
      radius={2}
      style={{
        border: '1px solid var(--wrangler-border-default)',
        background: 'var(--wrangler-surface-raised)',
      }}
    >
      <Stack space={2}>
        <Flex align="center" gap={2}>
          <Badge tone="caution" fontSize={0}>
            {cardType}
          </Badge>
          <Text size={0} muted>
            Unknown card type
          </Text>
        </Flex>
        <Box
          style={{
            maxHeight: 200,
            overflow: 'auto',
            fontSize: 12,
            fontFamily: 'var(--wrangler-font-data, monospace)',
            background: 'var(--wrangler-surface-sunken)',
            padding: 8,
            borderRadius: 4,
          }}
        >
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </Box>
        <MetaBar _source={_source} />
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Renderer
// ---------------------------------------------------------------------------

export function CardRenderer({ cardType, data, _meta, _source }: CardProps) {
  const Component = CARD_COMPONENTS[cardType];

  if (!Component) {
    return <FallbackCard cardType={cardType} data={data} _meta={_meta} _source={_source} />;
  }

  return <Component data={data} _meta={_meta} _source={_source} />;
}
