/**
 * AccountCard — Account intelligence card.
 *
 * Shows company name, domain, opportunity score (colored), tech stack summary,
 * profile completeness, and industry. Uses --wrangler-* tokens for score colors.
 */

import React from 'react';
import { Box, Card, Flex, Stack, Text, Badge } from '@sanity/ui';
import type { CardMeta, SourceAttribution } from './CardRenderer';
import { MetaBar } from './CardRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountData {
  companyName: string;
  domain: string;
  opportunityScore?: number;
  industry?: string;
  employeeCount?: string;
  profileCompleteness?: {
    score: number;
    missingFields?: string[];
  };
  technologyStack?: {
    cms?: string[];
    frameworks?: string[];
    analytics?: string[];
    hosting?: string[];
    [key: string]: string[] | undefined;
  };
}

interface AccountCardProps {
  data: AccountData;
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

function ScoreIndicator({ score, label }: { score: number; label: string }) {
  return (
    <Flex align="center" gap={2}>
      <Box
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `2px solid ${scoreColor(score)}`,
          flexShrink: 0,
        }}
      >
        <Text
          size={0}
          weight="bold"
          style={{ color: scoreColor(score) }}
        >
          {score}
        </Text>
      </Box>
      <Text size={0} muted>
        {label}
      </Text>
    </Flex>
  );
}

function TechStackSummary({
  stack,
}: {
  stack: AccountData['technologyStack'];
}) {
  const allTech = Object.entries(stack)
    .filter(([, v]) => v && v.length > 0)
    .flatMap(([, v]) => v || []);

  if (allTech.length === 0) return null;

  return (
    <Flex gap={1} wrap="wrap">
      {allTech.slice(0, 8).map((tech) => (
        <Badge key={tech} tone="default" fontSize={0} padding={1}>
          {tech}
        </Badge>
      ))}
      {allTech.length > 8 && (
        <Text size={0} muted>
          +{allTech.length - 8} more
        </Text>
      )}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function AccountCardSkeleton() {
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
        <Flex align="center" gap={3}>
          <Box
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--wrangler-surface-overlay)',
              animation: 'shimmer 1.5s ease-in-out infinite',
            }}
          />
          <Stack space={1} style={{ flex: 1 }}>
            <Box
              style={{
                height: 16,
                width: '60%',
                borderRadius: 4,
                background: 'var(--wrangler-surface-overlay)',
                animation: 'shimmer 1.5s ease-in-out infinite',
              }}
            />
            <Box
              style={{
                height: 12,
                width: '40%',
                borderRadius: 4,
                background: 'var(--wrangler-surface-overlay)',
                animation: 'shimmer 1.5s ease-in-out 0.2s infinite',
              }}
            />
          </Stack>
        </Flex>
        <Box
          style={{
            height: 12,
            width: '80%',
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
// Guard — only render as card if we have meaningful data
// ---------------------------------------------------------------------------

export function shouldRenderAsCard(data: AccountData): boolean {
  const hasScore = (data.opportunityScore ?? 0) > 0;
  const hasTechStack = data.technologyStack
    ? Object.values(data.technologyStack).some(v => v && v.length > 0)
    : false;
  return hasScore || hasTechStack;
}

export function AccountEntityLink({ data }: { data: AccountData }) {
  return (
    <Flex align="center" gap={2} padding={2}>
      <Text size={1} weight="semibold" style={{ color: 'var(--wrangler-accent-primary)' }}>
        {data.companyName || data.domain || 'Unknown Account'}
      </Text>
      {data.domain && (
        <Text size={0} muted>{data.domain}</Text>
      )}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AccountCard({ data, _meta, _source }: AccountCardProps) {
  if (!shouldRenderAsCard(data)) {
    return <AccountEntityLink data={data} />;
  }

  const {
    companyName,
    domain,
    opportunityScore,
    industry,
    employeeCount,
    profileCompleteness,
    technologyStack,
  } = data;

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
        {/* Header: company name + domain */}
        <Flex align="flex-start" justify="space-between">
          <Stack space={1}>
            <Text size={2} weight="bold">
              {companyName}
            </Text>
            <Text size={1} muted>
              {domain}
            </Text>
          </Stack>
          {industry && (
            <Badge tone="default" fontSize={0}>
              {industry}
            </Badge>
          )}
        </Flex>

        {/* Scores row */}
        <Flex gap={4} wrap="wrap">
          <ScoreIndicator score={opportunityScore} label="Opportunity" />
          {profileCompleteness && (
            <ScoreIndicator
              score={profileCompleteness.score}
              label="Profile"
            />
          )}
          {employeeCount && (
            <Flex align="center" gap={2}>
              <Text size={1} weight="bold">
                {employeeCount}
              </Text>
              <Text size={0} muted>
                employees
              </Text>
            </Flex>
          )}
        </Flex>

        {/* Tech stack */}
        {technologyStack && <TechStackSummary stack={technologyStack} />}

        {/* Missing fields hint */}
        {profileCompleteness?.missingFields?.length > 0 && (
          <Text size={0} muted>
            Missing: {profileCompleteness.missingFields.slice(0, 3).join(', ')}
            {profileCompleteness.missingFields.length > 3 &&
              ` +${profileCompleteness.missingFields.length - 3} more`}
          </Text>
        )}

        <MetaBar _source={_source} />
      </Stack>
    </Card>
  );
}
