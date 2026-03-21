import type { DocumentHandle } from '@sanity/sdk'
import { useDocumentProjection, useDocuments } from '@sanity/sdk-react'
import type React from 'react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { getWorkerConfigMessage } from '../lib/app-env'
import { dedupeAccounts, getAccountDisplayName, getAccountDomainLabel } from '../lib/account-dedupe'
import { humanizeCoverageStatus, formatTimestamp } from '../lib/formatters'
import { fetchEnrichStatus, hasWorker, queueEnrichment } from '../lib/worker-api'
import { fetchRecentSignals, countSignalsForAccount, type WorkerSignal } from '../lib/adapters/signals'

type LinkedRecord = {
  _id: string
  title?: string
  name?: string
  companyName?: string
  currentCompany?: string
  domain?: string
  industry?: string
  category?: string
  vendor?: string
  roleCategory?: string
  seniorityLevel?: string
  email?: string
  phone?: string
  actionType?: string
  urgency?: string
  recommendedNextStep?: string
  lifecycleStatus?: string
  pageSource?: string
  source?: string
  sourceSystems?: string[]
  summary?: string
  signalType?: string
  type?: string
  timestamp?: string
  observedAt?: string
  fetchedAt?: string
  snapshotClass?: string
  status?: string | number
  isDecisionMaker?: boolean
  isLegacy?: boolean
  isMigrationTarget?: boolean
  linkedinUrl?: string
  opportunityScore?: number
  strength?: number
  uncertaintyState?: string
  tags?: string[]
  eventSummary?: string
  dataAdded?: string[]
  dataDeleted?: string[]
  dataMerged?: string[]
  dataModified?: string[]
  userId?: string
  influencedAreas?: string[]
}

type ProjectedAccount = {
  _id: string
  name?: string
  companyName?: string
  canonicalUrl?: string
  domain?: string
  rootDomain?: string
  accountKey?: string
  industry?: string
  opportunityScore?: number
  profileCompleteness?: {
    score?: number
    gaps?: string[]
    nextStages?: string[]
    dimensionFlags?: Record<string, boolean>
  }
  classification?: { segment?: string; industry?: string; tags?: string[] }
  benchmarks?: Record<string, string | number | null> | null
  painPoints?: Array<{ category?: string; description?: string; severity?: string }>
  counts?: {
    crmContacts?: number
    leadership?: number
    technologies?: number
    competitors?: number
    signals?: number
    interactions?: number
    actionCandidates?: number
    evidence?: number
    painPoints?: number
    benchmarks?: number
  }
  leadership?: LinkedRecord[]
  crmContacts?: LinkedRecord[]
  technologies?: LinkedRecord[]
  competitors?: LinkedRecord[]
  signals?: LinkedRecord[]
  interactions?: LinkedRecord[]
  actionCandidates?: LinkedRecord[]
  evidencePacks?: LinkedRecord[]
  crawlSnapshots?: LinkedRecord[]
}

type TreeNode = {
  id: string
  title: string
  meta?: string
  badges?: string[]
  children?: TreeNode[]
}

type AccountHandle = DocumentHandle & {
  documentType: 'account'
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter(Boolean) as string[]
}

function toCommonCompanyName(value: string | undefined) {
  if (!value) return ''

  const normalized = value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .trim()

  const base = normalized.includes('.')
    ? normalized.split('.')[0]
    : normalized

  if (!base) return normalized

  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeComparableName(value: string | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, '') || ''
}

function formatLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getCoverageItems(account: ProjectedAccount) {
  const counts = account.counts || {}
  const benchmarksPresent = Boolean(counts.benchmarks)
  const items = [
    {
      label: 'Company Profile',
      status: account.companyName || account.name || account.domain ? 'covered' : 'missing',
      detail: [account.industry || account.classification?.industry, account.classification?.segment].filter(Boolean).join(' · ') || 'Identity fields',
    },
    {
      label: 'CRM Contacts',
      status: (counts.crmContacts || 0) > 0 ? 'covered' : 'missing',
      detail: `${counts.crmContacts || 0} linked people`,
    },
    {
      label: 'Leadership',
      status: (counts.leadership || 0) > 0 ? 'covered' : 'missing',
      detail: `${counts.leadership || 0} decision-makers`,
    },
    {
      label: 'Technologies',
      status: (counts.technologies || 0) > 0 ? 'covered' : 'missing',
      detail: `${counts.technologies || 0} linked technologies`,
    },
    {
      label: 'Signals',
      status: (counts.signals || 0) > 0 ? 'covered' : 'missing',
      detail: `${counts.signals || 0} recent signals`,
    },
    {
      label: 'Interactions',
      status: (counts.interactions || 0) > 0 ? 'covered' : 'missing',
      detail: `${counts.interactions || 0} captured interactions`,
    },
    {
      label: 'Evidence',
      status: (counts.evidence || 0) > 0 ? 'covered' : 'missing',
      detail: `${counts.evidence || 0} evidence items`,
    },
    {
      label: 'Pain Points',
      status: (counts.painPoints || 0) > 0 ? 'covered' : 'missing',
      detail: `${counts.painPoints || 0} structured pain points`,
    },
    {
      label: 'Benchmarks',
      status: benchmarksPresent ? 'covered' : 'missing',
      detail: benchmarksPresent ? 'Benchmarks present' : 'Needs company benchmarks',
    },
    {
      label: 'Actions',
      status: (counts.actionCandidates || 0) > 0 ? 'covered' : 'missing',
      detail: `${counts.actionCandidates || 0} action candidates`,
    },
  ]

  return items
}

