export const ACCOUNT_STORAGE_ACTIVE_DOC_BUDGET = 40
export const SANITY_FREE_PLAN_DOCUMENT_LIMIT = 10000
export const SANITY_FREE_PLAN_WARNING_THRESHOLD = 8000

export const ACCOUNT_STORAGE_LIMITS = {
  account: 1,
  accountPack: 1,
  person: 8,
  signal: 10,
  interaction: 5,
  crawlSnapshot: 3,
  evidencePack: 6,
  actionCandidate: 5,
  learning: 3,
  enrichmentJob: 3,
  enrichJob: 3,
  gmailDraft: 2,
  opportunityBrief: 2,
} as const

export type AccountStorageCountKey = keyof typeof ACCOUNT_STORAGE_LIMITS

export type AccountStorageCounts = Partial<Record<AccountStorageCountKey, number>>

export function getStorageLimit(key: AccountStorageCountKey): number {
  return ACCOUNT_STORAGE_LIMITS[key]
}

export function computeAccountActiveDocCount(counts: AccountStorageCounts): number {
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0)
}

export function getStorageUsageStatus(count: number, limit: number) {
  if (count > limit) return 'over'
  if (count >= Math.ceil(limit * 0.8)) return 'warning'
  return 'healthy'
}

export function computeAccountStorageBudget(counts: AccountStorageCounts) {
  const byType = Object.entries(ACCOUNT_STORAGE_LIMITS).map(([key, limit]) => {
    const count = Number(counts[key as AccountStorageCountKey] || 0)
    return {
      key,
      count,
      limit,
      status: getStorageUsageStatus(count, limit),
      overBy: Math.max(0, count - limit),
    }
  })

  const totalActiveDocs = computeAccountActiveDocCount(counts)
  return {
    totalActiveDocs,
    totalBudget: ACCOUNT_STORAGE_ACTIVE_DOC_BUDGET,
    totalStatus: getStorageUsageStatus(totalActiveDocs, ACCOUNT_STORAGE_ACTIVE_DOC_BUDGET),
    byType,
    overBudgetBy: Math.max(0, totalActiveDocs - ACCOUNT_STORAGE_ACTIVE_DOC_BUDGET),
  }
}

export function computeDatasetDocumentUsage(totalDocuments: number, planLimit: number = SANITY_FREE_PLAN_DOCUMENT_LIMIT) {
  const warningThreshold = Math.min(planLimit, SANITY_FREE_PLAN_WARNING_THRESHOLD)
  const status = totalDocuments > planLimit
    ? 'over'
    : totalDocuments >= warningThreshold
      ? 'warning'
      : 'healthy'

  return {
    totalDocuments,
    planLimit,
    warningThreshold,
    status,
    overBy: Math.max(0, totalDocuments - planLimit),
    remaining: Math.max(0, planLimit - totalDocuments),
    utilizationRatio: planLimit > 0 ? totalDocuments / planLimit : 0,
  }
}

export function buildEnrichJobKey(input: {
  entityType?: string | null
  entityId?: string | null
  goal?: string | null
}) {
  const entityType = String(input.entityType || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  const entityId = String(input.entityId || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  const goal = String(input.goal || 'general')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return `enrich.job.${entityType || 'unknown'}.${entityId || 'unknown'}.${goal || 'general'}`
}

export function buildExtensionCaptureBucketId(input: {
  accountKey?: string | null
  domain?: string | null
  date: string
}) {
  const base = String(input.accountKey || input.domain || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return `interaction.extension.${base || 'unknown'}.${input.date}`
}

export function buildDeterministicSnapshotId(input: {
  accountKey?: string | null
  accountId?: string | null
  urlOrPath: string
  namespace: string
}) {
  const subject = String(input.accountKey || input.accountId || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  const target = String(input.urlOrPath || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)

  return `${input.namespace}.${subject || 'unknown'}.${target || 'unknown'}`
}
