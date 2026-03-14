export type ResearchJobLike = {
  accountKey?: string | null
  targetEntity?: string | null
  status?: string | null
  currentStage?: string | number | null
  documentType?: string
  jobType?: string
}

export type ResearchAccountLike = {
  documentId: string
  companyName?: string
  name?: string
  domain?: string | null
  rootDomain?: string | null
  canonicalUrl?: string | null
}

export function getAccountKeyFromId(id: string | null | undefined): string | null {
  if (!id) return null
  return id.replace(/^account[.-]/, '')
}

export function getStageLabel(stage: string | number | null | undefined): string | null {
  switch (String(stage || '')) {
    case 'initial_scan':
      return 'Scanning the site'
    case 'discovery':
      return 'Finding useful pages'
    case 'crawl':
      return 'Reading important pages'
    case 'extraction':
      return 'Pulling out facts'
    case 'linkedin':
      return 'Checking LinkedIn'
    case 'brief':
      return 'Writing a research brief'
    case 'verification':
      return 'Checking claims'
    case 'complete':
      return 'Complete'
    default:
      return stage ? String(stage) : null
  }
}

export function getJobStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'in_progress':
      return 'In progress'
    case 'pending':
    case 'queued':
      return 'Queued'
    case 'complete':
      return 'Complete'
    case 'failed':
      return 'Failed'
    default:
      return status || 'Queued'
  }
}

export function getJobAccountKey(job: ResearchJobLike): string | null {
  const accountId =
    typeof job.targetEntity === 'string' && job.targetEntity.startsWith('account')
      ? job.targetEntity
      : null
  return getAccountKeyFromId(accountId) || job.accountKey || getAccountKeyFromId(job.targetEntity || undefined) || null
}

export function getJobCanonicalUrl(
  job: ResearchJobLike,
  accountMap: Map<string, ResearchAccountLike>
): string {
  const accountKey = getJobAccountKey(job)
  const accountId =
    (typeof job.targetEntity === 'string' && job.targetEntity.startsWith('account') ? job.targetEntity : null) ||
    (accountKey ? `account-${accountKey}` : null)

  const account = accountId
    ? accountMap.get(accountId) || (accountKey ? accountMap.get(`account.${accountKey}`) : null)
    : null

  if (account?.canonicalUrl) return account.canonicalUrl

  const domain = account?.domain || account?.rootDomain
  if (domain) return domain.startsWith('http') ? domain : `https://${domain.replace(/^https?:\/\//, '')}`

  return accountKey ? `https://${accountKey}` : ''
}

export function getActiveJobAccountKeys(jobs: ResearchJobLike[]): string[] {
  return [
    ...new Set(
      jobs
        .filter((job) => ['in_progress', 'pending', 'queued'].includes(String(job.status || '')))
        .map((job) => getJobAccountKey(job))
        .filter(Boolean)
    ),
  ] as string[]
}
