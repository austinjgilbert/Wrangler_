import { getCliClient } from 'sanity/cli'

import { buildCompletenessSummary } from '../../src/services/account-completeness.js'
import {
  extractBenchmarks,
  extractPainPoints,
} from '../../src/services/content-os-enrichment.js'

type AccountDoc = {
  _id: string
  accountKey?: string
  name?: string
  companyName?: string
  domain?: string
  rootDomain?: string
  canonicalUrl?: string
  industry?: string
  classification?: Record<string, any> | null
  technologyStack?: Record<string, any> | null
  aiReadiness?: Record<string, any> | null
  performance?: Record<string, any> | null
  businessScale?: Record<string, any> | null
  benchmarks?: Record<string, any> | null
  painPoints?: any[] | null
  signals?: string[]
  leadership?: Array<{ _ref?: string } | string>
}

type PersonDoc = {
  _id: string
  personKey?: string
  name?: string
  title?: string
  headline?: string
  currentTitle?: string
  currentCompany?: string
  relatedAccountKey?: string
  rootDomain?: string
  companyRef?: { _ref?: string } | null
  roleCategory?: string
  seniorityLevel?: string
  isDecisionMaker?: boolean
}

type AccountPackDoc = {
  _id: string
  accountKey?: string
  payload?: Record<string, any>
}

const API_VERSION = '2026-03-11'

async function groqQuery(client: any, query: string, params?: Record<string, any>) {
  return client.fetch(query, params || {})
}

async function getDocument(client: any, id: string) {
  return client.fetch(`*[_id == $id][0]`, { id })
}

async function patchDocument(
  client: any,
  id: string,
  operations: {
    set?: Record<string, any>
    unset?: string[]
  } = {}
) {
  let patch = client.patch(id)

  if (operations.set && Object.keys(operations.set).length > 0) {
    patch = patch.set({
      ...operations.set,
      _updatedAt: new Date().toISOString(),
    })
  }

  if (operations.unset && operations.unset.length > 0) {
    patch = patch.unset(operations.unset)
  }

  return patch.commit()
}

function normalizeWhitespace(value?: string | null) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isIdLikeName(value?: string | null) {
  const normalized = normalizeWhitespace(value)
  return !normalized || /^account[.-]/i.test(normalized)
}

function extractDomain(value?: string | null) {
  const input = normalizeWhitespace(value)
  if (!input) return ''

  try {
    const url = input.match(/^https?:\/\//i) ? input : `https://${input}`
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return input
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase()
  }
}

function buildSignalStrings(scan: Record<string, any> | null | undefined) {
  if (!scan?.technologyStack) return []

  const signals: string[] = []
  const stack = scan.technologyStack
  const pushMany = (prefix: string, values: unknown) => {
    if (!Array.isArray(values)) return
    for (const value of values) {
      const label = typeof value === 'string' ? value : value?.name
      if (label) {
        signals.push(`${prefix}: ${label}`)
      }
    }
  }

  pushMany('CMS', stack.cms)
  pushMany('Framework', stack.frameworks)
  pushMany('Legacy', stack.legacySystems)
  pushMany('PIM', stack.pimSystems)
  pushMany('DAM', stack.damSystems)
  pushMany('LMS', stack.lmsSystems)

  return [...new Set(signals)].slice(0, 20)
}

function classifySeniority(title?: string | null) {
  const value = normalizeWhitespace(title).toLowerCase()
  if (!value) return 'ic'
  if (/\bc[a-z]o\b|chief|president|founder|co-founder|partner/i.test(value)) return 'c-suite'
  if (/\bvp\b|vice president|svp|evp/i.test(value)) return 'vp'
  if (/director|head of/i.test(value)) return 'director'
  if (/manager|lead|principal|senior/i.test(value)) return 'manager'
  return 'ic'
}

function dedupeRefs(
  refs: Array<{ _type: 'reference'; _ref: string; _key: string }>
) {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    if (!ref._ref || seen.has(ref._ref)) return false
    seen.add(ref._ref)
    return true
  })
}

