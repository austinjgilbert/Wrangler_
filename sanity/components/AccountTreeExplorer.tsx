import React, { useEffect, useMemo, useState } from 'react';
import { useClient } from 'sanity';
import styled from 'styled-components';

const Page = styled.div`
  padding: 1.5rem;
  max-width: 1280px;
`;

const Header = styled.header`
  margin-bottom: 1.25rem;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
`;

const Subtitle = styled.p`
  margin: 0.5rem 0 0;
  color: var(--card-muted-fg, #6b7280);
  max-width: 840px;
`;

const Controls = styled.div`
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(260px, 2fr);
  gap: 0.75rem;
  margin: 1rem 0 1.25rem;
`;

const ModeBar = styled.div`
  display: flex;
  gap: 0.5rem;
  margin: 0 0 1rem;
`;

const ModeButton = styled.button<{ $active?: boolean }>`
  border: 1px solid var(--card-border-color, #d1d5db);
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  background: ${(p) => (p.$active ? 'rgba(34, 118, 252, 0.12)' : 'var(--card-bg-color, #fff)')};
  color: inherit;
  cursor: pointer;
`;

const Input = styled.input`
  width: 100%;
  border: 1px solid var(--card-border-color, #d1d5db);
  border-radius: 8px;
  padding: 0.75rem 0.9rem;
  background: var(--card-bg-color, #fff);
  color: inherit;
`;

const Select = styled.select`
  width: 100%;
  border: 1px solid var(--card-border-color, #d1d5db);
  border-radius: 8px;
  padding: 0.75rem 0.9rem;
  background: var(--card-bg-color, #fff);
  color: inherit;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
`;

const SummaryCard = styled.div`
  border: 1px solid var(--card-border-color, #e5e7eb);
  border-radius: 10px;
  padding: 0.9rem;
  background: var(--card-bg-color, #fff);
`;

const SummaryLabel = styled.div`
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--card-muted-fg, #6b7280);
`;

const SummaryValue = styled.div`
  margin-top: 0.4rem;
  font-size: 1.2rem;
  font-weight: 700;
`;

const TreeShell = styled.div`
  border: 1px solid var(--card-border-color, #e5e7eb);
  border-radius: 12px;
  padding: 1rem;
  background: var(--card-bg-color, #fff);
`;

const GraphLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(280px, 1fr);
  gap: 1rem;
`;

const GraphCanvas = styled.div`
  display: grid;
  gap: 1rem;
