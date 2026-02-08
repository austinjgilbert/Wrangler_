/**
 * Account Page — custom document view for Sanity Studio.
 *
 * Displays account data in a dashboard-style layout: company info, scores,
 * tech stack, pain points, leadership, and related data.
 */

import { type UserViewComponent } from 'sanity/structure';
import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  padding: 1.5rem;
  max-width: 800px;
`;

const Header = styled.header`
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--card-border-color, #e0e0e0);
`;

const Title = styled.h1`
  margin: 0 0 0.25rem 0;
  font-size: 1.5rem;
  font-weight: 600;
`;

const Domain = styled.a`
  color: var(--card-link-color, #2276fc);
  font-size: 0.9rem;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const ScoreBadge = styled.span<{ $score?: number }>`
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-right: 0.5rem;
  margin-top: 0.5rem;
  background: ${(p) =>
    (p.$score ?? 0) >= 70
      ? '#d4edda'
      : (p.$score ?? 0) >= 40
        ? '#fff3cd'
        : '#f8d7da'};
  color: ${(p) =>
    (p.$score ?? 0) >= 70
      ? '#155724'
      : (p.$score ?? 0) >= 40
        ? '#856404'
        : '#721c24'};
`;

const Section = styled.section`
  margin-bottom: 1.25rem;
`;

const SectionTitle = styled.h2`
  margin: 0 0 0.5rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--card-muted-fg, #6b7280);
`;

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

const Tag = styled.span`
  padding: 0.2rem 0.5rem;
  background: var(--card-hover-color, #f3f4f6);
  border-radius: 4px;
  font-size: 0.8rem;
`;

const PainPointItem = styled.div`
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--card-border-color, #eee);
  font-size: 0.9rem;

  &:last-child {
    border-bottom: none;
  }
`;

const Empty = styled.span`
  color: var(--card-muted-fg, #9ca3af);
  font-size: 0.9rem;
`;

interface AccountDisplayed {
  companyName?: string;
  name?: string;
  domain?: string;
  rootDomain?: string;
  canonicalUrl?: string;
  industry?: string;
  opportunityScore?: number;
  profileCompleteness?: { score?: number; gaps?: string[]; nextStages?: string[] };
  aiReadiness?: { score?: number };
  performance?: { performanceScore?: number };
  businessScale?: { businessScale?: string; estimatedAnnualRevenue?: string };
  benchmarks?: {
    estimatedEmployees?: string;
    headquarters?: string;
    estimatedRevenue?: string;
  };
  technologies?: { _ref?: string; name?: string }[];
  technologyStack?: {
    cms?: string[];
    frameworks?: string[];
    legacySystems?: string[];
  };
  painPoints?: Array<{
    category?: string;
    description?: string;
    severity?: string;
  }>;
  leadership?: { _ref?: string }[];
  tags?: string[];
  classification?: { industry?: string; segment?: string; tags?: string[] };
}

export const AccountPage: UserViewComponent = (props) => {
  const doc = props.document?.displayed as AccountDisplayed | undefined;

  if (!doc) {
    return (
      <Container>
        <Empty>Loading account...</Empty>
      </Container>
    );
  }

  const name = doc.companyName || doc.name || doc.rootDomain || doc.domain || 'Unknown';
  const domain = doc.domain || doc.rootDomain || '';
  const url = doc.canonicalUrl || (domain ? `https://${domain}` : '');
  const completeness = doc.profileCompleteness?.score ?? null;
  const aiScore = doc.aiReadiness?.score ?? null;
  const perfScore = doc.performance?.performanceScore ?? null;

  const techFlat: string[] = [
    ...(doc.technologyStack?.cms || []),
    ...(doc.technologyStack?.frameworks || []),
    ...(doc.technologyStack?.legacySystems || []),
  ].slice(0, 12);

  const painPoints = doc.painPoints || [];

  return (
    <Container>
      <Header>
        <Title>{name}</Title>
        {domain && (
          <Domain href={url} target="_blank" rel="noopener noreferrer">
            {domain}
          </Domain>
        )}
        <div>
          {completeness != null && (
            <ScoreBadge $score={completeness}>Profile: {completeness}%</ScoreBadge>
          )}
          {aiScore != null && (
            <ScoreBadge $score={aiScore}>AI Readiness: {aiScore}</ScoreBadge>
          )}
          {perfScore != null && (
            <ScoreBadge $score={perfScore}>Performance: {perfScore}</ScoreBadge>
          )}
        </div>
      </Header>

      {(doc.industry || doc.classification?.industry) && (
        <Section>
          <SectionTitle>Industry</SectionTitle>
          <span>{doc.industry || doc.classification?.industry}</span>
        </Section>
      )}

      {doc.benchmarks && Object.keys(doc.benchmarks).length > 0 && (
        <Section>
          <SectionTitle>Benchmarks</SectionTitle>
          <TagList>
            {doc.benchmarks.estimatedEmployees && (
              <Tag>Employees: {doc.benchmarks.estimatedEmployees}</Tag>
            )}
            {doc.benchmarks.headquarters && (
              <Tag>HQ: {doc.benchmarks.headquarters}</Tag>
            )}
            {doc.benchmarks.estimatedRevenue && (
              <Tag>Revenue: {doc.benchmarks.estimatedRevenue}</Tag>
            )}
          </TagList>
        </Section>
      )}

      {techFlat.length > 0 && (
        <Section>
          <SectionTitle>Technology Stack</SectionTitle>
          <TagList>
            {techFlat.map((t, i) => (
              <Tag key={i}>{t}</Tag>
            ))}
          </TagList>
        </Section>
      )}

      {painPoints.length > 0 && (
        <Section>
          <SectionTitle>Pain Points</SectionTitle>
          {painPoints.map((p, i) => (
            <PainPointItem key={i}>
              <strong>{p.category || 'General'}</strong>
              {p.severity && ` · ${p.severity}`}
              {p.description && (
                <div style={{ marginTop: 4, color: '#666' }}>{p.description}</div>
              )}
            </PainPointItem>
          ))}
        </Section>
      )}

      {doc.profileCompleteness?.gaps && doc.profileCompleteness.gaps.length > 0 && (
        <Section>
          <SectionTitle>Profile Gaps</SectionTitle>
          <TagList>
            {doc.profileCompleteness.gaps.map((g, i) => (
              <Tag key={i}>{g}</Tag>
            ))}
          </TagList>
        </Section>
      )}

      {doc.leadership && doc.leadership.length > 0 && (
        <Section>
          <SectionTitle>Leadership</SectionTitle>
          <span>{doc.leadership.length} person(s) linked</span>
        </Section>
      )}

      {!techFlat.length &&
        !painPoints.length &&
        completeness == null &&
        !doc.industry && (
          <Section>
            <Empty>No enrichment data yet. Run a scan or trigger enrichment.</Empty>
          </Section>
        )}
    </Container>
  );
};