async function linkPeopleToAccount(client: any, account: AccountDoc, dryRun = false) {
  if (!account.accountKey || !account._id) {
    return { linkedPeople: 0, leadershipRefs: 0, updatedPeople: 0 }
  }

  const domainCandidates = [...new Set(
    [account.domain, account.rootDomain, extractDomain(account.canonicalUrl)]
      .map((value) => normalizeWhitespace(value).toLowerCase())
      .filter(Boolean)
  )]

  const people = await groqQuery(
    client,
    `*[_type == "person" && (
      relatedAccountKey == $accountKey ||
      rootDomain in $domains ||
      companyRef._ref == $accountId
    )]{
      _id,
      personKey,
      name,
      title,
      headline,
      currentTitle,
      currentCompany,
      relatedAccountKey,
      rootDomain,
      companyRef,
      roleCategory,
      seniorityLevel,
      isDecisionMaker
    } | order(coalesce(isDecisionMaker, false) desc, coalesce(updatedAt, _updatedAt) desc)`,
    {
      accountKey: account.accountKey,
      accountId: account._id,
      domains: domainCandidates,
    }
  ) as PersonDoc[]

  let updatedPeople = 0

  for (const person of people || []) {
    const patch: Record<string, any> = {}

    if (!person.relatedAccountKey) {
      patch.relatedAccountKey = account.accountKey
    }

    if (!person.rootDomain && domainCandidates[0]) {
      patch.rootDomain = domainCandidates[0]
    }

    if (!person.companyRef?._ref) {
      patch.companyRef = { _type: 'reference', _ref: account._id }
    }

    if (!person.currentCompany && (account.companyName || account.name)) {
      patch.currentCompany = account.companyName || account.name
    }

    if (Object.keys(patch).length > 0) {
      if (!dryRun) {
        await patchDocument(client, person._id, { set: patch })
      }
      updatedPeople += 1
    }
  }

  const existingLeadership = Array.isArray(account.leadership)
    ? account.leadership
        .map((item) => typeof item === 'string' ? item : item?._ref)
        .filter(Boolean)
    : []

  const leadershipRefs = dedupeRefs([
    ...existingLeadership.map((ref) => ({
      _type: 'reference' as const,
      _ref: ref as string,
      _key: String(ref).replace(/^person[.-]/, '').slice(0, 96),
    })),
    ...(people || [])
      .filter((person) => {
        const seniority = person.seniorityLevel || classifySeniority(person.currentTitle || person.title || person.headline)
        return Boolean(person.isDecisionMaker) || ['c-suite', 'vp', 'director'].includes(seniority)
      })
      .map((person) => ({
        _type: 'reference' as const,
        _ref: person._id,
        _key: person.personKey || person._id.replace(/^person[.-]/, '').slice(0, 96),
      })),
  ])

  if (leadershipRefs.length > 0) {
    if (!dryRun) {
      await patchDocument(client, account._id, {
        set: {
          leadership: leadershipRefs,
        },
      })
    }
  }

  return {
    linkedPeople: people?.length || 0,
    leadershipRefs: leadershipRefs.length,
    updatedPeople,
  }
}

