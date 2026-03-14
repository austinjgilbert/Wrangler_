import { normalizeAccountDisplayName } from '../../../../shared/accountNameNormalizer.js'

export type AccountLike = {
  documentId?: string
  _id?: string
  accountKey?: string
  name?: string
  companyName?: string
  domain?: string | null
  rootDomain?: string | null
  canonicalUrl?: string | null
  opportunityScore?: number
  updatedAt?: string
  _updatedAt?: string
  profileCompleteness?: { score?: number }
  counts?: Record<string, number | undefined>
}

function getDocumentId(account: AccountLike) {
  return account.documentId || account._id || ''
}

function stripAccountPrefix(value: string) {
  return String(value || '').replace(/^account[.-]/i, '')
}

function normalizeHost(value: string | null | undefined) {
  if (!value) return ''
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]

  if (!normalized) return ''

  const parts = normalized.split('.').filter(Boolean)
  if (parts.length >= 3 && ['co', 'com'].includes(parts[parts.length - 2])) {
    return parts.slice(-3).join('.')
  }
  if (parts.length >= 2) {
    return parts.slice(-2).join('.')
  }
  return normalized
}

function normalizeName(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function getFieldRichnessScore(account: AccountLike) {
  return [
    account.companyName,
    account.name,
    account.domain,
    account.rootDomain,
    account.canonicalUrl,
    account.accountKey,
  ].filter(Boolean).length
}

function getCountScore(account: AccountLike) {
  return Object.values(account.counts || {}).reduce((sum, value) => sum + Number(value || 0), 0)
}

function getTimestampScore(account: AccountLike) {
  const value = account.updatedAt || account._updatedAt
  return value ? new Date(value).getTime() : 0
}

function getDeduplicationKey(account: AccountLike) {
  const host = normalizeHost(account.rootDomain || account.domain || account.canonicalUrl)
  if (host) return `domain:${host}`

  const accountKey = normalizeName(account.accountKey || stripAccountPrefix(getDocumentId(account)))
  if (accountKey) return `key:${accountKey}`

  const display = normalizeName(normalizeAccountDisplayName({
    _id: getDocumentId(account),
    accountKey: account.accountKey,
    companyName: account.companyName,
    name: account.name,
    domain: account.domain,
    rootDomain: account.rootDomain,
    canonicalUrl: account.canonicalUrl,
  }))
  return `name:${display || getDocumentId(account)}`
}

function compareAccounts(a: AccountLike, b: AccountLike) {
  const completionDiff = Number(b.profileCompleteness?.score || 0) - Number(a.profileCompleteness?.score || 0)
  if (completionDiff !== 0) return completionDiff

  const countDiff = getCountScore(b) - getCountScore(a)
  if (countDiff !== 0) return countDiff

  const fieldDiff = getFieldRichnessScore(b) - getFieldRichnessScore(a)
  if (fieldDiff !== 0) return fieldDiff

  const opportunityDiff = Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0)
  if (opportunityDiff !== 0) return opportunityDiff

  const updatedDiff = getTimestampScore(b) - getTimestampScore(a)
  if (updatedDiff !== 0) return updatedDiff

  return getDocumentId(a).localeCompare(getDocumentId(b))
}

export function dedupeAccounts<T extends AccountLike>(accounts: T[]): T[] {
  const groups = new Map<string, T[]>()

  for (const account of accounts || []) {
    const key = getDeduplicationKey(account)
    const existing = groups.get(key) || []
    existing.push(account)
    groups.set(key, existing)
  }

  return [...groups.values()]
    .map((group) => group.slice().sort(compareAccounts)[0])
    .filter(Boolean)
}

export function getAccountDisplayName(account: AccountLike | null | undefined) {
  if (!account) return 'Unknown account'

  const normalized = normalizeAccountDisplayName({
    _id: getDocumentId(account),
    accountKey: account.accountKey,
    companyName: account.companyName,
    name: account.name,
    domain: account.domain,
    rootDomain: account.rootDomain,
    canonicalUrl: account.canonicalUrl,
  })

  return normalized || account.companyName || account.name || account.domain || account.rootDomain || getDocumentId(account) || 'Unknown account'
}

export function getAccountDomainLabel(account: AccountLike | null | undefined) {
  if (!account) return ''
  return account.domain || account.rootDomain || normalizeHost(account.canonicalUrl) || ''
}