function buildTree(account: ProjectedAccount | null): TreeNode | null {
  if (!account) return null

  const title = account.companyName || account.name || account.domain || account._id

  return {
    id: account._id,
    title,
    meta: [account.domain || account.rootDomain, account.industry].filter(Boolean).join(' · '),
    badges: compactStrings([
      account.opportunityScore != null ? `Opportunity ${account.opportunityScore}` : null,
      account.profileCompleteness?.score != null ? `Profile ${account.profileCompleteness.score}%` : null,
      account.classification?.segment || null,
    ]),
    children: [
      {
        id: `${account._id}-people`,
        title: 'People',
        badges: [`${account.crmContacts?.length || account.leadership?.length || 0}`],
        children: (account.crmContacts || account.leadership || []).map((person) => ({
          id: person._id,
          title: person.name || person.currentTitle || person.title || person._id,
          meta: [person.currentTitle || person.title, person.roleCategory, person.seniorityLevel].filter(Boolean).join(' · '),
          badges: compactStrings([
            person.isDecisionMaker ? 'decision-maker' : null,
            person.email ? 'email' : null,
            person.linkedinUrl ? 'linkedin' : null,
          ]),
        })),
      },
      {
        id: `${account._id}-technologies`,
        title: 'Technologies',
        badges: [`${account.technologies?.length || 0}`],
        children: (account.technologies || []).map((technology) => ({
          id: technology._id,
          title: technology.title || technology.name || technology._id,
          meta: [technology.category, technology.vendor].filter(Boolean).join(' · '),
          badges: compactStrings([
            technology.isLegacy ? 'legacy' : null,
            technology.isMigrationTarget ? 'migration-target' : null,
          ]),
        })),
      },
      {
        id: `${account._id}-signals`,
        title: 'Signals',
        badges: [`${account.signals?.length || 0}`],
        children: (account.signals || []).map((signal) => ({
          id: signal._id,
          title: signal.signalType || signal.type || signal.summary || signal._id,
          meta: [signal.source, signal.timestamp || signal.observedAt].filter(Boolean).join(' · '),
          badges: compactStrings([
            signal.uncertaintyState || null,
            signal.strength != null ? `strength ${signal.strength}` : null,
          ]),
        })),
      },
      {
        id: `${account._id}-interactions`,
        title: 'Interactions',
        badges: [`${account.interactions?.length || 0}`],
        children: (account.interactions || []).map((interaction) => ({
          id: interaction._id,
          title: interaction.title || interaction.companyName || interaction._id,
          meta: [interaction.source, interaction.pageSource, interaction.timestamp].filter(Boolean).join(' · '),
          badges: compactStrings([
            interaction.domain || null,
            interaction.eventSummary ? 'has summary' : null,
            ...(interaction.influencedAreas || []),
          ]),
        })),
      },
      {
        id: `${account._id}-actions`,
        title: 'Action Candidates',
        badges: [`${account.actionCandidates?.length || 0}`],
        children: (account.actionCandidates || []).map((candidate) => ({
          id: candidate._id,
          title: candidate.recommendedNextStep || candidate.actionType || candidate._id,
          meta: [candidate.actionType, candidate.urgency].filter(Boolean).join(' · '),
          badges: compactStrings([
            candidate.lifecycleStatus || null,
            candidate.opportunityScore != null ? `score ${candidate.opportunityScore}` : null,
          ]),
        })),
      },
      {
        id: `${account._id}-evidence`,
        title: 'Evidence',
        badges: [`${(account.evidencePacks?.length || 0) + (account.crawlSnapshots?.length || 0)}`],
        children: [
          ...(account.evidencePacks || []).map((pack) => ({
            id: pack._id,
            title: pack.title || pack.name || pack._id,
            meta: [pack.domain, pack.fetchedAt].filter(Boolean).join(' · '),
            badges: ['evidence-pack'],
          })),
          ...(account.crawlSnapshots || []).map((snapshot) => ({
            id: snapshot._id,
            title: snapshot.title || snapshot.name || snapshot._id,
            meta: [snapshot.snapshotClass, snapshot.fetchedAt].filter(Boolean).join(' · '),
            badges: compactStrings([
              snapshot.source || null,
              snapshot.status != null ? `status ${snapshot.status}` : null,
            ]),
          })),
        ],
      },
      {
        id: `${account._id}-competitors`,
        title: 'Related Accounts',
        badges: [`${account.competitors?.length || 0}`],
        children: (account.competitors || []).map((competitor) => ({
          id: competitor._id,
          title: competitor.companyName || competitor.name || competitor.domain || competitor._id,
          meta: [competitor.domain, competitor.industry].filter(Boolean).join(' · '),
          badges: ['competitor'],
        })),
      },
    ],
  }
}