function buildAccountFillPatch(account: AccountDoc, pack: AccountPackDoc | null) {
  const payload = pack?.payload || {}
  const scan = payload.scan || payload.researchSet?.scan || {}
  const brief = payload.brief || payload.researchSet?.brief || {}
  const patch: Record<string, any> = {}

  const derivedCompanyName = normalizeWhitespace(
    account.companyName ||
    account.name ||
    scan.businessUnits?.companyName ||
    brief.companyName ||
    brief.company?.name
  )

  if (derivedCompanyName && (isIdLikeName(account.companyName) || !normalizeWhitespace(account.companyName))) {
    patch.companyName = derivedCompanyName
  }

  if (derivedCompanyName && (isIdLikeName(account.name) || !normalizeWhitespace(account.name))) {
    patch.name = derivedCompanyName
  }

  const derivedDomain = normalizeWhitespace(account.domain || account.rootDomain || extractDomain(account.canonicalUrl))
  if (derivedDomain && !normalizeWhitespace(account.domain)) {
    patch.domain = derivedDomain
  }

  if (derivedDomain && !normalizeWhitespace(account.rootDomain)) {
    patch.rootDomain = derivedDomain
  }

  const industry =
    normalizeWhitespace(account.industry) ||
    normalizeWhitespace(account.classification?.industry) ||
    normalizeWhitespace(scan.industry) ||
    normalizeWhitespace(brief.industry)
  if (industry && !normalizeWhitespace(account.industry)) {
    patch.industry = industry
  }

  if (industry) {
    patch.classification = {
      ...(account.classification || {}),
      industry,
      classifiedAt: (account.classification as Record<string, any> | null)?.classifiedAt || new Date().toISOString(),
    }
  }

  if (!account.technologyStack && scan.technologyStack) {
    patch.technologyStack = scan.technologyStack
  }

  if (!account.aiReadiness && scan.aiReadiness?.score != null) {
    patch.aiReadiness = { score: scan.aiReadiness.score }
  }

  if (!account.performance && scan.performance?.performanceScore != null) {
    patch.performance = { performanceScore: scan.performance.performanceScore }
  }

  if (!account.businessScale && scan.businessScale) {
    patch.businessScale = scan.businessScale
  }

  const mergedSignals = [...new Set([
    ...(Array.isArray(account.signals) ? account.signals : []),
    ...buildSignalStrings(scan),
  ])].slice(0, 20)
  if (mergedSignals.length > 0) {
    patch.signals = mergedSignals
  }

  if (pack?._id) {
    patch.sourceRefs = {
      ...(account as any).sourceRefs,
      packId: pack._id,
    }
  }

  const derivedBenchmarks = extractBenchmarks(account, pack)
  if (
    (!account.benchmarks || Object.values(account.benchmarks || {}).every((value) => value == null || value === ''))
    && Object.values(derivedBenchmarks || {}).some((value) => value != null && value !== '')
  ) {
    patch.benchmarks = derivedBenchmarks
  }

  const derivedPainPoints = extractPainPoints(account, pack)
  if ((!account.painPoints || account.painPoints.length === 0) && derivedPainPoints.length > 0) {
    patch.painPoints = derivedPainPoints
  }

  patch.lastValidatedAt = new Date().toISOString()

  return patch
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const offsetArg = process.argv.find((arg) => arg.startsWith('--offset='))
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
  const offset = offsetArg ? Number(offsetArg.split('=')[1]) : 0
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null
  const client = getCliClient({ apiVersion: API_VERSION })

  const accounts = await client.fetch<AccountDoc[]>(
    `*[_type == "account" && defined(accountKey)] | order(coalesce(updatedAt, _updatedAt) desc){
      _id,
      accountKey,
      name,
      companyName,
      domain,
      rootDomain,
      canonicalUrl,
      industry,
      classification,
      technologyStack,
      aiReadiness,
      performance,
      businessScale,
      signals,
      leadership
    }`
  )

  const targetAccounts = limit
    ? accounts.slice(offset, offset + limit)
    : accounts.slice(offset)

  const summary = {
    scanned: targetAccounts.length,
    accountsPatched: 0,
    peoplePatched: 0,
    leadershipRefs: 0,
    completenessPatched: 0,
  }

  for (const account of targetAccounts) {
    const pack = await groqQuery(
      client,
      `*[_type == "accountPack" && accountKey == $accountKey][0]{_id, accountKey, payload}`,
      { accountKey: account.accountKey }
    ) as AccountPackDoc | null

    const fillPatch = buildAccountFillPatch(account, pack)
    const meaningfulKeys = Object.keys(fillPatch).filter((key) => key !== 'lastValidatedAt')

    if (meaningfulKeys.length > 0) {
      if (!dryRun) {
        await patchDocument(client, account._id, { set: fillPatch })
      }
      summary.accountsPatched += 1
    }

    const linked = await linkPeopleToAccount(client, {
      ...account,
      ...fillPatch,
    }, dryRun)
    summary.peoplePatched += linked.updatedPeople
    summary.leadershipRefs += linked.leadershipRefs

    const refreshedAccount = !dryRun
      ? await getDocument(client, account._id)
      : { ...account, ...fillPatch }

    const completeness = buildCompletenessSummary(refreshedAccount, pack, null)
    if (!dryRun) {
      await patchDocument(client, account._id, {
        set: {
          profileCompleteness: completeness,
          lastEnrichedAt: new Date().toISOString(),
        },
      })
    }
    summary.completenessPatched += 1

    if (summary.completenessPatched % 25 === 0) {
      console.log(
        JSON.stringify({
          progress: `${summary.completenessPatched}/${targetAccounts.length}`,
          accountsPatched: summary.accountsPatched,
          peoplePatched: summary.peoplePatched,
        })
      )
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