`;

const GraphCenter = styled.div`
  border: 1px solid var(--card-border-color, #d1d5db);
  border-radius: 14px;
  padding: 1rem;
  background: rgba(34, 118, 252, 0.08);
`;

const GraphColumns = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.9rem;
`;

const GraphColumn = styled.div`
  border: 1px solid var(--card-border-color, #e5e7eb);
  border-radius: 12px;
  padding: 0.85rem;
  background: var(--card-bg-color, #fff);
`;

const GraphColumnTitle = styled.h3`
  margin: 0 0 0.7rem;
  font-size: 0.9rem;
`;

const GraphNodeList = styled.div`
  display: grid;
  gap: 0.55rem;
`;

const GraphNode = styled.button`
  text-align: left;
  border: 1px solid var(--card-border-color, #e5e7eb);
  border-radius: 10px;
  padding: 0.7rem 0.8rem;
  background: var(--card-bg-color, #fff);
  color: inherit;
  cursor: pointer;
`;

const GraphNodeTitle = styled.div`
  font-weight: 600;
`;

const GraphNodeMeta = styled.div`
  margin-top: 0.2rem;
  font-size: 0.82rem;
  color: var(--card-muted-fg, #6b7280);
`;

const FocusPanel = styled.div`
  border: 1px solid var(--card-border-color, #e5e7eb);
  border-radius: 12px;
  padding: 1rem;
  background: var(--card-bg-color, #fff);
  height: fit-content;
`;

const FocusTitle = styled.h3`
  margin: 0 0 0.4rem;
  font-size: 1rem;
`;

const FocusMeta = styled.div`
  font-size: 0.88rem;
  color: var(--card-muted-fg, #6b7280);
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.8rem;
`;

const ActionButton = styled.button`
  border: 1px solid var(--card-border-color, #d1d5db);
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  background: var(--card-bg-color, #fff);
  color: inherit;
  cursor: pointer;
`;

const NodeList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const NodeItem = styled.li<{ $depth: number }>`
  position: relative;
  margin-left: ${(p) => p.$depth * 20}px;
  padding-left: ${(p) => (p.$depth > 0 ? 18 : 0)}px;
  border-left: ${(p) => (p.$depth > 0 ? '1px solid var(--card-border-color, #e5e7eb)' : 'none')};

  & + & {
    margin-top: 0.5rem;
  }
`;

const NodeCard = styled.div<{ $tone?: 'root' | 'branch' | 'leaf' }>`
  border: 1px solid var(--card-border-color, #e5e7eb);
  border-radius: 10px;
  padding: 0.8rem 0.9rem;
  background: ${(p) => (
    p.$tone === 'root'
      ? 'rgba(34, 118, 252, 0.08)'
      : p.$tone === 'branch'
        ? 'rgba(99, 102, 241, 0.05)'
        : 'var(--card-bg-color, #fff)'
  )};
`;

const NodeHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
`;

const NodeTitle = styled.div`
  font-weight: 700;
`;

const NodeMeta = styled.div`
  margin-top: 0.3rem;
  font-size: 0.86rem;
  color: var(--card-muted-fg, #6b7280);
`;

const BadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: flex-end;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.45rem;
  border-radius: 999px;
  background: var(--card-hover-color, #f3f4f6);
  font-size: 0.75rem;
`;

const Empty = styled.div`
  color: var(--card-muted-fg, #9ca3af);
`;

type AccountHandle = {
  _id: string;
  label: string;
  domain: string;
  accountKey: string;
};

type AccountTreePayload = {
  account: Record<string, any> | null;
  people: Record<string, any>[];
  technologies: Record<string, any>[];
  competitors: Record<string, any>[];
  signals: Record<string, any>[];
  interactions: Record<string, any>[];
  actionCandidates: Record<string, any>[];
  evidencePacks: Record<string, any>[];
  crawlSnapshots: Record<string, any>[];
  events: Record<string, any>[];
};

type TreeNodeData = {
  id: string;
  title: string;
  meta?: string;
  badges?: string[];
  tone?: 'root' | 'branch' | 'leaf';
  children?: TreeNodeData[];
};

type FocusItem = {
  kind: string;
  title: string;
  meta?: string;
  badges?: string[];
  accountId?: string;
};

function formatAccountLabel(account: AccountHandle) {
  return account.domain ? `${account.label} (${account.domain})` : account.label;
}

function compactStrings(value: Array<string | null | undefined>) {
  return value.filter(Boolean) as string[];
}

function buildTree(data: AccountTreePayload | null): TreeNodeData | null {
  if (!data?.account) return null;

  const account = data.account;
  const title = account.companyName || account.name || account.domain || account._id;

  return {
    id: account._id,
    title,
    tone: 'root',
    meta: [account.domain, account.accountKey, account.industry].filter(Boolean).join(' · '),
    badges: compactStrings([
      account.opportunityScore != null ? `Opportunity ${account.opportunityScore}` : null,
      account.profileCompleteness?.score != null ? `Profile ${account.profileCompleteness.score}%` : null,
      account.classification?.segment || null,
    ]),
    children: [
      {
        id: `${account._id}-people`,
        title: `People`,
        tone: 'branch',
        badges: [`${data.people.length}`],
        meta: 'Leadership refs and linked people',
        children: data.people.map((person) => ({
          id: person._id,
          title: person.name || person.currentCompany || person._id,
          tone: 'leaf',
          meta: [person.currentTitle || person.title, person.roleCategory, person.seniorityLevel].filter(Boolean).join(' · '),
          badges: compactStrings([
            person.isDecisionMaker ? 'decision-maker' : null,
            person.linkedinUrl ? 'linkedin' : null,
          ]),
        })),
      },
      {
        id: `${account._id}-technologies`,
        title: `Technologies`,
        tone: 'branch',
        badges: [`${data.technologies.length}`],
        meta: 'Structured technology references',
        children: data.technologies.map((technology) => ({
          id: technology._id,
          title: technology.name || technology.slug || technology._id,
          tone: 'leaf',
          meta: [technology.category, technology.vendor].filter(Boolean).join(' · '),
          badges: compactStrings([
            technology.isLegacy ? 'legacy' : null,
            technology.isMigrationTarget ? 'migration-target' : null,
          ]),
        })),
      },
      {
        id: `${account._id}-signals`,
        title: `Signals`,
        tone: 'branch',
        badges: [`${data.signals.length}`],
        meta: 'Recent account signals',
        children: data.signals.map((signal) => ({
          id: signal._id,
          title: signal.signalType || signal.type || signal.summary || signal._id,
          tone: 'leaf',
          meta: [signal.source, signal.timestamp || signal.observedAt].filter(Boolean).join(' · '),
          badges: compactStrings([
            signal.uncertaintyState || null,
            signal.strength != null ? `strength ${signal.strength}` : null,
          ]),
        })),
      },
      {
        id: `${account._id}-interactions`,
        title: `Interactions`,
        tone: 'branch',
        badges: [`${data.interactions.length}`],
        meta: 'Captured touches and extension context',
        children: data.interactions.map((interaction) => ({
          id: interaction._id,
          title: interaction.title || interaction.companyName || interaction.url || interaction._id,
          tone: 'leaf',
          meta: [interaction.source, interaction.timestamp].filter(Boolean).join(' · '),
          badges: compactStrings([
            interaction.pageSource || null,
            interaction.domain || null,
          ]),
        })),
      },
      {
        id: `${account._id}-actions`,
        title: `Action Candidates`,
        tone: 'branch',
        badges: [`${data.actionCandidates.length}`],
        meta: 'Recommended SDR actions',
        children: data.actionCandidates.map((candidate) => ({
          id: candidate._id,
          title: candidate.recommendedNextStep || candidate.actionType || candidate._id,
          tone: 'leaf',
          meta: [candidate.actionType, candidate.urgency].filter(Boolean).join(' · '),
          badges: compactStrings([
            candidate.lifecycleStatus || null,
            candidate.opportunityScore != null ? `score ${candidate.opportunityScore}` : null,
          ]),
        })),
      },
      {
        id: `${account._id}-evidence`,
        title: `Evidence`,
        tone: 'branch',
        badges: [`${data.evidencePacks.length + data.crawlSnapshots.length}`],
        meta: 'Evidence packs and crawl snapshots',
        children: [
          ...data.evidencePacks.map((pack) => ({
            id: pack._id,
            title: pack.title || pack.siteName || pack.url || pack._id,
            tone: 'leaf' as const,
            meta: [pack.relatedAccountKey, pack.fetchedAt].filter(Boolean).join(' · '),
            badges: compactStrings(['evidence-pack']),
          })),
          ...data.crawlSnapshots.map((snapshot) => ({
            id: snapshot._id,
            title: snapshot.url || snapshot._id,
            tone: 'leaf' as const,
            meta: [snapshot.snapshotClass, snapshot.fetchedAt].filter(Boolean).join(' · '),
            badges: compactStrings([
              snapshot.sourceType || null,
              snapshot.status != null ? `status ${snapshot.status}` : null,
            ]),
          })),
        ],
      },
      {
        id: `${account._id}-related`,
        title: `Related`,
        tone: 'branch',
        badges: [`${data.competitors.length + data.events.length}`],
        meta: 'Competitors and related events',
        children: [
          ...data.competitors.map((competitor) => ({
            id: competitor._id,
            title: competitor.companyName || competitor.name || competitor.domain || competitor._id,
            tone: 'leaf' as const,
            meta: [competitor.domain, competitor.industry].filter(Boolean).join(' · '),
            badges: compactStrings(['competitor']),
          })),
          ...data.events.map((event) => ({
            id: event._id,
            title: event.type || event._id,
            tone: 'leaf' as const,
            meta: [event.actor, event.timestamp].filter(Boolean).join(' · '),
            badges: compactStrings(event.tags || []),
          })),
        ],
      },
    ],
  };
}

function TreeNode({ node, depth = 0 }: { node: TreeNodeData; depth?: number }) {
  return (
    <NodeItem $depth={depth}>
      <NodeCard $tone={node.tone || 'leaf'}>
        <NodeHeader>
          <div>
            <NodeTitle>{node.title}</NodeTitle>
            {node.meta && <NodeMeta>{node.meta}</NodeMeta>}
          </div>
          {node.badges && node.badges.length > 0 && (
            <BadgeRow>
              {node.badges.map((badge) => (
                <Badge key={`${node.id}-${badge}`}>{badge}</Badge>
              ))}
            </BadgeRow>
          )}
        </NodeHeader>
      </NodeCard>
      {node.children && node.children.length > 0 && (
        <NodeList>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </NodeList>
      )}
    </NodeItem>
  );
}

function buildFocusItem(kind: string, title: string, meta?: string, badges?: string[], accountId?: string): FocusItem {
  return { kind, title, meta, badges, accountId };
}

export function AccountTreeExplorer() {
  const client = useClient({ apiVersion: '2024-01-01' });
  const [accounts, setAccounts] = useState<AccountHandle[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'graph'>('tree');
  const [treeData, setTreeData] = useState<AccountTreePayload | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [focusItem, setFocusItem] = useState<FocusItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    client.fetch(`
      *[_type == "account"] | order(coalesce(updatedAt, _updatedAt) desc)[0...200]{
        _id,
        "label": coalesce(companyName, name, domain, rootDomain, _id),
        "domain": coalesce(domain, rootDomain, ""),
        "accountKey": coalesce(accountKey, "")
      }
    `).then((result: AccountHandle[]) => {
      if (cancelled) return;
      const rows = Array.isArray(result) ? result : [];
      setAccounts(rows);
      if (!selectedAccountId && rows[0]?._id) {
        setSelectedAccountId(rows[0]._id);
      }
    }).catch(() => {
      if (!cancelled) setAccounts([]);
    });

    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedAccountId) {
      setTreeData(null);
      return () => {
        cancelled = true;
      };
    }

    const selected = accounts.find((account) => account._id === selectedAccountId);
    setLoadingTree(true);

    client.fetch(`
      {
        "account": *[_type == "account" && _id == $accountId][0]{
          _id,
          name,
          companyName,
          domain,
          rootDomain,
          accountKey,
          industry,
          opportunityScore,
          profileCompleteness,
          classification,
          "leadershipRefs": leadership[]._ref,
          "technologyRefs": technologies[]._ref,
          "competitorRefs": competitors[]._ref
        },
        "people": *[_type == "person" && (companyRef._ref == $accountId || relatedAccountKey == $accountKey)] | order(coalesce(updatedAt, _updatedAt) desc)[0...20]{
          _id,
          name,
          title,
          currentTitle,
          roleCategory,
          seniorityLevel,
          isDecisionMaker,
          linkedinUrl
        },
        "technologies": *[_type == "technology" && _id in *[_type == "account" && _id == $accountId][0].technologies[]._ref] | order(name asc)[0...20]{
          _id,
          name,
          slug,
          category,
          vendor,
          isLegacy,
          isMigrationTarget
        },
        "competitors": *[_type == "account" && _id in *[_type == "account" && _id == $accountId][0].competitors[]._ref] | order(coalesce(companyName, name) asc)[0...12]{
          _id,
          name,
          companyName,
          domain,
          industry
        },
        "signals": *[_type == "signal" && (account._ref == $accountId || companyRef._ref == $accountId)] | order(coalesce(timestamp, observedAt, _updatedAt) desc)[0...15]{
          _id,
          signalType,
          type,
          source,
          summary,
          timestamp,
          observedAt,
          uncertaintyState,
          strength
        },
        "interactions": *[_type == "interaction" && (accountKey == $accountKey || domain == $domain)] | order(coalesce(updatedAt, _updatedAt, timestamp) desc)[0...15]{
          _id,
          title,
          companyName,
          url,
          source,
          pageSource,
          domain,
          timestamp
        },
        "actionCandidates": *[_type == "actionCandidate" && account._ref == $accountId] | order(coalesce(updatedAt, _updatedAt, createdAt) desc)[0...12]{
          _id,
          actionType,
          urgency,
          recommendedNextStep,
          lifecycleStatus,
          opportunityScore
        },
        "evidencePacks": *[_type == "evidencePack" && relatedAccountKey == $accountKey] | order(coalesce(fetchedAt, _updatedAt) desc)[0...10]{
          _id,
          title,
          siteName,
          url,
          relatedAccountKey,
          fetchedAt
        },
        "crawlSnapshots": *[_type == "crawl.snapshot" && (accountRef._ref == $accountId || accountKey == $accountKey)] | order(coalesce(fetchedAt, _updatedAt) desc)[0...10]{
          _id,
          url,
          status,
          fetchedAt,
          snapshotClass,
          sourceType
        },
        "events": *[_type == "molt.event" && references($accountId)] | order(coalesce(timestamp, _updatedAt) desc)[0...10]{
          _id,
          type,
          actor,
          timestamp,
          tags
        }
      }
    `, {
      accountId: selectedAccountId,
      accountKey: selected?.accountKey || '',
      domain: selected?.domain || '',
    }).then((result: AccountTreePayload) => {
      if (!cancelled) {
        setTreeData(result || null);
        const account = result?.account;
        if (account) {
          setFocusItem(buildFocusItem(
            'account',
            account.companyName || account.name || account.domain || account._id,
            [account.domain, account.accountKey, account.industry].filter(Boolean).join(' · '),
            compactStrings([
              account.profileCompleteness?.score != null ? `Profile ${account.profileCompleteness.score}%` : null,
              account.opportunityScore != null ? `Opportunity ${account.opportunityScore}` : null,
            ]),
            account._id,
          ));
        }
      }
    }).catch(() => {
      if (!cancelled) setTreeData(null);
    }).finally(() => {
      if (!cancelled) setLoadingTree(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accounts, client, selectedAccountId]);

  const filteredAccounts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) =>
      `${account.label} ${account.domain} ${account.accountKey}`.toLowerCase().includes(needle)
    );
  }, [accounts, search]);

  const tree = useMemo(() => buildTree(treeData), [treeData]);
  const selectedAccount = useMemo(
    () => accounts.find((account) => account._id === selectedAccountId) || null,
    [accounts, selectedAccountId],
  );

  const graphSections = useMemo(() => {
    if (!treeData?.account) return [];
    return [
      {
        title: 'People',
        items: treeData.people.map((person) => ({
          key: person._id,
          title: person.name || person._id,
          meta: [person.currentTitle || person.title, person.roleCategory].filter(Boolean).join(' · '),
          onClick: () => setFocusItem(buildFocusItem(
            'person',
            person.name || person._id,
            [person.currentTitle || person.title, person.roleCategory, person.seniorityLevel].filter(Boolean).join(' · '),
            compactStrings([
              person.isDecisionMaker ? 'decision-maker' : null,
              person.linkedinUrl ? 'linkedin' : null,
            ]),
          )),
        })),
      },
      {
        title: 'Technologies',
        items: treeData.technologies.map((technology) => ({
          key: technology._id,
          title: technology.name || technology.slug || technology._id,
          meta: [technology.category, technology.vendor].filter(Boolean).join(' · '),
          onClick: () => setFocusItem(buildFocusItem(
            'technology',
            technology.name || technology.slug || technology._id,
            [technology.category, technology.vendor].filter(Boolean).join(' · '),
            compactStrings([
              technology.isLegacy ? 'legacy' : null,
              technology.isMigrationTarget ? 'migration-target' : null,
            ]),
          )),
        })),
      },
      {
        title: 'Signals',
        items: treeData.signals.map((signal) => ({
          key: signal._id,
          title: signal.signalType || signal.type || signal.summary || signal._id,
          meta: [signal.source, signal.timestamp || signal.observedAt].filter(Boolean).join(' · '),
          onClick: () => setFocusItem(buildFocusItem(
            'signal',
            signal.signalType || signal.type || signal.summary || signal._id,
            [signal.source, signal.timestamp || signal.observedAt].filter(Boolean).join(' · '),
            compactStrings([
              signal.uncertaintyState || null,
              signal.strength != null ? `strength ${signal.strength}` : null,
            ]),
          )),
        })),
      },
      {
        title: 'Actions',
        items: treeData.actionCandidates.map((candidate) => ({
          key: candidate._id,
          title: candidate.recommendedNextStep || candidate.actionType || candidate._id,
          meta: [candidate.actionType, candidate.urgency].filter(Boolean).join(' · '),
          onClick: () => setFocusItem(buildFocusItem(
            'actionCandidate',
            candidate.recommendedNextStep || candidate.actionType || candidate._id,
            [candidate.actionType, candidate.urgency].filter(Boolean).join(' · '),
            compactStrings([
              candidate.lifecycleStatus || null,
              candidate.opportunityScore != null ? `score ${candidate.opportunityScore}` : null,
            ]),
          )),
        })),
      },
      {
        title: 'Related Accounts',
        items: treeData.competitors.map((competitor) => ({
          key: competitor._id,
          title: competitor.companyName || competitor.name || competitor.domain || competitor._id,
          meta: [competitor.domain, competitor.industry].filter(Boolean).join(' · '),
          onClick: () => setFocusItem(buildFocusItem(
            'account',
            competitor.companyName || competitor.name || competitor.domain || competitor._id,
            [competitor.domain, competitor.industry].filter(Boolean).join(' · '),
            ['competitor'],
            competitor._id,
          )),
        })),
      },
    ];
  }, [treeData]);

  return (
    <Page>
      <Header>
        <Title>Account Tree Explorer</Title>
        <Subtitle>
          Explore your Sanity data as an account-rooted tree. Select an account to trace downward into people,
          technologies, signals, interactions, evidence, actions, and related entities.
        </Subtitle>
      </Header>

      <ModeBar>
        <ModeButton $active={viewMode === 'tree'} onClick={() => setViewMode('tree')}>Tree</ModeButton>
        <ModeButton $active={viewMode === 'graph'} onClick={() => setViewMode('graph')}>Graph</ModeButton>
      </ModeBar>

      <Controls>
        <Input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search accounts by name, domain, or account key"
        />
        <Select
          value={selectedAccountId}
          onChange={(event) => setSelectedAccountId(event.currentTarget.value)}
          disabled={filteredAccounts.length === 0}
        >
          {filteredAccounts.length === 0 && (
            <option value="">No matching accounts</option>
          )}
          {filteredAccounts.map((account) => (
            <option key={account._id} value={account._id}>
              {formatAccountLabel(account)}
            </option>
          ))}
        </Select>
      </Controls>

      <SummaryGrid>
        <SummaryCard>
          <SummaryLabel>Accounts Indexed</SummaryLabel>
          <SummaryValue>{accounts.length}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>People</SummaryLabel>
          <SummaryValue>{treeData?.people?.length || 0}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Technologies</SummaryLabel>
          <SummaryValue>{treeData?.technologies?.length || 0}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Signals</SummaryLabel>
          <SummaryValue>{treeData?.signals?.length || 0}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Interactions</SummaryLabel>
          <SummaryValue>{treeData?.interactions?.length || 0}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Actions</SummaryLabel>
          <SummaryValue>{treeData?.actionCandidates?.length || 0}</SummaryValue>
        </SummaryCard>
      </SummaryGrid>

      <TreeShell>
        {loadingTree && <Empty>Loading account tree...</Empty>}
        {!loadingTree && !tree && <Empty>Select an account to render the tree.</Empty>}
        {!loadingTree && tree && viewMode === 'tree' && (
          <NodeList>
            <TreeNode node={tree} />
          </NodeList>
        )}
        {!loadingTree && tree && viewMode === 'graph' && (
          <GraphLayout>
            <GraphCanvas>
              <GraphCenter>
                <NodeTitle>{tree.title}</NodeTitle>
                {tree.meta && <NodeMeta>{tree.meta}</NodeMeta>}
                {tree.badges && tree.badges.length > 0 && (
                  <ActionRow>
                    {tree.badges.map((badge) => (
                      <Badge key={`root-${badge}`}>{badge}</Badge>
                    ))}
                  </ActionRow>
                )}
              </GraphCenter>
              <GraphColumns>
                {graphSections.map((section) => (
                  <GraphColumn key={section.title}>
                    <GraphColumnTitle>{section.title}</GraphColumnTitle>
                    <GraphNodeList>
                      {section.items.length === 0 && <Empty>No linked records.</Empty>}
                      {section.items.map((item) => (
                        <GraphNode key={item.key} onClick={item.onClick}>
                          <GraphNodeTitle>{item.title}</GraphNodeTitle>
                          {item.meta && <GraphNodeMeta>{item.meta}</GraphNodeMeta>}
                        </GraphNode>
                      ))}
                    </GraphNodeList>
                  </GraphColumn>
                ))}
              </GraphColumns>
            </GraphCanvas>
            <FocusPanel>
              <FocusTitle>{focusItem?.title || 'Node details'}</FocusTitle>
              {focusItem?.meta ? (
                <FocusMeta>{focusItem.meta}</FocusMeta>
              ) : (
                <Empty>Select a node in graph view to inspect details.</Empty>
              )}
              {focusItem?.badges && focusItem.badges.length > 0 && (
                <ActionRow>
                  {focusItem.badges.map((badge) => (
                    <Badge key={`focus-${badge}`}>{badge}</Badge>
                  ))}
                </ActionRow>
              )}
              {focusItem?.accountId && focusItem.accountId !== selectedAccount?._id && (
                <ActionRow>
                  <ActionButton onClick={() => setSelectedAccountId(focusItem.accountId || '')}>
                    Pivot To Account
                  </ActionButton>
                </ActionRow>
              )}
            </FocusPanel>
          </GraphLayout>
        )}
      </TreeShell>
    </Page>
  );
}
