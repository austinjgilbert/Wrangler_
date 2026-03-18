import React, { useEffect, useMemo, useState } from 'react';
import { useClient } from 'sanity';
import styled from 'styled-components';
import {
  computeAccountStorageBudget,
  computeDatasetDocumentUsage,
  SANITY_FREE_PLAN_DOCUMENT_LIMIT,
  type AccountStorageCounts,
} from '../../shared/accountStoragePolicy';

const Wrap = styled.div`
  padding: 1.5rem;
  max-width: 1200px;
`;

const Header = styled.div`
  margin-bottom: 1.5rem;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
`;

const Subtitle = styled.p`
  margin: 0.5rem 0 0;
  color: var(--card-muted-fg, #6b7280);
  max-width: 780px;
`;

const Section = styled.section`
  margin-top: 1.5rem;
`;

const SectionTitle = styled.h2`
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--card-muted-fg, #6b7280);
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
`;

const Card = styled.div<{ $tone?: 'healthy' | 'warning' | 'over' }>`
  border: 1px solid var(--card-border-color, #e5e7eb);
  border-left: 4px solid ${(p) => (
    p.$tone === 'over'
      ? '#dc2626'
      : p.$tone === 'warning'
        ? '#d97706'
        : '#16a34a'
  )};
  border-radius: 8px;
  padding: 0.9rem;
  background: var(--card-bg-color, #fff);
`;

const Label = styled.div`
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--card-muted-fg, #6b7280);
`;

const Value = styled.div`
  margin-top: 0.35rem;
  font-size: 1.2rem;
  font-weight: 700;
`;

const Hint = styled.div`
  margin-top: 0.25rem;
  font-size: 0.82rem;
  color: var(--card-muted-fg, #6b7280);
`;

const Table = styled.div`
  border: 1px solid var(--card-border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 2fr) repeat(4, minmax(100px, 1fr));
  gap: 0.75rem;
  padding: 0.8rem 1rem;
  border-top: 1px solid var(--card-border-color, #e5e7eb);

  &:first-child {
    border-top: none;
    background: var(--card-hover-color, #f9fafb);
    font-weight: 600;
  }
`;

const Empty = styled.div`
  color: var(--card-muted-fg, #9ca3af);
`;

type SystemCounts = Record<string, number>;

type AccountRow = {
  _id: string;
  name: string;
  domain: string;
  accountKey: string;
  counts: AccountStorageCounts;
};

function getTone(count: number, limit: number): 'healthy' | 'warning' | 'over' {
  if (count > limit) return 'over';
  if (count >= Math.ceil(limit * 0.8)) return 'warning';
  return 'healthy';
}

