/**
 * PersonCard — Person intelligence card.
 *
 * Shows name, title, company, seniority badge, LinkedIn link, contact info.
 * Only renders as a card if `currentTitle` AND (`seniorityLevel` OR `linkedinUrl`)
 * exist — otherwise falls back to an entity link.
 */

import React from 'react';
import { Box, Card, Flex, Stack, Text, Badge } from '@sanity/ui';
import type { CardMeta } from './CardRenderer';
import { MetaBar } from './CardRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonData {
  name: string;
  currentTitle?: string;
  currentCompany?: string;
  seniorityLevel?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  location?: string;
}

interface PersonCardProps {
  data: PersonData;
  _meta?: CardMeta;
  _source?: SourceAttribution;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seniorityTone(
  level: string,
): 'primary' | 'positive' | 'caution' | 'default' {
  const l = level.toLowerCase();
  if (l === 'c-suite' || l === 'vp' || l === 'executive') return 'primary';
  if (l === 'director' || l === 'senior') return 'positive';
  if (l === 'manager') return 'caution';
  return 'default';
}

/**
 * Returns true if the person data has enough fields to render as a full card.
 * Otherwise, it should be rendered as a simple entity link.
 */
export function shouldRenderAsCard(data: PersonData): boolean {
  return !!(
    data.currentTitle &&
    (data.seniorityLevel || data.linkedinUrl)
  );
}

// ---------------------------------------------------------------------------
// Entity Link Fallback — minimal inline reference
// ---------------------------------------------------------------------------

export function PersonEntityLink({ data }: { data: PersonData }) {
  return (
    <Flex align="center" gap={2} style={{ display: 'inline-flex' }}>
      <Text size={1} weight="bold">
        {data.name}
      </Text>
      {data.currentTitle && (
        <Text size={0} muted>
          {data.currentTitle}
        </Text>
      )}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function PersonCardSkeleton() {
  return (
    <Card
      padding={4}
      radius={2}
      style={{
        border: '1px solid var(--wrangler-border-default)',
        background: 'var(--wrangler-surface-raised)',
      }}
    >
      <Flex gap={3}>
        <Box
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--wrangler-surface-overlay)',
            animation: 'shimmer 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <Stack space={2} style={{ flex: 1 }}>
          <Box
            style={{
              height: 16,
              width: '50%',
              borderRadius: 4,
              background: 'var(--wrangler-surface-overlay)',
              animation: 'shimmer 1.5s ease-in-out 0.1s infinite',
            }}
          />
          <Box
            style={{
              height: 12,
              width: '70%',
              borderRadius: 4,
              background: 'var(--wrangler-surface-overlay)',
              animation: 'shimmer 1.5s ease-in-out 0.3s infinite',
            }}
          />
        </Stack>
      </Flex>
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

export function PersonCard({ data, _meta, _source }: PersonCardProps) {
  // Fall back to entity link if insufficient data
  if (!shouldRenderAsCard(data)) {
    return <PersonEntityLink data={data} />;
  }

  const {
    name,
    currentTitle,
    currentCompany,
    seniorityLevel,
    linkedinUrl,
    email,
    phone,
    location,
  } = data;

  // Initials for avatar placeholder
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
        {/* Header: avatar + name + title */}
        <Flex gap={3} align="flex-start">
          {/* Avatar placeholder */}
          <Box
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--wrangler-accent-primary-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Text
              size={0}
              weight="bold"
              style={{ color: 'var(--wrangler-accent-primary)' }}
            >
              {initials}
            </Text>
          </Box>

          <Stack space={1} style={{ flex: 1 }}>
            <Flex align="center" gap={2}>
              <Text size={1} weight="bold">
                {name}
              </Text>
              {seniorityLevel && (
                <Badge
                  tone={seniorityTone(seniorityLevel)}
                  fontSize={0}
                  padding={1}
                >
                  {seniorityLevel}
                </Badge>
              )}
            </Flex>
            {currentTitle && <Text size={1}>{currentTitle}</Text>}
            {currentCompany && (
              <Text size={0} muted>
                {currentCompany}
              </Text>
            )}
          </Stack>
        </Flex>

        {/* Contact info */}
        {(email || phone || location || linkedinUrl) && (
          <Flex gap={3} wrap="wrap">
            {email && (
              <Text size={0} muted>
                ✉️ {email}
              </Text>
            )}
            {phone && (
              <Text size={0} muted>
                📞 {phone}
              </Text>
            )}
            {location && (
              <Text size={0} muted>
                📍 {location}
              </Text>
            )}
            {linkedinUrl && (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--wrangler-accent-primary)',
                  fontSize: 12,
                  textDecoration: 'none',
                }}
              >
                🔗 LinkedIn
              </a>
            )}
          </Flex>
        )}

        <MetaBar _source={_source} />
      </Stack>
    </Card>
  );
}
