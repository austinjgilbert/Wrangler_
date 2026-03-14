/**
 * Account Page — custom document view for Sanity Studio.
 *
 * Displays account data in a dashboard-style layout: company info, scores,
 * tech stack, pain points, leadership, and related data.
 */

import React, { useEffect, useState } from 'react';
import { useClient } from 'sanity';
import { type UserViewComponent } from 'sanity/structure';
import styled from 'styled-components';
import { computeAccountStorageBudget, type AccountStorageCounts } from '../../shared/accountStoragePolicy';

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

const BudgetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
`;

const BudgetCard = styled.div<{ $tone?: 'healthy' | 'warning' | 'over' }>`
  border: 1px solid var(--card-border-color, #e5e7eb);
  border-left: 4px solid ${(p) => (
    p.$tone === 'over'
      ? '#dc2626'
      : p.$tone === 'warning'
        ? '#d97706'
        : '#16a34a'
  )};
  border-radius: 8px;
  padding: 0.75rem;
  background: var(--card-bg-color, #fff);
`;

const BudgetLabel = styled.div`
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--card-muted-fg, #6b7280);
`;

const BudgetValue = styled.div`
  margin-top: 0.35rem;
  font-size: 1.1rem;
  font-weight: 700;
`;

const BudgetHint = styled.div`
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: var(--card-muted-fg, #6b7280);
`;

interface AccountDisplayed {
  _id?: string;
  accountKey?: string;
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
  const client = useClient({ apiVersion: '2024-01-01' });
  const [storageCounts, setStorageCounts] = useState<AccountStorageCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    const accountId = doc?._id;
    const accountKey = doc?.accountKey || '';
    const domain = doc?.domain || doc?.rootDomain || '';

    if (!accountId) {
      setStorageCounts(null);
      return () => {
        cancelled = true;
      };
    }

    client.fetch(`
      {
        "person": count(*[_type == "person" && (companyRef._ref == $accountId || relatedAccountKey == $accountKey)]),
        "signal": count(*[_type == "signal" && (account._ref == $accountId || companyRef._ref == $accountId)]),
        "interaction": count(*[_type == "interaction" && (accountKey == $accountKey || domain == $domain)]),
        "crawlSnapshot": count(*[_type == "crawl.snapshot" && (accountRef._ref == $accountId || accountKey == $accountKey)]),
        "evidencePack": count(*[_type == "evidencePack" && (references($accountId) || accountRef._ref == $accountId || accountId == $accountId || accountKey == $accountKey)]),
        "actionCandidate": count(*[_type == "actionCandidate" && account._ref == $accountId]),
        "learning": count(*[_type == "learning" && references($accountId)]),
        "enrichmentJob": count(*[_type == "enrichmentJob" && accountKey == $accountKey]),
        "enrichJob": count(*[_type == "enrich.job" && (entityId == $accountId || accountKey == $accountKey)]),
        "gmailDraft": count(*[_type == "gmailDraft" && (account._ref == $accountId || accountId == $accountId || accountKey == $accountKey)]),
        "opportunityBrief": count(*[_type == "opportunityBrief" && (accountRef._ref == $accountId || accountId == $accountId || accountKey == $accountKey)])
      }
    `, {
      accountId,
      accountKey,
      domain,
    }).then((result: AccountStorageCounts) => {
      if (!cancelled) setStorageCounts(result || null);
    }).catch(() => {
      if (!cancelled) setStorageCounts(null);
    });

    return () => {
      cancelled = true;
    };
  }, [client, doc?._id, doc?.accountKey, doc?.domain, doc?.rootDomain]);

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
  const storageBudget = storageCounts ? computeAccountStorageBudget(storageCounts) : null;

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

      <Section>
        <SectionTitle>Storage Budget</SectionTitle>
        {storageBudget ? (
          <>
            <BudgetGrid>
              <BudgetCard $tone={storageBudget.totalStatus}>
                <BudgetLabel>Active Docs</BudgetLabel>
                <BudgetValue>{storageBudget.totalActiveDocs} / {storageBudget.totalBudget}</BudgetValue>
                <BudgetHint>
                  {storageBudget.totalStatus === 'over'
                    ? `Over budget by ${storageBudget.overBudgetBy}`
                    : storageBudget.totalStatus === 'warning'
                      ? 'Approaching account storage budget'
                      : 'Within account storage budget'}
                </BudgetHint>
              </BudgetCard>
              {storageBudget.byType
                .filter((item) => item.count > 0 || item.status !== 'healthy')
                .sort((a, b) => b.count - a.count)
                .slice(0, 6)
                .map((item) => (
                  <BudgetCard key={item.key} $tone={item.status}>
                    <BudgetLabel>{item.key}</BudgetLabel>
                    <BudgetValue>{item.count} / {item.limit}</BudgetValue>
                    <BudgetHint>
                      {item.status === 'over'
                        ? `Reduce by ${item.overBy}`
                        : item.status === 'warning'
                          ? 'Near limit'
                          : 'Healthy'}
                    </BudgetHint>
                  </BudgetCard>
                ))}
            </BudgetGrid>
          </>
        ) : (
          <Empty>Storage budget metrics unavailable.</Empty>
        )}
      </Section>

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