export function StorageGovernanceDashboard() {
  const client = useClient({ apiVersion: '2024-01-01' });
  const [systemCounts, setSystemCounts] = useState<SystemCounts | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    client.fetch(`
      {
        "documentTotal": count(*[]),
        "account": count(*[_type == "account"]),
        "accountPack": count(*[_type == "accountPack"]),
        "person": count(*[_type == "person"]),
        "signal": count(*[_type == "signal"]),
        "interaction": count(*[_type == "interaction"]),
        "crawlSnapshot": count(*[_type == "crawl.snapshot"]),
        "evidencePack": count(*[_type == "evidencePack"]),
        "actionCandidate": count(*[_type == "actionCandidate"]),
        "learning": count(*[_type == "learning"]),
        "enrichmentJob": count(*[_type == "enrichmentJob"]),
        "enrichJob": count(*[_type == "enrich.job"]),
        "gmailDraft": count(*[_type == "gmailDraft"]),
        "opportunityBrief": count(*[_type == "opportunityBrief"]),
        "moltEvent": count(*[_type == "molt.event"])
      }
    `).then((result: SystemCounts) => {
      if (!cancelled) setSystemCounts(result || null);
    }).catch(() => {
      if (!cancelled) setSystemCounts(null);
    });

    client.fetch(`
      *[_type == "account"] | order(coalesce(updatedAt, _updatedAt) desc)[0...20]{
        _id,
        "name": coalesce(companyName, name, rootDomain, domain, _id),
        "domain": coalesce(domain, rootDomain, ""),
        "accountKey": coalesce(accountKey, ""),
        "counts": {
          "person": count(*[_type == "person" && (companyRef._ref == ^._id || relatedAccountKey == ^.accountKey)]),
          "signal": count(*[_type == "signal" && (account._ref == ^._id || companyRef._ref == ^._id)]),
          "interaction": count(*[_type == "interaction" && (accountKey == ^.accountKey || domain == ^.domain)]),
          "crawlSnapshot": count(*[_type == "crawl.snapshot" && (accountRef._ref == ^._id || accountKey == ^.accountKey)]),
          "evidencePack": count(*[_type == "evidencePack" && (references(^._id) || accountRef._ref == ^._id || accountId == ^._id || accountKey == ^.accountKey)]),
          "actionCandidate": count(*[_type == "actionCandidate" && account._ref == ^._id]),
          "learning": count(*[_type == "learning" && references(^._id)]),
          "enrichmentJob": count(*[_type == "enrichmentJob" && accountKey == ^.accountKey]),
          "enrichJob": count(*[_type == "enrich.job" && (entityId == ^._id || accountKey == ^.accountKey)]),
          "gmailDraft": count(*[_type == "gmailDraft" && (account._ref == ^._id || accountId == ^._id || accountKey == ^.accountKey)]),
          "opportunityBrief": count(*[_type == "opportunityBrief" && (accountRef._ref == ^._id || accountId == ^._id || accountKey == ^.accountKey)])
        }
      }
    `).then((rows: AccountRow[]) => {
      if (!cancelled) setAccounts(Array.isArray(rows) ? rows : []);
    }).catch(() => {
      if (!cancelled) setAccounts([]);
    });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const topAccounts = useMemo(() => {
    return accounts
      .map((account) => ({
        ...account,
        budget: computeAccountStorageBudget(account.counts || {}),
      }))
      .sort((a, b) => b.budget.totalActiveDocs - a.budget.totalActiveDocs)
      .slice(0, 10);
  }, [accounts]);

  const topTypes = useMemo(() => {
    if (!systemCounts) return [];
    return Object.entries(systemCounts)
      .filter(([key]) => key !== 'documentTotal')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [systemCounts]);

  const datasetUsage = useMemo(() => {
    const totalDocuments = Number(systemCounts?.documentTotal || 0);
    return computeDatasetDocumentUsage(totalDocuments, SANITY_FREE_PLAN_DOCUMENT_LIMIT);
  }, [systemCounts]);

  const reductionOpportunities = useMemo(() => {
    return topTypes.slice(0, 5).map(([key, count]) => ({
      key,
      count,
      estimatedTrim: Math.round(
        count * (
          key === 'crawlSnapshot' || key === 'interaction'
            ? 0.85
            : key === 'enrichJob' || key === 'moltEvent'
              ? 0.7
              : 0.5
        )
      ),
    }));
  }, [topTypes]);

  return (
    <Wrap>
      <Header>
        <Title>Storage Governance</Title>
        <Subtitle>
          This dashboard shows which Sanity document families are growing fastest and which accounts are closest to the
          active working-set budget. The goal is to keep account intelligence detailed, but bounded.
        </Subtitle>
      </Header>

      <Section>
        <SectionTitle>Plan Pressure</SectionTitle>
        <Grid>
          <Card $tone={datasetUsage.status}>
            <Label>Total Documents</Label>
            <Value>{datasetUsage.totalDocuments.toLocaleString()}</Value>
            <Hint>Live dataset count</Hint>
          </Card>
          <Card $tone={datasetUsage.status}>
            <Label>Plan Limit</Label>
            <Value>{datasetUsage.planLimit.toLocaleString()}</Value>
            <Hint>Free-plan document allowance</Hint>
          </Card>
          <Card $tone={datasetUsage.status}>
            <Label>Overage</Label>
            <Value>{datasetUsage.overBy.toLocaleString()}</Value>
            <Hint>
              {datasetUsage.status === 'over'
                ? 'Documents to trim or compact'
                : 'No document overage'}
            </Hint>
          </Card>
          <Card $tone={datasetUsage.status}>
            <Label>Utilization</Label>
            <Value>{Math.round(datasetUsage.utilizationRatio * 100)}%</Value>
            <Hint>Of current plan limit</Hint>
          </Card>
        </Grid>
      </Section>

      <Section>
        <SectionTitle>System Shape</SectionTitle>
        {systemCounts ? (
          <Grid>
            {topTypes.map(([key, count]) => (
              <Card key={key} $tone={count > 500 ? 'over' : count > 100 ? 'warning' : 'healthy'}>
                <Label>{key}</Label>
                <Value>{count}</Value>
                <Hint>Current stored documents</Hint>
              </Card>
            ))}
          </Grid>
        ) : (
          <Empty>System document counts unavailable.</Empty>
        )}
      </Section>

      <Section>
        <SectionTitle>Reduction Opportunities</SectionTitle>
        {reductionOpportunities.length > 0 ? (
          <Table>
            <Row>
              <div>Document Family</div>
              <div>Current Count</div>
              <div>Potential Trim</div>
              <div>Status</div>
              <div>Recommended Move</div>
            </Row>
            {reductionOpportunities.map((item) => (
              <Row key={item.key}>
                <div>{item.key}</div>
                <div>{item.count.toLocaleString()}</div>
                <div>{item.estimatedTrim.toLocaleString()}</div>
                <div>{getTone(item.count, 500)}</div>
                <div>
                  {item.key === 'crawlSnapshot'
                    ? 'Keep one canonical snapshot per account+path'
                    : item.key === 'interaction'
                      ? 'Bucket extension captures by account/day'
                      : item.key === 'enrichJob'
                        ? 'Reuse one active job per account+goal'
                        : item.key === 'moltEvent'
                          ? 'Prefer idempotent system events'
                          : 'Collapse repeated writes into summaries'}
                </div>
              </Row>
            ))}
          </Table>
        ) : (
          <Empty>No reduction opportunities available.</Empty>
        )}
      </Section>

      <Section>
        <SectionTitle>Heaviest Accounts</SectionTitle>
        {topAccounts.length > 0 ? (
          <Table>
            <Row>
              <div>Account</div>
              <div>Active Docs</div>
              <div>Top Driver</div>
              <div>Status</div>
              <div>Domain</div>
            </Row>
            {topAccounts.map((account) => {
              const topDriver = [...account.budget.byType].sort((a, b) => b.count - a.count)[0];
              return (
                <Row key={account._id}>
                  <div>{account.name}</div>
                  <div>{account.budget.totalActiveDocs} / {account.budget.totalBudget}</div>
                  <div>{topDriver ? `${topDriver.key} (${topDriver.count})` : 'none'}</div>
                  <div>{account.budget.totalStatus}</div>
                  <div>{account.domain || 'n/a'}</div>
                </Row>
              );
            })}
          </Table>
        ) : (
          <Empty>No account storage rows available.</Empty>
        )}
      </Section>

      <Section>
        <SectionTitle>Policy Notes</SectionTitle>
        <Grid>
          <Card $tone="healthy">
            <Label>Bounded Working Set</Label>
            <Hint>One canonical account, one account pack, and a limited set of active evidence, signals, interactions, and actions.</Hint>
          </Card>
          <Card $tone="warning">
            <Label>Growth Watchlist</Label>
            <Hint>`crawl.snapshot`, `interaction`, `signal`, `molt.event`, and enrichment jobs are the first documents to compact or bucket.</Hint>
          </Card>
          <Card $tone="healthy">
            <Label>Write Rule</Label>
            <Hint>Prefer deterministic IDs, daily buckets, and updates to existing docs instead of append-only writes.</Hint>
          </Card>
        </Grid>
      </Section>
    </Wrap>
  );
}