function GapChip({
  label,
  gapKey,
  accountId,
  accountKey,
  canonicalUrl,
  domain,
  kind,
}: {
  label: string
  gapKey: string
  accountId: string
  accountKey?: string
  canonicalUrl?: string
  domain?: string
  kind: 'gap' | 'stage'
}) {
  const [status, setStatus] = useState<'idle' | 'queuing' | 'running' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const triggerEnrichment = async () => {
    if (!hasWorker()) {
      setErrorMsg(getWorkerConfigMessage('run research'))
      setStatus('error')
      return
    }
    setStatus('queuing')
    setErrorMsg(null)
    try {
      const key = accountKey || accountId.replace(/^account[.-]/, '')
      const resolvedCanonicalUrl =
        canonicalUrl
        || (domain ? `https://${domain.replace(/^https?:\/\//, '')}` : '')
      const queueResult = await queueEnrichment({
        accountId,
        accountKey: key,
        canonicalUrl: resolvedCanonicalUrl,
        stages: kind === 'stage' ? [gapKey] : undefined,
      })
      if (!queueResult.ok) {
        setErrorMsg(queueResult.message || 'Queue failed')
        setStatus('error')
        return
      }
      setStatus('running')
      setProgress(0)
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetchEnrichStatus(key)
          if (s.status === 'complete') {
            if (pollRef.current) {
              clearInterval(pollRef.current)
              pollRef.current = null
            }
            setProgress(100)
            setStatus('done')
          } else if (s.status === 'failed') {
            if (pollRef.current) {
              clearInterval(pollRef.current)
              pollRef.current = null
            }
            setErrorMsg('Research failed. Open the Research tab for details or rerun the job.')
            setStatus('error')
          } else if (s.status === 'in_progress' && s.progress != null) {
            setProgress(s.progress)
          } else if (s.status === 'queued' || s.status === 'pending') {
            setProgress(0)
          }
        } catch {
          // keep polling
        }
      }, 2000)
    } catch (e) {
      setErrorMsg((e as Error).message)
      setStatus('error')
    }
  }

  const isMissing = kind === 'gap' || (kind === 'stage' && status === 'idle')
  const chipClass = status === 'done' ? 'chip chip-covered' : status === 'error' ? 'chip chip-missing chip-error' : isMissing ? 'chip chip-missing' : 'chip chip-stage'

  return (
    <span className="chip-wrapper">
      <button
        type="button"
        className={`${chipClass} chip-clickable`}
        onClick={triggerEnrichment}
        disabled={status === 'queuing' || status === 'running'}
        title={hasWorker() ? `Run research to fill: ${label}` : getWorkerConfigMessage('enable research')}
      >
        {label}
        {status === 'queuing' && '…'}
        {status === 'running' && ` ${progress}%`}
        {status === 'done' && ' ✓'}
      </button>
      {status === 'running' && (
        <div className="enrich-progress">
          <div className="enrich-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status === 'error' && errorMsg && <span className="chip-error-msg">{errorMsg}</span>}
    </span>
  )
}

function EnrichmentActionBar({
  accountId,
  accountKey,
  canonicalUrl,
  domain,
}: {
  accountId: string
  accountKey?: string
  canonicalUrl?: string
  domain?: string
}) {
  const [pendingMode, setPendingMode] = useState<'standard' | 'restart' | 'deep' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const trigger = async (mode: 'standard' | 'restart' | 'deep') => {
    if (!hasWorker()) {
      setMessage(getWorkerConfigMessage('queue research'))
      return
    }

    const key = accountKey || accountId.replace(/^account[.-]/, '')
    const resolvedCanonicalUrl =
      canonicalUrl
      || (domain ? `https://${domain.replace(/^https?:\/\//, '')}` : '')

    setPendingMode(mode)
    setMessage(null)
    try {
      const result = await queueEnrichment({
        accountId,
        accountKey: key,
        canonicalUrl: resolvedCanonicalUrl,
        mode,
        selfHeal: true,
      })

      if (!result.ok) {
        setMessage(result.message || 'Could not queue research')
        return
      }

      setMessage(
        mode === 'deep'
          ? 'Deep research queued. The worker will try retries, gap fill, and broader evidence collection.'
          : mode === 'restart'
            ? 'A fresh enrichment run was queued. The worker will try to self-heal unresolved steps.'
            : 'Research queued. The worker will try to self-heal unresolved steps.'
      )
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setPendingMode(null)
    }
  }

  return (
    <div className="insight-section">
      <div className="section-header">
        <div>
          <p className="eyebrow">Research Controls</p>
          <h3>Keep solving until we have a usable answer</h3>
        </div>
      </div>
      <div className="queue-actions" style={{ marginLeft: 0, justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="btn btn--primary btn--enrich"
          disabled={pendingMode === 'standard'}
          onClick={() => trigger('standard')}
        >
          {pendingMode === 'standard' ? 'Queuing…' : 'Run research'}
        </button>
        <button
          type="button"
          className="btn btn--enrich"
          disabled={pendingMode === 'restart'}
          onClick={() => trigger('restart')}
        >
          {pendingMode === 'restart' ? 'Queuing…' : 'Run again'}
        </button>
        <button
          type="button"
          className="btn btn--enrich"
          disabled={pendingMode === 'deep'}
          onClick={() => trigger('deep')}
        >
          {pendingMode === 'deep' ? 'Queuing…' : 'Deep research'}
        </button>
      </div>
      <p className="detail-meta" style={{ marginTop: 10 }}>
        {message || 'Run research for a normal pass, Run again for a fresh retry, or Deep research for a broader evidence sweep.'}
      </p>
    </div>
  )
}

function TreeNodeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <li className={`tree-node depth-${depth}`}>
      <div className="tree-card">
        <div className="tree-copy">
          <div className="tree-title">{node.title}</div>
          {node.meta ? <div className="tree-meta">{node.meta}</div> : null}
        </div>
        {node.badges && node.badges.length > 0 ? (
          <div className="badge-row">
            {node.badges.map((badge) => (
              <span className="badge" key={`${node.id}-${badge}`}>{badge}</span>
            ))}
          </div>
        ) : null}
      </div>
      {node.children && node.children.length > 0 ? (
        <ul className="tree-list">
          {node.children.map((child) => (
            <TreeNodeView key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function AccountListItem({
  account,
  selected,
  onSelect,
}: {
  account: AccountHandle
  selected: boolean
  onSelect: (accountId: string) => void
}) {
  const { data } = useDocumentProjection({
    ...account,
    projection: `{
      "label": coalesce(companyName, name, domain, rootDomain, _id),
      "subLabel": coalesce(domain, rootDomain, _id)
    }`,
  })

  const projected = data as { label?: string; subLabel?: string } | undefined
  const rawLabel = projected?.label || account.documentId
  const rawSubLabel = projected?.subLabel || account.documentId
  const normalizedLabel = rawLabel.trim()
  const normalizedSubLabel = rawSubLabel.trim()
  const label = normalizedLabel.includes('.')
    ? toCommonCompanyName(normalizedLabel) || normalizedLabel
    : normalizedLabel
  const normalizedDomainLabel = toCommonCompanyName(normalizedSubLabel)
  const subLabel = (
    normalizedSubLabel.toLowerCase() === normalizedLabel.toLowerCase()
    || normalizeComparableName(normalizedDomainLabel) === normalizeComparableName(label)
  )
    ? ''
    : normalizedSubLabel

  return (
    <button
      className={`sidebar-item ${selected ? 'active' : ''}`}
      onClick={() => onSelect(account.documentId)}
      type="button"
    >
      <strong>{label}</strong>
      {subLabel ? <span>{subLabel}</span> : null}
    </button>
  )
}

type SortOption = 'updated' | 'name-asc' | 'name-desc'

function AccountList({
  selectedAccountId,
  onSelect,
}: {
  selectedAccountId: string
  onSelect: (accountId: string) => void
}) {
  const [sortBy, setSortBy] = useState<SortOption>('updated')
  const orderings = useMemo(() => {
    if (sortBy === 'name-asc') return [{ field: 'companyName', direction: 'asc' as const }]
    if (sortBy === 'name-desc') return [{ field: 'companyName', direction: 'desc' as const }]
    return [{ field: '_updatedAt', direction: 'desc' as const }]
  }, [sortBy])

  const { data, hasMore, loadMore, isPending } = useDocuments({
    documentType: 'account',
    batchSize: 100,
    orderings,
  })

  const rawAccounts = (data || []) as AccountHandle[]
  const accounts = useMemo(() => dedupeAccounts(rawAccounts), [rawAccounts])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!selectedAccountId && accounts[0]?.documentId) {
      onSelect(accounts[0].documentId)
    }
  }, [accounts, onSelect, selectedAccountId])

  useEffect(() => {
    if (!selectedAccountId) return
    if (accounts.some((account) => account.documentId === selectedAccountId)) return
    if (accounts[0]?.documentId) {
      onSelect(accounts[0].documentId)
    }
  }, [accounts, onSelect, selectedAccountId])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return accounts
    return accounts.filter((account) => {
      const searchText = [
        getAccountDisplayName(account),
        getAccountDomainLabel(account),
        account.documentId,
      ].filter(Boolean).join(' ').toLowerCase()
      return searchText.includes(needle)
    })
  }, [accounts, search])

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Accounts</h2>
        <p>{accounts.length} shown{rawAccounts.length > accounts.length ? ` · ${rawAccounts.length - accounts.length} duplicates hidden` : ''}</p>
      </div>
      <div className="sidebar-controls">
        <label className="sort-label">
          Sort
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="updated">Last updated</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
          </select>
        </label>
        <input
          className="search-input"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Filter by company or website"
        />
      </div>
      <div className="sidebar-list">
        {filtered.map((account) => (
          <Suspense
            key={account.documentId}
            fallback={
              <button className={`sidebar-item ${selectedAccountId === account.documentId ? 'active' : ''}`} type="button">
                <strong>{getAccountDisplayName(account)}</strong>
                <span>{getAccountDomainLabel(account) || 'Loading company name…'}</span>
              </button>
            }
          >
            <AccountListItem
              account={account}
              selected={selectedAccountId === account.documentId}
              onSelect={onSelect}
            />
          </Suspense>
        ))}
      </div>
      <div className="sidebar-footer">
        <span>{filtered.length} visible</span>
        {hasMore ? (
          <button
            className="sidebar-load-more"
            disabled={isPending}
            onClick={() => loadMore()}
            type="button"
          >
            {isPending ? 'Loading…' : 'Load more accounts'}
          </button>
        ) : (
          <span>All accounts loaded</span>
        )}
      </div>
    </aside>
  )
}

function AccountDetails({
  accountId,
  onPivotAccount,
}: {
  accountId: string
  onPivotAccount: (accountId: string) => void
}) {
  const handle = useMemo(() => ({
    documentId: accountId,
    documentType: 'account',
  } as const), [accountId])

  const { data } = useDocumentProjection({
    ...handle,
    projection: `{
      _id,
      name,
      companyName,
      canonicalUrl,
      domain,
      rootDomain,
      accountKey,
      industry,
      opportunityScore,
      profileCompleteness,
      classification,
      benchmarks,
      painPoints[]{
        category,
        description,
        severity
      },
      "counts": {
        "crmContacts": count(*[_type == "person" && (companyRef._ref == ^._id || relatedAccountKey == ^.accountKey || rootDomain == coalesce(^.rootDomain, ^.domain))]),
        "leadership": count(coalesce(leadership, [])),
        "technologies": count(coalesce(technologies, [])),
        "competitors": count(coalesce(competitors, [])),
        "signals": 0, // Signal count comes from Worker snapshot, not Sanity (signal type has 0 docs)
        "interactions": count(*[_type == "interaction" && (accountKey == ^.accountKey || domain == coalesce(^.domain, ^.rootDomain))]),
        "actionCandidates": count(*[_type == "actionCandidate" && account._ref == ^._id]),
        "evidence": count(*[_type == "evidencePack" && relatedAccountKey == ^.accountKey]) + count(*[_type == "crawl.snapshot" && (accountRef._ref == ^._id || accountKey == ^.accountKey)]),
        "painPoints": count(coalesce(painPoints, [])),
        "benchmarks": select(
          defined(benchmarks.updatedAt) || defined(benchmarks.estimatedRevenue) || defined(benchmarks.estimatedEmployees) || defined(benchmarks.headquarters) => 1,
          0
        )
      },
      "leadership": leadership[]->{
        _id,
        name,
        title,
        currentTitle,
        roleCategory,
        seniorityLevel,
        isDecisionMaker,
        linkedinUrl
      },
      "crmContacts": *[_type == "person" && (companyRef._ref == ^._id || relatedAccountKey == ^.accountKey || rootDomain == coalesce(^.rootDomain, ^.domain))] | order(coalesce(isDecisionMaker, false) desc, coalesce(updatedAt, _updatedAt) desc)[0...20]{
        _id,
        name,
        title,
        currentTitle,
        currentCompany,
        email,
        phone,
        roleCategory,
        seniorityLevel,
        isDecisionMaker,
        linkedinUrl,
        sourceSystems
      },
      "technologies": technologies[]->{
        _id,
        "title": coalesce(name, slug, _id),
        name,
        category,
        vendor,
        isLegacy,
        isMigrationTarget
      },
      "competitors": competitors[]->{
        _id,
        name,
        companyName,
        domain,
        industry
      },
      // signals: fetched from Worker snapshot, not Sanity (signal type has 0 docs — see AE-1)
      "interactions": *[_type == "interaction" && (accountKey == ^.accountKey || domain == coalesce(^.domain, ^.rootDomain))] | order(coalesce(updatedAt, _updatedAt, timestamp) desc)[0...10]{
        _id,
        title,
        companyName,
        domain,
        source,
        pageSource,
        timestamp,
        eventSummary,
        dataAdded,
        dataDeleted,
        dataMerged,
        dataModified,
        userId,
        influencedAreas
      },
      "actionCandidates": *[_type == "actionCandidate" && account._ref == ^._id] | order(coalesce(updatedAt, _updatedAt, createdAt) desc)[0...10]{
        _id,
        actionType,
        urgency,
        recommendedNextStep,
        lifecycleStatus,
        opportunityScore
      },
      "evidencePacks": *[_type == "evidencePack" && relatedAccountKey == ^.accountKey] | order(coalesce(fetchedAt, _updatedAt) desc)[0...8]{
        _id,
        title,
        domain,
        fetchedAt
      },
      "crawlSnapshots": *[_type == "crawl.snapshot" && (accountRef._ref == ^._id || accountKey == ^.accountKey)] | order(coalesce(fetchedAt, _updatedAt) desc)[0...8]{
        _id,
        "title": url,
        source,
        fetchedAt,
        snapshotClass,
        status
      }
    }`,
  })

  const rawAccount = (data || null) as ProjectedAccount | null

  // ── AE-1: Fetch signals from Worker snapshot instead of dead Sanity query ──
  const [workerSignals, setWorkerSignals] = useState<WorkerSignal[]>([])
  useEffect(() => {
    fetchRecentSignals().then(setWorkerSignals).catch(() => setWorkerSignals([]))
  }, [])

  // Filter signals for this account and merge into projected account
  const account = useMemo(() => {
    if (!rawAccount) return null
    const accountName = rawAccount.companyName || rawAccount.name || rawAccount.domain || ''
    const filtered = accountName
      ? workerSignals.filter(
          (s) => s.accountName?.toLowerCase().trim() === accountName.toLowerCase().trim()
        )
      : []
    // Map WorkerSignal → LinkedRecord shape for tree/graph compatibility
    const signalRecords: LinkedRecord[] = filtered.map((s) => ({
      _id: s.id,
      signalType: s.signalType,
      source: s.source,
      summary: s.summary,
      timestamp: s.timestamp,
      uncertaintyState: s.uncertaintyState,
    }))
    return {
      ...rawAccount,
      signals: signalRecords,
      counts: { ...rawAccount.counts, signals: filtered.length },
    }
  }, [rawAccount, workerSignals])

  const tree = useMemo(() => buildTree(account), [account])
  const coverageItems = useMemo(() => account ? getCoverageItems(account) : [], [account])
  const [mode, setMode] = useState<'tree' | 'graph'>('tree')
  const [modal, setModal] = useState<{ title: string; content: React.ReactNode } | null>(null)

  if (!account) {
    return <div className="detail-empty">No account selected.</div>
  }

  const title = account.companyName || account.name || account.domain || account._id

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Selected Account</p>
          <h2>{title}</h2>
          <p className="detail-meta">
            {[account.domain || account.rootDomain, account.industry].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="mode-row">
          <button className={`mode-button ${mode === 'tree' ? 'active' : ''}`} onClick={() => setMode('tree')} type="button">Tree</button>
          <button className={`mode-button ${mode === 'graph' ? 'active' : ''}`} onClick={() => setMode('graph')} type="button">Graph</button>
        </div>
      </div>

      <EnrichmentActionBar
        accountId={account._id}
        accountKey={account.accountKey}
        canonicalUrl={account.canonicalUrl}
        domain={account.domain || account.rootDomain}
      />

      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-label">Opportunity</span>
          <strong>{account.opportunityScore ?? 'n/a'}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Profile</span>
          <strong>{account.profileCompleteness?.score ?? 'n/a'}%</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">CRM Contacts</span>
          <strong>{account.counts?.crmContacts ?? account.crmContacts?.length ?? 0}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Signals</span>
          <strong>{account.counts?.signals ?? account.signals?.length ?? 0}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Actions</span>
          <strong>{account.counts?.actionCandidates ?? account.actionCandidates?.length ?? 0}</strong>
        </div>
      </div>

      <div className="insight-section battlecard-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Research</p>
            <h3>Key data at a glance</h3>
          </div>
        </div>
        <button
          type="button"
          className="section-summary-row"
          onClick={() => setModal({ title: 'Research', content: <div className="battlecard-summary">{coverageItems.map((item) => <div className="battlecard-line" key={item.label}><strong>{item.label}:</strong> {item.status === 'covered' ? item.detail : `Missing – ${item.detail}`}</div>)}</div> })}
        >
          <span className="summary-text">
            {coverageItems.filter((i) => i.status === 'covered').length} covered, {coverageItems.filter((i) => i.status === 'missing').length} missing
          </span>
          <span className="view-details-link">View full details</span>
        </button>
        <div className="battlecard-summary">
          {coverageItems.map((item) => (
            <div className="battlecard-line" key={item.label}>
              <strong>{item.label}:</strong>{' '}
              {item.status === 'covered' ? item.detail : `Missing – ${item.detail}`}
            </div>
          ))}
        </div>
      </div>

      <div className="insight-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Coverage</p>
            <h3>What we have and what still needs to be filled</h3>
          </div>
        </div>
        <div className="coverage-grid">
          {coverageItems.map((item) => (
            <div className={`coverage-card status-${item.status}`} key={item.label}>
              <span className="coverage-status">{humanizeCoverageStatus(item.status)}</span>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
        <div className="gap-grid">
          <div className="gap-card">
            <span className="summary-label">Missing Data</span>
            <div className="chip-row">
              {(account.profileCompleteness?.gaps || []).length > 0
                ? (account.profileCompleteness?.gaps || []).map((gap) => (
                    <GapChip
                      key={gap}
                      label={formatLabel(gap)}
                      gapKey={gap}
                      accountId={account._id}
                      accountKey={account.accountKey}
                      canonicalUrl={account.canonicalUrl}
                      domain={account.domain || account.rootDomain}
                      kind="gap"
                    />
                  ))
                : <span className="chip chip-covered">No current gap flags</span>}
            </div>
          </div>
          <div className="gap-card">
            <span className="summary-label">Next Research Stages</span>
            <div className="chip-row">
              {(account.profileCompleteness?.nextStages || []).length > 0
                ? (account.profileCompleteness?.nextStages || []).map((stage) => (
                    <GapChip
                      key={stage}
                      label={formatLabel(stage)}
                      gapKey={stage}
                      accountId={account._id}
                      accountKey={account.accountKey}
                      canonicalUrl={account.canonicalUrl}
                      domain={account.domain || account.rootDomain}
                      kind="stage"
                    />
                  ))
                : <span className="chip chip-covered">No queued stages</span>}
            </div>
          </div>
        </div>
      </div>

      {(account.interactions || []).length > 0 ? (
        <div className="insight-section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Interaction summaries</p>
              <h3>Event summary, changes, and influenced areas</h3>
            </div>
          </div>
          <div className="interaction-list">
            {(account.interactions || []).map((ix) => (
              <div className="interaction-card" key={ix._id}>
                <div className="interaction-head">
                  <strong>{ix.title || ix.companyName || ix._id}</strong>
                  <span className="interaction-meta">
                    {[ix.source, ix.pageSource, ix.timestamp].filter(Boolean).join(' · ')}
                  </span>
                  {ix.userId ? <span className="interaction-user">By {ix.userId}</span> : null}
                </div>
                {ix.eventSummary ? <p className="interaction-summary">{ix.eventSummary}</p> : null}
                <div className="interaction-deltas">
                  {ix.dataAdded?.length ? <span>Added: {ix.dataAdded.join(', ')}</span> : null}
                  {ix.dataModified?.length ? <span>Modified: {ix.dataModified.join(', ')}</span> : null}
                  {ix.dataDeleted?.length ? <span>Deleted: {ix.dataDeleted.join(', ')}</span> : null}
                  {ix.dataMerged?.length ? <span>Merged: {ix.dataMerged.join(', ')}</span> : null}
                </div>
                {ix.influencedAreas?.length ? (
                  <div className="chip-row">
                    {ix.influencedAreas.map((area) => (
                      <span className="chip chip-stage" key={area}>{area}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="insight-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">CRM Contacts</p>
            <h3>People linked from Outreach and other account matches</h3>
          </div>
          <span className="section-meta">{account.counts?.crmContacts ?? account.crmContacts?.length ?? 0} total</span>
        </div>
        <div className="contact-grid">
          {(account.crmContacts || []).length > 0 ? (
            (account.crmContacts || []).map((contact) => (
              <div className="contact-card" key={contact._id}>
                <strong>{contact.name || contact.currentTitle || contact._id}</strong>
                <p>{[contact.currentTitle || contact.title, contact.currentCompany].filter(Boolean).join(' · ') || 'Role not captured yet'}</p>
                <div className="chip-row">
                  {contact.roleCategory ? <span className="chip">{contact.roleCategory}</span> : null}
                  {contact.seniorityLevel ? <span className="chip">{contact.seniorityLevel}</span> : null}
                  {contact.isDecisionMaker ? <span className="chip chip-covered">decision-maker</span> : null}
                  {(contact.sourceSystems || []).map((sourceSystem) => (
                    <span className="chip chip-stage" key={`${contact._id}-${sourceSystem}`}>{sourceSystem}</span>
                  ))}
                </div>
                <div className="contact-meta">
                  {contact.email ? <span>{contact.email}</span> : null}
                  {contact.phone ? <span>{contact.phone}</span> : null}
                  {contact.linkedinUrl ? <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a> : null}
                </div>
              </div>
            ))
          ) : (
            <div className="detail-empty">No linked CRM contacts yet. This account still needs person and contact research.</div>
          )}
        </div>
      </div>

      {mode === 'tree' && tree ? (
        <div className="tree-shell">
          <ul className="tree-list">
            <TreeNodeView node={tree} />
          </ul>
        </div>
      ) : null}

      {mode === 'graph' ? (
        <div className="graph-shell">
          <div className="graph-center">
            <h3>{title}</h3>
            <p>{[account.domain || account.rootDomain, account.accountKey, account.industry].filter(Boolean).join(' · ')}</p>
          </div>

          <div className="graph-columns">
            <GraphColumn title="People" items={account.crmContacts || account.leadership || []} renderMeta={(item) => [item.currentTitle || item.title, item.roleCategory].filter(Boolean).join(' · ')} />
            <GraphColumn title="Technologies" items={account.technologies || []} renderMeta={(item) => [item.category, item.vendor].filter(Boolean).join(' · ')} />
            <GraphColumn title="Signals" items={account.signals || []} renderMeta={(item) => [item.source, item.timestamp || item.observedAt].filter(Boolean).join(' · ')} />
            <GraphColumn title="Actions" items={account.actionCandidates || []} renderMeta={(item) => [item.actionType, item.urgency].filter(Boolean).join(' · ')} />
            <GraphColumn
              title="Related Accounts"
              items={account.competitors || []}
              renderMeta={(item) => [item.domain, item.industry].filter(Boolean).join(' · ')}
              onItemClick={(item) => onPivotAccount(item._id)}
            />
          </div>
        </div>
      ) : null}

      {modal ? (
        <div
          className="modal-overlay"
          aria-hidden="false"
          onClick={() => setModal(null)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{modal.title}</h3>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => setModal(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">{modal.content}</div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function GraphColumn({
  title,
  items,
  renderMeta,
  onItemClick,
}: {
  title: string
  items: LinkedRecord[]
  renderMeta: (item: LinkedRecord) => string
  onItemClick?: (item: LinkedRecord) => void
}) {
  return (
    <div className="graph-column">
      <h3>{title}</h3>
      <div className="graph-list">
        {items.length === 0 ? <div className="detail-empty">No linked records.</div> : null}
        {items.map((item) => {
          const label = item.title || item.name || item.companyName || item.domain || item._id
          const content = (
            <>
              <strong>{label}</strong>
              <span>{renderMeta(item)}</span>
            </>
          )

          return onItemClick ? (
            <button className="graph-item graph-item-button" key={item._id} onClick={() => onItemClick(item)} type="button">
              {content}
            </button>
          ) : (
            <div className="graph-item" key={item._id}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AccountExplorer() {
  const [selectedAccountId, setSelectedAccountId] = useState('')

  return (
    <div className="explorer-layout">
      <Suspense fallback={<div className="loading-state panel">Loading accounts…</div>}>
        <AccountList selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
      </Suspense>

      <Suspense key={selectedAccountId || 'empty'} fallback={<div className="loading-state panel">Loading account detail…</div>}>
        {selectedAccountId ? (
          <AccountDetails accountId={selectedAccountId} onPivotAccount={setSelectedAccountId} />
        ) : (
          <div className="detail-panel">
            <div className="detail-empty">Select an account to load the explorer.</div>
          </div>
        )}
      </Suspense>
    </div>
  )
}
